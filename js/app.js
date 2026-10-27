/* Site Visit PWA v3 - UI. Classic script (no modules) so it can be inlined into a single file.
   Data model: stops (site sections / areas / control panels from checklist.json) + records (sections, tags, alarms,
   screens, issues, observations, interviews) + media. Analyst rules live in schema-map.js; this file is UI only. */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
const today = () => dayOf(Date.now());
const pathOf = f => String(f).includes('|') ? String(f).split('|') : String(f).split('.');
const getP = (o, f) => pathOf(f).reduce((a, k) => a?.[k], o);
const setP = (o, f, v) => { const ks = pathOf(f); let t = o; ks.slice(0, -1).forEach(k => t = t[k] = t[k] && typeof t[k] === 'object' && !Array.isArray(t[k]) ? t[k] : {}); t[ks.at(-1)] = v; };
let S = null;            // current visit bundle {visit, days, stops, records, media}
let capCtx = {};
let deferredInstall = null;
const ui = { open: JSON.parse(localStorage.getItem('sv-open') || '{}'), stopQ: '', recQ: '', recPanel: '', recLimit: 50, mediaLimit: 60, sel: new Set(), showMiss: '' };
/* localStorage = small device prefs only (sv-theme, sv-big, sv-open, sv-author, sv-device). Visit data + Blobs live in IndexedDB. */
const author = () => localStorage.getItem('sv-author') || String(S?.visit?.visitors?.[0] || '').replace(/\s*\(.*\)\s*$/, '');
const who = () => { const a = author(); return { createdBy: a, updatedBy: a }; };
/* 3.6.0 M2: device ID code (2-4 letters) = prefix of every ID minted here. Set once at setup; locked once used (Change… needs a confirm). */
const devCode = () => { const c = String(localStorage.getItem('sv-code') || '').toUpperCase(); return validDevCode(c) ? c : fileInitials(author() || 'XX').replace(/[^A-Z]/g, '').slice(0, 4).padEnd(2, 'X'); };
const codeLocked = () => !!localStorage.getItem('sv-code-used');
/* registers this device's code in the visit; returns the clash entry when another device uses the same code */
function registerDevice(v, live = true) { const c = devCode(), me = deviceId(); v.devices = v.devices || {}; const d = v.devices[c];
  if (!d) { v.devices[c] = { device: me, name: author(), at: Date.now() }; if (live) touch('visits', v); return null; }
  if (d.device !== me && !(d.others || []).some(o => o.device === me)) { d.others = [...(d.others || []), { device: me, name: author(), at: Date.now() }]; if (live) touch('visits', v); }
  return codeClashOf(v, c); }
function codeClashOf(v, c = devCode()) { const d = v?.devices?.[c]; if (!d) return null; const all = [d, ...(d.others || [])]; return new Set(all.map(o => o.device)).size > 1 ? { code: c, names: all.map(o => o.name || o.device) } : null; }
let clashWarned = '';
/* 3.7.0 S3: per-visit, per-device-code counter high-water mark kept OUTSIDE the visit too (localStorage 'sv-hwm' = {visitId: {kind@CODE: n}}).
   A Replace with an older backup restores visit.seq from the file; raiseCounters() then puts every counter back to the max of
   visit.seq, visit.hwm, this device's sv-hwm and the highest ID already in use - so an ID is never minted twice. */
const hwmAll = () => { try { return JSON.parse(localStorage.getItem('sv-hwm') || '{}') || {}; } catch (_) { return {}; } };
function hwmBump(vid, key, n) { const a = hwmAll(), m = a[vid] = a[vid] || {}; if ((m[key] || 0) >= n) return; m[key] = n; try { localStorage.setItem('sv-hwm', JSON.stringify(a)); } catch (_) {} }
const legacyBid = b => /^MED-LEG-/.test(b || '');
function bidSeqKey(b) { const kind = PREFIX_KIND[String(b).split('-')[0]], c = bidCode(b); if (!kind || legacyBid(b) || /-[0-9a-f]{6}$/.test(b)) return ''; return c ? kind + '@' + c : kind; }
function raiseCounters(B, extra = []) { const v = B.visit, raised = []; v.seq = v.seq || {}; v.hwm = v.hwm || {};
  const src = [v.hwm, hwmAll()[v.id] || {}, ...extra], inUse = {};
  for (const o of [...B.records, ...B.media]) { const k = o.bid && bidSeqKey(o.bid); if (k) inUse[k] = Math.max(inUse[k] || 0, bidNum(o.bid)); }
  for (const k of new Set([...Object.keys(v.seq), ...Object.keys(inUse), ...src.flatMap(x => Object.keys(x || {}))])) {
    const n = Math.max(v.seq[k] || 0, inUse[k] || 0, ...src.map(x => x?.[k] || 0));
    if (n > (v.seq[k] || 0)) raised.push({ counter: k, was: v.seq[k] || 0, now: n }); v.seq[k] = n; v.hwm[k] = Math.max(v.hwm[k] || 0, n); hwmBump(v.id, k, n); }
  return raised; }
function bidFor(B, kind) { const v = B.visit, c = devCode(), live = B === S; v.seq = v.seq || {};
  const clash = registerDevice(v, live); if (live && clash && clashWarned !== v.id + c) { clashWarned = v.id + c; setTimeout(() => toast(`⚠ ID code ${c} is used by more than one device in this visit (${clash.names.join(', ')}). Set a different code on one of them: Visit setup → ID code.`, 7000), 60); }
  const key = kind + '@' + c, n = Math.max(v.seq[key] || 0, v.hwm?.[key] || 0, hwmAll()[v.id]?.[key] || 0) + 1;
  v.seq[key] = n; v.hwm = { ...(v.hwm || {}), [key]: n }; hwmBump(v.id, key, n); localStorage.setItem('sv-code-used', c); if (live) touch('visits', v); return seqId(kind, n, c); }
/* 3.7.0 S2: this device's code is registered to ANOTHER device in this visit (second phone with the same initials, or a reinstall
   = new device id). Capture is blocked until a code of its own is picked (suggested: same letters + digit, JR2). */
const codeOwnerElsewhere = (v, c = devCode()) => { if (window.SV_TEST_SHARED_CODE) return null; const d = v?.devices?.[c]; return d && d.device !== deviceId() ? d : null; };
function suggestCode(v, c = devCode()) { const base = c.replace(/[0-9]$/, ''); for (let i = 2; i <= 9; i++) if (!v?.devices?.[base + i]) return base + i; return base.slice(0, 3) + 'X'; }
async function codeOwnersOnPhone() { const out = {}; for (const v of await dbAll('visits')) for (const [c, d] of Object.entries(v.devices || {})) if (d.device !== deviceId() && !out[c]) out[c] = { ...d, visit: v.name || v.id }; return out; }
function codePickBlocker() {
  const v = S?.visit, own = v && codeOwnerElsewhere(v); let ov = $('#codepick');
  if (!own) { ov?.remove(); return false; }
  if (ov) return true;
  const cur = devCode(), sug = suggestCode(v, cur);
  ov = document.createElement('div'); ov.id = 'codepick'; ov.className = 'blocker';
  ov.innerHTML = `<div class="mbox"><h2>Pick this phone's ID code</h2><p><b>${esc(cur)}</b> is already registered to <b>${esc(own.name || 'another device')}</b> in this visit. Every phone needs its own code, otherwise two phones mint the same IDs (ISS-${esc(cur)}-0004 twice).</p>
    <p class="small">Same initials? Add a digit: <b>${esc(sug)}</b>. Reinstalled this phone? Still pick a new code - the old install's counters may be newer than this backup.</p>
    <label class="fld"><span>ID code for this phone (2-4 letters + optional digit)</span><input id="codepickin" value="${esc(sug)}" maxlength="5" autocapitalize="characters"></label>
    <p class="small bad" id="codepickerr"></p><button class="btn big pri" data-act="codepickok">Use this code</button></div>`;
  document.body.appendChild(ov); return true; }
async function codePickOk() {
  const c = String($('#codepickin')?.value || '').trim().toUpperCase(), err = t => { const e = $('#codepickerr'); if (e) e.textContent = t; };
  if (!validDevCode(c)) return err('2-4 letters A-Z, optionally one digit (JR2)');
  const d = S.visit.devices?.[c]; if (d && d.device !== deviceId()) return err(`${c} is also used by ${d.name || 'another device'} - pick another`);
  localStorage.setItem('sv-code', c); localStorage.setItem('sv-code-used', ''); registerDevice(S.visit); raiseCounters(S); touch('visits', S.visit); await flush();
  $('#codepick')?.remove(); toast(`ID code set to ${c} ✓ - new IDs: ISS-${c}-0001`, 3500); route(); }
/* 3.6.0 B2 / 3.7.0 S1: every photo / bid-type record gets its ID; stored ones missing it are upgraded on load + import.
   Legacy photo IDs are derived from the ORIGINAL capture name (capName, or rebuilt from the author / sequence / uuid that made it),
   else from a SHA-256 of the photo bytes - never from the current (possibly renamed) file name, so every device derives the same ID. */
async function sha256Hex(blob) { try { const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (_) { return ''; } }
function captureName(B, m) { if (m.capName) return m.capName; if (!(m.seq > 0) || !m.uuid) return '';
  try { return mediaFilename({ ...mediaTokens(B, m), seq: m.seq, uuid: m.uuid, ext: mediaExt(m.mime) }); } catch (_) { return ''; } }
async function legacyMediaBid(B, m) {
  const f = /_([A-Z]{2,4})-(\d{3,})-([0-9a-f]{6})\.[A-Za-z0-9]+$/.exec(captureName(B, m)); if (f) return `MED-${f[1]}-${f[2]}-${f[3]}`;
  const h = m.blob ? await sha256Hex(m.blob) : ''; if (h) return `MED-LEG-${h.slice(0, 10)}`;
  return `MED-LEG-${String(m.uuid || m.id).replace(/-/g, '').slice(0, 10).toLowerCase()}`; }
async function backfillBids(B) { let n = 0; const T = (st, o) => { if (B === S) touch(st, o); };
  for (const m of B.media) { if (m.bid) continue; m.bid = await legacyMediaBid(B, m);
    if (B.media.some(x => x !== m && x.bid === m.bid)) m.bid = `MED-LEG-${String(m.uuid || m.id).replace(/-/g, '').slice(0, 10).toLowerCase()}`; T('media', m); n++; }
  for (const r of B.records) if (REC[r.type]?.bid && !r.bid) { r.bid = bidFor(B, REC[r.type].bid); T('records', r); n++; }
  return n; }

/* ================= persistence: pending-write queue (review must-fix 5) =================
   Every edit is queued; flush() writes the WHOLE queue in one transaction. On failure (QuotaExceededError ...) the queue
   is kept, a red NOT SAVED banner stays up, and flush retries with back-off. "Saved ✓" only shows when the queue is empty. */
const pending = new Map(); let saveTimer = null, saveFail = 0, lastSaveErr = null, flushing = null;
function touch(store, obj) { REV.n++; obj.updatedAt = Date.now(); obj.updatedBy = author(); pending.set(store + ':' + obj.id, [store, obj]); setStatus(); schedule(300); }
function schedule(ms) { clearTimeout(saveTimer); saveTimer = setTimeout(() => flush(), ms); }
async function flush() {
  if (flushing) { await flushing; if (!pending.size) return !saveFail; }
  clearTimeout(saveTimer);
  if (!pending.size) { setStatus(); return true; }
  flushing = (async () => {
    const snap = [...pending.entries()].map(([k, [s, o]]) => [k, s, o, o.updatedAt]);
    const items = snap.map(([, s, o]) => [s, o]);
    if (S?.visit && !items.some(([s]) => s === 'visits')) { S.visit.updatedAt = Date.now(); items.push(['visits', S.visit]); }
    try {
      await dbPutMany(items);
      for (const [k, , o, at] of snap) if (pending.get(k)?.[1] === o && o.updatedAt === at) pending.delete(k);   // edits made during the write stay queued
      saveFail = 0; lastSaveErr = null;
    } catch (e) { saveFail++; lastSaveErr = e; console.warn('save failed', e); schedule(Math.min(30000, 1000 * 2 ** Math.min(saveFail, 5))); }
    finally { setStatus(); }
  })();
  try { await flushing; } finally { flushing = null; }
  if (pending.size && !saveFail) schedule(50);
  return !saveFail && !pending.size;
}
addEventListener('pagehide', () => flush()); document.addEventListener('visibilitychange', () => document.hidden && flush());
addEventListener('beforeunload', e => { if (pending.size) { flush(); e.preventDefault(); e.returnValue = ''; } });
function setStatus() {
  const el = $('#savestat'), bad = pending.size && saveFail;
  if (el) { el.textContent = !pending.size ? 'Saved ✓' : bad ? 'NOT SAVED' : 'Saving…'; el.className = 'stat ' + (!pending.size ? 'ok' : bad ? 'bad' : 'busy'); }
  sysBar('notsaved', bad ? `<b>⛔ NOT SAVED</b> - ${pending.size} change${pending.size === 1 ? '' : 's'} are only in memory (${esc(lastSaveErr?.name === 'QuotaExceededError' ? 'device storage is full' : lastSaveErr?.message || 'storage error')}). Do not close the app.
    <span class="row"><button class="btn sm" data-act="retrysave">Retry now</button><button class="btn sm" data-act="go" data-href="${S ? '#/v/' + S.visit.id + '/media' : '#/'}">Free space: media</button></span>` : '');
}
function toast(t, ms = 2400, html = false) { const el = $('#toast'); if (html) el.innerHTML = t; else el.textContent = t; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), ms); }
/* persistent system banners above the app (NOT SAVED, iOS tab, storage) */
function sysBar(id, html) {
  let host = $('#sysbars'); if (!host) { host = document.createElement('div'); host.id = 'sysbars'; document.body.prepend(host); }
  let el = document.getElementById(id);
  if (!html) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = id; el.className = 'sysbar ' + id; el.setAttribute('role', 'alert'); host.appendChild(el); }
  el.innerHTML = html;
}

/* ================= storage quota (must-fix 5: estimate before capture) ================= */
const quota = { level: 'ok', usage: 0, quota: 0, at: 0 };
async function storageEstimate() { try { return navigator.storage?.estimate ? await navigator.storage.estimate() : null; } catch (e) { return null; } }
async function refreshQuota() {
  const e = await storageEstimate(); if (!e || !e.quota) { quota.level = 'ok'; return quota; }
  const free = e.quota - e.usage, r = e.usage / e.quota;
  Object.assign(quota, { usage: e.usage, quota: e.quota, at: Date.now(), level: r >= 0.9 || free < 50 * 1048576 ? 'block' : r >= 0.8 || free < 200 * 1048576 ? 'warn' : 'ok' });
  sysBar('quotabar', quota.level === 'ok' ? '' : `<b>${quota.level === 'block' ? '⛔ Storage full' : '⚠️ Storage low'}</b> - ${(free / 1048576).toFixed(0)} MB free of ${(e.quota / 1048576).toFixed(0)} MB. Back up, then delete old media or visits.${quota.level === 'block' ? ' New photos are blocked.' : ''}`);
  return quota;
}
setInterval(refreshQuota, 30000);

/* ================= iOS: must run from the Home Screen (must-fix 6) ================= */
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
function iosGate() {
  if (!isIOS() || isStandalone() || window.SV_SINGLE) return;
  sysBar('iosbar', '<b>⚠️ Running in a Safari tab.</b> Data here is separate from the Home Screen app and Safari may delete it after 7 days without use. Install: Share ⎋ › Add to Home Screen, then open the icon.');
  if (sessionStorage.getItem('sv-ios-tab-ok')) return;
  const ov = document.createElement('div'); ov.id = 'iosblock'; ov.className = 'blocker';
  ov.innerHTML = `<div class="mbox"><h2>Install before you capture</h2><p>This is an iPhone/iPad <b>browser tab</b>. Site data saved here is <b>not</b> shared with the Home Screen app and can be wiped by Safari.</p>
   <ol><li>Tap <b>Share</b> (square with arrow)</li><li>Tap <b>Add to Home Screen</b></li><li>Open <b>Site Visit</b> from the Home Screen</li></ol>
   <button class="btn" data-act="iostab">Continue in the tab anyway (testing only)</button></div>`;
  document.body.appendChild(ov);
}

/* ================= single-tab lock (should-fix: Web Locks, BroadcastChannel fallback) ================= */
const TAB_ID = uid(), LOCK = 'sv-single-tab';
const tabLock = { ok: false, bc: 'BroadcastChannel' in window ? new BroadcastChannel('sv-tab') : null, release: null };
function lockOverlay(show, why) {
  let ov = $('#tablock');
  if (!show) { ov?.remove(); return; }
  if (!ov) { ov = document.createElement('div'); ov.id = 'tablock'; ov.className = 'blocker'; document.body.appendChild(ov); }
  ov.innerHTML = `<div class="mbox"><h2>Open in another tab</h2><p>${esc(why || 'Site Visit is already open in another tab or window on this device.')} Only one tab may edit at a time so edits cannot overwrite each other.</p>
    <button class="btn big pri" data-act="takeover">Use this tab instead</button></div>`;
}
function acquireLock(steal = false) {
  if (navigator.locks?.request) {
    navigator.locks.request(LOCK, steal ? { steal: true } : { ifAvailable: true }, lock => {
      if (!lock) { tabLock.ok = false; lockOverlay(true); return; }
      tabLock.ok = true; lockOverlay(false); if (steal) route();
      return new Promise(res => tabLock.release = res);
    }).catch(e => { if (e?.name === 'AbortError') { tabLock.ok = false; flush(); lockOverlay(true, 'This visit was taken over by another tab.'); } });
  } else if (tabLock.bc) {   // fallback: ask who is there
    let busy = false; const h = e => { if (e.data?.t === 'busy' && e.data.to === TAB_ID) busy = true; };
    tabLock.bc.addEventListener('message', h); tabLock.bc.postMessage({ t: steal ? 'takeover' : 'hello', from: TAB_ID });
    setTimeout(() => { tabLock.bc.removeEventListener('message', h); tabLock.ok = steal || !busy; lockOverlay(!tabLock.ok); if (steal) route(); }, 350);
  } else tabLock.ok = true;
}
tabLock.bc?.addEventListener('message', e => {
  const m = e.data || {};
  if (m.t === 'hello' && tabLock.ok) tabLock.bc.postMessage({ t: 'busy', to: m.from });
  if (m.t === 'takeover' && m.from !== TAB_ID && tabLock.ok) { flush(); if (!navigator.locks?.request) { tabLock.ok = false; lockOverlay(true, 'This visit was taken over by another tab.'); } }
  if (m.t === 'changed' && m.from !== TAB_ID && S) { S = null; }
});
async function takeOver() { tabLock.bc?.postMessage({ t: 'takeover', from: TAB_ID }); await new Promise(r => setTimeout(r, 300)); S = null; acquireLock(true); }

