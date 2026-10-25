# Site Visit PWA – WinCo Foods Ellensburg, WA (cold-storage DC)

An offline-first Progressive Web App for capturing a multi-day site visit and turning it into **Ignition SCADA design inputs**: tag paths, UDT patterns, screen requirements per area/role, an alarm matrix, an equipment inventory and printable daily and visit reports.

* **No dependencies:** vanilla HTML/CSS/JS with no build step, no CDN and no network calls.
* **Works offline:** a service worker caches the app shell, and IndexedDB holds everything, including photo and video blobs.
* **Field-friendly:** mobile-first layout where **every touch target is at least 60 px** for gloved use in cold rooms (checked by the test suite) and a high-contrast dark theme by default. There is a **daylight** theme (◐ button) for bright docks and yard, plus an **A+ Text size** toggle.
* **Autosave:** every field saves about 300 ms after you stop typing, and checklist taps save immediately. The header shows `Saving… / Saved ✓`.
* **Single-file variant:** `site-visit.html` contains everything. Open it directly with no server (see below).

Version **3.7.1** · Analyst canonical schema **3.1.0** (`analyst/v3.1.0/`; 3.0.0 exports import with a version bump only) · internal store `schemaVersion: 6`. v1/v2/v3(2.0)/v4(2.1) exports still import and are upgraded on load. See the changelog in §0.

---

## Field rules

One page to read before the site visit. The app shows it once on first run and again from **Home → 📋 Field rules** or **Settings → Help**.

1. **One device code per phone.** Each phone needs its own code, e.g. JR on one phone and JR2 on the next. If you reinstall, or a second phone joins, the app asks for a new code before you can capture.
2. **Restore with Merge, never Replace.** Merge keeps the records on both sides. Use Replace only for a damaged device copy. ID counters are kept at their highest either way.
3. **Install to the Home Screen before going on site.** Do this from Safari with Share → Add to Home Screen. A browser tab can lose its storage.
4. **Back up after each panel.** Use Backup (full .zip) and AirDrop it or save it off the phone.

---

## 0. Changelog

### v3.7.1 (2026-10-25) - Fix overlapping pills on the Screen page
- **Bug (seen on a phone on the live site):** on a Screen record, the *Navigates to* and *Equipment types* pills overlapped and the labels were unreadable. Cause: `.chips` was a flex row with no wrap and `.chip` was `white-space:nowrap`; the 3.5.0 long-text rule `label{min-width:0}` then let each `label.chip` shrink below its text, so the text spilled over its neighbours. The more pills a group had, the worse it got (*Opto groups* has only 7 short ones).
- **Fix:** every chip group wraps (`.chips{flex-wrap:wrap}`). A pill keeps its full label and wraps it inside the pill when it is long (`white-space:normal; overflow-wrap:anywhere; max-width:100%`). The pill's checkbox is a fixed 28 px; it is no longer stretched to 100% width. This applies to all chip groups: Screen fields, checklist multiselects, *Areas served* and the Records filter. Rules kept: pills ≥ 60 px tall, labels ≥ 16 px, no side scroll at 390 px.
- **Update on installed phones:** the SW cache is now `sv-3.7.1`. The new service worker installs, skips waiting and claims the page on the first launch after the deploy, and the page shows *"App updated ✓ - close and reopen the app to use the new version"*. The page that is already open keeps the old code. Close the app fully and open it again (2 launches in total).
- Tests: the Screen page is seeded with 24 screens (some with long names), 22 equipment types and 7 opto groups. Sibling pill boxes never intersect, no label is clipped, and pills are ≥ 60 px / ≥ 16 px. The same checks run on every other chip group, plus an SW update round trip. Screenshot 25. App 3.7.1, SW cache `sv-3.7.1`, test_v3.py 187/187.

### v3.7.0 (2026-10-25) - Reviewer v3.6.0 re-check (should-fixes S1-S4 + Field rules)
- **S3: ID counters never roll back.** A high-water mark per kind@code is kept in localStorage (`sv-hwm`) and in the visit (`visit.hwm`). Restore, import and load take the max of all sources and of the highest ID in use. After a Replace with an older backup, the next issue is still ISS-JR-0006, not 0004. The Replace dialog now says that Merge is safer.
- **S2: the same code on two phones is caught before any ID is issued.** At setup, a code that another device owns in a visit on this phone is refused. When a visit is imported or restored onto a phone that is not the code's owner (a reinstall or a second phone), a blocking "Pick this phone's ID code" prompt appears with a suggested suffix (JR2). Suffixed IDs (`ISS-JR2-0001`) pass validate.py 3.1.0.
- **S1: legacy photo IDs come from the original capture name, or the SHA-256 of the photo bytes (SubtleCrypto), never from the current name.** A photo renamed differently on two phones gets the same ID on both. New captures store `capName`.
- **S4: late edits to a merged-away copy are redirected.** If a phone edits a record that the other phone merged away, Merge moves the edited fields onto the kept record (per field, newer wins) and lists them in the conflict report as "↪ edit on merged-away copy". Conflicts that differ only by a raw UUID after a merge-two are no longer listed.
- **Field rules card** (see below). It is shown once on first run.

