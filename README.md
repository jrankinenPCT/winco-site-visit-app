# Site Visit PWA – WinCo Foods Ellensburg, WA (cold-storage DC)

An offline-first Progressive Web App for capturing a multi-day site visit and turning it into **Ignition SCADA design inputs**: tag paths, UDT patterns, screen requirements per area/role, an alarm matrix, an equipment inventory and printable daily and visit reports.

* **No dependencies:** vanilla HTML/CSS/JS with no build step, no CDN and no network calls.
* **Works offline:** a service worker caches the app shell, and IndexedDB holds everything, including photo and video blobs.
* **Field-friendly:** mobile-first layout where **every touch target is at least 60 px** for gloved use in cold rooms (checked by the test suite) and a high-contrast dark theme by default. There is a **daylight** theme (◐ button) for bright docks and yard, plus an **A+ Text size** toggle.
* **Autosave:** every field saves about 300 ms after you stop typing, and checklist taps save immediately. The header shows `Saving… / Saved ✓`.
* **Single-file variant:** `site-visit.html` contains everything. Open it directly with no server (see below).

Version **3.7.3** · Analyst canonical schema **3.1.0** (`analyst/v3.1.0/`; 3.0.0 exports import with a version bump only) · internal store `schemaVersion: 6`. v1/v2/v3(2.0)/v4(2.1) exports still import and are upgraded on load. See the changelog in §0.

---

## User manual (quick start)

For Jeff, before the Wednesday trip. Use the installed phone app, not `site-visit.html`.

1. **Install (once, while online).** On the iPhone, open **https://jrankinenpct.github.io/winco-site-visit-app/** in **Safari**. Tap Share (□↑) → **Add to Home Screen** → **Add**. From then on, always start the app from the Home Screen icon. It works offline and keeps its data, while a Safari tab can lose its storage. Open the app once while online so everything gets cached. Then tap **Keep data (persist)** on Home.
2. **First run.** Read the Field rules. Under **➕ New visit**, check your name and give this phone its own **ID code** (e.g. `JR`; the second phone gets `JR2`), then tap **Create visit**. The visit comes seeded with the site-wide sections, the areas, all 56 control panels and the screen list.
3. **Bottom tabs:**
   * **🗺️ Stops:** the visit dashboard. It holds the backup bar, the day picker, *Jump to panel* (`MCP-20` or `CP-020`), search, and the stops grouped Site-wide / Areas / per area / Multi-area. Open a stop to work its checklist (✓ Done / N/A / ⛔ Blocked), photos, sections (panels) and records. Use **Panel found on site** to add one that isn't in the list.
   * **📋 Records:** every record (sections/devices, tags, alarms, screens, issues, observations, interviews), filtered by type, panel or search. This tab also has the 🧭 Navigation matrix and the *New …* buttons.
   * **🖼️ Media:** all photos and videos, newest first. Tap one to add a caption, change its type, mark it *Sensitive*, open its record, or delete it.
   * **📤 Export:** backups, the deliverable package, the Analyst CSVs/JSON, the Analyst checks card, reports, and **Import** (restore/merge).
   * **⚙️ Setup:** visit settings (trip, capture mode, your name, the device ID code, *Attach GPS to photos*), the 🏭 Site registry (site code and tag model), 📅 Days (+ New day), Storage, Help/Field rules, and Display (dark/daylight, A+ bigger text).