/* ================= load / create ================= */
async function loadVisit(id) {
  if (S?.visit.id === id) return S;
  await flush();
  const visit = await dbGet('visits', id); if (!visit) return (S = null);
  const [days, stops, records, media] = await Promise.all(['days', 'stops', 'records', 'media'].map(s => dbByVisit(s, id)));
  S = { visit, days, stops, records, media }; sortBundle(S);
  const notes = migrateBundle(S), nb = await backfillBids(S), up = raiseCounters(S);
  if (nb || up.length) { touch('visits', S.visit); await flush(); if (nb) console.info(`3.6.0: ${nb} missing photo/record IDs assigned`); if (up.length) console.info('3.7.0: counters raised to high-water mark', up); }
  if (notes) { await dbPutMany([['visits', S.visit], ...['days', 'stops', 'records', 'media'].flatMap(s => S[s].map(o => [s, o]))]);
    const old = new Set([...S.stops, ...S.records, ...S.media].map(o => o.id)); for (const s of ['stops', 'records']) for (const k of await dbKeysByVisit(s, id)) if (!S[s].some(o => o.id === k)) await dbDel(s, k);
    sortBundle(S); showNotes('Visit upgraded', notes); }
  return S;
}
function sortBundle(B) { B.days.sort((a, b) => a.date.localeCompare(b.date)); B.stops.sort((a, b) => a.order - b.order); B.records.sort((a, b) => a.createdAt - b.createdAt); B.media.sort((a, b) => a.createdAt - b.createdAt); }
function newDay(visitId, date, n) { return { id: uid(), visitId, date, label: 'Day ' + n, notes: '', createdAt: Date.now(), updatedAt: Date.now(), ...who() }; }
function seedScreenRecords(B, day) {
  const map = {}, out = []; AS.seedScreens.forEach(s => map[s.id] = uid());
  const areaStop = id => B.stops.find(s => s.kind === 'area' && ('AREA-' + s.key === id || s.key === id))?.id || '';
  const panelStop = id => B.stops.find(s => s.kind === 'panel' && ('PNL-' + s.panel.label === id || s.panel.label === id))?.id || '';
  for (const s of AS.seedScreens) {
    const f = { screenCode: s.screenCode, codeStatus: s.codeStatus, layer: s.layer, altitude: s.altitude, name: s.name, viewFolder: s.viewFolder || '', fullViewName: s.fullViewName || '',
      areaId: areaStop(s.areaId), subArea: s.subArea || '', panelId: panelStop(s.panelId), parentScreenId: map[s.parentScreenId] || '', navigatesTo: (s.navigatesTo || []).map(x => map[x]).filter(Boolean),
      viewParams: s.viewParams || [], optoGroups: s.optoGroups || [], permissionKey: s.permissionKey || '', equipmentTypes: s.equipmentTypes || [], commandsExposed: s.commandsExposed || [],
      docRef: refsText(s.sourceRefs), notes: s.notes || '' };
    out.push({ id: map[s.id], visitId: B.visit.id, dayId: day.id, stopId: '', type: 'screen', f, recordStatus: 'open', gates: {}, seedSource: 'analyst-sample', createdAt: Date.now(), updatedAt: Date.now(), ...who() });
  }
  return out;
}
async function createVisit(d) {
  const id = uid(), now = Date.now();
  /* 3.7.0 S2: at setup the code is checked against every device code this phone already knows (other visits, teammates' backups) */
  { const c = String(d.devcode || '').trim().toUpperCase(), want = validDevCode(c) && !codeLocked() ? c : null, owners = await codeOwnersOnPhone();
    const prevAuthor = localStorage.getItem('sv-author'); if (d.author) localStorage.setItem('sv-author', String(d.author).trim());
    const eff = want || devCode(), o = owners[eff];
    if (o && !window.SV_TEST_SHARED_CODE) { if (d.author) { if (prevAuthor === null) localStorage.removeItem('sv-author'); else localStorage.setItem('sv-author', prevAuthor); }
      toast(`⛔ ID code ${eff} is already used by ${o.name || 'another device'} (visit "${o.visit}"). Pick another code for this phone, e.g. ${suggestCode({ devices: owners }, eff)}.`, 7000); return null; }
    if (want) localStorage.setItem('sv-code', want); }
  const day = newDay(id, d.startDate || today(), 1);
  const site = { ...SITE_DEFAULTS }; for (const k of Object.keys(SITE_DEFAULTS)) if (d[k] !== undefined && d[k] !== '') site[k] = typeof SITE_DEFAULTS[k] === 'boolean' ? !!d[k] : String(d[k]).trim();
  if (d.site && !d.siteName) site.siteName = d.site;
  const visit = { id, schemaVersion: SCHEMA_VERSION, analystSchema: AS.version, name: d.name || d.site || site.siteName, site, trip: TRIPS.includes(d.trip) ? d.trip : TRIPS[0], captureMode: d.captureMode || 'quick',
    startDate: d.startDate || today(), endDate: d.endDate || '', visitors: splitList(String(d.visitors || '').replace(/,/g, ';')), clientContacts: [], seq: {}, mediaSeq: {},
    devices: { [devCode()]: { device: deviceId(), name: author(), at: now } }, tombs: {}, aliases: {},
    backup: { lastAt: 0, kind: '', mediaMark: 0, seq: 0 }, backupMode: 'prompt', shareSensitive: false, gps: true, activeDayId: day.id, lastStopId: '', createdAt: now, updatedAt: now, ...who() };
  const B = { visit, days: [day], stops: seedStops(id), records: [], media: [] };
  B.records = seedScreenRecords(B, day);
  requestPersist();
  await dbPutMany([['visits', visit], ['days', day], ...B.stops.map(s => ['stops', s]), ...B.records.map(r => ['records', r])]);
  return id;
}
const activeDay = () => S.days.find(d => d.id === S.visit.activeDayId) || S.days.at(-1);
const nextBid = kind => bidFor(S, kind);
const panelStops = () => S.stops.filter(s => s.kind === 'panel');
const sectionsOf = stopId => S.records.filter(r => r.type === 'section' && r.stopId === stopId);
function sectionDefaults(stop) {
  const prev = stop ? sectionsOf(stop.id).at(-1) : null, f = { overlay: {}, packml: {} };
  for (const fd of SECTION_FIELDS) { if (fd.type === 'packmlGrid' || fd.attest) continue;   /* 3.0.0: attest fields (presentOnSite) are never defaulted */
    if (fd.default === 'previous') { const v = prev && getD(prev.f, fd.key); if (!isBlank(v)) setD(f, fd.key, v); } else if (fd.default !== undefined) setD(f, fd.key, fd.default); }
  const pd = stop?.resp?.['CP-06']?.a?.packmlDefault, def = EN.packmlAvail.includes(pd) ? pd : 'unknown';
  for (const [folder, mm] of Object.entries(AS.packml)) { f.packml[folder] = {}; for (const [m] of mm) f.packml[folder][m] = def; }
  return f;
}
function newRecord(type, stopId, f0 = {}) {
  const stop = S.stops.find(s => s.id === stopId);
  const f = type === 'section' ? sectionDefaults(stop) : { ...(REC_DEFAULTS[type] || {}) };
  for (const [k, v] of Object.entries(f0)) setD(f, k, v);
  if (stop?.kind === 'panel' && ['tag', 'alarm', 'issue', 'observation', 'screen'].includes(type) && !f.panelId) f.panelId = stop.id;
  if (stop?.kind === 'area' && ['issue', 'observation', 'screen'].includes(type) && !f.areaId) f.areaId = stop.id;
  const r = { id: uid(), visitId: S.visit.id, dayId: activeDay()?.id, stopId: stopId || '', type, f, recordStatus: 'open', gates: {}, captureMode: S.visit.captureMode, createdAt: Date.now(), updatedAt: Date.now(), ...who() };
  if (REC[type]?.bid) r.bid = nextBid(REC[type].bid);
  S.records.push(r); touch('records', r); return r;
}
/* Analyst answer 1: Blocked presentOnSite -> offer an access-constraint Issue linked to the section (skippable; export checks nudge again) */
async function offerAccessIssue(r, direct = false) {
  const stop = S.stops.find(s => s.id === r.stopId), iid = secIid(r) || '(section)', pl = stop?.panel?.label || '';
  if (!direct) { const c = await ask(`<h3>Log an access-constraint issue?</h3><p class="small">${esc(iid)}${pl ? ' on ' + esc(pl) : ''} is marked <b>Blocked</b>. Log it in the Issue Log (category <b>${esc(ACCESS_ISSUE.category)}</b>, linked to this section and panel) so it shows in the Issue Log CSV and the report.</p>
     <div class="row"><button class="btn pri" data-choice="log">Log issue</button><button class="btn" data-choice="skip">Skip for now</button></div>`);
    if (c !== 'log') { toast('Skipped - export checks will remind you', 3500); return null; } }
  const area = stop?.areaCodes?.[0], areaStop = S.stops.find(s => s.kind === 'area' && s.areaCodes?.[0] === (r.f.areaCode || area));
  const dup = accessIssueFor(S, r); if (dup) { toast(`Access issue ${dup.bid || ''} is already open for ${esc(iid)}`, 3500); goRec(dup); return dup; }   /* uiHints dedupe */
  /* 3.1.0 = sample ISS-0021: title exactly 'Access constraint: {instanceId}', gap, Medium, Open, [DeviceInventory], current trip,
     sourceRef site/<trip> walkdown; equipmentId/panelId/areaId/subSystemId resolved on export (subSystemId = the section's Sub-System) */
  const i = newRecord('issue', r.stopId, { category: ACCESS_ISSUE.category, priority: ACCESS_ISSUE.priority, status: ACCESS_ISSUE.status, title: ACCESS_ISSUE.title(iid),
    description: `presentOnSite = blocked for ${iid}${pl ? ' on panel ' + pl : ''}. Who / why / when to retry: `, deliverables: [...ACCESS_ISSUE.deliverables], nteImpact: 'unknown',
    equipmentId: r.id, panelId: stop?.kind === 'panel' ? stop.id : undefined, areaId: areaStop?.id });
  i.sourceRefs = [{ doc: 'site', section: `${EN.trip.includes(S.visit.trip) ? S.visit.trip : 'Trip1'} walkdown` }];
  i.f.accessFor = r.id; touch('records', i); await flush(); toast(`Issue ${i.bid || ''} logged - add who/why/when`, 3500); goRec(i); return i;
}
/* unique instance id across the visit (clone / add next / range) */
const usedIids = () => new Set(S.records.filter(r => r.type === 'section').map(secIid));
function freeConveyor(type, conv, step = 1) { const used = usedIids(); let c = conv, n = 0; while (c && used.has(sectionInstanceId(type, c)) && n++ < 10000) c = nextConveyorNumber(c, step); return c; }

/* ================= html helpers ================= */
const opt = (v, cur, label) => `<option value="${esc(v)}"${String(v) === String(cur ?? '') ? ' selected' : ''}>${esc(label ?? v)}</option>`;
const bind = (store, id, f) => `data-obj="${store}:${id}" data-f="${esc(f)}"`;
const MIC = '<button type="button" class="mic" data-act="mic" aria-label="Dictate note">🎤</button>';
const inp = (label, store, o, f, type = 'text', ph = '', cls = '') => `<label class="fld ${cls}"><span>${esc(label)}</span>${type === 'textarea' ? `<div class="dict"><textarea ${bind(store, o.id, f)} placeholder="${esc(ph)}" rows="3">${esc(getP(o, f) ?? '')}</textarea>${MIC}</div>` : `<input type="${type}" ${bind(store, o.id, f)} value="${esc(getP(o, f) ?? '')}" placeholder="${esc(ph)}">`}</label>`;
const sel = (label, store, o, f, opts, cls = '') => `<label class="fld ${cls}"><span>${esc(label)}</span><select ${bind(store, o.id, f)}>${opts}</select></label>`;
const bar = pct => `<div class="bar"><i style="width:${pct}%"></i></div>`;
function sec(key, title, body, openDefault = true) { const open = ui.open[key] ?? openDefault; return `<details data-key="${key}"${open ? ' open' : ''}><summary>${title}</summary><div class="secbody">${open ? body : `<div data-lazy="${key}"></div>`}</div></details>`; }
const lazy = {};   // closed sections render on first open (keeps big panels light)
function secL(key, title, fn, openDefault = false) { lazy[key] = fn; const open = ui.open[key] ?? openDefault; return `<details data-key="${key}"${open ? ' open' : ''}><summary>${title}</summary><div class="secbody">${open ? fn() : `<div data-lazy="${key}"></div>`}</div></details>`; }
const thumbs = list => list.length ? `<div class="thumbs">${list.map(m => `<button class="th" data-act="media" data-id="${m.id}" aria-label="Open ${esc(m.filename || 'media')}">${m.thumb ? `<img src="${m.thumb}" alt="" loading="lazy">` : `<span>${m.kind === 'video' ? '▶' : '🖼'}</span>`}${m.kind === 'video' ? '<b class="vb">VIDEO</b>' : ''}<b class="tb">${esc(PHOTO_TYPE[m.photoType]?.label || '')}</b>${m.blob ? '' : '<b class="vb miss">NO FILE</b>'}</button>`).join('')}</div>` : '';
const typeOpts = cur => PHOTO_TYPES.map(([k, l]) => opt(k, cur, l)).join('');
const dataCtx = c => Object.entries(c).map(([k, v]) => `data-${k}="${esc(v || '')}"`).join(' ');
const capButtons = (c, defType = 'other') => `<div class="capbox"><label class="fld"><span>Photo type (sets the file name)</span><select class="captype" data-change="captype">${typeOpts(defType)}</select></label><div class="row"><button class="btn" data-act="cap" data-kind="photo" ${dataCtx(c)}>📷 Photo</button><button class="btn" data-act="cap" data-kind="video" ${dataCtx(c)}>🎥 Video</button><button class="btn" data-act="cap" data-kind="lib" ${dataCtx(c)}>📁 File</button></div></div>`;
const pill = (st, map = RECORD_STATUS) => `<span class="pill st-${esc(st || 'open')}">${esc(map[st || 'open'] || st)}</span>`;
/* Analyst answer 2: Trip 1 (intro) sections stop at walkdown_verified, shown as "Seen" (display only; stored value unchanged) */
const secIntro = (r, g) => r?.type === 'section' && (g || sectionGate(S, r)).phase === 'intro';
const statusLabel = (r, st = r.recordStatus, g) => (secIntro(r, g) && INTRO_STATUS_LABEL[st]) || RECORD_STATUS[st || 'open'] || st;
const rpill = (r, g) => `<span class="pill st-${esc(r.recordStatus || 'open')}">${esc(statusLabel(r, r.recordStatus, g))}</span>`;
/* Analyst answer 3: small marker wherever a fallback Sub-System on a shared vendor panel is shown */
const provMark = () => ` <small class="prov" title="Sub-System assignment for shared vendor panels is open in ${PROVISIONAL_SUBSYSTEM.issueId}">⚑ ${esc(PROVISIONAL_SUBSYSTEM.marker)}</small>`;
const subName = id => { const x = subSystemById(S, id); return x ? `${x.code || x.id} (${x.id})` : (id || '-'); };
const storLine = '<span class="storstat">Checking storage…</span>';
function modal(html, cls = '') { $('#toast')?.classList.remove('show'); const ov = document.createElement('div'); ov.className = 'modal ' + cls; ov.innerHTML = `<div class="mbox" role="dialog" aria-modal="true">${html}</div>`; document.body.appendChild(ov); return ov; }
function closeModal(rerender = true) { const ov = $('.modal'); if (!ov) return; if (ov.dataset.url) URL.revokeObjectURL(ov.dataset.url); ov._resolve?.(null); ov.remove(); if (rerender) route(); }
/* promise-returning modal: buttons with data-choice resolve it */
function ask(html) { return new Promise(res => { const ov = modal(html); ov._resolve = res; ov.addEventListener('click', e => { const b = e.target.closest('[data-choice]'); if (!b) return; e.stopPropagation(); ov._resolve = null; ov.remove(); res(b.dataset.choice); }); }); }
function showNotes(title, notes) { if (notes?.length) toast(`${title}: ${notes.slice(0, 3).join(' · ')}${notes.length > 3 ? ` (+${notes.length - 3})` : ''}`, 6000); }
const stopName = id => { const s = S.stops.find(x => x.id === id); return s ? stopTitle(s) : '(unassigned)'; };
const recTitle = r => REC[r.type]?.title(r) || REC[r.type]?.label || r.type;

/* ---------- checklist.json field controls (text, select, integer, multiselect, flow) + REC spec controls ---------- */
const MISS = ' miss';
/* 3.0.0 attest field (checklist field.attest, e.g. presentOnSite): explicit Yes / No taps by a person on THIS record, no prefill.
   Stores r.f[key] + r.attest[key] = {by, at}. Unknown is the default (nothing tapped); Blocked = could not get there; Clear resets. */