### v3.6.0 (2026-10-25) - Reviewer v3.5.0 re-check (B2 + M2 + M3)
- **B2 (blocker): every photo gets its ID at capture.** `addFiles` assigns `MED-<code>-NNNN` on every path (shot list, freeform, video, library multi-select, floating camera on a stop or record). Photos and ID-type records stored without an ID (made by 3.5.0) are upgraded on load and on import; a photo's ID comes from its file name (`MED-JR-007-1a2b3c`), so two devices that upgrade the same photo get the same ID. Tested through the real `<input type=file capture=environment>` (Playwright file chooser); the resulting export passes validate.py 3.1.0. Audit: clone, quick-add observation/alarm and Blocked → access issue get prefixed IDs. Quick-add / seed-import sections take their EQ- ID from the instanceId, so they need no counter.
- **M2: IDs carry a device code.** New IDs are `ISS-JR-0003`, `OBS-KL-0001`, `MED-JR-0012` (2-4 letters; the default is the author's initials). You can set the code in Visit setup; after that it is shown and changed under Settings → ID code. Once any ID uses the code it is locked: **Change…** needs an "I understand" tick and refuses a code that another device in the visit already owns. Each device's code is recorded in `visit.devices` and merged on exchange. If two devices use the same code, a warning appears in the import dialog, the merge result and Settings. Counters are kept per code (`seq["issue@JR"]`). Renumbering on merge is now only a fallback for legacy unprefixed IDs and same-code clashes, and it keeps the code. Conflict lists no longer show the renumbering as a field difference. Schema check: every ID pattern accepts the prefix. PNL-/EQ-/SCR-/CLR-/DAY- IDs are derived from physical keys and stay unprefixed.
- **M3: the same device/screen recorded twice.** Sections with the same instanceId and screens with the same screenCode are flagged under Export ("Recorded twice - export blocked until merged"). Analyst JSON / ZIP / CSV export is hard-blocked (no "Export anyway"), and nothing is ever split into `EQ-…-2`. **Merge these two** keeps the first-captured record and its ID. It offers a pick for each differing field, combines the photos and sourceRefs, and points every link at the kept record. The absorbed record is saved as a tombstone and alias, so an older backup cannot bring it back.
- Deletes are tombstoned so a merge cannot bring back a deleted record. Day-theme nudge contrast fixed.
- App 3.6.0, SW cache `sv-3.0.5`, test_v3.py 164/164.

### v3.5.0 (2026-10-25) - Reviewer v3.4.0 re-check (B1 + M1)
- **B1 (blocker):** long unbroken user text (120-char tag paths, PLC addresses) wraps instead of widening the page: `min-width:0; overflow-wrap:anywhere` on `.grow`, `.card`, list items, flex/grid children (`.row/.grid2/.grid3/.dict/.secrow/.pkrow`), headings, labels, code, table cells, modals and stops; `pre` wraps; inputs/selects/images are capped at 100%. Test: tag, alarm, issue, observation records and a new stop with a 120-char tag path and a long PLC address; no horizontal scroll on 12 pages at 390 and 375 px with every `details` open (screenshot 21).
- **M1 merge (two devices exchanging backups):** every ID counter (`seq.*`, `mediaSeq`, `backup.seq`, `mediaMark`) becomes max(device, file) and is never lower than the highest ID in use. After the merge every human-readable ID (ISS-, ALM-, OBS-, INT-, MED-, ...) is checked for uniqueness; on a collision the device keeps its ID, the incoming record is renumbered to the next free one and every reference (text, notes, sourceRefs) is rewritten. The result dialog lists old → new and a conflict table (record, field, this device vs file, which value was kept; newer edit wins). The same report is kept in the **Import log** on the Export page (last 50 imports). Derived IDs that cannot be renumbered (EQ from instanceId, SCR from screenCode, photo filenames) are flagged. Export checks block on duplicate IDs (`dupIds`). Tests: devices A and B exchange full backups both ways; counters never go back, no duplicates, the renumbered ISS-0003 → ISS-0005 resolves on both devices, the conflict list is correct, the next IDs are ISS-0006 / ISS-0007 (screenshot 22).
- The result toast no longer covers modal buttons (opening a modal hides the toast).
- App 3.5.0, SW cache `sv-3.0.4`, test_v3.py 133/133.

### v3.4.0 (2026-10-25) - Analyst schema 3.1.0 + Reviewer v3.2.0 re-check
- **Schema 3.1.0:** exports write `schemaVersion`/`checklistVersion` 3.1.0. 3.0.0 files import with a version bump only (no backfill). `presenceAttestedBy`/`presenceAttestedAt` are emitted as a pair, only when presentOnSite is yes/no; unknown/blocked clears both; At must match the strict ISO pattern (a malformed stamp emits neither, plus a warning). A verified record without a stamp is a warning, not an error. Access issues stay category `gap`, title `Access constraint: {section}` (ISS-0021 shape). The ISS-0020 marker is unchanged. "Seen" stays a UI-only Trip 1 rule; an L5X-seeded section that becomes verified gets a warning, never a block.
- **N1 (blocker):** `fieldset.chips{min-width:0}` and `.row2` / date-input min-width fixes; no horizontal scroll at 390 px on any page (tested on 9 routes).
- **S-a:** importing a visit that already exists shows, before anything changes, a "Replace would lose data" block with before → after counts (photos/records, N deleted) when the file is older or smaller. **Merge (keep both sides; newer edit wins)** is the default, then Import as copy, Replace (red), Cancel.
- **S-b:** an incremental imported without its chain (visit missing, photos neither in the file nor on the device, or a `seq` gap) warns "Import the full backup and earlier incrementals first"; Cancel is the default. Packages carry `package.seq`/`prevSeq`.
- **S-c:** every zip entry's CRC32 and size are checked against the central directory. A corrupt visit.json fails the import with nothing changed; damaged photos are listed in the dialog, skipped and reported in the result toast.
- **S-d:** Share package is two taps (build → "Package ready" → Share/Download/Close) so share() runs on a fresh gesture; share errors appear in the dialog with Download as fallback.
- **S-e:** sysbar buttons 60 px; photo captions 12.5 px.
- Tests (test_v3.py): 114 checks, all real-UI for the reviewer items (IDB-prototype quota → banner → Retry, real second tab, 60-photo download → clean-device import, Replace+Cancel). Screenshots 16-20. SW cache `sv-3.0.3`.

### v3.3.0 (2026-10-25) - Analyst answers 1-4, "Seen", 3.1.0 prep
- **Blocked → access issue:** tapping Blocked on present-on-site asks to log an access-constraint Issue, prefilled from `ACCESS_ISSUE` (schema-map.js): category `gap` (Issue.category has no access value), Medium, Open, deliverable DeviceInventory, title `Access constraint: <instanceId> (<panel>) could not be reached`, linked via equipmentId (section), panelId and areaId. It appears in the Issue Log CSV and the report. You can skip it; the Section screen then shows a nudge with "Log access issue", the export card lists Blocked sections that have no issue, and export asks once more (it is a soft warning, not a validate.py error). Blocked still does not count toward walkdown_verified.
- **Provisional Sub-System (ISS-0020):** on the shared vendor panels MCP-01, MCP-02, MOVU-ASTC, MCP-50 (MCP-50(A-I), MCP-50A-I and other variants), MCP-89 and MCP-90 (`PROVISIONAL_SUBSYSTEM`), a section that uses the panel fallback Sub-System (blank SubSystemCode, or no explicit Sub-System) shows "⚑ provisional, see ISS-0020". It appears in the stop header, the section view and record lists, and in the report (the Device inventory SubSystem column plus a short section). The exports flag it within schema 3.0.0: Equipment/ControlPanel `notes` gets "[Sub-System provisional, see ISS-0020]" and `sourceRefs` gets `{doc:'review', section:'ISS-0020'}`. Seed import keeps the fallback and the strict header check (exit 2).
- **"Seen":** Trip 1 (intro-phase) sections at `walkdown_verified` display as "Seen ✓", and the Verify button reads "Mark seen". This is display only; the stored and exported value is still `walkdown_verified`. The Trip 1 data gate is unchanged.
- **3.1.0 prep:** a yes/no tap still stores `r.attest.presentOnSite = {by, at}`. `ATTEST_EXPORT_MAP` maps it to `presenceAttestedBy` / `presenceAttestedAt` (ISO), and the export emits these only when the loaded schema's Equipment defines them. Under 3.0.0 nothing extra is emitted. To adopt 3.1.0, drop in the new schema; no code change is needed.
- SW cache `sv-3.0.2`. Tests: 68 checks (14 new).

## v3.2.0 (2026-10-25): Analyst schema 3.0.0
* **Exported JSON** (`analyst/capture.json`, *Export → Analyst JSON*) carries `schemaVersion: "3.0.0"` and passes `analyst/v3.0.0/tools/validate.py` (output in `tests/out/validate-3.0.0.txt`).
* **presentOnSite** is an explicit **Yes / No** tap per section (plus *Blocked* and *Clear*). It is never prefilled and defaults to `unknown`. A tap stores `attest {by, at}`. Import, clone, add-range, seed import and bulk verify never write it, and clone resets it to `unknown`. The gates honour the attest: `walkdown_verified` needs an attested Yes or No, so a typed-in or imported value without an attest exports as `unknown` with a warning.
* **Panel ids** come from `checklist.json` `panels[].panelId`.
* **References are resolved** before export (a port of `ref_errors`): unresolved subSystemId / panelId / areaId show in the Export card and in a *Cancel – fix first / Export anyway* prompt.
* **CSVs:** `BitPosition` is dropped. SubSystem columns hold `SUB-` ids joined with `;`. The 3.0.0 enums are used (TagType, ValueSource, DowntimeClass). All 5 headers byte-match `analyst/v3.0.0/exports/*.csv`.
* **Seed import** (section CSV and L5X) is all-or-nothing. It merges only on exit 0. Exit 1 or 2 rejects the file with a report and merges nothing.
* **Section fields are commissioning-tier.** The Trip 1 gate covers only panel, area and site. Sections show "optional on Trip 1".
* **Store v5 upgrade** (`migrateV4toV5`): prefilled `presentOnSite` is cleared to `unknown`, and unattested verified sections are reopened with a note. This step replaces `migrate_2_1_to_3_0.py`, which is not ported because the app never imports Analyst documents, only its own exports.

### v3.1.0: Analyst 2.1.0 alignment, data-driven
* Sub-System hierarchy, status encodings, walkdown and data gates, and per-trip requiredness all come from `analyst-schema.js` / `checklist.json`. Nothing is hard-coded in the UI.
* Photo filename: `{Area}_{Subject}_{shot}_{YYYYMMDD}_{INITIALS}-{NNN}-{hex6}`. The sequence is fixed at capture.
* Navigation Matrix capture (NavigatesTo ticks).

### v3.0.1: Reviewer fixes (REVIEW-v2-app.md)
* **Must-fix:**
  * import *Replace* is atomic: staged, then one IDB transaction, with staging cleared on abort;
  * a backup is marked done only after a confirmed share or download;
  * incremental backups and a streaming ZIP;
  * no backup copies are stored in IndexedDB;
  * a quota-aware save queue, a red NOT SAVED banner, and `storage.estimate()` checked before capture;
  * a blocking "install to Home Screen" screen in an iOS Safari tab.
* **Should-fix:**
  * single-tab lock;
  * records search, filter, jump and paging;
  * no toggle-off, plus an explicit Clear;
  * confirm or undo on deletes;
  * 16 px body/inputs and N/A contrast;
  * floating camera button;
  * a laptop-only note for the single file (§6).

### v2.0.0 (2026-10-25): review §4 app-side fixes
Implements the schema-independent items from `REVIEW-v1.md` §4. The Analyst's schema/checklist work (§1–3) is **not** in this release. Everything it will touch is collected in **`js/schema-map.js`** so it can be remapped in one place (see §4.3).

| # | Item | v1 state | v2 change |
|---|---|---|---|
| 1 | **Photo storage** | Blobs were already in IndexedDB at full camera resolution (3–12 MB each); persist was requested only from a button | Photos are **compressed on capture**: canvas, 1600 px long edge, JPEG q0.7. A 4000×3000 test photo goes from 742 KB to 118 KB. The original is kept if compression would not make it smaller. **Videos are stored as-is.** Each item records `origSize`, `width`, `height` and `compressed`. `navigator.storage.persist()` is requested when a visit is created. The storage status (persisted or not, MB used and available) shows on Home, Dashboard, Export and Setup. localStorage holds only small `sv-*` prefs (theme, text size, author). |
| 2 | **Offline** | Manifest and cache-first SW existed and an offline reload passed | `manifest.id` added. The SW cache is bumped to `sv-2.0.0`, includes `schema-map.js`, and installs with `cache:'reload'` so it never caches stale HTTP-cached files. Fixed a router race that could drop a navigation landing mid-render. Tested: offline deep-link reload, offline capture and offline export. |
| 3 | **Backup** | Manual export only | After a stop or panel is marked **complete**, a **one-tap backup** runs. The mode is set per visit (Export → *After an area / panel is marked complete*): **Prompt** (default; a modal offers *Backup ZIP now*, *Share ZIP* on mobile, or *Quick JSON*), **Auto-download ZIP**, or **Off**. The Dashboard shows *Last backup … · N changes since*, with a 📦 button. |
| 4 | **Clone** | None | **📑 Clone section** on a stop copies its checklist, shot list, required flags, photo types, group, ISA area and tag segment under a new name. The name is auto-incremented (`PLC panel: MCP-20` → `MCP-21`). No answers, notes, photos or records are copied. **📑 Clone (new ID)** on a record copies every field and changes only the ID field (`MDR-101` → `MDR-102`). Per-instance fields are cleared (serial, IP, PLC address, source bit) and the status is reset to Open. |
| 5 | **Typed photos** | Untyped, named `Area_date_id8` | 13 photo types: Nameplate, Panel exterior, Panel interior, PLC rack, Network switch, HMI screen, Layout, Sensor, I/O, Drive, Safety, Overview, Other. Shot prompts carry a type. Freeform captures pick one from a selector next to the capture buttons, and the type can be changed in the media viewer. **Export filename = tag path + type + sequence**, e.g. `media/ELL01__System_MCP-20_PanelExterior_01.jpg`. **PLC panel** stops have a **required photo set** (door/ID, interior, rack, network switch, nameplate, HMI). Only the HMI photo can be marked N/A (some panels have none). *Mark panel complete* is blocked until every required photo is captured and every checklist item is answered. |
| 6 | **Records** | UUID and timestamps only | Every visit, day, stop, record and media item has `id` (UUID), `createdAt`/`updatedAt`, `createdBy`/`updatedBy` (from *Your name on this device*), and a `status`: records are **open / verified / N/A**, stops are **open / complete / N/A**. Required fields are marked `*`. **✔ Mark verified** is blocked until they are filled; missing fields turn red and are counted in lists and CSVs. Data is `schemaVersion: 2`. v1 JSON/ZIP imports are migrated (`migrateBundle`): statuses, authors, photo types and the tag model are added, and alarm priority is mapped High → P1, etc. A file from a newer schema shows a warning. |
| 7 | **Cold-room use** | 48–56 px targets | **60 px minimum** for every button, input, select, chip, link and summary (the test measures every visible control on 6 screens). Every note box has a **🎤 mic button** (Web Speech API) that appends what you say. Where the API is missing (iOS standalone, Firefox), it shows a tip to use the **keyboard 🎤 dictation** instead. |
| 8 | **CSVs** | `equipment.csv`, `tags.csv`, `alarms.csv` | Four handoff CSVs: **Tag Mapping Matrix**, **Alarm Mapping Matrix**, **Equipment Inventory** and **Issue Log**. Columns are listed in §3. They are in the ZIP under `csv/` and are also individual buttons. JSON `derived` carries the same rows, plus `csvColumns`. |

Other: the alarm record now follows Design §7.4 (CP, Device ID, Alarm code E-Stop/Fault/Jam/Full → P1/P1/P2/P3, source bit, Alarm vs Status). The Gap record gained category, due date and resolution, which together make the Issue Log. New equipment types: MDR Zone, Spiral, Elevator, Pallet Conveyor, DWS, Print & Apply, ASRS, Robotics Cell. The Tag record gained a Tag Group. The visit report has Issue Log, Tag Mapping Matrix and Alarm Mapping Matrix sections, and stop coverage shows required-photo counts.

### v1.0.0
First release: guided stops, shot lists, checklists, 7 record types, photo/video/GPS capture, ZIP/JSON/CSV/HTML/MD exports, import, daylight theme and a single-file build.

---

## 1. Run it

```bash
cd app
python3 -m http.server 8080
# open http://localhost:8080/  (service worker + install work on localhost)
```

A phone needs **HTTPS** to register the service worker and install the app. `http://<laptop-ip>` will load but will not work offline or install. Options:

* **GitHub Pages (recommended):** push this folder to a repo, then go to Settings → Pages → Deploy from branch → `/ (root)`. Open `https://<user>.github.io/<repo>/`. All paths are relative, so a sub-path works.
* Any static HTTPS host, such as Netlify, Cloudflare Pages, Azure Static Web Apps or an internal IIS/nginx with TLS.
* `site-visit.html` on its own: AirDrop it, email it or put it on a share, then open it. See §6.

### Install on a phone

**iPhone / iPad (Safari only):**
1. Open the HTTPS URL in **Safari**.
2. Tap **Share** (□↑) → **Add to Home Screen** → **Add**.
3. Launch it from the home-screen icon. It runs full-screen and offline. Open it once while online so the shell gets cached.
4. Check the **storage line** on Home or Setup. It reads ✅ *Storage persisted* or ⚠️ *not persisted*, plus MB used and MB available. Tap **Request persistent storage** if it isn't persisted. Browsers usually grant this only to an installed app. iOS can still evict data from sites that go unused for weeks, so use the **one-tap backup** after each panel or area (see §2).
5. Camera: the first capture asks for camera permission. Location prompts for GPS on the first capture when the GPS toggle is on.

**Android (Chrome / Edge / Samsung Internet):**
1. Open the HTTPS URL in Chrome.
2. Tap **Install app**, either in the app's home screen or in the ⋮ menu (**Install app** / **Add to Home screen**).
3. Launch it from the launcher. It works offline after the first load.
4. Tap **Request persistent storage** (Setup → Storage) if the storage line shows ⚠️.

**Updating:** when a new version is deployed, `sw.js` `VERSION` is bumped (currently `sv-2.0.0`). A *“App updated – offline cache refreshed ✓”* toast appears when the new worker takes over. The app picks it up on the next online launch; close and reopen it if needed. Data in IndexedDB is not touched by updates.

---

## 2. Using it on site

1. **Home → New visit.** The form is prefilled for *WinCo Foods Distribution Center – Ellensburg, WA*. Enter **Your name on this device**, which is stamped on everything you create or change as `createdBy`/`updatedBy`. Each phone should use its own name. Check the **site code** (`ELL01`). Day 1 is today; use **+ New day** each morning.
2. **Stops** are grouped as Overall, Cold zones, Docks, Conveyor/MHE, Controls and Utilities. Add more from the dashboard: **+ Conveyor stage**, **+ PLC panel** (e.g. `PLC panel: MCP-20`), or **+ Cooler zone**.
3. **On a stop or panel:**
   * The top card shows the status pill, the **ISA-95 tag path** for the stop, progress (checklist, shots, *required photos n/6*) and these buttons:
     * **✔ Mark panel/area complete:** runs the completion gate, then the backup prompt.
     * **📑 Clone section:** the next panel, same lists.
     * **✎ Edit lists.**
   * **Shot list:** each prompt has a photo type. **🔴 REQUIRED** prompts cannot be skipped, except where N/A is allowed. In edit mode you can change the type or the required flag per shot.
   * **Extra / freeform:** pick a photo type (default *Overview*), then 📷 / 🎥 / 📁.
   * **Checklist:** ✓ Done / N/A / ⚠ Issue, with a note and 🎤. Issues go to the Issue Log.
   * **Records:** add Equipment, PLC/controller, Tag, Alarm, Gap/issue, Operator requirement or Observation.
     * **✔ Mark verified** is available once the required fields `*` are filled. **N/A** and **Reopen** are also available.
     * **📑 Clone (new ID)** gives you the next MDR zone, sensor or alarm in two taps.
4. **Backups:** with the default *Prompt* mode, completing a panel asks **📦 Backup ZIP now** (one tap). Copy the ZIPs off the phone (Files / OneDrive / AirDrop) at least daily.
5. **Voice notes:** tap **🎤** next to any note and speak. Tap again (or pause) to stop. If the tip says the browser has no voice typing, tap the note box and use the keyboard's own 🎤. That works offline on iOS 15+ with on-device dictation, and on Android with Gboard's offline language pack.

---

## 3. Exports

| Button | File | Contents |
|---|---|---|
| Full ZIP / Backup ZIP | `<site>_<date>_full.zip` / `_backup_<time>.zip` | `visit.json`, the 4 CSVs in `csv/`, `reports/visit-report.{html,md}`, `reports/daily-<date>.{html,md}`, and `media/<TagPathKey>_<Type>_<NN>.<ext>` |
| JSON (media referenced) | `<site>_<date>.json` | Full data dump, `schemaVersion: 2`, `csvColumns`, and `derived.{tagMapping, alarmMapping, equipment, issues, udts, screens}` |
| JSON + base64 media | `..._with-media.json` | One self-contained file |
| Media-only ZIP | `..._media.zip` | Typed photo and video files |
| **Tag Mapping Matrix** | `..._tag-mapping-matrix.csv` | see below |
| **Alarm Mapping Matrix** | `..._alarm-mapping-matrix.csv` | see below |
| **Equipment Inventory** | `..._equipment-inventory.csv` | see below |
| **Issue Log** | `..._issue-log.csv` | see below |
| Daily summary / Total visit report | HTML (printable) / Markdown | The visit report adds an Issue Log, Tag Mapping Matrix and Alarm Mapping Matrix, and shows required-photo coverage |

CSVs are UTF-8 with a BOM, for Excel. **Column order and headers come from `CSV_COLUMNS` in `js/schema-map.js`.**

**Tag Mapping Matrix** (`csv/tag-mapping-matrix.csv`)
`OptoWesPath, ISA95Path, PLCAddress, DataType, UDT, TagGroup, Area, LineOrCell, Equipment, Instance, Point, Units, EngLow, EngHigh, Access, PLC_CP, Protocol, Description, Source, Status, RecordUUID`

Rows come from four sources:
* captured Tag records;
* **PackML** members (`Status/StateCurrent`, `Command/…`, `Admin/…`) for each MHE equipment record, or UDT hints for non-MHE equipment;
* "data points" typed in the field;
* per-PLC-panel `HMI_STATUS_CP##[$]`, `HMI_ALARM_CP##[$]` and comms rows.

`Source` names each row's origin: *Captured tag*, *PackML required member (SUP §2)*, *UDT hint (inferred)*, *Field note (…)*, *CP status/alarm array (to confirm)*, *System comms (SUP §1.5)*.

**Alarm Mapping Matrix** (`csv/alarm-mapping-matrix.csv`)
`CP, DeviceID, AlarmCode, Description, Priority, SourceBit, AlarmOrStatus, TagPath, Condition, Setpoint, Delay_s, Notification, Area, Source, Status, RecordUUID`

Rows come from captured Alarm records, tag records with an alarm, field notes, and *Suggested* Design §7.4 defaults (E-Stop P1, Fault P1, Jam P2, Full P3) per MHE equipment and panel. Suggested rows are for review.

**Equipment Inventory** (`csv/equipment-inventory.csv`)
`RecordKind, Area, LineOrCell, CP, EquipmentType, InstanceID, Name, Manufacturer, Model, Serial, Firmware, IP, Protocol, UDT, OptoWesPath, ISA95Path, Stop, Status, MissingRequired, PhotoFiles, Notes, Author, CreatedAt, UpdatedAt, RecordUUID`

It contains one row per Equipment record and one per PLC/controller record.

**Issue Log** (`csv/issue-log.csv`)
`IssueID, DateRaised, Area, Stop, Category, Title, Description, Severity, Status, Owner, DueDate, RecommendedAction, Resolution, RaisedBy, Source, PhotoFiles, UpdatedAt, RecordUUID`

It contains Gap/issue records plus every checklist item marked ⚠ Issue. IDs are `ISS-001…` in date order.

**Import / restore** (Home → Import) accepts a full or backup ZIP, a base64 JSON, or a plain JSON, from **v1 or v2**. v1 files are upgraded on import (a toast says *upgraded v1 → v2*). If the visit already exists you choose **Replace** or **Import as a copy**.

### Tag paths (SUP §1.5)
* ISA-95: `[provider]Enterprise/Site/Area/LineOrCell/Equipment/Instance/Point`, e.g. `[default]KPI/ELL01/Ambient/Spiral01/MDR/MDR-101/Status/StateCurrent`.
* PLC panels: `[default]KPI/ELL01/_System/MCP-20/…`.
* OptoWes view: `[default]OptoWes/MHE/<Instance>/<Point>`.

Area and LineOrCell come from each stop's ⚙️ Stop settings (*ISA-95 Area*, *LineOrCell*), with a default derived from the stop kind and name. The provider, enterprise, site code and OptoWes root are set in **Setup → Tag model**.

---

## 4. Data model (`schemaVersion: 2`)

IndexedDB `site-visit-pwa` (DB v1, unchanged) has the stores `visits`, `days`, `stops`, `records` and `media`, each with a `visitId` index. Photos and videos are **Blobs** inside `media`. IDs are UUIDs. Times are epoch ms (ISO in CSVs and reports).

```jsonc
{ "format": "site-visit-pwa", "schemaVersion": 2, "appVersion": "2.0.0", "exportedAt": "ISO", "mediaEmbedded": false,
  "csvColumns": { "tagMapping": [...], ... },
  "visit": {...}, "days": [...], "stops": [...], "records": [...], "media": [...],
  "derived": { "tagMapping": [...], "alarmMapping": [...], "equipment": [...], "issues": [...], "udts": [...], "screens": [...] } }
```

Common to every entity: `id, createdAt, updatedAt, createdBy, updatedBy`.

| Entity | Fields (v2 additions in **bold**) |
|---|---|
| **visit** | `site, client, address, startDate, endDate, visitors[], gps, activeDayId, lastStopId`, **`schemaVersion, tagModel{provider,enterprise,siteCode,optoRoot}, backupMode (prompt\|auto\|off), lastBackupAt, migratedFrom`** |
| **day** | `visitId, date, label, notes` |
| **stop** | `visitId, kind, name, group, tagSegment, setpoint, order, checklist[{id,text,status,note,dayId,updatedAt}], shots[{id,text,na,`**`type, req, naOk`**`}], prompts{}, ign{}`, **`status (open\|complete\|na), isa{area,line}, completedAt, completedBy, clonedFrom`** |
| **record** | `visitId, dayId, stopId, type, f{…}, ign{}`, **`status (open\|verified\|na), verifiedAt, verifiedBy, clonedFrom`** |
| **media** | `visitId, dayId, stopId, shotId, recordId, kind, mime, name, size, thumb, note, tags[], gps`, **`photoType, origSize, origMime, width, height, compressed, takenAt`**, `blob` → `file` / `dataBase64` |

Record fields (`*` = required for **Verified**):

| type | fields |
|---|---|
| `equipment` | equipId\*, name\*, type\* (… MDR Zone, Spiral, Elevator, Pallet Conveyor, DWS, Print & Apply, ASRS, Robotics Cell), manufacturer, model, serial, plc, sensors, nameplate, notes |
| `plc` | name\*, make\*, model\*, firmware, ip\*, protocol, path, program, notes |
| `tag` | point\*, equipRef, plcRef, address\*, dataType\*, **tagGroup**, units, rangeLo, rangeHi, rw, description, alarmCondition, alarmSetpoint, alarmPriority |
| `alarm` | **cp\*, deviceId\*, alarmCode\*, description\*, priority\* (P1/P2/P3/Diagnostic), sourceBit, classification**, tagPath, condition, setpoint, delay, notification, notes |
| `gap` | title\*, **category**, severity\*, description\*, recommendedAction, owner, **dueDate**, status, **resolution** |
| `operator` | role\*, need\*, screen, priority, frequency, notes |
| `observation` | title\*, category, description\* |

### 4.3 Remapping when the Analyst schema lands
**`js/schema-map.js`** is the single place to edit:

| Constant | Controls |
|---|---|
| `CSV_COLUMNS` | header/key per CSV; reorder, rename or drop columns |
| `REQUIRED_FIELDS` | the verify gate per record type |
| `PHOTO_TYPES`, `PANEL_SHOT_SET`, `PANEL_KINDS` | photo types, filename tokens, the required panel photo set and which stop kinds use it |
| `TAG_MODEL_DEFAULTS`, `ISA_AREAS`, `stopArea()`, `stopLine()`, `isaPath()`, `optoPath()` | tag paths |
| `TAG_GROUPS`, `PACKML_MEMBERS`, `MHE_TYPES`, `UDT_FOR_TYPE`, `DATA_TYPE_FOR_MEMBER` | tag matrix rows |
| `ALARM_CODES`, `ALARM_PRIORITIES`, `V1_PRIORITY_MAP` | alarm philosophy |
| `STATUS`, `STOP_STATUS`, `CLONE_ID_FIELD`, `CLONE_CLEAR` | statuses and clone behaviour |
| `migrateBundle()` | upgrades older files. Add a `v2 → v3` step here and bump `SCHEMA_VERSION` in `templates.js`. |

Checklists, shot lists and record field specs stay in `js/templates.js`. After editing, run `python3 build-single.py`, bump `VERSION` in `sw.js` and run the tests.

---

## 5. Files

```
index.html             app shell (classic scripts: schema-map → templates → db → zip → exports → app)
styles.css             dark + daylight themes, 60 px targets
manifest.webmanifest   PWA manifest (id, standalone, icons 192/512/maskable)
sw.js                  service worker – cache-first app shell, VERSION sv-3.0.1
js/schema-map.js       ← remappable schema: CSV columns, required fields, photo types, tag model, alarm codes, v1→v2 migration
js/templates.js        schema/app version, stop kinds, default stops, checklists, shot lists, record field specs
js/db.js               IndexedDB helpers
js/zip.js              store-only ZIP writer/reader (CRC32)
js/exports.js          tag/alarm/equipment/issue rows, completion gate, typed media names, CSV/JSON/report/ZIP
js/app.js              UI, routing, autosave, capture + compression, dictation, backup, clone, import/export
site-visit.html        single-file build (generated by build-single.py)
tests/test_v3.py       Playwright test for 3.1.0 + Reviewer fixes (114 checks); tests/test_v2.py (legacy v2 suite, no longer maintained - do not run, it clears screenshots/);
analyst/v3.0.0/        Analyst canonical schema, checklist.json, exports/*.csv, tools/validate.py; tools/gen_analyst.py regenerates js/analyst-schema.js
                       tests/fixtures (v1 exports, 4000×3000 JPEG, video)
screenshots/           25 v3.7.1 Screen-page pills; 01–11 v2 run; 12–15 v3.2.0 (attest, export checks, ref-error prompt, import confirm)
```

## 6. Single-file variant

`site-visit.html` has the CSS, JS (including `schema-map.js`) and icon inlined. Open it directly over `file://`; data persists in that origin's IndexedDB. It has no service worker and cannot be installed. **Laptop only:** the single file has no offline cache, cannot be installed, and on iOS its storage can be evicted, so use the hosted PWA on phones. Regenerate it with `python3 build-single.py`.

## 7. Tests

```bash
pip install playwright && playwright install chromium
python3 tests/test_v3.py     # :8797. Must-fixes MF1–MF6, 3.0.0 attest/gates, seed import, refs, nav matrix, CSV byte-match, IDs, validate.py, upgrades. 54/54 pass
python3 tests/test_v2.py     # starts its own server on :8771, writes tests/out/ and screenshots/
```

Headless Chromium at 390×844 with touch. **70/70 checks pass with no console errors.** Coverage:
* **Install and offline:** SW control, manifest `id`, SW cache contents.
* **Storage:** persist/usage status; localStorage holds only small prefs.
* **Photos:** a 4000×3000 JPEG is compressed to 1600×1200 JPEG (742 KB → 118 KB) and stored as a Blob in IDB; video is stored unchanged.
* **PLC panel gate:**
  * blocked on 6 required photos;
  * then blocked on the checklist only;
  * passes once both are done, then shows the backup prompt and downloads the ZIP;
  * typed filenames are present in the ZIP;
  * *last backup / 0 changes* shows.
* **Auto-backup mode** downloads on completion.
* **Clone section:** MCP-20 → MCP-21 copies the lists and none of the data.
* **Records:** UUID, author and Open status on create. Verify is blocked on a missing IP and then passes. Clone record MDR-101 → MDR-102 clears the serial. Alarm code Jam sets P2.
* **Dictation:** a mocked SpeechRecognition appends text and saves it. The no-API fallback tip shows.
* **60 px targets:** measured on dashboard, panel, record, media, media modal, export and setup.
* **CSVs:** all 4 headers equal `CSV_COLUMNS`, with content checks (ISA/OptoWes paths, PackML, HMI arrays, Jam P2 + source bit, §7.4 suggestions, MDR clones, ISS ids).
* **Exports:** JSON v2 with uuid/author/status on everything; full ZIP CSVs; report sections.
* **v1 import:** v1 JSON migrated (High → P1); v1 ZIP imported as a copy with Blobs and photo types.
* **Offline:** offline deep-link reload, capture and export.
* **Single-file build** loads and creates a visit.

The v1 suite (35 checks) lives with the v1 build at `/workspace/svtest/test.py`.

## 8. Known limits / depends on the Analyst schema

* **Analyst-dependent** (REVIEW §1–3), not done here. Each one is a `schema-map.js` / `templates.js` edit:
  * confirm the tag model (site code `ELL01`, Area/LineOrCell naming);
  * restructure the checklists;
  * pre-seed the 69 panels (20 conveyor MCPs + 49 vendor panels) as stops;
  * Navigation Matrix capture;
  * the final Alarm Philosophy priorities;
  * the status-word index inconsistency (11–13 vs 16) between source docs;
  * the final CSV column names.
* **Not verified on real devices:** airplane mode on an installed iPhone/Android, and glove use at −10 °F. The tests use Chromium's offline emulation.
* **Web Speech limits:**
  * Chrome's recognizer sends audio to a server, so 🎤 does nothing in airplane mode. The keyboard's on-device dictation still works.
  * iOS Safari supports `webkitSpeechRecognition` but is unreliable in home-screen (standalone) mode, which is why the fallback tip exists.
* **Persistent storage** is a browser decision. Chrome usually grants it to installed or bookmarked sites; Safari grants it only to home-screen apps. The UI shows the real state.
* Videos are not compressed (by design), so keep clips short.