4. **Photos.** On a stop, each 📷 prompt is one shot. 🔴 *required* shots gate the stop. Tap 📷 (or 🎥 for video, 📁 to pick a file) on the prompt. The round 📷 button at the bottom right takes the **next required photo**. Photos are shrunk to a 1400 px long edge (one photo at a time, so the phone does not run out of memory) and named at capture (`<area>_<subject>_<type>_<yyyymmdd>_<seq>`). Use **N/A** only where it is offered. Extra shots go under the prompt list, and on a record they go in its *Media* card.
5. **GPS.** **Setup → Attach GPS to photos** adds a location to each photo. The first capture asks for location permission; tap **Allow**. Each photo waits up to 5 s for a fix. Indoors (freezer, cooler, docks) a fix often isn't available, and the photo is then saved without GPS, which is normal. GPS is never required.
6. **Back up every day (more often is better).** Tap **💾 Back up now** on Stops, or use **Export → 💾 Incremental backup**. Then tap **Share** → AirDrop / Save to Files / OneDrive, or Download, and confirm. Incremental = all data plus only the new photos. Do an **📦 Full backup** at least once a day and at the end of the visit. To restore: import the full backup first, then each incremental in order. When a stop is verified the app asks to back up; say yes after each panel.
7. **Merging a second phone.** Each phone needs its own ID code. On the second phone, make a **Full backup** and AirDrop the ZIP to the main phone. On the main phone, go to **Export → 📥 Import JSON / ZIP**, pick the file and choose **Merge (keep both sides)**. *Never Replace*: Replace is only for restoring a damaged copy. The **📜 Import log** on Export shows what merged and any conflicts.
8. **Updating the app.** Updates come only from the hosted site. Open the app **while online**. A toast says *"App updated ✓ - close and reopen the app to use the new version"*. Close the app fully (swipe it away) and open it again. That is 2 launches; the version is on Home (*App v…*). Updates never touch your data, but back up first anyway.
9. **`site-visit.html` is for a laptop only.** It's a single-file copy you can open from disk with no server, for reviewing data or exports on a laptop. It has no offline cache, cannot be installed, and on iOS its storage can be lost. Don't use it on the phone for site capture.

**Which mode on Wednesday?** Use the installed Home Screen app (the PWA), offline, in **quick** capture mode unless you need every field (*full*). Don't use "html mode" (`site-visit.html`) on the phone.

---

## Field rules

One page to read before the site visit. The app shows it once on first run and again from **Home → 📋 Field rules** or **Settings → Help**.

1. **One device code per phone.** Each phone needs its own code, e.g. JR on one phone and JR2 on the next. If you reinstall, or a second phone joins, the app asks for a new code before you can capture.
2. **Restore with Merge, never Replace.** Merge keeps the records on both sides. Use Replace only for a damaged device copy. ID counters are kept at their highest either way.
3. **Install to the Home Screen before going on site.** Do this from Safari with Share → Add to Home Screen. A browser tab can lose its storage.
4. **Back up after each panel.** Use Backup (full .zip) and AirDrop it or save it off the phone.

---

## 0. Changelog

### v3.7.3 (2026-10-27) - Low-memory photo capture fix (includes 3.7.2)
- **Bug (iPhone, 3.7.1):** after taking a photo, iOS reported low memory and reloaded the app; the photo was lost. **Cause:** `compressPhoto` decoded the full camera image with `createImageBitmap(file)` (no resize) and kept it while drawing - about 4 bytes per pixel, so 48 MB for 12 MP and 96–190 MB for 24–48 MP, plus an oriented copy in Safari. If that failed it decoded the full image **again** (a second `createImageBitmap`, then an `<img>`), and the thumbnail was made by decoding the full original a **third** time. Photos from separate taps could be processed at the same time, and the file input kept a reference to the original File.
- **Fix - decode once, downscaled:** the size, EXIF orientation, GPS and capture time are read from the first 128 KB of the file only. The photo is decoded with `createImageBitmap(file, {resizeWidth, imageOrientation:'from-image'})` (feature-detected once; otherwise one `<img>` from an object URL that is revoked straight after) and drawn onto **one** canvas at the target size (1400 px long edge, JPEG q0.7, `toBlob` only). The thumbnail is cut from that small canvas. The bitmap, image, object URL and canvas are released before the next step and the File reference is dropped once the photo is stored.
- **One photo at a time:** every capture (camera, library multi-select, video) goes through a serial queue; each photo is stored and flushed to disk before the next is decoded. Videos are stored directly, no decode.
- **Fallbacks:** if encoding fails, it retries automatically at 1000 px q0.6, then 800 px q0.5. If all three fail, a **"⛔ Photo NOT saved"** card opens with a big **Retry** button and **"Save original without compression"** (stores the camera file as-is, no decode). Typed notes and form data are never lost (they are saved before the camera opens and are independent of the photo). The NOT SAVED banner, retry queue and storage-full handling are unchanged. If iOS still kills the app mid-photo, the next launch shows *"Last photo was not saved"* with **Retake**.
- **Unchanged:** existing photos, their IDs (capture-name and SHA-256 legacy IDs) and files are not touched; store schema 6; exports and validate.py (old photos still export `maxEdgePx` 1600, new ones 1400 or the retry size). No GPS fix on the phone → GPS from the photo's EXIF.
- **Measured** (one 8000×6000 / 48 MP EXIF-rotated JPEG, peak renderer memory above idle, `tests/mem_probe.py`): WebKit 590 MB → 434 MB (−26%), memory still held after the photo 408 MB → 231 MB; Chromium ~200 MB → ~208 MB (both are the single unavoidable full decode; 3.7.1 added 1–2 more full decodes on its failure paths). JS heap +0.2–1.2 MB.
- App 3.7.3, SW cache `sv-3.7.3`. test_v3.py 213/213 (new tests/test_capture.py: 10 MB 8000×6000 EXIF-6 photo through the real camera input → 1050×1400, orientation, GPS/metadata, thumb, 128 KB header read, serial queue, forced createImageBitmap/toBlob failures → 1000/800 px → card → Retry / Save original, video, legacy IDs + export, interrupted-capture notice); validate.py 3.1.0 VALID.