function attestCtl(r, fd, lab, miss) {
  const v = getD(r.f, fd.key), att = r.attest?.[fd.key], btn = (x, l) => `<button class="btn seg ${v === x ? 'on' : ''}" data-act="attest" data-id="${r.id}" data-key="${esc(fd.key)}" data-v="${x}" aria-pressed="${v === x}">${l}</button>`;
  return `<div class="fld attest${miss || (fd.attest.values.includes(v) && att ? '' : MISS)}">${lab}<div class="segs">${btn('yes', '✓ Yes, seen')}${btn('no', '✗ No, not here')}${btn('blocked', '⛔ Can\'t reach')}${v && v !== 'unknown' ? `<button class="btn seg clear" data-act="attest" data-id="${r.id}" data-key="${esc(fd.key)}" data-v="">Clear</button>` : ''}</div>
   <small class="muted">${fd.attest.values.includes(v) && att ? `Confirmed ${esc(v)} by ${esc(att.by || '?')} · ${esc(fmtDate(att.at))}` : v === 'blocked' ? 'Blocked - counts as not confirmed' : 'Unknown - tap Yes or No on site (needed to verify)'}</small></div>`;
}
function fieldCtl(store, o, path, fd, opts = {}) {
  const v = getP(o, path), b = bind(store, o.id, path), req = fd.required || opts.req ? ' <b class="req">*</b>' : '', miss = opts.miss ? MISS : '';
  const lab = `<span>${esc(fd.label || fd.key)}${req}${fd.help ? ` <i class="muted">${esc(fd.help)}</i>` : ''}</span>`;
  const t = fd.type;
  if (fd.attest && store === 'records') return attestCtl(o, fd, lab, miss);
  const soft = softAllowed(fd) ? GATES.SOFT : [];   /* 2.1.0: unknown / blocked count as an answer on the intro walk-down gate */
  if (t === 'select' && fd.key === 'primarySubSystemId') { const l = subSystemsOf(S).filter(x => !opts.areas || opts.areas.includes(x.area));
    return `<label class="fld${miss}">${lab}<select ${b}>${opt('', v, '-')}${l.map(x => opt(x.id, v, `${x.code} · ${x.name || ''} (${x.area})`)).join('')}${!isBlank(v) && !l.some(x => x.id === v) ? opt(v, v) : ''}</select></label>`; }
  if (t === 'select') { const o2 = [...(fd.options || []), ...soft.filter(x => !(fd.options || []).includes(x))];
    return `<label class="fld${miss}">${lab}<select ${b}>${opt('', v, '-')}${o2.map(x => opt(x, v)).join('')}${!isBlank(v) && !o2.map(String).includes(String(v)) ? opt(v, v) : ''}</select></label>`; }
  if (t === 'bitMapGrid') { const rows = Array.isArray(v) ? v : [];
    return `<label class="fld${miss}">${lab}<i class="muted small">One row per line: Type:value/bBit=meaning->colourEnum - a trailing ? means not yet confirmed on site. Remove the ? once checked.</i><textarea data-t="bitmap" ${b} rows="${Math.min(14, rows.length + 2)}">${esc(rows.map(bitMapLine).join('\n'))}</textarea></label>`; }
  if (t === 'interlockList') { const rows = Array.isArray(v) ? v : [];
    return `<label class="fld${miss}">${lab}<i class="muted small">One per line: signal | kind (${esc(INTERLOCK_KINDS.join('/'))}) | in/out | other device ID or description</i><textarea data-t="interlocks" ${b} rows="3">${esc(rows.map(interlockLine).join('\n'))}</textarea></label>`; }
  if (t === 'subSystemList' || t === 'shifts') return `<label class="fld${miss}">${lab}<div class="dict"><textarea ${b} rows="4">${esc(v ?? '')}</textarea>${MIC}</div></label>`;
  if (t === 'multiselect' || t === 'multi') { const cur = Array.isArray(v) ? v.map(String) : splitList(v); const o2 = fd.options || [];
    return `<fieldset class="fld chips${miss}"><legend>${esc(fd.label || fd.key)}${req}</legend>${o2.map(x => `<label class="chip"><input type="checkbox" ${b} data-multi="${esc(x)}" ${cur.includes(String(x)) ? 'checked' : ''}><span>${esc(x)}</span></label>`).join('')}</fieldset>`; }
  if (t === 'integer' || t === 'int' || t === 'held:int') return `<label class="fld${miss}">${lab}<input inputmode="numeric" pattern="-?[0-9]*" data-t="int" ${b} value="${esc(v ?? '')}"></label>`;
  if (t === 'num') return `<label class="fld${miss}">${lab}<input inputmode="decimal" data-t="num" ${b} value="${esc(v ?? '')}"></label>`;
  if (t === 'bool') return `<label class="fld${miss}">${lab}<select data-t="bool" ${b}>${opt('', v === true ? 'true' : v === false ? 'false' : '', '-')}${opt('true', String(v), 'Yes')}${opt('false', String(v), 'No')}</select></label>`;
  if (t === 'date') return `<label class="fld${miss}">${lab}<input type="date" ${b} value="${esc(v ?? '')}"></label>`;
  if (t === 'list') return `<label class="fld${miss}">${lab}<input data-t="list" ${b} value="${esc((Array.isArray(v) ? v : []).join('; '))}"></label>`;
  if (t === 'qa') return `<label class="fld${miss}">${lab}<div class="dict"><textarea data-t="qa" ${b} rows="5">${esc((v || []).map(x => `${x.q} :: ${x.a}`).join('\n'))}</textarea>${MIC}</div></label>`;
  if (t === 'flow' || t === 'textarea') return `<label class="fld${miss}">${lab}<div class="dict"><textarea ${b} rows="${t === 'flow' ? 4 : 3}" placeholder="${t === 'flow' ? 'e.g. PE-1 → MDR-20101 → MDR-20102 → Merge' : ''}">${esc(v ?? '')}</textarea>${MIC}</div></label>`;
  if (t === 'point') return `<label class="fld${miss}">${lab}<input list="pointlist" ${b} value="${esc(v ?? '')}"><datalist id="pointlist">${Object.values(AS.packml).flat().map(m => `<option value="${esc(m[0])}">`).join('')}</datalist></label>`;
  if (t?.startsWith('ref:') || t === 'refs:screen') {
    const kind = t.split(':')[1], list = kind === 'panel' ? panelStops().map(s => [s.id, s.panel.label]) : kind === 'area' ? S.stops.filter(s => s.kind === 'area').map(s => [s.id, s.key])
      : kind === 'section' ? S.records.filter(r => r.type === 'section').map(r => [r.id, recTitle(r)]) : S.records.filter(r => r.type === 'screen' && r.id !== o.id).map(r => [r.id, recTitle(r)]);
    if (t === 'refs:screen') { const cur = v || []; return `<fieldset class="fld chips${miss}"><legend>${esc(fd.label)}${req}</legend>${list.map(([id, l]) => `<label class="chip"><input type="checkbox" ${b} data-multi="${id}" ${cur.includes(id) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('') || '<i class="muted">no screens yet</i>'}</fieldset>`; }
    return `<label class="fld${miss}">${lab}<select ${b}>${opt('', v, '-')}${list.map(([id, l]) => opt(id, v, l)).join('')}</select></label>`;
  }
  const dl = soft.length ? `soft-${fd.key.replace(/\W/g, '_')}` : '';
  return `<label class="fld${miss}">${lab}<input ${b} value="${esc(v ?? '')}"${fd.pattern ? ` pattern="${esc(fd.pattern)}"` : ''}${dl ? ` list="${dl}"` : ''}>${dl ? `<datalist id="${dl}">${soft.map(x => `<option value="${x}">`).join('')}</datalist>` : ''}</label>`;
}
const specToFd = ([key, label, type, options]) => ({ key, label, type: type || 'text', options });

/* ================= shell ================= */
function shell(title, back, body, nav, fab = false) {
  const v = S?.visit;
  app.innerHTML = `<header class="top">${back ? `<a class="hbtn" href="${back}" aria-label="Back">◀</a>` : '<span class="logo">❄</span>'}<h1>${esc(title)}</h1><span id="savestat" class="stat">Saved ✓</span><span class="net ${navigator.onLine ? 'on' : 'off'}">${navigator.onLine ? 'ONLINE' : 'OFFLINE'}</span><button class="hbtn" data-act="theme" aria-label="Theme">◐</button></header>
<main>${body}</main>${fab ? '<button class="fab" data-act="fab" aria-label="Take the next required photo">📷</button>' : ''}${nav && v ? `<nav class="bot">${[['', '🗺️', 'Stops'], ['records', '📋', 'Records'], ['media', '🖼️', 'Media'], ['export', '📤', 'Export'], ['settings', '⚙️', 'Setup']].map(([p, i, l]) => `<a href="#/v/${v.id}${p ? '/' + p : ''}" class="${nav === (p || 'stops') ? 'on' : ''}"><span>${i}</span>${l}</a>`).join('')}</nav>` : ''}`;
  setStatus();
}
function swStatus() {
  if (location.protocol === 'file:' || window.SV_SINGLE) return 'Single-file mode (laptop only): data is saved in this browser profile for this file. For phones/tablets install the hosted app.';
  if (!('serviceWorker' in navigator)) return 'Service worker not supported in this browser.';
  return navigator.serviceWorker.controller ? 'Offline ready ✓ (service worker active)' : 'Preparing offline cache… reload once to confirm.';
}
async function requestPersist() { try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) return await navigator.storage.persist(); return true; } catch (e) { return false; } }
async function storageHtml() {
  const st = navigator.storage; if (!st?.estimate) return 'Storage API not available in this browser';
  const [p, e] = await Promise.all([st.persisted ? st.persisted().catch(() => false) : false, storageEstimate()]);
  return `${p ? '🔒 Storage persisted ✓' : '⚠️ Storage not persisted (may be evicted; install the app / tap Request persistent storage)'}${e ? ` · ${(e.usage / 1048576).toFixed(1)} MB used of ${(e.quota / 1048576).toFixed(0)} MB` : ''}`;
}
function fillStorage() { const els = $$('.storstat'); if (els.length) storageHtml().then(h => els.forEach(el => el.innerHTML = h)); }

/* ================= backup status ================= */
function changesSince() { const t = S.visit.backup?.lastAt || 0; return [...S.days, ...S.stops, ...S.records].filter(o => (o.updatedAt || o.createdAt || 0) > t).length; }
const newMediaCount = () => { const mk = S.visit.backup?.mediaMark || 0; return S.media.filter(m => m.blob && (m.createdAt || 0) > mk).length; };
function backupLine() { const b = S.visit.backup || {}, n = changesSince(), nm = newMediaCount();
  return `${b.lastAt ? `Last backup ${esc(fmtDate(b.lastAt))} (${esc(b.kind)}, #${b.seq})` : '<b class="iss">Never backed up</b>'} · <b class="${n || nm ? 'iss' : ''}">${n} change${n === 1 ? '' : 's'}, ${nm} new photo/video${nm === 1 ? '' : 's'} since</b>`; }

/* ================= views ================= */
async function renderHome() {
  S = null; const visits = (await dbAll('visits')).sort((a, b) => b.updatedAt - a.updatedAt);
  const sd = SITE_DEFAULTS;
  shell('Site Visits', null, `
  ${window.SV_SINGLE ? '<div class="card warn"><b>💻 Single-file copy - laptop only.</b> Data stays in this browser profile for this exact file path. On phones/tablets use the installed (hosted) app; iOS cannot keep data for a local HTML file.</div>' : ''}
  ${visits.map(v => `<a class="card link" href="#/v/${v.id}"><b>${esc(v.name || v.site?.siteName || v.site)}</b><small>${esc(v.trip || '')} · ${esc(v.startDate || '')} – ${esc(v.endDate || '')} · ${esc((v.visitors || []).join(', '))}</small><small>Updated ${esc(fmtDate(v.updatedAt))} · schema v${v.schemaVersion || 1}</small></a>`).join('') || '<p class="muted">No visits yet. Create one below.</p>'}
  <details class="card" ${visits.length ? '' : 'open'}><summary>➕ New visit</summary>
  <form id="newvisit" class="secbody">
   <label class="fld"><span>Visit name</span><input name="name" value="${esc(sd.siteName)} - ${esc(TRIPS[0])}" required></label>
   <div class="row2"><label class="fld"><span>Site code (${sd.siteCodeConfirmed ? 'confirmed' : 'TO CONFIRM'})</span><input name="siteCode" value="${esc(sd.siteCode)}" pattern="[A-Z0-9]{3,8}"></label>
   <label class="fld"><span>Trip</span><select name="trip">${TRIPS.map(t => opt(t, TRIPS[0], `${t} - ${CK.trips[t]?.label || CK.trips[t] || ''}`.replace(/ - \[object Object\]$/, ''))).join('')}</select></label></div>
   <div class="row2"><label class="fld"><span>Start</span><input type="date" name="startDate" value="${today()}"></label><label class="fld"><span>End</span><input type="date" name="endDate" value="${dayOf(Date.now() + 86400000)}"></label></div>
   <label class="fld"><span>Visitors (; separated)</span><input name="visitors" value="Jeff Rankinen (Keystone Integrated Solutions)"></label>
   <label class="fld"><span>Your name (author stamp + photo initials, this device)</span><input name="author" value="${esc(localStorage.getItem('sv-author') || 'Jeff Rankinen')}"></label>
   <label class="fld"><span>ID code for this device (2-4 letters, + a digit if initials are shared: JR2 - prefixes every ID: ISS-${esc(devCode())}-0001, MED-${esc(devCode())}-0001; each phone needs its own)</span><input name="devcode" id="devcodein" value="${esc(devCode())}" maxlength="5" pattern="[A-Za-z]{2,4}[0-9]?" autocapitalize="characters" ${codeLocked() ? 'readonly title="Locked - IDs already use it. Change in Visit setup."' : ''}></label>
   <label class="fld"><span>Capture mode</span><select name="captureMode">${EN.captureMode.map(m => opt(m, 'quick')).join('')}</select></label>
   <p class="muted">Seeds ${CK.crossCutting.length} site-wide sections, ${CK.areas.length} areas (${AREA_CODES.join(' / ')}), ${CK.panels.length} control panels and ${AS.seedScreens.length} screens from Analyst schema v${esc(AS.version)}.</p>
   <button class="btn big pri" type="submit">Create visit</button></form></details>
  <div class="card"><b>Import / restore</b><p class="muted">A ZIP or JSON exported by this app (v1, v2 or v3). Restore = full backup first, then each incremental in order.</p><button class="btn" data-act="import">📥 Import JSON / ZIP</button></div>
  <div class="card muted small">App v${APP_VERSION} · store schema v${SCHEMA_VERSION} · Analyst schema v${esc(AS.version)} (checklist ${esc(CK.checklistVersion)}) · status encoding ${STATUS_ENCODING.held ? 'HELD' : 'released'}<br><span id="swstat">${swStatus()}</span><br>${storLine}
   <div class="row"><button class="btn" data-act="rules">📋 Field rules</button>${deferredInstall ? '<button class="btn" data-act="install">⬇ Install app</button>' : ''}<button class="btn" data-act="persist">Keep data (persist)</button></div></div>`);
  $('#newvisit')?.addEventListener('submit', async e => { e.preventDefault(); const id = await createVisit(Object.fromEntries(new FormData(e.target))); if (!id) { $('#devcodein')?.focus(); return; } location.hash = '#/v/' + id; });
}
function stopCard(s) {
  const st = stopStats(S, s), sub = s.kind === 'panel' ? `${sectionsOf(s.id).length}${s.panel.expected ? '/' + s.panel.expected : ''} sections · ` : '';
  return `<a class="card link stop st-${s.recordStatus}" href="#/v/${S.visit.id}/s/${s.id}"><div class="row"><b class="grow">${esc(stopTitle(s))}</b>${pill(s.recordStatus)}</div>
   <small>${sub}${st.itemsDone}/${st.items} items · ${st.reqDone}/${st.req} required photos${st.blocked ? ` · <b class="iss">${st.blocked} blocked</b>` : ''}${st.issues ? ` · <b class="iss">${st.issues} open issues</b>` : ''}</small>${bar(st.pct)}</a>`;
}
function renderVisit() {
  const v = S.visit, d = activeDay(), q = ui.stopQ.trim().toLowerCase();
  const order = ['Site-wide', 'Areas', ...AREA_CODES, 'Multi-area', 'Legacy (v1/v2)'], groups = {};
  S.stops.filter(s => !q || `${stopTitle(s)} ${s.panel?.idNorm || ''} ${(s.panel?.vendorSystems || []).join(' ')}`.toLowerCase().includes(q)).forEach(s => (groups[s.group] = groups[s.group] || []).push(s));
  const gk = Object.keys(groups).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  const done = S.stops.filter(s => isVerified(s.recordStatus) || s.recordStatus === 'na').length;
  shell(v.name, '#/', `
  <div class="card bk"><div id="bkline" class="small">${backupLine()}</div><div class="row"><button class="btn pri" data-act="backup" data-x="incremental">💾 Back up now</button><button class="btn" data-act="backup" data-x="full">Full backup</button></div></div>
  <div class="card"><div class="row2"><label class="fld"><span>Day</span><select data-change="day">${S.days.map(x => opt(x.id, d?.id, `${x.label} · ${x.date}`)).join('')}</select></label>
   <label class="fld"><span>Jump to panel</span><input id="jump" list="panellist" placeholder="MCP-20, CP-020…" autocomplete="off"><datalist id="panellist">${panelStops().map(s => `<option value="${esc(s.panel.label)}">${esc(s.panel.idNorm || '')}</option>`).join('')}</datalist></label></div>
   ${d ? inp('Day notes', 'days', d, 'notes', 'textarea', 'Who you met, what changed, follow-ups…') : ''}
   <div class="muted small">${esc(v.trip)} · ${done}/${S.stops.length} stops verified/N/A · ${S.records.filter(r => r.type === 'section').length} sections · ${S.media.length} media · ${v.captureMode} mode</div></div>
  <label class="fld search"><span>Find a stop</span><input type="search" id="stopq" value="${esc(ui.stopQ)}" placeholder="Search areas, panels, vendor systems"></label>
  ${gk.map(g => secL('g-' + g, `${esc(g)} <small class="muted">(${groups[g].length})</small>`, () => groups[g].map(stopCard).join(''), g === 'Site-wide' || g === 'Areas' || !!q)).join('')}
  <div class="card"><b>Panel found on site</b><div class="row2"><label class="fld"><span>Label</span><input id="newpanel" placeholder="MCP-24A"></label><label class="fld"><span>Type</span><select id="newpaneltype">${Object.keys(CK.panelTemplates).map(t => opt(t, 'conveyor')).join('')}</select></label></div>
   <fieldset class="fld chips"><legend>Areas served</legend>${AREA_CODES.map(a => `<label class="chip"><input type="checkbox" class="newpanelarea" value="${a}"><span>${a}</span></label>`).join('')}</fieldset><button class="btn" data-act="addpanel">+ Add panel</button></div>
  <div class="row"><a class="btn" href="#/v/${v.id}/nav">🧭 Navigation matrix</a>${ADDABLE.map(t => `<button class="btn" data-act="newrec" data-type="${t}">${REC[t].icon} ${esc(REC[t].label.split(' (')[0])}</button>`).join('')}</div>`, 'stops');
}
function shotRow(s, sh) {
  const ms = S.media.filter(m => m.stopId === s.id && m.shotId === sh.id), ok = shotDone(S, s, sh), naOk = !sh.req || REQUIRED_PHOTO_NA_ALLOWED.includes(sh.photoType);
  return `<div class="shot ${ok ? 'ok' : sh.req ? 'need' : ''}" id="shot-${sh.id}"><div class="row"><b class="grow">${ok ? '✅' : sh.req ? '🔴' : '⚪'} ${esc(sh.text)}${sh.req ? ' <b class="req">required</b>' : ''}</b><small class="muted">${esc(PHOTO_TYPE[sh.photoType]?.label || '')}</small></div>
   <div class="row"><button class="btn" data-act="cap" data-kind="photo" data-stop="${s.id}" data-shot="${sh.id}">📷</button><button class="btn" data-act="cap" data-kind="video" data-stop="${s.id}" data-shot="${sh.id}">🎥</button><button class="btn" data-act="cap" data-kind="lib" data-stop="${s.id}" data-shot="${sh.id}">📁</button>
   ${naOk ? (sh.na ? `<button class="btn" data-act="shotna" data-shot="${sh.id}" data-v="0">Clear N/A</button>` : `<button class="btn" data-act="shotna" data-shot="${sh.id}" data-v="1">N/A</button>`) : ''}</div>${thumbs(ms)}</div>`;
}
function itemCard(s, id) {
  const it = itemDef(id); if (!it) return '';
  const r = s.resp[id] = s.resp[id] || { state: 'todo', a: {}, q: {}, note: '' }, st = r.state || 'todo', miss = st === 'done' || ui.showMiss === s.id ? itemMissing(S, s, id) : [];
  const btn = (v, l) => `<button class="btn seg ${st === v ? 'on' : ''}" data-act="ist" data-item="${id}" data-v="${v}" aria-pressed="${st === v}">${l}</button>`;
  return `<div class="item st-${st}" id="it-${id}"><div class="row"><b class="grow">${esc(id)} ${esc(it.title)}</b>${it.trips?.length && !inTrip(S, id) ? `<small class="pill">${esc(it.trips.join('/'))}</small>` : ''}<span class="pill st-${st}">${esc(CHECKLIST_STATE[st] || st)}</span></div>
   ${it.prompt ? `<p class="muted small">${esc(it.prompt)}</p>` : ''}
   <div class="segs">${btn('done', '✓ Done')}${btn('na', 'N/A')}${btn('blocked', '⛔ Blocked')}${st !== 'todo' ? `<button class="btn seg clear" data-act="ist" data-item="${id}" data-v="todo">Clear</button>` : ''}</div>
   ${st === 'na' ? '' : `<div class="flds">${(it.fields || []).map(fd => fieldCtl('stops', s, `resp|${id}|a|${fd.key}`, fd, { miss: miss.includes(fd.key) })).join('')}
   ${(it.questions || []).map(qq => fieldCtl('stops', s, `resp|${id}|q|${qq.id || qq.key}`, { key: qq.id, label: qq.text || qq.label, type: 'textarea' })).join('')}</div>`}
   ${fieldCtl('stops', s, `resp|${id}|note`, { key: 'note', label: st === 'blocked' ? 'Why blocked? (who / when to retry)' : 'Note', type: 'textarea' })}</div>`;
}
function sectionRow(r) {
  const iid = secIid(r), ok = validInstanceId(iid), g = sectionGate(S, r), up = STATUS_ORDER[g.best] > STATUS_ORDER[r.recordStatus] && r.recordStatus !== 'na';
  return `<div class="secrow"><label class="chk"><input type="checkbox" data-act="selsec" data-id="${r.id}" ${ui.sel.has(r.id) ? 'checked' : ''} aria-label="Select ${esc(iid)}"></label>
   <a class="grow" href="#/v/${S.visit.id}/r/${r.id}"><b class="${ok ? '' : 'iss'}">${esc(iid || '(no ID)')}</b> <small>${esc(r.f.equipmentType || '')} · ${esc(r.f.driveType || '')}${r.f.presentOnSite === 'no' ? ' · not present' : ''}${!['yes', 'no'].includes(r.f.presentOnSite) || !r.attest?.presentOnSite ? ' · <b class="iss">present?</b>' : ''}${r.f.presentOnSite === 'blocked' && !accessIssueFor(S, r) ? ' · <b class="iss">blocked - no issue</b>' : ''}${subSystemProvisional(S, r) ? provMark() : ''}</small></a>${rpill(r, g)}${up ? `<small class="ok">ready: ${esc(RECORD_STATUS[g.best] || g.best)}</small>` : ''}</div>`;
}
function renderStop(id) {
  const s = S.stops.find(x => x.id === id); if (!s) { location.hash = '#/v/' + S.visit.id; return; }
  if (S.visit.lastStopId !== s.id) { S.visit.lastStopId = s.id; touch('visits', S.visit); }
  const st = stopStats(S, s), gate = stopGate(S, s), recs = S.records.filter(r => r.stopId === s.id && r.type !== 'section');
  const items = s.items || [], onTrip = items.filter(i => inTrip(S, i)), offTrip = items.filter(i => !inTrip(S, i));
  const secs = s.kind === 'panel' ? sectionsOf(s.id) : [];
  const SG = CK.sectionTemplate.repeat?.generators || {};
  shell(stopTitle(s), '#/v/' + S.visit.id, `
  <div class="card"><div class="row"><b class="grow">${esc(stopTitle(s))}</b>${pill(s.recordStatus)}</div>
   ${s.panel ? `<div class="muted small">${esc(s.panel.idNorm || '')} · ${esc(s.panel.type)} · areas ${esc(s.areaCodes.join(', '))}${s.panel.flags?.length ? ' · ' + esc(s.panel.flags.join('; ')) : ''}</div>
   <div class="muted small" id="panelsub">Sub-System ${esc(subName(ans(s, 'CP-01', 'primarySubSystemId') || s.panel.primarySubSystemId || seedPanel(s.panel.label)?.primarySubSystemId))} <i>(fallback for sections without a SubSystemCode)</i>${isProvisionalPanel(s.panel) ? provMark() : ''}</div>` : ''}
   ${bar(st.pct)}<div class="muted small">${st.itemsDone}/${st.items} items · ${st.reqDone}/${st.req} required photos</div>
   <div class="row">${!['verified', 'na'].includes(s.recordStatus) ? `<button class="btn pri" data-act="stopverify">✔ Verify${s.recordStatus === 'open' ? ' &amp; complete' : ' again'}</button>` : ''}${s.recordStatus === 'open' ? `<button class="btn" data-act="stopna">N/A whole stop</button>` : `<button class="btn" data-act="stopreopen">Reopen</button>`}</div>
   ${ui.showMiss === s.id && gate.length ? `<ul class="miss small">${gate.slice(0, 12).map(g => `<li>${esc(g)}</li>`).join('')}${gate.length > 12 ? `<li>+${gate.length - 12} more</li>` : ''}</ul>` : ''}</div>
  ${s.shots.length ? sec('shots-' + s.kind, `📷 Photos <small class="muted">${st.shotDone}/${st.shots}</small>`, s.shots.map(sh => shotRow(s, sh)).join('') + capButtons({ stop: s.id })) : ''}
  ${s.kind === 'legacy' ? sec('legacy', 'Legacy checklist (v1/v2)', (s.checklist || []).map(i => `<div class="item"><b>${esc(i.text)}</b> ${esc(i.status || '')} ${esc(i.note || '')}</div>`).join('') + `<pre class="small">${esc(JSON.stringify(s.prompts || {}, null, 1))}</pre>`) : ''}
  ${onTrip.length ? sec('items-' + s.kind, `☑️ Checklist <small class="muted">${S.visit.trip}</small>`, onTrip.map(i => itemCard(s, i)).join('')) : ''}
  ${offTrip.length ? secL('offtrip-' + s.kind, `Other trips <small class="muted">(${offTrip.length}, not gating)</small>`, () => offTrip.map(i => itemCard(s, i)).join(''), false) : ''}
  ${s.kind === 'panel' ? sec('sections', `⚙️ Sections <small class="muted">${secs.length}${s.panel.expected ? ' of ~' + s.panel.expected + ' expected' : ''}${GATES.phaseFor(s.areaCodes?.[0], [S.visit.trip]) === 'intro' ? ' · optional on ' + esc(S.visit.trip) + ' (commissioning-tier)' : ''}</small>`, `
    <div class="row"><button class="btn pri" data-act="secnew">+ Section</button><button class="btn" data-act="secnext" ${secs.length ? '' : 'disabled'}>+ Next (${esc(secs.length ? nextConveyorNumber(secs.at(-1).f.conveyorNumber) || '?' : '-')})</button><button class="btn" data-act="secrange">Add range…</button><button class="btn" data-act="seedimp" data-kind="csv">${esc(SEED_IMPORTERS.csv.label)}</button><button class="btn" data-act="seedimp" data-kind="l5x">${esc(SEED_IMPORTERS.l5x.label)}</button></div>
    ${secs.length > 8 ? `<label class="fld search"><span>Filter sections</span><input type="search" class="secq" placeholder="ID, type…"></label>` : ''}
    <div class="seclist">${secs.map(sectionRow).join('')}</div>
    ${secs.length ? `<div class="row"><button class="btn" data-act="selall">Select all</button><button class="btn" data-act="selnone">Select none</button><button class="btn pri" data-act="bulkverify">Verify selected (${ui.sel.size})</button></div>` : ''}`) : ''}
  ${sec('stoprecs', `📋 Records here <small class="muted">${recs.length}</small>`, recs.map(r => `<a class="card link" href="#/v/${S.visit.id}/r/${r.id}">${REC[r.type]?.icon || ''} ${esc(recTitle(r))} ${pill(r.recordStatus)}</a>`).join('') +
    `<div class="row">${ADDABLE.map(t => `<button class="btn" data-act="newrec" data-type="${t}" data-stop="${s.id}">${REC[t].icon} ${esc(REC[t].label.split(' (')[0])}</button>`).join('')}</div>`, false)}
  ${sec('stopnotes', '📝 Stop notes', inp('Notes', 'stops', s, 'notes', 'textarea'), false)}`, 'stops', true);
}

/* ---------- section (Equipment) editor: checklist.json sectionTemplate ---------- */
function packmlGrid(r) {
  return Object.entries(AS.packml).map(([folder, mm]) => `<div class="pkf"><b>${esc(folder)}</b>${mm.map(([m, t]) => { const v = r.f.packml?.[folder]?.[m] || 'unknown', req = requiredFor(S, 'section', 'verified').includes(`packml.${folder}.${m}`);
    return `<label class="pkrow${req && v === 'unknown' ? MISS : ''}"><span>${esc(m)}${req ? ' <b class="req">*</b>' : ''} <small class="muted">${esc(t)}</small></span><select ${bind('records', r.id, `f|packml|${folder}|${m}`)}>${EN.packmlAvail.map(a => opt(a, v)).join('')}</select></label>`; }).join('')}</div>`).join('');
}
function renderSection(r) {
  const ST = CK.sectionTemplate, stop = S.stops.find(s => s.id === r.stopId), iid = secIid(r), derived = sectionInstanceId(r.f.equipmentType, r.f.conveyorNumber);
  const g = sectionGate(S, r), missV = ui.showMiss === r.id ? [...g.walkMissing, ...g.dataMissing] : [], quickMiss = sectionMissing(S, r, 'quick');
  const intro = g.phase === 'intro', attFd = SECTION_FIELDS.find(fd => fd.attest);
  const fl = (fd, pre = 'f|') => fd.type === 'packmlGrid' ? '' : fieldCtl('records', r, pre + fd.key.replace(/\./g, '|'), fd, { miss: missV.includes(fd.key), req: requiredFor(S, 'section', 'verified').includes(fd.key) });
  const overlay = ST.typeOverlays[r.f.equipmentType] || [], photos = ST.photos || [];
  shell(iid || 'New section', stop ? `#/v/${S.visit.id}/s/${stop.id}` : `#/v/${S.visit.id}/records`, `
  <div class="card"><div class="row"><b class="grow">${esc(iid || '(enter conveyor number)')}</b>${rpill(r, g)}</div>
   <div class="muted small">${esc(stop ? stopTitle(stop) : 'no panel')} · Sub-System ${esc(subName(effectiveSubSystem(S, r)))}${subSystemFallback(r) ? ' <i>(panel fallback)</i>' : ''}${subSystemProvisional(S, r) ? provMark() : ''} · UDT ${esc(udtOf(r.f.equipmentType) || '-')} · ${quickMiss.length ? 'quick gate: missing ' + esc(quickMiss.join(', ')) : 'quick gate ✓'}</div>
   ${attFd ? attestCtl(r, attFd, `<span><b>${esc(attFd.label)}</b> <b class="req">*</b></span>`, '') : ''}
   ${r.f.presentOnSite === 'blocked' ? (accessIssueFor(S, r) ? `<p class="small">⛔ Access-constraint issue: <a href="#/v/${S.visit.id}/r/${accessIssueFor(S, r).id}">${esc(accessIssueFor(S, r).bid || 'issue')}</a></p>` : `<div class="nudge small" id="blocknudge">⛔ Blocked with no access-constraint issue logged. <button class="btn" data-act="accessissue" data-id="${r.id}">Log access issue</button></div>`) : ''}
   <div class="muted small">Gates (tools/gates.py, phase ${esc(g.phase || '-')}): walk-down ${g.walkMissing.length ? 'missing ' + esc(g.walkMissing.slice(0, 6).join(', ')) : '✓'} · data ${g.dataMissing.length ? 'missing ' + esc(g.dataMissing.slice(0, 6).join(', ')) : '✓'} → best status <b>${esc(statusLabel(r, g.best, g))}</b>${intro ? '<br>Trip 1 (intro): section fields are commissioning-tier and optional now - only the Yes/No present-on-site tap is needed to verify the walk-down.' : ''}</div>
   <div class="row">${!['verified', 'na'].includes(r.recordStatus) && !(intro && r.recordStatus === 'walkdown_verified') ? `<button class="btn pri" data-act="recverify" data-id="${r.id}">${intro ? '👁 Mark seen' : '✔ Verify'}</button>` : ''}${r.recordStatus === 'open' ? `<button class="btn" data-act="recna" data-id="${r.id}">N/A</button>` : `<button class="btn" data-act="recopen" data-id="${r.id}">Reopen</button>`}
    <button class="btn" data-act="recclone" data-id="${r.id}">⧉ Clone → ${esc(nextConveyorNumber(r.f.conveyorNumber) || '?')}</button><button class="btn danger" data-act="recdel" data-id="${r.id}">Delete</button></div>
   ${missV.length ? `<p class="miss small">Missing for Verified: ${esc(missV.join(', '))}</p>` : ''}</div>
  <div class="card"><b>Quick</b>${intro ? ' <small class="muted">(optional on Trip 1)</small>' : ''}${ST.quickFields.filter(fd => !fd.attest).map(fd => fl(fd)).join('')}
   <label class="fld${validInstanceId(iid) ? '' : MISS}"><span>Instance ID (derived ${esc(derived || '-')}; override only if the nameplate differs)</span><input ${bind('records', r.id, 'f|instanceIdOverride')} value="${esc(r.f.instanceIdOverride || '')}" placeholder="${esc(derived)}" pattern="${esc(AS.patterns.instanceId)}" autocapitalize="characters"><small id="iidhint" class="muted">${iid ? (validInstanceId(iid) ? '✓ ' + esc(iid) : '⚠ ' + esc(iid) + ' - ' + esc(INSTANCE_ID.hint)) : ''}</small></label>
   ${validInstanceId(iid) ? '' : `<p class="miss small">Instance ID must match ${esc(INSTANCE_ID.hint)}</p>`}</div>
  <div class="card"><b>📷 Section photos</b>${photos.map(p => { const ms = S.media.filter(m => m.recordId === r.id && m.photoType === p.photoType), na = (r.photoNa || {})[p.photoType], req = (REQUIRED_PHOTO_SETS.section || []).includes(p.photoType);
    return `<div class="shot ${ms.length || na ? 'ok' : req ? 'need' : ''}"><div class="row"><b class="grow">${ms.length || na ? '✅' : req ? '🔴' : '⚪'} ${esc(p.prompt || PHOTO_TYPE[p.photoType]?.label)}${req ? ' <b class="req">required for Verified</b>' : ''}</b></div>
     <div class="row"><button class="btn" data-act="cap" data-kind="photo" data-stop="${r.stopId}" data-rec="${r.id}" data-type="${p.photoType}">📷</button><button class="btn" data-act="cap" data-kind="lib" data-stop="${r.stopId}" data-rec="${r.id}" data-type="${p.photoType}">📁</button>
     <button class="btn" data-act="secphotona" data-id="${r.id}" data-type="${p.photoType}">${na ? 'Clear "not possible"' : 'Not possible here'}</button></div>${thumbs(ms)}</div>`; }).join('')}
   ${thumbs(S.media.filter(m => m.recordId === r.id && !photos.some(p => p.photoType === m.photoType)))}${capButtons({ stop: r.stopId, rec: r.id }, 'other')}</div>
  ${secL('secfull', 'All fields', () => ST.fullFields.filter(fd => fd.type !== 'packmlGrid').map(fd => fl(fd)).join(''), S.visit.captureMode !== 'quick')}
  ${overlay.length ? sec('secoverlay', `${esc(r.f.equipmentType)} details`, overlay.map(fd => fl(fd, 'f|overlay|')).join('')) : ''}
  ${secL('secpackml', 'PackML availability (packmlGrid)', () => packmlGrid(r), S.visit.captureMode !== 'quick')}
  ${sec('secnotes', 'Notes', inp('Notes', 'records', r, 'f.notes', 'textarea'), false)}`, 'records', true);
}
function renderRecord(id) {
  const r = S.records.find(x => x.id === id); if (!r) { location.hash = `#/v/${S.visit.id}/records`; return; }
  if (r.type === 'section') return renderSection(r);
  const spec = REC[r.type], miss = ui.showMiss === r.id ? recMissing(S, r) : [], req = requiredFor(S, r.type, r.type);
  const back = r.stopId ? `#/v/${S.visit.id}/s/${r.stopId}` : `#/v/${S.visit.id}/records`;
  shell(`${spec.label}${r.bid ? ' ' + r.bid : ''}`, back, `
  <div class="card"><div class="row"><b class="grow">${spec.icon} ${esc(recTitle(r) || '(new)')}</b>${pill(r.recordStatus)}</div><div class="muted small">${esc(r.createdBy || '')} · ${esc(fmtDate(r.createdAt))}${r.seedSource ? ' · seeded from Analyst sample' : ''}</div>
   <div class="row">${r.recordStatus === 'open' ? `<button class="btn pri" data-act="recverify" data-id="${r.id}">✔ Verify</button><button class="btn" data-act="recna" data-id="${r.id}">N/A</button>` : `<button class="btn" data-act="recopen" data-id="${r.id}">Reopen</button>`}
   <button class="btn" data-act="recclone" data-id="${r.id}">⧉ Clone</button><button class="btn danger" data-act="recdel" data-id="${r.id}">Delete</button></div>
   ${miss.length ? `<p class="miss small">Missing: ${esc(miss.join(', '))}</p>` : ''}</div>
  <div class="card">${spec.fields.map(sp => fieldCtl('records', r, 'f|' + sp[0], specToFd(sp), { miss: miss.includes(sp[0]), req: req.includes(sp[0]) })).join('')}
   ${r.type === 'tag' ? `<p class="muted small">Effective (blank = SUP rule): ${(t => esc(`${t.tagGroup} · historized ${t.historized} · ${t.historySampleMode} · ${t.dataType || '-'} · ${t.udtMember || '-'}`))(effTag(r))}</p>` : ''}
   ${r.type === 'alarm' ? `<p class="muted small">Effective priority: ${esc(effAlarmPriority(r.f) || '-')} · colour value is ${STATUS_ENCODING.held ? 'HELD (stored, not interpreted)' : 'interpreted'}</p>` : ''}</div>
  <div class="card"><b>Media</b>${thumbs(S.media.filter(m => m.recordId === r.id))}${capButtons({ stop: r.stopId, rec: r.id })}</div>`, 'records', true);
}
function renderRecords(q) {
  const type = q.get('type') || '', qq = ui.recQ.trim().toLowerCase(), pf = ui.recPanel;
  const panelOf = r => r.type === 'section' ? r.stopId : r.f.panelId || (S.stops.find(s => s.id === r.stopId)?.kind === 'panel' ? r.stopId : '');
  const list = S.records.filter(r => (!type || r.type === type) && (!pf || panelOf(r) === pf) && (!qq || `${r.bid || ''} ${recTitle(r)} ${JSON.stringify(r.f)}`.toLowerCase().includes(qq)));
  const shown = list.slice(0, ui.recLimit);
  shell('Records', '#/v/' + S.visit.id, `
  <div class="chips row">${[['', 'All'], ...Object.keys(REC).map(t => [t, REC[t].icon + ' ' + REC[t].label.split(' (')[0]])].map(([t, l]) => `<a class="chip ${type === t ? 'on' : ''}" href="#/v/${S.visit.id}/records${t ? '?type=' + t : ''}">${esc(l)} <small>${S.records.filter(r => !t || r.type === t).length}</small></a>`).join('')}</div>
  <div class="row2"><label class="fld search"><span>Search</span><input type="search" id="recq" value="${esc(ui.recQ)}" placeholder="ID, name, text…"></label>
   <label class="fld"><span>Panel</span><select id="recpanel">${opt('', pf, 'All panels')}${panelStops().map(s => opt(s.id, pf, s.panel.label)).join('')}</select></label></div>
  <p class="muted small">${list.length} record${list.length === 1 ? '' : 's'}${list.length > shown.length ? ` · showing ${shown.length}` : ''}</p>
  <div class="reclist">${shown.map(r => `<a class="card link rec" href="#/v/${S.visit.id}/r/${r.id}"><div class="row"><span class="grow">${REC[r.type]?.icon || ''} ${r.bid ? `<small>${esc(r.bid)}</small> ` : ''}${esc(recTitle(r) || '(untitled)')}</span>${rpill(r)}</div><small class="muted">${esc(r.stopId ? stopName(r.stopId) : '')}${r.type === 'section' && subSystemProvisional(S, r) ? provMark() : ''}</small></a>`).join('')}</div>
  ${list.length > shown.length ? `<button class="btn" data-act="more" data-k="recLimit">Show ${Math.min(50, list.length - shown.length)} more</button>` : ''}
  <div class="row"><a class="btn" href="#/v/${S.visit.id}/nav">🧭 Navigation matrix</a>${ADDABLE.map(t => `<button class="btn" data-act="newrec" data-type="${t}">${REC[t].icon} New ${esc(REC[t].label.split(' (')[0].toLowerCase())}</button>`).join('')}</div>`, 'records');
}
/* Navigation Matrix capture (Analyst exports/navigation-matrix.csv): rows = from-screen, columns = to-screen */
function renderNav() {
  const scr = S.records.filter(r => r.type === 'screen').sort((a, b) => String(a.f.screenCode || '').localeCompare(String(b.f.screenCode || '')));
  shell('Navigation matrix', '#/v/' + S.visit.id, `
  <p class="muted small">Tick a cell when the row screen navigates to the column screen. Parent = breadcrumb parent. Exports as navigation-matrix.csv (Analyst v${esc(AS.version)} columns) and in the visit report.</p>
  <div class="navwrap"><table class="nav"><thead><tr><th>From \\ To</th>${scr.map(c => `<th title="${esc(c.f.name || '')}"><span>${esc(c.f.screenCode || '?')}</span></th>`).join('')}<th>Parent</th></tr></thead>
  <tbody>${scr.map(r => `<tr><th><a href="#/v/${S.visit.id}/r/${r.id}">${esc(r.f.screenCode || '?')}</a> <small>${esc(r.f.name || '')}</small></th>${scr.map(c => c.id === r.id ? '<td class="self">-</td>' : `<td><input type="checkbox" data-act="navtog" data-from="${r.id}" data-to="${c.id}" aria-label="${esc(r.f.screenCode)} to ${esc(c.f.screenCode)}" ${(r.f.navigatesTo || []).includes(c.id) ? 'checked' : ''}></td>`).join('')}
   <td><select ${bind('records', r.id, 'f|parentScreenId')}>${opt('', r.f.parentScreenId, '-')}${scr.filter(c => c.id !== r.id).map(c => opt(c.id, r.f.parentScreenId, c.f.screenCode)).join('')}</select></td></tr>`).join('')}</tbody></table></div>
  <div class="row"><button class="btn" data-act="newrec" data-type="screen">+ Screen</button><button class="btn" data-act="ex" data-x="csv:navigation-matrix">⬇ navigation-matrix.csv</button></div>`, 'records');
}
function renderMedia() {
  const list = [...S.media].reverse(), shown = list.slice(0, ui.mediaLimit), mb = S.media.reduce((a, m) => a + (m.size || 0), 0) / 1048576;
  shell('Media', '#/v/' + S.visit.id, `
  <p class="muted small">${S.media.length} items · ${mb.toFixed(1)} MB · file names are fixed at capture</p>
  ${capButtons({}, 'overview')}${thumbs(shown)}
  ${list.length > shown.length ? `<button class="btn" data-act="more" data-k="mediaLimit">Show more</button>` : ''}`, 'media', true);
}
function openMedia(id) {
  const m = S.media.find(x => x.id === id); if (!m) return;
  const url = m.blob ? URL.createObjectURL(m.blob) : '';
  const ov = modal(`<div class="row"><b class="grow">${m.kind === 'video' ? '🎥' : '📷'} ${esc(m.filename || '')}</b><button class="btn" data-act="mclose">✕ Close</button></div>
   ${!url ? '<p class="miss">File not on this device (incremental import without the earlier backup).</p>' : m.kind === 'video' ? `<video src="${url}" controls playsinline></video>` : `<img src="${url}" alt="">`}
   ${inp('Caption / note', 'media', m, 'note', 'textarea')}${sel('Photo type', 'media', m, 'photoType', typeOpts(m.photoType))}
   <label class="chk"><input type="checkbox" ${bind('media', m.id, 'sensitive')} ${m.sensitive ? 'checked' : ''}> Sensitive (IPs / network labels) - excluded from shared exports</label>
   <div class="muted small">${esc(stopName(m.stopId))} · ${esc(fmtDate(m.createdAt))} · ${((m.size || 0) / 1024).toFixed(0)} KB · by ${esc(m.createdBy || '?')}${m.gps ? ` · GPS ${m.gps.lat.toFixed(5)}, ${m.gps.lon.toFixed(5)}` : ''}</div>
   <div class="row">${m.recordId ? `<a class="btn" href="#/v/${S.visit.id}/r/${m.recordId}" data-act="mclose">↗ Record</a>` : ''}<button class="btn" data-act="mrename" data-id="${m.id}">Rename to match type</button><button class="btn danger" data-act="mdel" data-id="${m.id}">Delete</button></div>`);
  ov.dataset.url = url;
}
function renderExport() {
  const share = !!(navigator.canShare && navigator.share), d = activeDay();
  shell('Export', '#/v/' + S.visit.id, `
  <div class="card bk"><b>💾 Backup</b><div class="muted small" id="bkline">${backupLine()}</div>
   <p class="muted small">Incremental = full visit data (no thumbnails/reports) + only photos/videos new since the last <b>confirmed</b> backup. Restore: full first, then each incremental in order.</p>
   <div class="row"><button class="btn big pri" data-act="backup" data-x="incremental">💾 Incremental backup</button><button class="btn" data-act="backup" data-x="full">📦 Full backup (all media)</button></div>
   <label class="fld"><span>When a stop is verified</span><select ${bind('visits', S.visit.id, 'backupMode')}>${[['prompt', 'Ask me to back up'], ['off', 'Do nothing']].map(([v, l]) => opt(v, S.visit.backupMode || 'prompt', l)).join('')}</select></label>${storLine}</div>
  <div class="card"><b>📦 Deliverable package</b><p class="muted">ZIP: visit.json, analyst/capture.json (schema v${esc(AS.version)}), 5 CSVs, visit + daily reports, all media.</p><button class="btn pri" data-act="ex" data-x="zip">⬇ Download package</button>${share ? '<button class="btn" data-act="ex" data-x="zipshare">📤 Share package</button>' : ''}</div>
  <div class="card"><b>Analyst CSVs (headers = exports/*.csv)</b><div class="grid2">${EXPORT_KEYS.map(k => `<button class="btn" data-act="ex" data-x="csv:${k}">${esc(k)}.csv</button>`).join('')}</div>
   <button class="btn" data-act="ex" data-x="analyst">{ } Analyst capture JSON</button><button class="btn" data-act="ex" data-x="json">{ } App JSON (media referenced)</button>
   <label class="chk"><input type="checkbox" ${bind('visits', S.visit.id, 'shareSensitive')} ${S.visit.shareSensitive ? 'checked' : ''}> Include sensitive values (IPs, sensitive photos) - only if the site approved</label>
   <button class="btn" data-act="warnings">Show export warnings</button></div>
  ${(() => { const X = exportChecks(S); return `<div class="card ${X.count ? 'bad' : ''}" id="excheck"><b>${X.count ? '⚠' : '✓'} Analyst ${esc(AS.version)} checks</b>
   <div class="small">${X.refErrors.length} unresolved references (panel / Sub-System / area) · ${X.schemaErrors.length} schema errors · ${X.statusErrors.length} gate/status errors · ${X.warnings.length} warnings</div>
   ${X.dupPhys.length ? `<div class="gate small" id="dupphys"><b>⛔ Recorded twice - export blocked until merged:</b>${dupListHtml(X.dupPhys)}</div>` : ''}
   ${X.blockedNoIssue.length ? `<p class="small nudge" id="blockedwarn">⛔ ${X.blockedNoIssue.length} section(s) Blocked with no access-constraint issue: ${esc(X.blockedNoIssue.slice(0, 8).join(', '))}${X.blockedNoIssue.length > 8 ? '…' : ''}</p>` : ''}
   ${X.count ? `<ul class="gate small">${[...X.refErrors.map(x => 'ref: ' + x), ...X.schemaErrors.map(x => 'schema: ' + x), ...X.statusErrors.map(x => 'gate: ' + x)].slice(0, 12).map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="muted small">Fix these before sending - validate.py will reject the export.</p>` : ''}</div>`; })()}
  <div class="card"><b>Reports</b><label class="fld"><span>Day</span><select id="exday">${S.days.map(x => opt(x.id, d?.id, `${x.label} · ${x.date}`)).join('')}</select></label>
   <div class="grid2"><button class="btn" data-act="ex" data-x="dayopen">🖨️ Daily (print)</button><button class="btn" data-act="ex" data-x="daymd">Daily .md</button><button class="btn" data-act="ex" data-x="vopen">🖨️ Visit report (print)</button><button class="btn" data-act="ex" data-x="vhtml">Visit report .html</button><button class="btn" data-act="ex" data-x="vmd">Visit report .md</button></div></div>
  <div class="card"><b>Restore</b><button class="btn" data-act="import">📥 Import JSON / ZIP</button></div>
  ${(S.visit.importLog || []).length ? `<details class="card" id="implog"><summary>📜 Import log (${S.visit.importLog.length})</summary>${S.visit.importLog.slice().reverse().map(e => `<details class="implog-e" data-id="${esc(e.id)}"><summary class="small">${esc(new Date(e.at).toLocaleString())} · ${esc(e.choice)} · ${esc(e.file || '')}${e.conflicts?.length ? ` · ${e.conflicts.length} conflicts` : ''}${e.renumbered?.length ? ` · ${e.renumbered.length} renumbered` : ''}</summary>
   ${e.choice === 'merge' ? mergeReportHtml(e) : '<p class="small">Whole-visit import - no field merge.</p>'}${e.damaged?.length ? `<p class="small bad">Damaged, not imported: ${esc(e.damaged.join(', '))}</p>` : ''}</details>`).join('')}</details>` : ''}`, 'export');
}
function renderSettings() {
  const v = S.visit; v.site = v.site || {};
  const siteF = Object.keys(SITE_DEFAULTS).map(k => typeof SITE_DEFAULTS[k] === 'boolean' ? `<label class="chk"><input type="checkbox" ${bind('visits', v.id, 'site|' + k)} ${siteOf(S)[k] ? 'checked' : ''}> ${esc(k)}</label>`
    : `<label class="fld"><span>${esc(k)}</span><input ${bind('visits', v.id, 'site|' + k)} value="${esc(siteOf(S)[k] ?? '')}"></label>`).join('');
  shell('Visit setup', '#/v/' + v.id, `
  <div class="card">${inp('Visit name', 'visits', v, 'name')}<div class="row2"><label class="fld"><span>Trip (filters checklist items + gates)</span><select ${bind('visits', v.id, 'trip')}>${TRIPS.map(t => opt(t, v.trip)).join('')}</select></label>
   <label class="fld"><span>Capture mode</span><select ${bind('visits', v.id, 'captureMode')}>${EN.captureMode.map(m => opt(m, v.captureMode)).join('')}</select></label></div>
   <div class="row2">${inp('Start', 'visits', v, 'startDate', 'date')}${inp('End', 'visits', v, 'endDate', 'date')}</div>
   <label class="fld"><span>Visitors (; separated)</span><input ${bind('visits', v.id, 'visitors')} data-t="list" value="${esc((v.visitors || []).join('; '))}"></label>
   <label class="fld"><span>Your name on this device (author + photo initials)</span><input data-pref="sv-author" value="${esc(localStorage.getItem('sv-author') || '')}" placeholder="${esc(author())}"></label>
   <div class="fld" id="devcoderow"><span>ID code on this device (prefix of every new ID)</span><div class="row"><b id="devcodeval">${esc(devCode())}</b><span class="small muted">${codeLocked() ? '🔒 in use - e.g. ISS-' + esc(devCode()) + '-0001' : 'not used yet'}</span><button class="btn sm" data-act="devcode">Change…</button></div></div>
   ${(() => { const cc = codeClashOf(v); return cc ? `<p class="small nudge" id="codeclash">⚠ ID code <b>${esc(cc.code)}</b> is used by ${cc.names.length} devices in this visit (${esc(cc.names.join(', '))}). Their new IDs can collide - set a different code on one device (Change…).</p>` : ''; })()}
   <label class="chk"><input type="checkbox" ${bind('visits', v.id, 'gps')} ${v.gps ? 'checked' : ''}> Attach GPS to photos</label></div>
  ${sec('siteReg', '🏭 Site registry (Analyst site / tag model)', siteF + `<p class="muted small">Example: <code>${esc(tagPaths(siteOf(S), { area: 'Ambient', lineOrCell: 'CP-020', equipmentType: 'MDRZone', instanceId: 'MDR-20101', folder: 'StatusPoints', point: 'StateCurrent' }).isa95Path)}</code></p>`, false)}
  ${sec('days', '📅 Days', S.days.map(d => `<div class="sub row2">${inp('Label', 'days', d, 'label')}${inp('Date', 'days', d, 'date', 'date')}</div>`).join('') + '<button class="btn" data-act="newday">+ New day</button>', false)}
  <div class="card"><b>Storage</b><div class="muted small">${storLine}</div><button class="btn" data-act="persist">🔒 Request persistent storage</button></div>
  <div class="card"><b>Help</b><div class="row"><button class="btn" data-act="rules">📋 Field rules</button></div></div>
  <div class="card"><b>Display</b><div class="row"><button class="btn" data-act="theme">◐ Dark / Daylight</button><button class="btn" data-act="bigtext">A+ Bigger text</button></div></div>
  <div class="card"><b>Danger zone</b><p class="muted">Back up first. Deleting removes this visit and its media from this device.</p><button class="btn danger" data-act="delvisit">Delete visit…</button></div>`, 'settings');
}

/* ================= capture ================= */
function getGps() {
  if (!S.visit.gps || !navigator.geolocation) return Promise.resolve(null);
  return new Promise(res => { const t = setTimeout(() => res(null), 6000);
    navigator.geolocation.getCurrentPosition(p => { clearTimeout(t); res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, ts: p.timestamp }); }, () => { clearTimeout(t); res(null); }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }); });
}
/* Video poster thumbnail (videos are never decoded into JS memory - the File/Blob is stored as-is). */
async function makeThumb(blob, kind) {
  if (kind !== 'video') return null;   /* 3.7.3: photo thumbs come from the small canvas in encodePhoto - never a second decode */
  const url = URL.createObjectURL(blob); let v, c;
  try {
    v = await new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('timeout')), 6000); const e = document.createElement('video'); e.muted = true; e.playsInline = true; e.preload = 'auto';
      e.onloadeddata = () => { e.currentTime = Math.min(0.3, (e.duration || 1) / 2); }; e.onseeked = () => { clearTimeout(to); res(e); }; e.onerror = () => { clearTimeout(to); rej(new Error('video')); }; e.src = url; });
    const w = v.videoWidth, h = v.videoHeight, sc = Math.min(1, THUMB_MAX / Math.max(w, h));
    c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); return await canvasThumb(c);
  } catch (e) { return null; } finally { releaseCanvas(c); if (v) { v.removeAttribute('src'); v.load?.(); } URL.revokeObjectURL(url); }
}
/* ================= 3.7.3: low-memory photo capture =================
   iOS killed the page ("low memory") because 3.7.1 decoded every camera photo at FULL resolution (12-48 MP = 48-190 MB of pixels)
   before shrinking it. Now: the photo is decoded already downscaled (createImageBitmap resize, feature-detected; else one <img>
   drawn straight onto ONE target-size canvas), encoded with toBlob (never toDataURL), the thumbnail is cut from that small canvas,
   only the first 128 KB are read for EXIF, everything is released at once, and captures run strictly one at a time.
   If decode / encode fails: automatic retry at 1000 px q0.6, then 800 px q0.5; then a "Photo NOT saved" card with Retry and
   "Save original without compression". Stored media / IDs are never touched. */
const PHOTO_STEPS = [[1400, 0.7], [1000, 0.6], [800, 0.5]];
const PHOTO_MAX = PHOTO_STEPS[0][0], PHOTO_Q = PHOTO_STEPS[0][1], PHOTO_MAX_LEGACY = 1600, THUMB_MAX = 360, HEAD_BYTES = 131072;
const PHOTO_RE = /^image\/(jpeg|jpg|pjpeg|png|webp|heic|heif|bmp|gif|avif)$/i;
const releaseCanvas = c => { if (c) { c.width = 0; c.height = 0; } };
const blobToDataURL = b => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(b); });
async function canvasThumb(src) {   /* small (<=360 px) JPEG data URL from an already-small canvas - format kept for existing media / backups */
  let t;
  try { const sc = Math.min(1, THUMB_MAX / Math.max(src.width, src.height)); t = document.createElement('canvas'); t.width = Math.max(1, Math.round(src.width * sc)); t.height = Math.max(1, Math.round(src.height * sc));
    t.getContext('2d').drawImage(src, 0, 0, t.width, t.height); const b = await new Promise(res => t.toBlob(res, 'image/jpeg', 0.72)); return b ? await blobToDataURL(b) : null;
  } catch (e) { return null; } finally { releaseCanvas(t); }
}
/* Header only (first 128 KB): pixel size, EXIF orientation, EXIF GPS + DateTimeOriginal. Never reads the whole file. */
async function readImageHead(file) {
  const o = { w: 0, h: 0, orient: 1, fmt: '' };
  let dv; try { dv = new DataView(await file.slice(0, HEAD_BYTES).arrayBuffer()); } catch (e) { return o; }
  const n = dv.byteLength, u8 = i => dv.getUint8(i), u16 = i => dv.getUint16(i), u32 = i => dv.getUint32(i);
  try {
    if (n > 24 && u32(0) === 0x89504E47) { o.fmt = 'png'; o.w = u32(16); o.h = u32(20); return o; }
    if (n < 4 || u16(0) !== 0xFFD8) return o;
    o.fmt = 'jpeg'; let p = 2;
    while (p + 4 <= n) {
      if (u8(p) !== 0xFF) break; const mk = u8(p + 1); if (mk === 0xFF) { p++; continue; }
      if (mk === 0xD8 || mk === 0x01 || (mk >= 0xD0 && mk <= 0xD7)) { p += 2; continue; }
      const len = u16(p + 2);
      if (mk === 0xE1 && p + 10 < n && u32(p + 4) === 0x45786966) parseExif(dv, p + 10, Math.min(n, p + 2 + len), o);
      if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC && p + 9 <= n) { o.h = u16(p + 5); o.w = u16(p + 7); break; }
      p += 2 + len;
    }
  } catch (e) { /* header unreadable - decode path still works, just without a known size */ }
  return o;
}
function parseExif(dv, t, end, o) {
  const le = dv.getUint16(t) === 0x4949, U16 = i => dv.getUint16(i, le), U32 = i => dv.getUint32(i, le), ok = i => i >= t && i <= end;   /* i = end of the bytes about to be read */
  const ifd = (off, fn) => { const s = t + off; if (!ok(s + 2)) return; const cnt = U16(s); for (let k = 0; k < cnt; k++) { const e = s + 2 + k * 12; if (!ok(e + 12)) return; fn(U16(e), U16(e + 2), U32(e + 4), U32(e + 8), e + 8); } };
  const rat = (off, c) => { const a = []; for (let k = 0; k < c; k++) { const q = t + off + k * 8; if (!ok(q + 8)) return null; const d = U32(q + 4); a.push(d ? U32(q) / d : 0); } return a; };
  const str = (cnt, vo, e) => { const s = cnt > 4 ? t + vo : e; let r = ''; for (let k = 0; k < cnt - 1 && ok(s + k); k++) r += String.fromCharCode(dv.getUint8(s + k)); return r; };
  let gpsOff = 0, exOff = 0, g = {};
  ifd(U32(t + 4), (tag, ty, cnt, vo, e) => { if (tag === 0x0112) o.orient = U16(e) || 1; else if (tag === 0x8825) gpsOff = vo; else if (tag === 0x8769) exOff = vo; });
  if (exOff) ifd(exOff, (tag, ty, cnt, vo, e) => { if (tag === 0x9003) { const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(str(cnt, vo, e)); if (m) { const d = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(); if (d > 0) o.taken = d; } } });
  if (gpsOff) ifd(gpsOff, (tag, ty, cnt, vo, e) => { if (tag === 1 || tag === 3) g[tag] = String.fromCharCode(dv.getUint8(e)); else if ((tag === 2 || tag === 4) && cnt === 3) g[tag] = rat(vo, 3); });
  const dms = a => a && a[0] + a[1] / 60 + a[2] / 3600;
  if (g[2] && g[4]) { const lat = dms(g[2]) * (g[1] === 'S' ? -1 : 1), lon = dms(g[4]) * (g[3] === 'W' ? -1 : 1); if (isFinite(lat) && isFinite(lon) && (lat || lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) o.gps = { lat, lon }; }
}
let cibResize;   /* feature-detect createImageBitmap resize + EXIF orientation once (Safari < 17 lacks resize - it then uses the <img> path) */
async function cibResizeOK() {
  if (cibResize !== undefined) return cibResize; cibResize = false;
  if (!window.createImageBitmap) return false; let c, bm;
  try { c = document.createElement('canvas'); c.width = 8; c.height = 4; c.getContext('2d').fillRect(0, 0, 8, 4); const b = await new Promise(res => c.toBlob(res, 'image/png'));
    bm = await createImageBitmap(b, { resizeWidth: 4, resizeHeight: 2, resizeQuality: 'medium', imageOrientation: 'from-image' }); cibResize = bm.width === 4 && bm.height === 2;
  } catch (e) { cibResize = false; } finally { bm?.close?.(); releaseCanvas(c); }
  return cibResize;
}
const fit = (w, h, max) => { const sc = Math.min(1, max / Math.max(w, h)); return [Math.max(1, Math.round(w * sc)), Math.max(1, Math.round(h * sc)), sc]; };
/* One attempt: decode already scaled to <= max, draw on ONE canvas of the target size, toBlob, thumb from that canvas, release all. */
async function encodePhoto(file, hd, max, q, useCib) {
  let bm = null, img = null, url = '', c = null;
  try {
    let src, w, h;
    const ow = hd.orient >= 5 && hd.orient <= 8 ? hd.h : hd.w, oh = hd.orient >= 5 && hd.orient <= 8 ? hd.w : hd.h;   /* oriented (display) size */
    if (useCib && ow && oh) {   /* width only: the browser keeps the (oriented) aspect ratio, so a misread EXIF tag can never squash the photo.
        Cheap 'low' resample to 2x the target, then a 'high'-quality canvas step: same sharpness as 'medium', without Chromium's extra full-size mip buffers (-45 MB on 48 MP) */
      bm = await createImageBitmap(file, { resizeWidth: Math.min(ow, 2 * fit(ow, oh, max)[0]), resizeQuality: 'low', imageOrientation: 'from-image' }); src = bm; w = bm.width; h = bm.height; }
    else { url = URL.createObjectURL(file); img = new Image(); img.decoding = 'async';
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('image decode failed')); img.src = url; });
      src = img; w = img.naturalWidth; h = img.naturalHeight; }
    if (!w || !h) throw new Error('image has no size');
    const [cw, ch, sc] = fit(w, h, max);
    c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d'); if (!g) throw new Error('no canvas memory');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, cw, ch);
    bm?.close?.(); bm = null; if (img) { img.src = ''; img = null; } if (url) { URL.revokeObjectURL(url); url = ''; }   /* decoded source gone before encoding */
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', q));
    if (!blob || !blob.size) throw new Error('JPEG encode failed (toBlob returned null)');
    const thumb = await canvasThumb(c);
    const native = Math.max(ow || w, oh || h) <= max && sc === 1;
    if (native && /jpe?g/i.test(file.type || hd.fmt) && blob.size >= file.size) return { blob: new Blob([file], { type: 'image/jpeg' }), width: cw, height: ch, compressed: false, thumb };
    return { blob, width: cw, height: ch, compressed: true, maxEdge: max, jpegQ: q, thumb };
  } finally { bm?.close?.(); if (img) img.src = ''; if (url) URL.revokeObjectURL(url); releaseCanvas(c); }
}
async function compressPhoto(file, hd) {
  const errs = []; let useCib = await cibResizeOK();
  for (const [max, q] of PHOTO_STEPS) {
    try { const r = await encodePhoto(file, hd, max, q, useCib); if (errs.length) console.warn('photo saved after retry at', max, errs); return { ...r, retries: errs.length }; }
    catch (e) { errs.push(`${max}px: ${e?.message || e}`); console.warn('photo encode failed', max, e); if (useCib) useCib = false; /* next step: plain <img> decode */
      await new Promise(r => setTimeout(r, 120)); }   /* give the GC a moment before the smaller retry */
  }
  return { failed: true, errs };
}
/* Captures are processed strictly one at a time (queue), each persisted before the next is decoded. */
const capQ = [], capFailed = []; let capRun = null;
function addFiles(files) {
  const ctx = { ...capCtx }; for (const file of files) capQ.push({ file, ctx, visitId: S.visit.id });
  if (!capRun) capRun = runCapQ().finally(() => { capRun = null; });
  return capRun;
}
async function runCapQ() {
  if (!S.media.length) requestPersist();
  const q = await refreshQuota();
  if (q.level === 'block') toast('⚠️ Storage is full - trying to save anyway. Back up and free space now.', 5000);
  let n = 0, bad = 0;
  while (capQ.length) { const it = capQ.shift(); const r = await captureOne(it); if (r === true) n++; else if (r === false) bad++; }
  capMark(null);
  if (capFailed.length) showCapFail(); else if (n || bad) toast(!bad ? `Saved ${n} file${n === 1 ? '' : 's'} ✓` : `⛔ ${bad} file${bad === 1 ? '' : 's'} NOT SAVED - storage error. See the red banner.`, bad ? 6000 : 2400);
  route(); refreshQuota();
}
/* returns true (saved), false (storage error - stays queued in memory with the red banner), or 'failed' (photo processing failed - card) */
async function captureOne(it, raw = false) {
  if (!S || S.visit.id !== it.visitId) { capFailed.push(it); return 'failed'; }
  const file = it.file, c = it.ctx, kind = (file.type || '').startsWith('video') ? 'video' : 'photo';
  toast(`Saving ${kind}…`, 8000);
  const gpsP = getGps();   /* runs while the photo is processed */
  let cp = null, hd = { orient: 1 };
  if (kind === 'photo') {
    hd = await readImageHead(file);
    if (!raw && (PHOTO_RE.test(file.type || '') || hd.fmt)) { cp = await compressPhoto(file, hd); if (cp.failed) { it.errs = cp.errs; capFailed.push(it); await gpsP; return 'failed'; } }
  }
  const blob = cp?.blob || new Blob([file], { type: file.type || 'application/octet-stream' });   /* videos / originals: the File itself, never read into memory */
  const [thumb, gps] = await Promise.all([cp ? cp.thumb : makeThumb(blob, kind), gpsP]);
  const crc = await crc32Blob(blob);
  const now = Date.now(), exifGps = S.visit.gps && hd.gps ? { ...hd.gps, src: 'exif' } : null;
  const m = { id: uid(), visitId: S.visit.id, dayId: activeDay()?.id, stopId: c.stop || '', shotId: c.shot || '', recordId: c.rec || '', kind, photoType: c.type || (kind === 'video' ? 'video_operation' : 'other'),
    mime: blob.type || 'application/octet-stream', name: file.name || '', size: blob.size, origSize: file.size, origMime: file.type || '', width: cp?.width || (raw ? (hd.orient >= 5 ? hd.h : hd.w) || undefined : undefined), height: cp?.height || (raw ? (hd.orient >= 5 ? hd.w : hd.h) || undefined : undefined),
    compressed: !!cp?.compressed, crc, blob, thumb, note: '', tags: [], sensitive: false, gps: gps || exifGps, capturedAt: now, takenAt: hd.taken || file.lastModified || now, createdAt: now, updatedAt: now, ...who() };
  if (cp?.compressed) { m.maxEdge = cp.maxEdge; m.jpegQ = cp.jpegQ; }
  if (raw) m.uncompressed = true;
  if (!EN.photoType.includes(m.photoType)) m.photoType = 'other';
  assignMediaName(S, m);                   // filename + sequence fixed now (should-fix); never renamed implicitly
  m.bid = nextBid('media');                // 3.6.0 B2: photo ID (MED-JR-0007) at capture, every path (shot list, freeform, video, library, floating camera)
  S.media.push(m); touch('media', m); touch('visits', S.visit);
  it.file = null; cp = null;               // drop our reference to the original as soon as it is stored
  return await flush();
}
function capWhere(it) { const st = S?.stops.find(s => s.id === it.ctx.stop), sh = st?.shots?.find(x => x.id === it.ctx.shot);
  return [st ? stopName(st.id) : '', sh?.text || PHOTO_TYPE[it.ctx.type]?.label || ''].filter(Boolean).join(' · '); }