### v3.7.2 (2026-10-25) - Analyst follow-up (access-issue dedupe, 3.0.0 attestation stamps, ISS-0020 from checklist.json, README)
- **1. One access issue per section** (already in place since 3.3.0/3.4.0, now covered for every status): while an *Access constraint: {instanceId}* issue (category `gap`) on a section is **Open or InProgress**, tapping ⛔ Blocked again neither prompts nor creates a second one; *Log issue* opens the existing one (`accessIssueFor()` in `exports.js`, used by `offerAccessIssue()` and the Blocked tap in `app.js`). Once that issue is Closed, Answered or Deferred, a new one can be logged. New tests: InProgress deduped, Closed allows exactly one new issue, then that one is deduped too.
- **2. 3.0.0-era presence taps export as attestation stamps with the time they were recorded** (already in place since 3.4.0, now asserted exactly): `r.attest.presentOnSite = {by, at}` → `presenceAttestedBy` / `presenceAttestedAt = new Date(at).toISOString()`. A record without a recorded tap gets **no** stamp (the v5→v6 migration is a version bump with no backfill); times are never invented. New test: an exported 3.0.0 bundle re-imported via the UI exports exactly the recorded ms as ISO.
- **3. "provisional, see ISS-0020" now comes from `checklist.json`:** a panel is provisional when its `panelType` is `vendor` and `areas` has more than one entry. That is the same rule as `tools/gates.shared_vendor_panel`, which `seed_import.py` uses. The hard-coded regex list in `schema-map.js` is gone (`sharedVendorPanels()`, `isProvisionalPanel()`, `provisionalPanelLabels()`). Matching covers the label, the panelId, the label without "(A-I)", the sub-panels (MCP-50A…I, also written MCP-50-A) and leading zeros (MCP-1). The report's "Shared vendor panels (…)" line is built from the same list. **No behaviour change for the current checklist:** the tests compare it with the 3.7.1 list over 87 label variants, all 56 panel stops and all 56 exported ControlPanels, and check the set equals `gates.shared_vendor_panel` over both the app and system checklist.json. A further test edits the checklist in memory: a new 2-area vendor panel gets the marker, MCP-89 cut to 1 area loses it, and a multi-area conveyor panel does not get it.
- README: new *User manual (quick start)*; §2–4 and §8 rewritten for 3.7.2 (store schema 6, Analyst 3.1.0, current exports and limits).
- App 3.7.2, SW cache `sv-3.7.2` (installed phones: open online, close, reopen). The SW update test now reads the current version instead of a fixed string. test_v3.py 192/192; validate.py 3.1.0 VALID.

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
| 1 | **Photo storage** | Blobs were already in IndexedDB at full camera resolution (3–12 MB each); persist was requested only from a button | Photos are **compressed on capture**: canvas, 1600 px long edge (1400 px since 3.7.3), JPEG q0.7. A 4000×3000 test photo goes from 742 KB to 118 KB. The original is kept if compression would not make it smaller. **Videos are stored as-is.** Each item records `origSize`, `width`, `height` and `compressed`. `navigator.storage.persist()` is requested when a visit is created. The storage status (persisted or not, MB used and available) shows on Home, Dashboard, Export and Setup. localStorage holds only small `sv-*` prefs (theme, text size, author). |
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