function showCapFail() {
  if (!capFailed.length) return; $('.modal.capfail')?.remove();
  const n = capFailed.length, mb = capFailed.reduce((a, it) => a + (it.file?.size || 0), 0) / 1048576;
  modal(`<h3>⛔ ${n === 1 ? 'Photo' : n + ' photos'} NOT saved</h3>
    <p>The phone could not process ${n === 1 ? 'this photo' : 'these photos'} (tried ${PHOTO_STEPS.map(s => s[0] + ' px').join(', ')} - usually low memory). <b>Your notes and everything else are saved.</b></p>
    <p class="small muted">${capFailed.map(it => esc(capWhere(it) || it.file?.name || 'photo')).join('<br>')}</p>
    <button class="btn big pri" data-act="capretry" style="width:100%">↻ Retry</button>
    <div class="row" style="margin-top:.6rem"><button class="btn" data-act="capraw">Save original without compression (${mb.toFixed(1)} MB)</button><button class="btn danger" data-act="capdiscard">Discard</button></div>
    <p class="small muted">If Retry keeps failing: close other apps, or save the original and back up soon (originals use more storage).</p>`, 'capfail');
}
async function capRetry(raw) {
  const items = capFailed.splice(0); closeModal(false);
  if (!S) return;
  let n = 0, bad = 0; for (const it of items) { if (!it.file) continue; const r = await captureOne(it, raw); if (r === true) n++; else if (r === false) bad++; }
  if (capFailed.length) showCapFail(); else toast(bad ? `⛔ ${bad} NOT SAVED - storage error. See the red banner.` : `Saved ${n} file${n === 1 ? '' : 's'} ✓${raw ? ' (original, uncompressed)' : ''}`, bad ? 6000 : 2400);
  route(); refreshQuota();
}
/* If iOS reloads the page mid-capture (low memory), the photo is gone - say so on the next launch instead of failing silently. */
function capMark(v) { try { v ? localStorage.setItem('sv-cap-pending', JSON.stringify(v)) : localStorage.removeItem('sv-cap-pending'); } catch (e) { } }
function capInterrupted() {
  let mk; try { mk = JSON.parse(localStorage.getItem('sv-cap-pending') || 'null'); } catch (e) { } capMark(null);
  if (!mk || !(Date.now() - mk.at < 10 * 60000) || !S || S.visit.id !== mk.visitId || $('.modal')) return;
  capCtx = mk.ctx;
  modal(`<h3>⚠️ Last ${mk.kind === 'video' ? 'video' : 'photo'} was not saved</h3><p>The app was restarted (iOS low memory) while ${mk.phase === 'processing' ? 'saving' : 'taking'} it. Nothing else was lost.</p>
    <p class="small muted">${esc(capWhere({ ctx: mk.ctx }))}</p><button class="btn big pri" data-act="capretake" data-kind="${esc(mk.kind || 'photo')}" style="width:100%">📷 Retake now</button><div class="row" style="margin-top:.6rem"><button class="btn" data-act="mclose">Close</button></div>`, 'capfail');
}
function startCapture(b) {
  if (quota.level === 'block') { modal(`<h3>⛔ Storage full</h3><p>${((quota.quota - quota.usage) / 1048576).toFixed(0)} MB free. Back up, then delete old media or visits before taking more photos.</p><div class="row"><button class="btn pri" data-act="backup" data-x="incremental">💾 Back up now</button><button class="btn" data-act="mclose">Close</button></div>`); return; }
  const sh = b.dataset.shot && S.stops.find(s => s.id === b.dataset.stop)?.shots.find(x => x.id === b.dataset.shot);
  capCtx = { stop: b.dataset.stop, shot: b.dataset.shot, rec: b.dataset.rec, type: sh ? sh.photoType : b.dataset.type || b.closest('.capbox')?.querySelector('select.captype')?.value || '' };
  openCapInput(b.dataset.kind);
}
function openCapInput(k) {
  const el = $(k === 'video' ? '#capVideo' : k === 'lib' ? '#capLib' : '#capPhoto');
  el.value = ''; el.click();
  capMark({ at: Date.now(), visitId: S.visit.id, ctx: capCtx, kind: k === 'video' ? 'video' : 'photo', phase: 'camera' });
  flush(); refreshQuota();   /* typed notes are on disk before the camera takes the phone's memory */
}
function fab() {
  const p = location.hash.split('/'), s = p[3] === 's' ? S.stops.find(x => x.id === p[4]) : null, r = p[3] === 'r' ? S.records.find(x => x.id === p[4]) : null;
  const ctx = document.createElement('button'); ctx.dataset.kind = 'photo';
  if (s) { const sh = s.shots.find(x => x.req && !shotDone(S, s, x)) || s.shots.find(x => !shotDone(S, s, x)); ctx.dataset.stop = s.id; if (sh) ctx.dataset.shot = sh.id; else ctx.dataset.type = 'other'; }
  else if (r) { ctx.dataset.stop = r.stopId; ctx.dataset.rec = r.id; const need = r.type === 'section' ? (CK.sectionTemplate.photos || []).find(x => !S.media.some(m => m.recordId === r.id && m.photoType === x.photoType)) : null; ctx.dataset.type = need?.photoType || 'other'; }
  else ctx.dataset.type = 'overview';
  toast(ctx.dataset.shot ? 'Next photo: ' + (s.shots.find(x => x.id === ctx.dataset.shot)?.text || '') : 'Photo: ' + (PHOTO_TYPE[ctx.dataset.type]?.label || ''), 2000);
  startCapture(ctx);
}

/* ================= delete with undo (should-fix) ================= */
let undoBuf = null;
async function softDelete(items, label) {   // items = [[store, obj]]
  await flush();
  for (const [s, o] of items) { S[s] = S[s].filter(x => x.id !== o.id); pending.delete(s + ':' + o.id); await dbDel(s, o.id); }
  S.visit.tombs = S.visit.tombs || {}; for (const [, o] of items) S.visit.tombs[o.id] = Date.now();   /* 3.6.0: a merge never brings a deleted record back */
  touch('visits', S.visit); await flush();
  undoBuf = items; toast(`Deleted ${esc(label)} <button class="btn sm" data-act="undo">Undo</button>`, 7000, true);
}
async function undoDelete() {
  if (!undoBuf) return; const items = undoBuf; undoBuf = null;
  for (const [s, o] of items) { o.updatedAt = Date.now(); S[s].push(o); pending.set(s + ':' + o.id, [s, o]); delete S.visit.tombs?.[o.id]; }
  touch('visits', S.visit); sortBundle(S); await flush(); $('#toast').classList.remove('show'); toast('Restored ✓'); route();
}

/* ================= import: stage -> validate -> atomic swap (must-fix 1) ================= */
function remapIds(obj, map) { if (Array.isArray(obj)) return obj.map(x => remapIds(x, map)); if (obj && typeof obj === 'object' && !(obj instanceof Blob)) { const o = {}; for (const k in obj) o[k] = remapIds(obj[k], map); return o; } return typeof obj === 'string' && map[obj] ? map[obj] : obj; }
async function readPackage(file) {
  let data, files = null, bad = [];
  if (/\.zip$/i.test(file.name || '') || (file.type || '').includes('zip')) { const Z = await readZipEntries(file); files = Z.files; if (!files['visit.json']) throw new Error('visit.json not found in zip');
    bad = await verifyZipEntries(Z);   /* 3.4.0 S-c: every entry checked against its central-directory CRC32 */
    if (bad.includes('visit.json')) throw new Error('visit.json is corrupt (CRC32 mismatch) - this file is damaged. Nothing was imported.');
    data = JSON.parse(await zipText(files['visit.json'])); }
  else data = JSON.parse(await file.text());
  if (data.format !== 'site-visit-pwa' || !data.visit) throw new Error('Not a Site Visit export');
  const badMedia = [];
  for (const m of data.media || []) {
    if (m.dataBase64) { const bin = atob(m.dataBase64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); m.blob = new Blob([u8], { type: m.mime }); delete m.dataBase64; }
    else if (files && files[m.file]) { if (bad.includes(m.file)) badMedia.push(m.filename || m.file); else m.blob = new Blob([files[m.file]], { type: m.mime }); }   /* corrupt media never imported */
    delete m.file; delete m.inPackage;
  }
  const pack = { visit: data.visit, days: data.days || [], stops: data.stops || [], records: data.records || [], media: data.media || [] };
  pack.visit.schemaVersion = pack.visit.schemaVersion || data.schemaVersion || 1;
  return { pack, data, bad: bad.filter(n => n !== 'visit.json'), badMedia };
}
function validatePack(P, want) {
  const e = [], vid = P.visit?.id;
  if (!vid) e.push('no visit');
  for (const s of ['days', 'stops', 'records', 'media']) { if (P[s].length !== want[s].length) e.push(`${s}: staged ${P[s].length} of ${want[s].length}`); if (P[s].some(o => o.visitId !== vid)) e.push(`${s}: wrong visitId`); }
  if (!P.stops.length) e.push('no stops');
  const stopIds = new Set(P.stops.map(s => s.id)); if (P.records.some(r => r.stopId && !stopIds.has(r.stopId))) e.push('records point at missing stops');
  if (P.visit && P.visit.schemaVersion !== SCHEMA_VERSION) e.push('not migrated');
  return e;
}
async function stageAndCommit(pack) {
  await dbStage(pack);
  let P; try { P = await dbReadStaging(); } catch (err) { await dbClearStaging(); throw err; }
  const errs = validatePack(P, pack);
  if (errs.length) { await dbClearStaging(); throw new Error('Validation failed - nothing was changed: ' + errs.slice(0, 3).join('; ')); }
  try { await dbCommitStaging(P.visit.id, window.SV_TEST_COMMIT || {}); }
  catch (err) { await dbClearStaging().catch(() => {}); throw err; }   /* aborted swap: live data untouched, staging emptied */
}
/* 3.4.0 (Reviewer S-a): what Replace would do to this device, as before -> after counts */
async function deviceImpact(pack) {
  const vid = pack.visit.id, local = { visit: await dbGet('visits', vid) };
  for (const st of ['days', 'stops', 'records', 'media']) local[st] = await dbByVisit(st, vid);
  const inPack = st => new Set(pack[st].map(o => o.id)), lmBlob = new Map(local.media.filter(m => m.blob).map(m => [m.id, m]));
  const photosAfter = pack.media.filter(m => m.blob || lmBlob.has(m.id)).length;
  const lostRecords = local.records.filter(r => !inPack('records').has(r.id)), lostMedia = local.media.filter(m => !inPack('media').has(m.id));
  const newer = st => local[st].filter(o => { const q = pack[st].find(x => x.id === o.id); return q && (o.updatedAt || o.createdAt || 0) > (q.updatedAt || q.createdAt || 0); }).length;
  return { local, before: { records: local.records.length, photos: lmBlob.size }, after: { records: pack.records.length, photos: photosAfter }, lostRecords, lostMedia, newerOnDevice: newer('records') + newer('media'),
    older: (pack.visit.updatedAt || 0) < (local.visit?.updatedAt || 0) };
}
/* Merge = union of file + device; an object on both sides keeps the newer updatedAt (ties keep the device copy).
   3.5.0 (Reviewer M1): every ID counter = max(device, file) (never goes backwards); the device's backup chain is kept;
   human-readable IDs (ISS-/ALM-/OBS-/INT-/MED-...) are re-checked after the merge - a collision renumbers the INCOMING
   record and rewrites every reference to the old ID in incoming objects; same-record edits are listed field by field. */
const MERGE_SKIP = new Set(['updatedAt', 'createdAt', 'blob', 'thumb', 'schemaVersion', 'seq', 'mediaSeq', 'backup', 'importLog', 'migratedFrom', 'migrationNotes', 'id', 'visitId', 'updatedBy', 'activeDayId', 'lastStopId', 'lastBackupAt', 'crc', 'bid', 'devices', 'tombs', 'aliases', 'mergedFrom', 'hwm', 'capName']);
const PREFIX_KIND = Object.fromEntries(Object.entries(ID_PREFIX).map(([k, p]) => [p, k]));
const shortVal = v => { if (v === undefined || v === null || v === '') return '(blank)'; const t = typeof v === 'object' ? JSON.stringify(v) : String(v); return t.length > 120 ? t.slice(0, 117) + '…' : t; };
const sameVal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
function objLabel(st, o) { if (st === 'records') return `${o.bid ? o.bid + ' ' : ''}${recTitle(o) || o.type}`.trim(); if (st === 'media') return o.bid || o.filename || o.id;
  if (st === 'stops') { try { return stopTitle(o); } catch (_) { return o.id; } } if (st === 'visit') return 'Visit settings'; return o.label || o.date || o.id; }