**Updating:** each deploy bumps `sw.js` `VERSION` (currently `sv-3.7.3`). The service worker caches the app shell cache-first. The new worker installs on the next **online** launch, skips waiting and takes over, and the toast says *"App updated ✓ - close and reopen the app to use the new version"*. The page already open keeps the old code until you close and reopen the app (2 launches). Updates never touch the IndexedDB data.

---

## 2. Using it on site

1. **Home → ➕ New visit.** This is prefilled for WinCo Foods Ellensburg. Fill in the visit name, the **site code** (shown *TO CONFIRM* until confirmed), the trip (Trip1…), dates and visitors. **Your name** is stamped on everything as `createdBy`/`updatedBy` and gives the photo initials. The **ID code for this device** (2–4 letters plus an optional digit, e.g. `JR`, `JR2`) prefixes every ID (`ISS-JR-0001`, `MED-JR-0001`), and each phone needs its own. Capture mode is `quick` or `full`. The visit is seeded from Analyst `checklist.json` 3.1.0: site-wide sections, the areas, **56 control panels** and the seed screens.
2. **Stops tab (dashboard):**
   * the backup bar (*💾 Back up now* / *Full backup*);
   * the day picker and day notes (add a day in Setup → 📅 Days);
   * **Jump to panel** (label or CP number);
   * search;
   * the stops grouped *Site-wide*, *Areas*, per area, *Multi-area* (and *Legacy* for v1/v2 imports). Each stop card shows its status, items done, required photos, blocked items and open issues;
   * **Panel found on site** adds a panel that isn't in the checklist (label, type, areas served);
   * buttons for the Navigation matrix and new records.
3. **A stop:**
   * **Header:** status, ID/type/areas for a panel, the Sub-System fallback (with *provisional, see ISS-0020* on shared vendor panels, see §8), progress, **✔ Verify & complete** (runs the gate and lists what is missing), and *N/A whole stop*.
   * **📷 Photos:** the shot list from the checklist; 🔴 required shots gate the stop. Each shot has 📷 / 🎥 / 📁, and N/A only where the photo type allows it. The floating 📷 takes the next required photo.
   * **☑️ Checklist:** items for the visit's trip. Each is ✓ Done / N/A / ⛔ Blocked, with its fields, questions and a note (with 🎤). Items for other trips are listed but don't gate. *Done* checks the required fields.
   * **⚙️ Sections (panels):** one record per conveyor section/device: conveyor number, equipment type, drive type, instance ID (derived, e.g. `MDR-20950`) and **presence on site** (yes/no, stamped with who/when). Use **+ Section**, **+ Next** (next conveyor number), **CSV seed import** and **Verify selected**. The statuses are `open → walkdown_verified → data_verified → verified` or `na`. **⛔ Blocked** offers to log an *Access constraint: {instanceId}* issue (category gap, linked to section and panel). It never creates a second one while one is Open/InProgress.
   * **📋 Records here** and **📝 Stop notes**.
4. **Records tab:** every record by type: Section/device, Tag, Alarm, Screen (nav matrix), Issue, Observation, Interview. You can filter by panel or search, and add new ones. A record shows its fields (`*` = required for verify), status, media and clone. Screens hold *Navigates to*, *Opto groups* and *Equipment types* pills. **🧭 Navigation matrix** is a from/to grid of the screens with a parent per row.
5. **Media tab:** all photos and videos with their fixed file names. You can edit the caption and photo type, mark a photo **Sensitive** (IPs/network labels, kept out of shared exports unless allowed), open its record, or delete it.
6. **Setup tab:** the visit fields (trip, capture mode, dates, visitors, your name, the device ID code, **Attach GPS to photos**), the **🏭 Site registry** (site code, tag provider/enterprise/OptoWes root), **📅 Days** (+ New day each morning), Storage (request persistent), Help / Field rules, and Display (◐ dark/daylight, A+ bigger text).
7. **Backups:** when a stop is verified the app asks to back up (mode *Ask me* / *Do nothing* on Export). An **incremental** backup is all data plus the media new since the last *confirmed* backup. A **full** backup has everything. A backup counts as done only after the Share completes or you confirm the download. See the quick start for the daily routine and merging a second phone.
8. **Voice notes:** tap **🎤** next to a note. If the browser has no speech API, use the keyboard's own 🎤 (on-device dictation works offline on iOS/Gboard).

---

## 3. Exports (Export tab)

| Button | File | Contents |
|---|---|---|
| 💾 Incremental backup / 📦 Full backup | `<visit>_backup<NNN>_<incremental\|full>_<yyyymmdd-hhmm>.zip` | `visit.json` (all data, Analyst doc included), `analyst/capture.json`, the media (full: all; incremental: new since the last confirmed backup). Restore = full first, then each incremental in order |
| ⬇ Download package / 📤 Share package | `<base>_package.zip` | Deliverable: `visit.json`, `analyst/capture.json` (Analyst schema **3.1.0**), the **5 Analyst CSVs** in `csv/`, the visit report (.html/.md), a daily report per day and all media in `media/` |
| Analyst CSVs | `tag-mapping-matrix.csv`, `alarm-mapping-matrix.csv`, `device-inventory.csv`, `navigation-matrix.csv`, `issue-log.csv` | Headers byte-for-byte equal to `analyst/v3.1.0/exports/*.csv` (checked by the tests) |
| { } Analyst capture JSON | `<base>_analyst-capture.json` | The Analyst 3.1.0 document: `schemaVersion, site, visits, areas, controlPanels, subSystems, equipment, inventoryCounts, commPaths, tags, alarms, screens, issues, media, observations, interviews, checklistResponses, …`. It passes `tools/validate.py` |
| { } App JSON (media referenced) | `<base>.json` | Internal dump: `format: site-visit-pwa`, `schemaVersion: 6`, `appVersion`, `analystSchema`, visit/days/stops/records/media (files referenced as `media/<name>`), plus `analyst` and `exportWarnings` |
| Reports | Daily (print) / Daily .md; Visit report (print) / .html / .md | Progress, sections, device inventory (with the ISS-0020 marker), issue log, tag/alarm matrices, navigation matrix, photo coverage |
| 📥 Import JSON / ZIP | - | Restore or merge (see below) |

* **Analyst 3.1.0 checks card:** shows unresolved references (panel/Sub-System/area), schema errors, gate/status errors and warnings, using the same rules as `validate.py` / `gates.py`.
  * Exports with errors ask *Cancel - fix first / Export anyway*.
  * The same device or screen recorded twice **blocks** the export until the two are merged.
  * Blocked sections without an access issue get a soft nudge.
* **Attestation (3.1.0):** a section whose `presentOnSite` is yes/no exports `presenceAttestedBy` + `presenceAttestedAt` (ISO UTC) from the recorded tap, both or neither. A missing or malformed tap emits nothing and adds an advisory warning.
* **Sensitive values** (IPs, *Sensitive* photos) are left out of shared exports unless *Include sensitive values* is ticked.
* CSVs are UTF-8 with a BOM, for Excel. Column order comes from `analyst/v3.1.0/exports` via `js/analyst-schema.js`.
* **Import:** accepts a backup/package ZIP or JSON from any app version (v1–v6 store schemas; Analyst 2.0.0/2.1.0/3.0.0/3.1.0). Older files are upgraded on load: v1/v2 → v3 → v4 → v5 → v6, where the last step changes version strings only. If the visit already exists the choices are **Merge (keep both sides)** (recommended), *Import as copy*, or *Replace* (a damaged device copy only; staged and swapped in one transaction). ID counters never roll back. Each import is recorded in the **📜 Import log** with its conflicts and renumbered IDs.