function fieldDiffs(st, l, o) { const out = [];
  if (st === 'records') { const ks = new Set([...Object.keys(l.f || {}), ...Object.keys(o.f || {})]); for (const k of ks) if (!sameVal(l.f?.[k], o.f?.[k])) out.push([k, l.f?.[k], o.f?.[k]]); }
  const ks = new Set([...Object.keys(l), ...Object.keys(o)]); for (const k of ks) { if (MERGE_SKIP.has(k) || k === 'f' || k === 'attest' || k === 'sync') continue; if (!sameVal(l[k], o[k])) out.push([k, l[k], o[k]]); }
  return out; }
const bidNum = b => { const m = /-(\d+)$/.exec(b || ''); return m ? +m[1] : 0; };
function rewriteRefs(x, re, to) { if (typeof x === 'string') return x.replace(re, to); if (Array.isArray(x)) return x.map(y => rewriteRefs(y, re, to));
  if (x && typeof x === 'object' && !(x instanceof Blob)) { const o = {}; for (const k in x) o[k] = k === 'blob' || k === 'thumb' || k === 'id' || k === 'bid' ? x[k] : rewriteRefs(x[k], re, to); return o; } return x; }
function mergePack(pack, local) {
  const ts = o => o?.updatedAt || o?.createdAt || 0, lv = local.visit || {}, pv = pack.visit, fileNewer = ts(pv) > ts(lv);
  const R = { conflicts: [], renumbered: [], duplicates: [], counters: [] };
  const P = { visit: fileNewer ? { ...pv } : { ...lv } };
  for (const [k, l, o] of fieldDiffs('visit', lv, pv)) R.conflicts.push({ store: 'visit', id: lv.id, record: 'Visit settings', field: k, device: shortVal(l), file: shortVal(o), won: fileNewer ? 'file' : 'device' });
  /* counters: per-key max, never backwards */
  const maxMap = (a = {}, b = {}, what) => { const out = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { out[k] = Math.max(a[k] || 0, b[k] || 0);
    if ((P.visit[what]?.[k] || 0) < out[k]) R.counters.push({ counter: `${what}.${k}`, device: a[k] || 0, file: b[k] || 0, now: out[k] }); } return out; };
  P.visit.seq = maxMap(lv.seq, pv.seq, 'seq'); P.visit.mediaSeq = maxMap(lv.mediaSeq, pv.mediaSeq, 'mediaSeq');
  P.visit.backup = { ...(pv.backup || {}), ...(lv.backup || {}) };                                         /* the device's backup chain */
  P.visit.backup.seq = Math.max(lv.backup?.seq || 0, pv.backup?.seq || 0); P.visit.backup.mediaMark = Math.max(lv.backup?.mediaMark || 0, pv.backup?.mediaMark || 0);
  const logs = new Map([...(lv.importLog || []), ...(pv.importLog || [])].map(e => [e.id, e])); P.visit.importLog = [...logs.values()].sort((a, b) => a.at - b.at);
  P.visit.schemaVersion = SCHEMA_VERSION;
  /* 3.6.0 M2/M3: device codes, tombstones and merge-two aliases are unions */
  const devs = {}; for (const dv of [lv.devices || {}, pv.devices || {}]) for (const [c, d] of Object.entries(dv)) { const cur = devs[c];
    if (!cur) { devs[c] = { ...d, others: [...(d.others || [])] }; continue; }
    for (const o of [d, ...(d.others || [])]) if (o.device !== cur.device && !cur.others.some(x => x.device === o.device)) cur.others.push({ device: o.device, name: o.name, at: o.at }); }
  for (const d of Object.values(devs)) if (!d.others.length) delete d.others;
  P.visit.devices = devs; R.codeClash = Object.keys(devs).map(c => codeClashOf(P.visit, c)).filter(Boolean);
  const tombs = { ...(lv.tombs || {}) }; for (const [k, t] of Object.entries(pv.tombs || {})) tombs[k] = Math.max(tombs[k] || 0, t); P.visit.tombs = tombs;
  const aliases = { ...(pv.aliases || {}), ...(lv.aliases || {}) }; P.visit.aliases = aliases;
  const incoming = new Set(), fromFile = new Set();                    /* incoming = only in the file; fromFile = the file's copy won */
  for (const st of ['days', 'stops', 'records', 'media']) { const m = new Map(local[st].map(o => [o.id, o]));
    for (const o of pack[st]) { const l = m.get(o.id);
      if (!l) { incoming.add(o.id); fromFile.add(o.id); m.set(o.id, o); continue; }
      const win = ts(o) > ts(l);
      if (ts(o) !== ts(l)) for (const [k, dv, fv] of fieldDiffs(st, l, o)) R.conflicts.push({ store: st, id: o.id, record: objLabel(st, win ? o : l), field: k, device: shortVal(dv), file: shortVal(fv), won: win ? 'file' : 'device', _dv: dv, _fv: fv });
      if (win) { fromFile.add(o.id); m.set(o.id, st === 'media' && !o.blob && l?.blob ? { ...o, blob: l.blob, thumb: o.thumb || l.thumb } : o); } }
    /* 3.7.0 S4: an edit made to a merged-away copy (on a phone that had not heard of the merge yet) is redirected onto the kept record,
       field by field (fields changed since the merge snapshot), newer wins, and listed in the conflict report - never dropped silently */
    if (st === 'records') for (const x of [...m.values()]) { if (!aliases[x.id]) continue;
      let tid = aliases[x.id], hop = 0; while (aliases[tid] && hop++ < 20) tid = aliases[tid];
      const tgt0 = m.get(tid); if (!tgt0) continue;
      const snapE = (tgt0.mergedFrom || []).find(e => e.id === x.id), snap = snapE?.f, xFile = fromFile.has(x.id) && !local[st].some(o => o.id === x.id && ts(o) >= ts(x));
      const xf = remapIds(x.f || {}, aliases), edited = Object.keys(xf).filter(k => snap ? !sameVal(xf[k], remapIds(snap[k], aliases)) : ts(x) > (snapE?.at || tombs[x.id] || 0)).filter(k => !sameVal(xf[k], tgt0.f?.[k]));
      if (!edited.length) continue;
      const xWins = ts(x) > ts(tgt0), tgt = xWins ? { ...tgt0, f: { ...tgt0.f } } : tgt0, lbl = `${objLabel(st, tgt0)} ← edit on merged-away copy`;
      for (const k of edited) { const kept = tgt0.f?.[k], late = xf[k];
        R.conflicts.push({ store: st, id: tid, record: lbl, field: k, device: shortVal(xFile ? kept : late), file: shortVal(xFile ? late : kept), won: xWins === xFile ? 'file' : 'device', redirected: true });
        (R.redirected = R.redirected || []).push({ from: x.id, to: tid, field: k, applied: xWins });
        if (xWins) tgt.f[k] = structuredClone(late); }
      if (xWins) { tgt.updatedAt = Math.max(ts(tgt0), ts(x)); tgt.updatedBy = x.updatedBy || tgt.updatedBy; m.set(tid, tgt); fromFile.add(tid); } }
    P[st] = [...m.values()].filter(o => !(tombs[o.id] && tombs[o.id] >= ts(o)) && !aliases[o.id]); }
  if (Object.keys(aliases).length) for (const st of ['records', 'media', 'stops']) P[st] = P[st].map(o => { let y = null;
    for (const k in o) { if (k === 'id' || k === 'blob' || k === 'thumb') continue; const v2 = remapIds(o[k], aliases); if (!sameVal(v2, o[k])) (y = y || { ...o })[k] = v2; } return y || o; });
  /* human-readable IDs: counters cover every ID already in use, then collisions renumber the incoming record */
  const all = [...P.records, ...P.media].filter(o => o.bid);
  const seqKey = bidSeqKey;
  for (const o of all) { const k = seqKey(o.bid); if (k) P.visit.seq[k] = Math.max(P.visit.seq[k] || 0, bidNum(o.bid)); }
  const byBid = new Map(); for (const o of all) { if (!byBid.has(o.bid)) byBid.set(o.bid, []); byBid.get(o.bid).push(o); }
  for (const [bid, list] of byBid) { if (list.length < 2) continue;
    const keep = list.find(o => !incoming.has(o.id)) || list.slice().sort((a, b) => ts(a) - ts(b))[0];
    /* fallback only: legacy unprefixed IDs, or two devices on the same code. Keeps the original's prefix/code. */
    for (const o of list) { if (o === keep) continue; const kind = PREFIX_KIND[String(bid).split('-')[0]]; if (!kind) continue;
      const code = bidCode(bid), key = code ? kind + '@' + code : kind, nb = seqId(kind, P.visit.seq[key] = (P.visit.seq[key] || 0) + 1, code), st = P.records.some(x => x.id === o.id) ? 'records' : 'media';
      const re = new RegExp(`\\b${bid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'); let refs = 0;
      for (const s2 of ['records', 'media', 'stops', 'days']) P[s2] = P[s2].map(x => { if (!fromFile.has(x.id)) return x; const y = rewriteRefs(x, re, nb), J = z => JSON.stringify(z, (k, v) => v instanceof Blob ? 0 : v); if (J(y) === J(x)) return x; if (x.id !== o.id) { refs++; y.updatedAt = Date.now(); } return y; });
      const tgt = P[st].find(x => x.id === o.id); tgt.bid = nb; tgt.updatedAt = Date.now();
      R.renumbered.push({ store: st, id: o.id, from: bid, to: nb, record: objLabel(st, tgt), refs }); } }
  /* 3.6.0 nit: rewrites caused by renumbering (this merge or an earlier one in the import log) are not "conflicts" */
  const pairs = [...(P.visit.importLog || []).flatMap(e => e.renumbered || []), ...R.renumbered].map(r => [new RegExp(`\\b${r.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), r.to]);
  const canon = v => { let t = JSON.stringify(v ?? null); for (const [re, to] of pairs) t = t.replace(re, to); return t; };
  if (pairs.length) R.conflicts = R.conflicts.filter(c => c._dv === undefined || canon(c._dv) !== canon(c._fv));
  if (Object.keys(aliases).length) R.conflicts = R.conflicts.filter(c => c._dv === undefined || !sameVal(remapIds(c._dv, aliases), remapIds(c._fv, aliases)));   /* 3.7.0 nit: no raw-UUID noise after a merge-two */
  R.conflicts.forEach(c => { delete c._dv; delete c._fv; });
  /* derived IDs that cannot be renumbered (a physical device / screen code): flag - export is blocked until merged (3.6.0 M3) */
  const dupOf = (list, key) => { const g = new Map(); for (const o of list) { const k = key(o); if (!k) continue; if (!g.has(k)) g.set(k, 0); g.set(k, g.get(k) + 1); } return [...g].filter(([, n]) => n > 1).map(([k, n]) => `${k} ×${n}`); };
  R.duplicates = [...dupOf(P.records, physKey), ...dupOf(P.media, m => m.filename)];
  return { P, R };
}
function mergeReportHtml(R, compact = false) {
  const rn = R.renumbered || [], cf = R.conflicts || [], ct = R.counters || [], du = R.duplicates || [];
  return `${ct.length ? `<p class="small">Counters kept at the highest value: ${esc(ct.map(c => `${c.counter} ${c.device}/${c.file} → ${c.now}`).join(' · '))}</p>` : ''}
   ${rn.length ? `<div class="gate small" id="renumbered"><b>🔢 ${rn.length} incoming ID${rn.length > 1 ? 's' : ''} renumbered (already used on this device):</b><ul>${rn.map(r => `<li>${esc(r.from)} → <b>${esc(r.to)}</b> · ${esc(r.record)}${r.refs ? ` · ${r.refs} reference${r.refs > 1 ? 's' : ''} updated` : ''}</li>`).join('')}</ul></div>` : ''}
   ${(R.codeClash || []).length ? `<p class="small nudge" id="codeclash">⚠ Two devices use the same ID code: ${esc(R.codeClash.map(c => `${c.code} (${c.names.join(', ')})`).join('; '))}. Set a different code on one of them (Visit setup → ID code) or their IDs will keep colliding.</p>` : ''}
   ${du.length ? `<p class="small nudge" id="dupids">⚠ Same device/screen recorded twice: ${esc(du.join(', '))}. Export is blocked until they are merged - Export page → <b>Merge these two</b>.</p>` : ''}
   ${(R.redirected || []).length ? `<p class="small nudge" id="redirected">↪ ${R.redirected.length} late edit${R.redirected.length > 1 ? 's' : ''} made to a merged-away copy ${R.redirected.length > 1 ? 'were' : 'was'} moved onto the kept record (newer wins; marked ↪ below).</p>` : ''}
   <div id="conflicts">${cf.length ? `<p class="small"><b>⚖ ${cf.length} field${cf.length > 1 ? 's' : ''} differed on both sides</b> - the newer record won; the other value is listed so nothing is lost silently:</p>
   <div class="navwrap"><table class="conf small"><colgroup><col style="width:28%"><col style="width:22%"><col style="width:25%"><col style="width:25%"></colgroup><tr><th>Record</th><th>Field</th><th>This device</th><th>File</th></tr>${cf.slice(0, compact ? 50 : 1000).map(c => `<tr data-id="${esc(c.id || '')}" data-field="${esc(c.field)}"${c.redirected ? ' class="redir"' : ''}><td>${c.redirected ? '↪ ' : ''}${esc(c.record)}</td><td>${esc(c.field)}</td><td${c.won === 'device' ? ' class="won"' : ''}>${esc(c.device)}${c.won === 'device' ? ' <span class="kept">✓ kept</span>' : ''}</td><td${c.won === 'file' ? ' class="won"' : ''}>${esc(c.file)}${c.won === 'file' ? ' <span class="kept">✓ kept</span>' : ''}</td></tr>`).join('')}</table></div>${compact && cf.length > 50 ? `<p class="small">+${cf.length - 50} more in the import log (Export page)</p>` : ''}` : '<p class="small">No conflicting edits.</p>'}</div>`;
}
async function importFile(file) {
  await flush();
  const { pack, data, bad, badMedia } = await readPackage(file);
  if (pack.visit.schemaVersion > SCHEMA_VERSION) { await ask(`<h3>Newer app needed</h3><p>This export is store schema v${pack.visit.schemaVersion}; this app is v${SCHEMA_VERSION}. Update the app (reload when online), then import again. Nothing was changed.</p><button class="btn pri" data-choice="cancel">OK</button>`); return 'newer'; }
  const from = pack.visit.schemaVersion, notes = migrateBundle(pack) || [];
  await backfillBids(pack);   /* 3.6.0 B2: photos / records saved by 3.5.0 without an ID get one before merging */
  const exists = await dbGet('visits', pack.visit.id), inc = data.package?.kind === 'incremental';
  const nm = pack.media.filter(m => m.blob).length;
  const I = exists ? await deviceImpact(pack) : null;
  /* 3.4.0 S-b: an incremental alone (visit not on this device, or media it references are neither in the file nor here) */
  if (inc) { const have = new Set((I?.local.media || []).filter(m => m.blob).map(m => m.id)), missing = pack.media.filter(m => !m.blob && !have.has(m.id)).length,
      seq = data.package?.seq || 0, devSeq = exists?.backup?.seq || 0, gap = !exists || missing > 0 || (seq > 1 && devSeq && devSeq < seq - 1);
    if (gap) { const c = await ask(`<h3>⚠ Partial backup chain</h3><p>This is an <b>incremental</b> backup${seq ? ` (#${seq})` : ''}. ${!exists ? 'This visit is not on this device, so ' : ''}${missing} of ${pack.media.length} photos it lists are neither in this file nor on this device.</p>
        <p><b>Import the full backup and earlier incrementals first</b>, then this one.</p><div class="row"><button class="btn pri" data-choice="cancel">Cancel</button><button class="btn" data-choice="go">Import anyway</button></div>`);
      if (c !== 'go') { toast('Import cancelled - nothing changed'); return 'cancel'; } } }
  const lossy = I && (I.lostRecords.length || I.lostMedia.length || I.newerOnDevice || I.older);
  const badHtml = bad.length ? `<p class="bad small"><b>⚠ ${bad.length} damaged file${bad.length > 1 ? 's' : ''} in this zip (CRC32 mismatch) - not imported:</b> ${esc(bad.slice(0, 10).join(', '))}${bad.length > 10 ? ` +${bad.length - 10} more` : ''}</p>` : '';
  const impact = I ? `<p><b>This visit already exists on this device.</b></p>${lossy ? `<div class="gate small" id="impwarn"><b>⚠ Replace would lose data on this device${I.older ? ' (this file is older than the device copy)' : ''}:</b>
      <br>Photos: ${I.before.photos} → ${I.after.photos}${I.lostMedia.length ? ` (${I.lostMedia.length} deleted)` : ''} · Records: ${I.before.records} → ${I.after.records}${I.lostRecords.length ? ` (${I.lostRecords.length} deleted)` : ''}${I.newerOnDevice ? ` · ${I.newerOnDevice} newer on device would be overwritten` : ''}
      <br><b>Merge</b> keeps everything: newer record wins, every differing field is listed, ID counters never go back.</div>` : `<p class="small">Photos: ${I.before.photos} → ${I.after.photos} · Records: ${I.before.records} → ${I.after.records}</p>`}
      <p class="small nudge" id="replwarn">🛡 <b>Merge is safer.</b> Replace swaps this device's copy for the file: edits made here since, and records merged or deleted since, can come back or be lost. Use Replace only for a damaged device copy. (ID counters are kept at their highest either way.)</p>` : '';
  const preClash = exists ? Object.entries(pack.visit.devices || {}).filter(([c, d]) => { const l = I.local.visit?.devices?.[c]; return l && new Set([l, ...(l.others || []), d, ...(d.others || [])].map(o => o.device)).size > 1; }).map(([c]) => c) : [];
  const clashHtml = preClash.length ? `<p class="small nudge" id="impclash">⚠ This file was made on another device that uses the same ID code (${esc(preClash.join(', '))}). Merge still works (colliding IDs are renumbered), but set a different code on one device.</p>` : '';
  const choice = await ask(`<h3>Import "${esc(pack.visit.name || pack.visit.site?.siteName || pack.visit.site || '')}"</h3>
   <p class="small">${pack.stops.length} stops · ${pack.records.length} records · ${pack.media.length} media (${nm} files in this package)${from < SCHEMA_VERSION ? ` · upgraded from v${from}` : ''}${inc ? ' · <b>incremental backup</b>: media not in it are kept from this device' : ''}</p>
   ${badHtml}${impact}${clashHtml}
   <div class="row">${exists ? `<button class="btn pri" data-choice="merge">Merge (keep both sides)</button><button class="btn" data-choice="copy">Import as copy</button><button class="btn ${lossy ? 'danger' : ''}" data-choice="replace">Replace</button>` : '<button class="btn pri" data-choice="replace">Import</button>'}<button class="btn" data-choice="cancel">Cancel</button></div>`);
  if (!['replace', 'copy', 'merge'].includes(choice)) { toast('Import cancelled - nothing changed'); return 'cancel'; }
  let P = pack;
  let R = null;
  if (choice === 'merge') ({ P, R } = mergePack(pack, I.local));
  if (choice === 'copy') { const map = {}; [pack.visit, ...pack.days, ...pack.stops, ...pack.records, ...pack.media].forEach(o => map[o.id] = uid());
    pack.stops.forEach(s => s.shots?.forEach(i => map[i.id] = uid()));
    const blobs = pack.media.map(m => m.blob); P = remapIds(pack, map); P.media.forEach((m, i) => m.blob = blobs[i]); P.visit.name = (P.visit.name || 'Visit') + ' (copy)'; }
  /* 3.5.0: every import leaves an entry in the visit's import log (Export page), merge results included */
  const lv = I?.local.visit, entry = { id: uid(), at: Date.now(), file: file.name || '', choice, fileSeq: data.package?.seq || 0, fileKind: data.package?.kind || (file.name?.endsWith('.json') ? 'json' : ''),
    by: who().createdBy || '', conflicts: R?.conflicts || [], redirected: R?.redirected || [], renumbered: R?.renumbered || [], duplicates: R?.duplicates || [], counters: R?.counters || [], damaged: badMedia.slice(0, 50) };
  if (choice === 'replace' && lv?.importLog) P.visit.importLog = [...(P.visit.importLog || []).filter(e => !lv.importLog.some(x => x.id === e.id)), ...lv.importLog];
  /* 3.7.0 S3: counters never go back - max(file, device copy, this device's high-water mark, IDs in use) for every choice, Replace included */
  const raised = raiseCounters(P, choice === 'replace' && lv ? [lv.seq, lv.hwm] : []); if (raised.length) entry.counters = [...entry.counters, ...raised.map(r => ({ counter: 'seq.' + r.counter, device: r.now, file: r.was, now: r.now }))];
  P.visit.importLog = [...(P.visit.importLog || []), entry].slice(-50);
  await stageAndCommit(P);
  S = null; tabLock.bc?.postMessage({ t: 'changed', from: TAB_ID });
  const doneMsg = `Imported ✓${choice === 'merge' ? ' (merged)' : ''}${notes.length ? ' · ' + notes.length + ' upgrade notes' : ''}${badMedia.length ? ` · ⚠ ${badMedia.length} damaged photo${badMedia.length > 1 ? 's' : ''} skipped` : ''}`;
  if (!R) toast(doneMsg, 4500); location.hash = '#/v/' + P.visit.id; await route();
  if (R) modal(`<div id="mergeresult"><h3>✓ Merged "${esc(P.visit.name || '')}"</h3><p class="small">${esc(doneMsg)}</p>${mergeReportHtml(R, true)}<p class="small">Saved in the import log on the Export page.</p></div><button class="btn pri" data-act="mclose">OK</button>`);
  return choice;
}

/* 3.6.0 M2: change this device's ID code - deliberate (confirm), refused if another device in the visit owns the code */
async function changeDevCode() {
  const cur = devCode(), used = [...S.records, ...S.media].filter(o => bidCode(o.bid) === cur).length, locked = codeLocked();
  const res = await askForm(`<div id="devcodedlg"><h3>ID code for this device</h3><p class="small">New issue, observation, alarm, interview and photo IDs made on this device start with it (ISS-${esc(cur)}-0001). Every phone on the team needs its own code.</p>
   ${locked ? `<p class="gate small">⚠ ${used} record${used === 1 ? '' : 's'} in this visit already use <b>${esc(cur)}</b>. Existing IDs never change - only new records get the new code. Change it only if it is wrong or another phone uses it.</p>` : ''}
   <label class="fld"><span>New code (2-4 letters + optional digit, e.g. JR2)</span><input name="code" value="${esc(cur)}" maxlength="5" autocapitalize="characters"></label>
   ${locked ? `<label class="chk"><input type="checkbox" name="sure"> I understand existing IDs keep ${esc(cur)}</label>` : ''}
   <div class="row"><button class="btn pri" data-choice="ok">Save code</button><button class="btn" data-choice="cancel">Cancel</button></div></div>`);
  if (res?.choice !== 'ok') return route();
  const c = String(res.code || '').trim().toUpperCase();
  if (!validDevCode(c)) { toast('⛔ The code must be 2-4 letters A-Z, optionally + one digit (JR2)', 4000); return; }
  if (c === cur) return route();
  if (locked && !res.sure) { toast('⛔ Tick "I understand…" to change a code that is already in use', 4500); return; }
  const owner = S.visit.devices?.[c]; if (owner && owner.device !== deviceId()) { toast(`⛔ ${c} is already used by ${owner.name || 'another device'} in this visit - pick another code`, 5000); return; }
  localStorage.setItem('sv-code', c); if (locked) localStorage.setItem('sv-code-used', ''); registerDevice(S.visit); await flush(); toast(`ID code set to ${c} ✓`); route(); }

/* ================= 3.6.0 M3: "Merge these two" (same device / screen captured twice) ================= */
const dupListHtml = groups => `<ul class="small" id="duplist">${groups.map(g => `<li><b>${esc(g.id)}</b> - ${g.ids.length} ${g.type === 'screen' ? 'screens' : 'sections'}: ${g.ids.map(id => { const r = recById(id); return r ? `<a href="#/v/${S.visit.id}/r/${r.id}">${esc(recTitle(r) || r.id.slice(0, 8))}</a>` : ''; }).join(' + ')}
  <button class="btn sm pri" data-act="dupmerge" data-ids="${esc(g.ids.slice(0, 2).join(','))}">Merge these two</button></li>`).join('')}</ul>`;
async function mergeTwo(ids, picks = null) {
  closeModal(false);
  const [a, b] = ids.map(recById).filter(Boolean).sort((x, y) => x.createdAt - y.createdAt);   /* keep the first-captured record (its uuid / sync id) */
  if (!a || !b) return null;
  const ks = [...new Set([...Object.keys(a.f), ...Object.keys(b.f)])].filter(k => !sameVal(a.f[k], b.f[k]));
  const newer = (a.updatedAt || 0) >= (b.updatedAt || 0) ? 'a' : 'b', def = k => isBlank(a.f[k]) && !isBlank(b.f[k]) ? 'b' : !isBlank(a.f[k]) && isBlank(b.f[k]) ? 'a' : newer;
  const ma = S.media.filter(m => m.recordId === a.id).length, mb = S.media.filter(m => m.recordId === b.id).length, key = physKey(a);
  if (!picks) { const res = await askForm(`<div id="mergetwo"><h3>Merge these two - ${esc(key)}</h3>
     <p class="small">Both records describe the same ${a.type === 'screen' ? 'screen' : 'device'}. They become one record with the ID <b>${esc(key)}</b>. Photos are combined (${ma} + ${mb}) and every link to either record points at the merged one.</p>
     ${ks.length ? `<p class="small"><b>${ks.length} field${ks.length > 1 ? 's' : ''} differ - pick the value to keep:</b></p><div class="navwrap"><table class="conf small"><colgroup><col style="width:30%"><col style="width:70%"></colgroup><tr><th>Field</th><th>Keep</th></tr>
      ${ks.map(k => `<tr><td>${esc(k)}</td><td><select name="k:${esc(k)}" data-field="${esc(k)}"><option value="a" ${def(k) === 'a' ? 'selected' : ''}>1st: ${esc(shortVal(a.f[k]))}</option><option value="b" ${def(k) === 'b' ? 'selected' : ''}>2nd: ${esc(shortVal(b.f[k]))}</option></select></td></tr>`).join('')}</table></div>` : '<p class="small">All fields are identical.</p>'}
     <div class="row"><button class="btn pri" data-choice="merge">Merge into one</button><button class="btn" data-choice="cancel">Cancel</button></div></div>`);
    if (res?.choice !== 'merge') { route(); return null; }
    picks = Object.fromEntries(ks.map(k => [k, res['k:' + k] || def(k)])); }
  for (const k of ks) if ((picks[k] || def(k)) === 'b') { a.f[k] = structuredClone(b.f[k]); if (b.attest?.[k] !== undefined) { a.attest = a.attest || {}; a.attest[k] = b.attest[k]; } }
  const refs = new Map([...(a.sourceRefs || []), ...(b.sourceRefs || [])].map(x => [JSON.stringify(x), x])); if (refs.size) a.sourceRefs = [...refs.values()];
  const map = { [b.id]: a.id }; let moved = 0, relinked = 0;
  for (const m of S.media) if (m.recordId === b.id) { m.recordId = a.id; touch('media', m); moved++; }
  for (const st of ['records', 'stops', 'media']) for (const o of S[st]) { if (o === b) continue; let ch = false;
    for (const k in o) { if (k === 'id' || k === 'blob' || k === 'thumb') continue; const v2 = remapIds(o[k], map); if (!sameVal(v2, o[k])) { o[k] = v2; ch = true; } }
    if (ch) { touch(st, o); if (o !== a) relinked++; } }
  a.mergedFrom = [...(a.mergedFrom || []), { id: b.id, uuid: b.uuid || b.sync?.uuid || '', at: Date.now(), by: author(), f: structuredClone(b.f), t: b.updatedAt || b.createdAt || 0 }];   /* f = the removed copy as merged (3.7.0 S4: later edits to it are redirected) */
  touch('records', a);
  S.records = S.records.filter(x => x.id !== b.id); pending.delete('records:' + b.id); await dbDel('records', b.id);
  S.visit.tombs = { ...(S.visit.tombs || {}), [b.id]: Date.now() }; S.visit.aliases = { ...(S.visit.aliases || {}), [b.id]: a.id }; touch('visits', S.visit);
  await flush(); toast(`Merged into one ${esc(key)} ✓ · ${moved} photo${moved === 1 ? '' : 's'} moved · ${relinked} link${relinked === 1 ? '' : 's'} updated`, 4500); route();
  return { kept: a.id, removed: b.id, moved, relinked, fields: ks }; }

/* ================= export ================= */
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000); toast('Exported ' + name);
}
function openHtml(html) { const url = URL.createObjectURL(new Blob([html], { type: 'text/html' })); const w = window.open(url, '_blank'); if (!w) download('report.html', html, 'text/html'); setTimeout(() => URL.revokeObjectURL(url), 120000); }
const baseName = () => seg(S.visit.name || 'visit').slice(0, 40) + '_' + today();
async function doExport(x) {
  await flush(); const B = S, base = baseName(), day = S.days.find(d => d.id === $('#exday')?.value) || activeDay();
  if (x.startsWith('csv:') || ['zip', 'zipshare', 'analyst'].includes(x)) { const X = exportChecks(B);     /* 3.0.0: surface before export */
    if (X.dupPhys.length) {   /* 3.6.0 M3: hard block - one physical device / screen recorded twice must be merged first */
      modal(`<div id="dupblock"><h3>⛔ Export blocked - recorded twice</h3><p class="small">The same device or screen exists as two records. Exporting would split one device into two IDs. Merge each pair first:</p>${dupListHtml(X.dupPhys)}</div><button class="btn" data-act="mclose">Close</button>`);
      return; }
    if (X.count) { const all = [...X.refErrors.map(e => 'ref: ' + e), ...X.schemaErrors.map(e => 'schema: ' + e), ...X.statusErrors.map(e => 'gate: ' + e)];
      const c = await ask(`<h3>Export has ${all.length} problem${all.length > 1 ? 's' : ''}</h3><p class="small">The Analyst's validate.py would reject this export.</p><ul class="gate small">${all.slice(0, 25).map(e => `<li>${esc(e)}</li>`).join('')}${all.length > 25 ? `<li>+${all.length - 25} more</li>` : ''}</ul>
        <div class="row"><button class="btn" data-choice="cancel">Cancel - fix first</button><button class="btn danger" data-choice="go">Export anyway</button></div>`);
      if (c !== 'go') return; }
    else if (X.blockedNoIssue.length) {   /* Analyst answer 1: soft nudge, not a validate.py error */
      const c = await ask(`<h3>${X.blockedNoIssue.length} Blocked section${X.blockedNoIssue.length > 1 ? 's' : ''} without an access issue</h3><p class="small">${esc(X.blockedNoIssue.slice(0, 12).join(', '))}</p><p class="small">Log an access-constraint issue on each (Section screen → Log access issue) so the Issue Log explains the gap.</p>
        <div class="row"><button class="btn" data-choice="cancel">Cancel - log issues</button><button class="btn" data-choice="go">Export anyway</button></div>`);
      if (c !== 'go') return; } }
  toast('Building…', 6000);
  if (x.startsWith('csv:')) { const k = x.slice(4), { files, warnings } = csvFiles(B, { sensitive: !!B.visit.shareSensitive }); const f = files.find(z => z[0].replace(/\.csv$/, '') === k);
    if (warnings.length) console.info('export warnings', warnings); return download(`${k}.csv`, f[1], 'text/csv'); }
  switch (x) {
    case 'zip': { const r = await buildZip(B, 'export'); return download(base + '_package.zip', r.blob); }
    case 'zipshare': {   /* 3.4.0 S-d: two taps - build, then Share from a fresh user gesture (iOS drops the gesture during a long build) */
      closeModal(false); const ov = modal('<h3>📦 Building package…</h3><p class="small">Preparing…</p>');
      try { const r = await buildZip(B, 'export'); pk = new File([r.blob], base + '_package.zip', { type: 'application/zip' }); }
      catch (e) { ov.querySelector('.mbox').innerHTML = `<h3>Package failed</h3><p class="bad" id="pkerr">${esc(e?.message || String(e))}</p><div class="row"><button class="btn" data-act="pkclose">Close</button></div>`; return; }
      const can = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [pk] }));
      ov.querySelector('.mbox').innerHTML = `<h3>📦 Package ready</h3><p class="small">${esc(pk.name)} · ${(pk.size / 1048576).toFixed(1)} MB</p>${can ? '' : '<p class="small">Sharing files is not supported in this browser - use Download.</p>'}
        <div class="row">${can ? '<button class="btn big pri" data-act="pkshare">📤 Share</button>' : ''}<button class="btn ${can ? '' : 'big pri'}" data-act="pkdl">⬇ Download</button><button class="btn" data-act="pkclose">Close</button></div><p class="bad" id="pkerr" role="alert"></p>`;
      return; }
    case 'json': return download(base + '.json', JSON.stringify(await buildJson(B), null, 1), 'application/json');
    case 'analyst': { const { doc } = buildAnalystDoc(B, { sensitive: !!B.visit.shareSensitive }); return download(base + '_analyst-capture.json', JSON.stringify(doc, null, 1), 'application/json'); }
    case 'dayopen': return openHtml(reportHtml(dailyReport(B, day)));
    case 'daymd': return download(`${base}_daily-${day.date}.md`, reportMd(dailyReport(B, day)), 'text/markdown');
    case 'vopen': return openHtml(reportHtml(visitReport(B)));
    case 'vhtml': return download(base + '_visit-report.html', reportHtml(visitReport(B)), 'text/html');
    case 'vmd': return download(base + '_visit-report.md', reportMd(visitReport(B)), 'text/markdown');
  }
}