### Tag paths (SUP §1.5)
* ISA-95: `[tagProvider]enterprise/siteCode/area/lineOrCell/equipmentType/instanceId/folder/point`, e.g. `[default]KPI/ELL01/Ambient/CP-020/MDRZone/MDR-20101/Status/StateCurrent`.
* OptoWes view: `[default]OptoWes/MHE/<Instance>/<Point>`.
* The provider, enterprise, site code and OptoWes root are set in **Setup → 🏭 Site registry**, which shows a live example path. Paths that don't match the Analyst patterns are left out with a warning.

---

## 4. Data model (store `schemaVersion: 6`, Analyst 3.1.0)

IndexedDB `site-visit-pwa` (DB version 2) has the stores `visits`, `days`, `stops`, `records` and `media`, each with a `visitId` index, plus `staging` (a Replace import is staged there and swapped in one transaction). Photos and videos are **Blobs** in `media`. Internal IDs are UUIDs; the human IDs are `<KIND>-<devcode>-NNNN`. Times are epoch ms internally and ISO UTC in exports. Every entity has `id, createdAt, updatedAt, createdBy, updatedBy`.

| Entity | Main fields |
|---|---|
| **visit** | `name, trip, startDate, endDate, visitors[], site{…}, tagModel, captureMode, gps, backupMode, backup{lastAt, seq}, hwm, shareSensitive, importLog[], schemaVersion (6), analystSchema ('3.1.0'), migratedFrom` |
| **day** | `visitId, date, label, notes` |
| **stop** | `visitId, kind (site\|area\|panel\|legacy), key, name, group, order, areaCodes[], items[], resp{itemId:{state todo\|done\|na\|blocked, a{}, q{}, note}}, shots[], recordStatus, notes`; panels add `panel{label, idNorm, type, vendorSystems, flags, subPanels, expected, subSystemIds, primarySubSystemId}` |
| **record** | `visitId, dayId, stopId, type (section\|tag\|alarm\|screen\|issue\|observation\|interview), bid, f{…}, recordStatus (open\|walkdown_verified\|data_verified\|verified\|na), attest.presentOnSite{by, at}, subFallback, seedSource` |
| **media** | `visitId, dayId, stopId, shotId, recordId, kind, mime, filename, seq, uuid, size, photoType, note, sensitive, gps{lat, lon, acc}, crc, blob` |

* **Field specs and gates** come from the Analyst bundle (`analyst/v3.1.0/`), compiled into `js/analyst-schema.js` by `tools/gen_analyst.py`.
* **Mapping** to the Analyst document lives in `js/schema-map.js`: instance IDs, the Sub-System fallback, `PROVISIONAL_SUBSYSTEM`, the access-issue template, the attestation map and media file names.
* **Migrations** live in `js/migrations.js`; the gate rules are in `gates.js` (a port of `tools/gates.py`).
* **Changing the schema:** after editing, run `python3 build-single.py`, bump `APP_VERSION` (`js/templates.js`) and `VERSION` (`sw.js`), and run the tests.

---

## 5. Files

```
index.html             app shell (classic scripts: schema-map → templates → db → zip → exports → app)
styles.css             dark + daylight themes, 60 px targets
manifest.webmanifest   PWA manifest (id, standalone, icons 192/512/maskable)
sw.js                  service worker – cache-first app shell, VERSION sv-3.7.3
js/schema-map.js       ← remappable schema: CSV columns, required fields, photo types, tag model, alarm codes, v1→v2 migration
js/templates.js        schema/app version, stop kinds, default stops, checklists, shot lists, record field specs
js/db.js               IndexedDB helpers
js/zip.js              store-only ZIP writer/reader (CRC32)
js/exports.js          tag/alarm/equipment/issue rows, completion gate, typed media names, CSV/JSON/report/ZIP
js/app.js              UI, routing, autosave, capture + compression, dictation, backup, clone, import/export
site-visit.html        single-file build (generated by build-single.py)
tests/test_v3.py       Playwright test for 3.1.0 + Reviewer fixes (114 checks); tests/test_v2.py (legacy v2 suite, no longer maintained - do not run, it clears screenshots/);
analyst/v3.1.0/        Analyst canonical schema, checklist.json, exports/*.csv, tools/validate.py; tools/gen_analyst.py regenerates js/analyst-schema.js
                       tests/fixtures (v1 exports, 4000×3000 JPEG, video)
screenshots/           25 v3.7.1 Screen-page pills; 01–11 v2 run; 12–15 v3.2.0 (attest, export checks, ref-error prompt, import confirm)
```