/* ================= backup (must-fix 2, 3, 4) =================
   1) flush  2) build the zip (incremental: full JSON without thumbs/reports + only media newer than the last CONFIRMED
   backup; store-only zip assembled from Blob parts, media never read into JS memory)  3) user taps Share or Download
   4) marked done only after a share resolves or the user confirms the download. The File is never stored. */
const stampStr = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
let bk = null;   // the one in-flight backup {file, newest, kind} - replaced, never accumulated
async function backup(kind = 'incremental') {
  if (!(await flush()) && pending.size) { toast('⛔ Fix the NOT SAVED error first - the backup would miss unsaved changes', 5000); return; }
  if (kind === 'incremental' && !S.visit.backup?.lastAt) kind = 'full';
  closeModal(false); bk = null;
  const ov = modal(`<h3>💾 Building ${kind} backup…</h3><p class="small" id="bkprog">Preparing…</p>`);
  const seq = (S.visit.backup?.seq || 0) + 1, name = `${seg(S.visit.name || 'visit').slice(0, 30)}_backup${String(seq).padStart(3, '0')}_${kind}_${stampStr()}.zip`;
  const r = await buildZip(S, kind, (i, n) => { const el = $('#bkprog'); if (el) el.textContent = `${i} / ${n} files`; });
  bk = { file: new File([r.blob], name, { type: 'application/zip' }), newest: r.newestMedia, kind, count: r.mediaCount };
  const canShare = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [bk.file] }));
  ov.querySelector('.mbox').innerHTML = `<h3>💾 Backup ready</h3><p class="small">${esc(name)} · ${(bk.file.size / 1048576).toFixed(1)} MB · ${bk.count} media file${bk.count === 1 ? '' : 's'}${kind === 'incremental' ? ' (new since last backup)' : ''}</p>
   <p class="small">Save it to Files / Drive / a laptop. It is marked done only after it is shared or you confirm the download.</p>
   <div class="row">${canShare ? '<button class="btn big pri" data-act="bkshare">📤 Share backup</button>' : ''}<button class="btn ${canShare ? '' : 'big pri'}" data-act="bkdl">⬇ Download</button><button class="btn" data-act="bkcancel">Cancel</button></div><div id="bkconfirm"></div>`;
}
let pk = null;   // 3.4.0 S-d: the one built Share package
async function pkShare() {
  if (!pk) return; const el = $('#pkerr');
  try { await navigator.share({ files: [pk], title: pk.name }); pk = null; closeModal(); toast('Shared ✓'); }
  catch (e) { if (e?.name === 'AbortError') { toast('Share cancelled'); return; } if (el) el.textContent = 'Share failed: ' + (e?.message || e?.name || e) + ' - try Download instead.'; }
}
async function bkShare() {
  if (!bk) return;
  try { await navigator.share({ files: [bk.file], title: bk.file.name }); await markBackup('shared'); }
  catch (e) { toast(e?.name === 'AbortError' ? 'Share cancelled - backup NOT marked done' : 'Share failed - backup NOT marked done: ' + e.message, 4000); }
}
function bkDownload() {
  if (!bk) return; download(bk.file.name, bk.file);
  const el = $('#bkconfirm'); if (el) el.innerHTML = `<p><b>Did the file save?</b> Check Downloads / Files.</p><div class="row"><button class="btn pri" data-act="bkyes">Yes, it saved</button><button class="btn" data-act="bkno">No</button></div>`;
}
async function markBackup(how) {
  const b = S.visit.backup = S.visit.backup || {};
  Object.assign(b, { lastAt: Date.now(), kind: bk.kind, how, seq: (b.seq || 0) + 1, mediaMark: Math.max(b.mediaMark || 0, bk.newest || 0), lastName: bk.file.name });
  touch('visits', S.visit); bk = null; await flush(); closeModal(); toast('Backup done ✓');
}
async function afterComplete(s) {
  if ((S.visit.backupMode || 'prompt') === 'off') { toast(`✔ ${stopTitle(s)} complete`); return; }
  modal(`<h3>✔ ${esc(stopTitle(s))} complete</h3><p>${changesSince()} change(s), ${newMediaCount()} new photo/video(s) since the last backup.</p>
   <div class="row"><button class="btn big pri" data-act="backup" data-x="incremental">💾 Back up now</button><button class="btn" data-act="mclose">Later</button></div>`);
}

/* ================= dictation (Web Speech API; keyboard-dictation tip fallback) ================= */
let dict = null;
function dictTip(why) {
  modal(`<h3>🎤 Voice notes</h3><p>${why ? `Browser voice typing is unavailable here (${esc(why)}).` : 'This browser has no built-in voice typing.'}</p>
   <p><b>Use keyboard dictation instead:</b> tap the note box, then the 🎤 key on the keyboard (iOS 15+ dictates on-device, offline).</p><button class="btn pri" data-act="mclose">OK</button>`);
}
function dictate(btn) {
  const ta0 = btn.parentElement.querySelector('textarea'), key = [ta0.dataset.obj, ta0.dataset.f];
  const ta = () => document.querySelector(`textarea[data-obj="${key[0]}"][data-f="${CSS.escape(key[1])}"]`) || ta0;
  if (dict) { const same = dict.btn === btn; try { dict.r.stop(); } catch (e) {} dict = null; if (same) return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return dictTip();
  const r = new SR(); r.lang = navigator.language || 'en-US'; r.continuous = true; r.interimResults = false; dict = { r, btn }; btn.classList.add('rec'); btn.textContent = '⏹';
  r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) { const t = String(e.results[i][0].transcript || '').trim(), el = ta(); if (!t) continue;
    el.value += (el.value && !/\s$/.test(el.value) ? ' ' : '') + t; el.dispatchEvent(new Event('input', { bubbles: true })); } };
  r.onerror = e => { if (['network', 'not-allowed', 'service-not-allowed', 'language-not-supported', 'audio-capture'].includes(e.error)) dictTip(e.error); };
  r.onend = () => { btn.classList.remove('rec'); btn.textContent = '🎤'; if (dict?.r === r) dict = null; };
  try { r.start(); toast('Listening… tap ⏹ to stop'); } catch (e) { r.onend(); dictTip(e.message); }
}

/* form modal: resolves with {choice, ...fields} (fields read before the modal closes) */
function askForm(html) { return new Promise(res => { const ov = modal(html); ov._resolve = res; ov.addEventListener('click', e => { const b = e.target.closest('[data-choice]'); if (!b) return; e.stopPropagation();
  const out = { choice: b.dataset.choice }; $$('[name]', ov).forEach(i => out[i.name] = i.type === 'checkbox' ? i.checked : i.value); ov._resolve = null; ov.remove(); res(out); }); }); }
const goRec = r => { location.hash = `#/v/${S.visit.id}/r/${r.id}`; };
const curStop = () => { const p = location.hash.split('/'); return p[3] === 's' ? S?.stops.find(s => s.id === p[4]) : null; };
const recById = id => S.records.find(x => x.id === id);
function pickFile(accept) { return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => res(i.files[0] || null); i.click(); }); }
/* CSV / L5X section seeding (3.0.0 port of tools/seed_import.py via SEED_IMPORTERS). ALL-OR-NOTHING: merges only when
   seed_import.py would exit 0. Exit 2 (header, skipped rows, bad PanelLabel/area/SubSystemCode, duplicate ids, reference errors)
   or exit 1 (records failing schema.json) -> rejected with a report, nothing merged. On 0: idempotent - a row whose seed uuid or
   instance id already exists only fills blank fields; walk-down answers and presentOnSite are never written. Rows go to the
   panel stop whose checklist panelId matches the row (created from the checklist if missing). */
async function seedImport(s, kind, text, fileName) {
  const area = s.areaCodes?.[0] || 'Ambient', rep = { file: fileName, kind, area, exitCode: 2, errors: [], warnings: [], schemaErrors: [], added: 0, merged: 0, rows: 0 };
  let rows; try { rows = kind === 'l5x' ? SEED_IMPORTERS.l5x.rows(text, fileName, s.panel?.label) : SEED_IMPORTERS.csv.rows(text); }
  catch (err) { rep.errors.push(String(err.message || err)); return rep; }
  rep.rows = rows.length;
  const res = SEED_IMPORTERS.toEquipment(rows, { area, by: fileInitials(author()), device: 'pwa', trip: S.visit.trip });
  Object.assign(rep, { exitCode: res.exitCode, errors: res.errors, warnings: res.warnings, schemaErrors: res.schemaErrors });
  if (res.exitCode !== 0) return rep;                                     /* no partial merge */
  const stopFor = e => panelStops().find(p => panelIdFor(p.panel.label) === e.panelId) || s;
  for (const e of res.equipment) {
    const ex = S.records.find(r => r.type === 'section' && (r.uuid === e.sync.uuid || secIid(r) === e.instanceId));
    const f = { conveyorNumber: e.conveyorNumber, equipmentType: e.equipmentType, driveType: e.driveType, name: e.name, location: e.location, parentInstanceId: e.parentInstanceId,
      sequenceInRun: e.sequenceInRun, notes: e.notes, subSystemId: e.subSystemId };
    const fb = (res.fallback || []).includes(e.id);   /* blank SubSystemCode -> panel fallback (provisional on ISS-0020 panels) */
    if (ex) { if (fb && isBlank(ex.f.subSystemId)) ex.subFallback = e.subSystemId;
      for (const [k, v] of Object.entries(f)) if (v !== undefined && isBlank(getD(ex.f, k))) ex.f[k] = v;
      ex.seedSource = ex.seedSource || e.seedSource; ex.sourceRefs = ex.sourceRefs || e.sourceRefs; touch('records', ex); rep.merged++; continue; }
    const r = sectionFrom(stopFor(e), Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)));
    r.uuid = e.sync.uuid; r.seedSource = e.seedSource; r.sourceRefs = e.sourceRefs; if (fb) r.subFallback = e.subSystemId;
    if (e.instanceId !== sectionInstanceId(e.equipmentType, e.conveyorNumber)) r.f.instanceIdOverride = e.instanceId;
    touch('records', r); rep.added++;   /* presentOnSite stays unknown: import never attests */
  }
  return rep;
}
function seedReportHtml(rep) {
  const ok = rep.exitCode === 0, li = (h, l) => l.length ? `<p><b>${h} (${l.length})</b></p><ul class="gate small">${l.slice(0, 80).map(x => `<li>${esc(x)}</li>`).join('')}${l.length > 80 ? `<li>+${l.length - 80} more</li>` : ''}</ul>` : '';
  return `<h3>${ok ? '✓ Seed import merged' : '✗ Seed import rejected - nothing merged'}</h3>
   <p class="small">${esc(rep.file)} · ${esc(rep.kind.toUpperCase())} · area ${esc(rep.area)} · ${rep.rows} rows · seed_import.py exit ${rep.exitCode}${ok ? ` · ${rep.added} added, ${rep.merged} matched existing (blank fields filled only)` : rep.exitCode === 1 ? ' (schema errors)' : ' (skipped rows / bad references)'}</p>
   ${li('Errors', rep.errors)}${li('Schema errors', rep.schemaErrors)}${li('Warnings', rep.warnings)}
   ${ok ? '' : '<p class="small">Fix the file (PanelLabel must be a checklist panel in this area, SubSystemCode a seeded Sub-System) and import again.</p>'}
   <button class="btn pri" data-act="mclose">OK</button>`;
}
function sectionFrom(stop, f0, extra = {}) { const r = newRecord('section', stop.id, f0); Object.assign(r, extra); r.captureMode = 'quick'; return r; }
const packmlDefault = stop => { const d = sectionDefaults(stop); return d.packml; };

/* ================= events ================= */
async function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, s = S && curStop();
  if (!tabLock.ok && !['takeover', 'iostab'].includes(a) && !window.SV_TEST_NOLOCK) return;
  try {
    switch (a) {
      case 'theme': { const t = document.documentElement.dataset.theme === 'day' ? 'dark' : 'day'; document.documentElement.dataset.theme = t; localStorage.setItem('sv-theme', t); break; }
      case 'bigtext': { const v = document.documentElement.classList.toggle('big'); localStorage.setItem('sv-big', v ? '1' : ''); break; }
      case 'iostab': sessionStorage.setItem('sv-ios-tab-ok', '1'); $('#iosblock')?.remove(); break;
      case 'takeover': await takeOver(); break;
      case 'retrysave': { saveFail = 0; const ok = await flush(); toast(ok ? 'Saved ✓' : 'Still NOT SAVED - free space (Media) and retry', 3500); break; }
      case 'go': location.hash = b.dataset.href; break;
      case 'cap': startCapture(b); break;
      case 'capretry': await capRetry(false); break;
      case 'capraw': await capRetry(true); break;
      case 'capdiscard': if (confirm(`Discard ${capFailed.length === 1 ? 'this photo' : capFailed.length + ' photos'}? ${capFailed.length === 1 ? 'It is' : 'They are'} not saved anywhere.`)) { capFailed.splice(0); closeModal(); } break;
      case 'capretake': closeModal(false); openCapInput(b.dataset.kind); break;
      case 'fab': fab(); break;
      case 'media': openMedia(b.dataset.id); break;
      case 'mclose': closeModal(); break;
      case 'codepickok': await codePickOk(); break;
      case 'rules': showFieldRules(); break;
      case 'rulesok': localStorage.setItem('sv-rules-seen', APP_VERSION); closeModal(); break;
      case 'undo': await undoDelete(); break;
      case 'dupmerge': await mergeTwo(b.dataset.ids.split(',')); break;
      case 'devcode': await changeDevCode(); break;
      case 'mdel': { const m = S.media.find(x => x.id === b.dataset.id); closeModal(false); await softDelete([['media', m]], m.filename || 'media'); route(); break; }
      case 'mrename': { const m = S.media.find(x => x.id === b.dataset.id); const n = prompt('File name (sanitized; extension kept)', m.filename); if (!n) break;
        m.filename = seg(n.replace(/\.[a-z0-9]+$/i, '')) + mediaExt(m); m.renamed = true; touch('media', m); closeModal(false); openMedia(m.id); break; }
      /* checklist item state: explicit buttons, no toggle-off on re-tap; "Clear" resets to todo */
      case 'attest': { const r = recById(b.dataset.id), k = b.dataset.key, v = b.dataset.v, fd = SECTION_FIELDS.find(x => x.key === k);
        r.attest = r.attest || {};
        if (!v) { setD(r.f, k, 'unknown'); delete r.attest[k]; }
        else { setD(r.f, k, v); if (fd?.attest?.values.includes(v)) r.attest[k] = { by: author(), at: Date.now() }; else delete r.attest[k]; }
        touch('records', r); route();
        if (v === 'blocked' && !accessIssueFor(S, r)) await offerAccessIssue(r);
        break; }
      case 'accessissue': { const r = recById(b.dataset.id); await offerAccessIssue(r, true); break; }
      case 'ist': { const r = s.resp[b.dataset.item] = s.resp[b.dataset.item] || { state: 'todo', a: {}, q: {}, note: '' }; if (r.state === b.dataset.v) break;
        r.state = b.dataset.v; r.at = Date.now(); r.by = author(); r.dayId = activeDay()?.id; touch('stops', s); route(); break; }
      case 'shotna': { const sh = s.shots.find(x => x.id === b.dataset.shot);
        if (b.dataset.v === '1') { if (sh.req && !REQUIRED_PHOTO_NA_ALLOWED.includes(sh.photoType)) { toast('Required photo - N/A is not allowed'); break; } const why = prompt('Why is this photo N/A?', sh.naReason || ''); if (why === null) break; sh.na = true; sh.naReason = why.trim(); }
        else { sh.na = false; sh.naReason = ''; }
        touch('stops', s); route(); break; }
      case 'stopverify': { const probs = stopGate(S, s);
        if (probs.length) { ui.showMiss = s.id; modal(`<h3>Can't verify yet</h3><ul class="gate">${probs.map(p => `<li>${esc(p)}</li>`).join('')}</ul><button class="btn pri" data-act="mclose">OK</button>`); break; }
        const sg = stopGateStatus(S, s);   /* 3.0.0: + tools/gates.py walkdown/data gates on the exported record */
        if (sg.best === 'open') { ui.showMiss = s.id; modal(`<h3>Can't verify yet</h3><p class="small">Walk-down gate (gates.py) not met:</p><ul class="gate">${sg.missing.slice(0, 30).map(p => `<li>${esc(p)}</li>`).join('')}</ul><button class="btn pri" data-act="mclose">OK</button>`); break; }
        s.recordStatus = sg.best; s.gates = { ...(s.gates || {}), verified: { at: Date.now(), by: author(), status: sg.best } }; touch('stops', s); await flush();
        if (sg.best !== 'verified') toast(`Marked ${RECORD_STATUS[sg.best] || sg.best} - still missing for full Verified: ${sg.missing.slice(0, 3).join(', ')}`, 5000); route(); await afterComplete(s); break; }
      case 'stopna': { const why = prompt('Why is this stop N/A?', s.naReason || ''); if (why === null) break; s.recordStatus = 'na'; s.naReason = why.trim(); touch('stops', s); route(); break; }
      case 'stopreopen': s.recordStatus = 'open'; touch('stops', s); route(); break;
      case 'addpanel': { const label = $('#newpanel').value.trim().toUpperCase(); if (!label) { toast('Panel label first (e.g. MCP-24A)'); break; }
        if (panelStops().some(p => p.panel.label === label)) { toast('That panel already exists'); break; }
        const st = newPanelStop(S.visit.id, label, $('#newpaneltype').value, $$('.newpanelarea:checked').map(x => x.value), S.stops.length);
        S.stops.push(st); touch('stops', st); await flush(); location.hash = `#/v/${S.visit.id}/s/${st.id}`; break; }
      /* sections (checklist.json sectionTemplate.repeat generators) */
      case 'secnew': { const r = sectionFrom(s, {}); await flush(); goRec(r); break; }
      case 'secnext': { const prev = sectionsOf(s.id).at(-1), type = prev.f.equipmentType || 'Other';
        const conv = freeConveyor(type, nextConveyorNumber(prev.f.conveyorNumber || '') || '');
        const r = sectionFrom(s, { conveyorNumber: conv, equipmentType: type, driveType: prev.f.driveType || '', 'location.level': getD(prev.f, 'location.level') || '' });
        await flush(); toast('Next section ' + (secIid(r) || '')); goRec(r); break; }
      case 'secrange': { const g = await askForm(`<h3>Add a range of sections</h3><div class="row2"><label class="fld"><span>From conveyor #</span><input name="from" inputmode="numeric" placeholder="20101"></label><label class="fld"><span>To</span><input name="to" inputmode="numeric" placeholder="20150"></label></div>
          <div class="row2"><label class="fld"><span>Step</span><input name="step" inputmode="numeric" value="1"></label><label class="fld"><span>Equipment type</span><select name="type">${EN.equipmentType.map(t => opt(t, 'MDRZone')).join('')}</select></label></div>
          <label class="fld"><span>Drive type</span><select name="drive">${EN.driveType.map(t => opt(t, 'Unknown')).join('')}</select></label><div class="row"><button class="btn pri" data-choice="ok">Add</button><button class="btn" data-choice="cancel">Cancel</button></div>`);
        if (g?.choice !== 'ok') break;
        const step = Math.max(1, parseInt(g.step) || 1), from = String(g.from).trim(), to = parseInt(g.to);
        if (!/^\d{3,6}[A-Z]?$/.test(from) || !(to >= parseInt(from))) { toast('From/To must be 3-6 digit numbers, To ≥ From', 3500); break; }
        const used = usedIids(); let n = 0, skip = 0, c = from;
        for (let i = 0; parseInt(c) <= to && n < 500; i++, c = nextConveyorNumber(c, step)) { if (used.has(sectionInstanceId(g.type, c))) { skip++; continue; }
          sectionFrom(s, { conveyorNumber: c, equipmentType: g.type, driveType: g.drive }, { sequenceInRun: i + 1 }); n++; }
        await flush(); toast(`Added ${n} sections${skip ? ` (${skip} already existed)` : ''}`, 3000); route(); break; }
      case 'seedimp': { const kind = b.dataset.kind, imp = SEED_IMPORTERS[kind], f = await pickFile(imp.accept); if (!f) break;
        const rep = await seedImport(s, kind, await f.text(), f.name); ui.lastSeedReport = rep;
        await flush(); route(); modal(seedReportHtml(rep)); break; }
      case 'selsec': b.checked ? ui.sel.add(b.dataset.id) : ui.sel.delete(b.dataset.id); break;
      case 'selall': sectionsOf(s.id).forEach(r => ui.sel.add(r.id)); route(); break;
      case 'selnone': ui.sel.clear(); route(); break;
      /* bulk verify NEVER writes presentOnSite (3.0.0 attest): sections without a Yes/No tap stay open */
      case 'bulkverify': { const sel = sectionsOf(s.id).filter(r => ui.sel.has(r.id)); let ok = 0, noAtt = 0;
        for (const r of sel) { const g = sectionGate(S, r); if (g.best === 'open') { if (g.walkMissing.includes('presentOnSite')) noAtt++; continue; }
          if (STATUS_ORDER[g.best] <= STATUS_ORDER[r.recordStatus] && r.recordStatus !== 'na') continue;
          r.recordStatus = g.best; r.gates = { ...(r.gates || {}), verified: { at: Date.now(), by: author(), status: g.best } }; touch('records', r); ok++; }
        await flush(); toast(`Verified ${ok} of ${sel.length}${sel.length - ok ? ` · ${sel.length - ok} not changed` : ''}${noAtt ? ` (${noAtt} need a Yes/No present-on-site tap)` : ''}`, 4500); ui.sel.clear(); route(); break; }
      case 'secphotona': { const r = recById(b.dataset.id); r.photoNa = r.photoNa || {}; r.photoNa[b.dataset.type] = !r.photoNa[b.dataset.type]; touch('records', r); route(); break; }
      case 'recverify': { const r = recById(b.dataset.id);
        if (r.type === 'section') { const g = sectionGate(S, r);
          if (g.best === 'open') { ui.showMiss = r.id; toast('Walk-down gate not met: ' + g.walkMissing.join(', '), 5000); route(); break; }
          /* 3.1.0: "Trip 1 stops at walkdown_verified" is a UI rule only - a section whose data gate already passes on the intro trip
             (PackML fields from an L5X import) is allowed past Seen with a warning; the export carries gates.attestation_warnings' advisory */
          const past = secIntro(r, g) && ['data_verified', 'verified'].includes(g.best);
          r.recordStatus = g.best; r.gates = { ...(r.gates || {}), verified: { at: Date.now(), by: author(), status: g.best } }; touch('records', r); await flush();
          if (past) { toast(`⚠ ${RECORD_STATUS[g.best] || g.best} on the intro trip${r.seedSource === 'L5X' ? ' (PackML data from the L5X import)' : ''} - Trip 1 sections normally stop at Seen. Allowed; the export carries an advisory.`, 6000); route(); break; }
          toast(g.best === 'verified' ? 'Verified ✓' : secIntro(r, g) ? `${statusLabel(r, g.best, g)} - Trip 1 sections stop here` : `${RECORD_STATUS[g.best] || g.best} ✓ · for full Verified: ${g.dataMissing.slice(0, 4).join(', ')}`, 4500); route(); break; }
        const miss = recMissing(S, r);
        if (miss.length) { ui.showMiss = r.id; toast('Fill required fields first: ' + miss.join(', '), 4500); route(); break; }
        r.recordStatus = 'verified'; r.gates = { ...(r.gates || {}), verified: { at: Date.now(), by: author() } }; touch('records', r); await flush(); toast('Verified ✓'); route(); break; }
      case 'recna': { const r = recById(b.dataset.id); r.recordStatus = 'na'; touch('records', r); route(); break; }
      case 'recopen': { const r = recById(b.dataset.id); r.recordStatus = 'open'; touch('records', r); route(); break; }
      case 'recclone': { const r = recById(b.dataset.id), c = newRecord(r.type, r.stopId);
        const f = JSON.parse(JSON.stringify(r.f)); delete f.serial; c.clonedFromUuid = r.id;
        if (r.type === 'section') for (const fd of SECTION_FIELDS) if (fd.attest) setD(f, fd.key, 'unknown');   /* 3.0.0: clone resets attest fields; c.attest stays empty, status open */
        if (r.type === 'section') { const stop = S.stops.find(x => x.id === r.stopId), type = f.equipmentType || 'Other';
          f.packml = packmlDefault(stop);
          if (f.instanceIdOverride) { const used = usedIids(); let id = nextInstanceId(f.instanceIdOverride); for (let i = 0; used.has(id) && i < 10000; i++) id = nextInstanceId(id); f.instanceIdOverride = id; f.conveyorNumber = ''; }
          else f.conveyorNumber = freeConveyor(type, nextConveyorNumber(f.conveyorNumber || ''));
          c.captureMode = r.captureMode; }
        else { const k = { screen: 'screenCode', tag: 'point', alarm: 'alarmCode' }[r.type]; if (k && f[k]) f[k] = nextName(f[k]); }
        c.f = f; touch('records', c); await flush(); toast('Cloned → ' + (recTitle(c) || 'copy')); goRec(c); break; }
      case 'recdel': { const r = recById(b.dataset.id), ms = S.media.filter(m => m.recordId === r.id);
        await softDelete([['records', r], ...ms.map(m => ['media', m])], `${recTitle(r) || 'record'}${ms.length ? ` + ${ms.length} media` : ''}`);
        location.hash = r.stopId ? `#/v/${S.visit.id}/s/${r.stopId}` : `#/v/${S.visit.id}/records`; break; }
      case 'newrec': { const r = newRecord(b.dataset.type, b.dataset.stop || ''); await flush(); goRec(r); break; }
      case 'navtog': { const r = recById(b.dataset.from), to = b.dataset.to, L = r.f.navigatesTo = r.f.navigatesTo || [];
        if (b.checked) { if (!L.includes(to)) L.push(to); } else r.f.navigatesTo = L.filter(x => x !== to); touch('records', r); break; }
      case 'more': ui[b.dataset.k] += 50; route(); break;
      case 'newday': { const d = newDay(S.visit.id, today(), S.days.length + 1); S.days.push(d); touch('days', d); S.visit.activeDayId = d.id; touch('visits', S.visit); await flush(); toast(d.label + ' started'); route(); break; }
      case 'ex': await doExport(b.dataset.x); break;
      case 'warnings': { const { warnings } = csvFiles(S, {}); modal(`<h3>Export warnings (${warnings.length})</h3><ul class="gate">${warnings.slice(0, 200).map(w => `<li>${esc(w)}</li>`).join('') || '<li>None</li>'}</ul><button class="btn pri" data-act="mclose">OK</button>`); break; }
      case 'import': $('#impFile').value = ''; $('#impFile').click(); break;
      case 'delvisit': { const n = S.visit.name || 'visit', t = prompt(`Delete "${n}" and all its media from this device?\nBack up first. Type the visit name to confirm:`); if (t === null) break;
        if (t.trim() !== n.trim()) { toast('Name did not match - nothing deleted', 3000); break; } pending.clear(); await dbDeleteVisit(S.visit.id); S = null; setStatus(); location.hash = '#/'; break; }
      case 'install': if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; } break;
      case 'persist': toast(navigator.storage?.persist ? ((await requestPersist()) ? 'Storage will persist ✓' : 'Browser declined persistence (install to Home Screen and retry)') : 'Not supported', 3500); fillStorage(); break;
      case 'backup': await backup(b.dataset.x); break;
      case 'bkshare': await bkShare(); break;
      case 'pkshare': await pkShare(); break;
      case 'pkdl': if (pk) download(pk.name, pk); break;
      case 'pkclose': pk = null; closeModal(); break;
      case 'bkdl': bkDownload(); break;
      case 'bkyes': await markBackup('download-confirmed'); break;
      case 'bkno': toast('Backup NOT marked done - try Share, or download again', 3500); break;
      case 'bkcancel': bk = null; closeModal(); toast('Backup cancelled - not marked done'); break;
      case 'mic': dictate(b); break;
    }
  } catch (err) { console.error(err); toast('Error: ' + err.message, 5000); }
}
document.addEventListener('click', onClick);

let searchT = null;
function onField(e) {
  const el = e.target;
  if (!tabLock.ok && !window.SV_TEST_NOLOCK) return;
  if (el.id === 'stopq' || el.id === 'recq') { ui[el.id === 'stopq' ? 'stopQ' : 'recQ'] = el.value; if (el.id === 'recq') ui.recLimit = 50;
    clearTimeout(searchT); searchT = setTimeout(async () => { const pos = el.selectionStart; await route(); const n = $('#' + el.id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} } }, 250); return; }
  if (el.id === 'recpanel') { ui.recPanel = el.value; ui.recLimit = 50; route(); return; }
  if (el.classList.contains('secq')) { const q = el.value.trim().toLowerCase(); $$('.secrow').forEach(r => r.hidden = !!q && !r.textContent.toLowerCase().includes(q)); return; }
  if (el.id === 'jump') { if (e.type !== 'change' && e.inputType) return; const v = el.value.trim().toUpperCase(), n = normalizePanelId(v);
    const p = panelStops().find(s => s.panel.label.toUpperCase() === v || (n && s.panel.idNorm === n)); if (p) location.hash = `#/v/${S.visit.id}/s/${p.id}`; return; }
  if (el.id === 'exday') return;
  if (el.dataset.change === 'day') { S.visit.activeDayId = el.value; touch('visits', S.visit); route(); return; }
  if (el.dataset.change === 'captype') return;
  if (el.dataset.pref) { localStorage.setItem(el.dataset.pref, el.value.trim()); return; }
  if (!el.dataset.obj || el.dataset.act) return;
  const [store, id] = el.dataset.obj.split(':');
  const obj = store === 'visits' ? S.visit : S[store].find(x => x.id === id); if (!obj) return;
  let v = el.type === 'checkbox' && !el.dataset.multi ? el.checked : el.value;
  if (el.dataset.multi !== undefined) { const cur = getP(obj, el.dataset.f), arr = Array.isArray(cur) ? [...cur] : splitList(cur || ''); const x = el.dataset.multi;
    v = el.checked ? (arr.includes(x) ? arr : [...arr, x]) : arr.filter(y => y !== x); }
  else if (el.dataset.t === 'int') v = el.value.trim() === '' ? '' : parseInt(el.value, 10);
  else if (el.dataset.t === 'num') v = el.value.trim() === '' ? '' : parseFloat(el.value);
  else if (el.dataset.t === 'bool') v = el.value === '' ? '' : el.value === 'true';
  else if (el.dataset.t === 'list') v = splitList(el.value.replace(/,/g, ';'));
  else if (el.dataset.t === 'bitmap') v = el.value.split('\n').map(parseBitMapLine).filter(Boolean);
  else if (el.dataset.t === 'interlocks') v = el.value.split('\n').map(parseInterlockLine).filter(Boolean);
  else if (el.dataset.t === 'qa') v = el.value.split('\n').filter(l => l.trim()).map(l => { const [q, ...r] = l.split('::'); return { q: q.trim(), a: r.join('::').trim() }; });
  if (typeof v === 'number' && isNaN(v)) v = el.value;
  setP(obj, el.dataset.f, v); touch(store, obj);
  if (store === 'records' && obj.type === 'section' && /conveyorNumber|instanceIdOverride|equipmentType/.test(el.dataset.f)) { const h = $('#iidhint'); if (h) { const iid = secIid(obj); h.textContent = iid ? (validInstanceId(iid) ? '✓ ' + iid : '⚠ ' + iid + ' - ' + INSTANCE_ID.hint) : ''; } }
  if (e.type === 'change' && (el.tagName === 'SELECT' || el.type === 'checkbox') && !$('.modal')) route();
}
document.addEventListener('input', e => { if (e.target.tagName !== 'SELECT' && e.target.type !== 'checkbox') onField(e); });
document.addEventListener('change', e => { if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || e.target.id === 'jump') onField(e); });
document.addEventListener('toggle', e => { const k = e.target.dataset?.key; if (!k) return; ui.open[k] = e.target.open; localStorage.setItem('sv-open', JSON.stringify(ui.open));
  const ph = e.target.querySelector(':scope > .secbody > [data-lazy]'); if (e.target.open && ph && lazy[k]) ph.outerHTML = lazy[k](); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('.modal') && !bk) closeModal(); });
for (const id of ['capPhoto', 'capVideo', 'capLib']) { const el = document.getElementById(id);
  el.addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; if (!fs.length) return capMark(null);   /* input lets go of the File list */
    try { const mk = JSON.parse(localStorage.getItem('sv-cap-pending') || 'null'); if (mk) capMark({ ...mk, phase: 'processing', at: Date.now() }); } catch (_) { }
    addFiles(fs).catch(err => { capMark(null); toast('Capture failed: ' + err.message, 6000); }); });
  el.addEventListener('cancel', () => capMark(null)); }
$('#impFile').addEventListener('change', e => e.target.files[0] && importFile(e.target.files[0]).catch(err => { console.error(err); modal(`<h3>Import failed</h3><p>${esc(err.message)}</p><p>Nothing on this device was changed.</p><button class="btn pri" data-act="mclose">OK</button>`); }));
addEventListener('online', () => route()); addEventListener('offline', () => route());
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; if (!S) route(); });

/* ================= 3.7.0: Field rules card (help, and once on first run) ================= */
const FIELD_RULES = [
  ['📱', 'One device code per phone', 'Set it at setup (JR, KL - same initials: JR2). Never share a code between phones; after a reinstall pick a new one.'],
  ['🔀', 'Restore with Merge, never Replace', 'Merge keeps both sides and lists every difference. Replace is only for a damaged device copy.'],
  ['🏠', 'Install to the Home Screen before going on site', 'iPhone: Share → Add to Home Screen, then open the icon. A browser tab can lose its data.'],
  ['💾', 'Back up after each panel', 'Export → Backup (incremental is quick) and send it to your teammate / laptop.']];
const fieldRulesHtml = () => `<div id="fieldrules"><h3>Field rules</h3><ol class="rules">${FIELD_RULES.map(([i, t, d]) => `<li><b>${i} ${esc(t)}</b><br><span class="small">${esc(d)}</span></li>`).join('')}</ol>
  <p class="small muted">Always here: home page → Field rules, or Visit setup → Field rules.</p><button class="btn big pri" data-act="rulesok">Got it</button></div>`;
function showFieldRules() { if ($('#fieldrules')) return; closeModal(false); modal(fieldRulesHtml(), 'rulesbox'); }
function firstRunRules() { if (localStorage.getItem('sv-rules-seen') || $('#iosblock') || $('#tablock')) return; showFieldRules(); }

/* ================= router ================= */
const app = $('#app');
let routing = false, routeAgain = false;
async function route() {
  if (routing) { routeAgain = true; return; }
  routing = true; routeAgain = false;
  try {
    const y = scrollY, prev = location.hash;
    const [path, qs] = location.hash.replace(/^#\/?/, '').split('?'); const p = path.split('/'), q = new URLSearchParams(qs || '');
    if (p[0] !== 'v') { await renderHome(); $('#codepick')?.remove(); }
    else {
      if (!(await loadVisit(p[1]))) { location.hash = '#/'; return; }
      if (route.lastVisit !== p[1]) { ui.sel.clear(); ui.recQ = ''; ui.stopQ = ''; ui.recPanel = ''; route.lastVisit = p[1]; }
      ({ s: () => renderStop(p[3]), r: () => renderRecord(p[3]), records: () => renderRecords(q), nav: renderNav, media: renderMedia, export: renderExport, settings: renderSettings }[p[2]] || renderVisit)();
      codePickBlocker();   /* 3.7.0 S2: blocks capture until this phone has a code of its own */
    }
    if (route.last === prev) scrollTo(0, y); else { scrollTo(0, 0); ui.recLimit = 50; ui.mediaLimit = 60; } route.last = prev; fillStorage();
  } finally { routing = false; if (routeAgain) { routeAgain = false; route(); } }
}
addEventListener('hashchange', route);

/* ================= init ================= */
document.documentElement.dataset.theme = localStorage.getItem('sv-theme') || 'dark';
if (localStorage.getItem('sv-big')) document.documentElement.classList.add('big');
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !window.SV_SINGLE)
  navigator.serviceWorker.register('sw.js').then(() => { const el = $('#swstat'); if (el) el.textContent = swStatus(); }).catch(e => console.warn('SW failed', e));
navigator.serviceWorker?.addEventListener?.('controllerchange', () => { const el = $('#swstat'); if (el) el.textContent = swStatus(); if (route.hadController) toast('App updated ✓ - close and reopen the app to use the new version', 6000); });
route.hadController = !!navigator.serviceWorker?.controller;
iosGate(); acquireLock(); refreshQuota(); route().then(() => setTimeout(() => { capInterrupted(); firstRunRules(); }, 50));