## 6. Single-file variant

`site-visit.html` has the CSS, JS (including `schema-map.js`) and icon inlined. Open it directly over `file://`; data persists in that origin's IndexedDB. It has no service worker and cannot be installed. **Laptop only:** the single file has no offline cache, cannot be installed, and on iOS its storage can be evicted, so use the hosted PWA on phones. Regenerate it with `python3 build-single.py`.

## 7. Tests

```bash
pip install playwright && playwright install chromium
python3 tests/test_v3.py     # :8797 (+ :8798 for the SW update check). 3.7.3: 213/213 pass (includes the 21 photo-capture checks from tests/test_capture.py), including validate.py 3.1.0 VALID on the app exports
python3 tests/test_capture.py [URL]  # :8799 or a live URL - low-memory capture checks only (3.7.3)
python3 tests/mem_probe.py OLD_DIR NEW_DIR  # peak renderer memory for one 48 MP photo, old build vs new (Chromium + WebKit)
python3 tests/test_v2.py     # starts its own server on :8771, writes tests/out/ and screenshots/
```

Headless Chromium at 390×844 with touch, no page errors. The list below is the original v2 coverage; test_v3.py now covers every changelog entry in §0. Coverage:
* **Install and offline:** SW control, manifest `id`, SW cache contents.
* **Storage:** persist/usage status; localStorage holds only small prefs.
* **Photos:** a 4000×3000 JPEG is compressed to 1400×1050 JPEG (742 KB → 102 KB) and stored as a Blob in IDB; video is stored unchanged.
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

## 8. Known limits (3.7.3)

* **Open Analyst items, held in data rather than code:**
  * **ISS-0020:** the Sub-System/Area of shared vendor panels is provisional. Sections on vendor panels with more than one area in `checklist.json` (currently MCP-01, MCP-02, MCP-50(A-I), MOVU-ASTC, MCP-89, MCP-90) use the panel's primary Sub-System and are marked *provisional, see ISS-0020* in the app, the exports (notes + `sourceRefs` review/ISS-0020) and the report. When the checklist changes, the marker follows with no code change.
  * The **status-word encoding** per panel is not released (`STATUS_ENCODING`, from `statusEncodings`).
  * The **site code** shows *TO CONFIRM* until it is confirmed in `SITE_DEFAULTS`.
* **Updates need 2 launches:** the new service worker takes over on the first online launch, and the new code runs after you close and reopen. An app opened offline keeps the cached version.
* **Single file (`site-visit.html`):** for a laptop only. It has no service worker or offline cache and cannot be installed, its data is tied to that file path and browser profile, and iOS can evict it.
* **Storage:** persistent storage is the browser's decision (Safari grants it only to Home Screen apps). iOS can evict data from apps that go unused, so back up daily. A backup is marked done only after a confirmed share/download.
* **Two phones don't sync live:** merge by Export → Import → *Merge*. The same device recorded on both phones is flagged as a duplicate and blocks the export until it is merged.
* **GPS** is best effort, with a 5 s timeout per photo. Indoors there is often no fix and the photo is saved without one.
* **Not verified on real devices:** airplane mode on an installed iPhone/Android and use with gloves at −10 °F. The tests use headless Chromium at 390×844 with touch and offline emulation.
* **Web Speech:** Chrome's recognizer needs a network connection. iOS standalone mode is unreliable, so use the keyboard's 🎤 instead.
* Videos are not compressed, so keep clips short. Photos are re-encoded to 1400 px JPEG q0.7 (1000 px q0.6 / 800 px q0.5 if the phone is short of memory). The browser still has to decode the full camera image once (about 4 bytes per pixel, e.g. 190 MB for 48 MP) - no web app can avoid that; 3.7.3 makes sure it happens only once per photo and one photo at a time.
