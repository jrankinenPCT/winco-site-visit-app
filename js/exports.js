/* exports.js - model helpers, the Analyst canonical document (schema.json v3.0.0), the five CSV exports
   (exactly exports/*.csv headers; rows = port of tools/build_exports.py derive_rows + csv.DictWriter), reports, JSON + ZIP. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seg = s => String(s ?? '').trim().replace(/[°]/g, '').replace(/[^A-Za-z0-9_\-/]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
const splitList = s => Array.isArray(s) ? s : String(s || '').split(/[\n;]+/).map(x => x.trim()).filter(Boolean);
const fmtDate = t => t ? new Date(t).toLocaleString() : '';
/* an Issue linked to this section (Issue.equipmentId -> the section record) - any status counts as "logged" */
/* 3.1.0 uiHints.blockedAccessIssue.dedupe: an Open (or InProgress) issue with this equipmentId and a title starting 'Access constraint:' */
const accessIssueFor = (B, r) => B.records.find(x => x.type === 'issue' && x.f.equipmentId === r.id && String(x.f.title || '').startsWith(ACCESS_ISSUE.titlePrefix + ':') && ['Open', 'InProgress'].includes(x.f.status || 'Open'));
/* 3.1.0 presenceAttestedBy/At: both or neither; At = new Date(ms).toISOString() checked against the schema's own strict pattern */
function attestStamp(a, dflt = '') {
  if (!a || !a.at) return null; a = { ...a, by: String(a.by || dflt || '').trim() }; if (!a.by) return null; const t = new Date(a.at); if (isNaN(t)) return null;
  const at = t.toISOString(), pat = AS.defs?.Equipment?.properties?.presenceAttestedAt?.pattern;
  return pat && !new RegExp(pat).test(at) ? null : { by: a.by, at };
}
/* Analyst answer 3: the section's Sub-System is the panel fallback (no explicit SubSystemCode) on a shared vendor panel (ISS-0020) */
function subSystemFallback(r) { return !r.f.subSystemId || (r.subFallback && r.subFallback === r.f.subSystemId); }
function subSystemProvisional(B, r) { const p = (B.stops || []).find(s => s.id === r.stopId); return !!(p?.panel && isProvisionalPanel(p.panel) && subSystemFallback(r)); }
function effectiveSubSystem(B, r) { const p = (B.stops || []).find(s => s.id === r.stopId);
  return r.f.subSystemId || (p?.panel ? (ans(p, 'CP-01', 'primarySubSystemId') || p.panel.primarySubSystemId || seedPanel(p.panel.label)?.primarySubSystemId) : '') || ''; }
const dayOf = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const iso = t => t ? new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z') : '';
const blobToB64 = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = () => rej(fr.error); fr.readAsDataURL(b); });
const isBlank = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
const getD = (o, p) => String(p).split('.').reduce((a, k) => a?.[k], o);
const setD = (o, p, v) => { const ks = String(p).split('.'); let t = o; ks.slice(0, -1).forEach(k => t = t[k] = t[k] && typeof t[k] === 'object' ? t[k] : {}); t[ks.at(-1)] = v; };

/* ---------------- model helpers (shared with app.js) ---------------- */
const secIid = r => (r.f.instanceIdOverride || sectionInstanceId(r.f.equipmentType, r.f.conveyorNumber) || '').trim();
const stopById = (B, id) => B.stops.find(s => s.id === id);
/* 3.6.0 M3: the physical identity of a section (EQ-<instanceId>) / screen (SCR-<code>) - two records with one key = the same thing captured twice */
const physKey = r => r.type === 'section' ? (secIid(r) ? 'EQ-' + idSafe(secIid(r)) : '') : r.type === 'screen' ? (String(r.f?.screenCode || '').trim() ? 'SCR-' + idSafe(String(r.f.screenCode).trim()) : '') : '';
function dupPhysical(B) { const g = new Map(); for (const r of B.records) { const k = physKey(r); if (!k) continue; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  return [...g].filter(([, l]) => l.length > 1).map(([id, l]) => ({ id, type: l[0].type, ids: l.map(r => r.id) })); }
const panelOfRec = (B, r) => { const s = stopById(B, r.type === 'section' ? r.stopId : r.f.panelId); if (s?.kind === 'panel') return s;
  if (r.f.equipmentId) { const e = B.records.find(x => x.id === r.f.equipmentId); if (e) return panelOfRec(B, e); } const s2 = stopById(B, r.stopId); return s2?.kind === 'panel' ? s2 : null; };
const ans = (s, item, key) => s?.resp?.[item]?.a?.[key];
const shotDone = (B, s, sh) => B.media.some(m => m.stopId === s.id && m.shotId === sh.id) || (sh.na && (!sh.req || REQUIRED_PHOTO_NA_ALLOWED.includes(sh.photoType)));
/* items that apply to the visit's trip (checklist item.trips; area/panel stops inherit). Off-trip items stay answerable but never gate. */
const inTrip = (B, id) => { const t = itemDef(id)?.trips; return !t || !t.length || !B?.visit?.trip || t.includes(B.visit.trip); };
const tripItems = (B, s) => (s.items || []).filter(id => inTrip(B, id) || (s.resp[id]?.state && s.resp[id].state !== 'todo'));
function itemMissing(B, s, id) { const r = s.resp[id] || {}; return requiredFor(B, 'items', id).filter(k => isBlank(r.a?.[k])); }
function stopStats(B, s) {
  if (s.kind === 'legacy') { const ck = s.checklist || [], done = ck.filter(i => i.status).length, sd = s.shots.filter(sh => shotDone(B, s, sh)).length;
    const req = s.shots.filter(sh => sh.req), reqDone = req.filter(sh => shotDone(B, s, sh)).length, tot = ck.length + s.shots.length;
    return { itemsDone: done, items: ck.length, shotDone: sd, shots: s.shots.length, reqDone, req: req.length, blocked: 0, issues: ck.filter(i => i.status === 'issue').length, pct: tot ? Math.round(100 * (done + sd) / tot) : 0 }; }
  const st = tripItems(B, s).map(id => s.resp[id]?.state || 'todo'), done = st.filter(x => x !== 'todo').length, sd = s.shots.filter(sh => shotDone(B, s, sh)).length;
  const req = s.shots.filter(sh => sh.req), reqDone = req.filter(sh => shotDone(B, s, sh)).length;
  const issues = B.records.filter(r => r.type === 'issue' && (r.stopId === s.id || r.f.panelId === s.id) && !['Closed', 'Deferred'].includes(r.f.status)).length;
  const tot = st.length + s.shots.length;
  return { itemsDone: done, items: st.length, shotDone: sd, shots: s.shots.length, reqDone, req: req.length, blocked: st.filter(x => x === 'blocked').length, issues, pct: tot ? Math.round(100 * (done + sd) / tot) : 0 };
}
/* verify gate for a walk-down stop (VERIFY_GATES): every item answered, done items carry their required fields, required photos present */
function stopGate(B, s) {
  const out = [];
  if (s.kind === 'legacy') { (s.checklist || []).filter(i => !i.status).forEach(i => out.push('Checklist: ' + i.text)); }
  for (const id of tripItems(B, s)) { const r = s.resp[id] || {}, it = itemDef(id);
    if ((r.state || 'todo') === 'todo') out.push(`${id} ${it.title}: not answered (Done / N/A / Blocked)`);
    else if (r.state === 'done') { const miss = itemMissing(B, s, id); if (miss.length) out.push(`${id} ${it.title}: missing ${miss.map(k => it.fields.find(f => f.key === k)?.label || k).join(', ')}`); } }
  for (const sh of s.shots) if (sh.req && !shotDone(B, s, sh)) out.push('Required photo: ' + (PHOTO_TYPE[sh.photoType]?.label || sh.text));
  return out;
}
/* section (Equipment) gates.
   'quick' = checklist sectionTemplate.completenessGate.quick (capture hint only).
   'verified' = 3.0.0 gate-based: what blocks the best status from tools/gates.py (walkdown + data), computed on the same
   Analyst document the export builds (analystFor, cached per change), so the UI and validate.py can never disagree. */
function sectionMissing(B, r, profile = 'verified') {
  if (profile !== 'verified') { const miss = requiredFor(B, 'section', profile).filter(k => { const v = getD(r.f, k); return isBlank(v) || (k.startsWith('packml.') && v === 'unknown'); });
    if (!validInstanceId(secIid(r))) miss.push('instanceId'); return miss; }
  const g = sectionGate(B, r); return g.best === 'verified' ? [] : [...g.walkMissing, ...g.dataMissing];
}
const REV = { n: 0 };            /* bumped by app.js touch(); keys the gate cache */
let _AC = null;
function analystFor(B) {
  const key = `${REV.n}|${B.records.length}|${B.stops.length}|${B.media.length}`;
  if (_AC && _AC.B === B && _AC.key === key) return _AC.res;
  const res = buildAnalystDoc(B, { sensitive: true });          /* in memory only: sensitive answers still count for the gates */
  const eqBy = Object.fromEntries(res.doc.equipment.map(e => [e.id, e])), cpBy = Object.fromEntries(res.doc.controlPanels.map(p => [p.id, p])), arBy = Object.fromEntries(res.doc.areas.map(a => [a.id, a]));
  res.secDoc = id => eqBy[res.idMap.equipment[id]]; res.panelDoc = id => cpBy[res.idMap.panels[id]]; res.areaDoc = code => arBy['AREA-' + code];
  _AC = { B, key, res }; return res;
}
/* -> {best, walkMissing, dataMissing, phase, exported}. best = highest recordStatus GATES.statusFor allows (walkdown_verified /
   data_verified / verified) or 'open'. Ungated sections (no conveyor number) need only the presentOnSite attestation. */
function sectionGate(B, r) {
  const e = analystFor(B).secDoc(r.id);
  if (!e) { const why = []; if (!validInstanceId(secIid(r))) why.push('instanceId'); if (!EN.equipmentType.includes(r.f.equipmentType)) why.push('equipmentType'); if (!panelOfRec(B, r)) why.push('panel');
    return { best: 'open', walkMissing: why.length ? why : ['not exportable'], dataMissing: [], phase: '', exported: false }; }
  const c = e.completeness;
  if (!c) { const ok = ['yes', 'no'].includes(e.presentOnSite); return { best: ok ? 'verified' : 'open', walkMissing: ok ? [] : ['presentOnSite'], dataMissing: [], phase: '', exported: true }; }
  return { best: GATES.statusFor(c, 'verified'), walkMissing: c.walkdown.missing, dataMissing: c.data.missing, phase: c.phase, exported: true, c };
}
/* panel / area stop: the app's checklist states (stopGate) AND the gates.py completeness of the exported record */
function stopGateStatus(B, s) {
  const res = analystFor(B), o = s.kind === 'panel' ? res.panelDoc(s.id) : s.kind === 'area' ? res.areaDoc(s.key) : null, c = o?.completeness;
  if (!c) return { best: 'verified', missing: [] };
  return { best: GATES.statusFor(c, 'verified'), missing: [...c.walkdown.missing.map(k => 'walk-down: ' + k), ...c.data.missing.map(k => 'data: ' + k)] };
}
/* effective values: blank -> Analyst rule (tag group, history, alarm priority ...) */
function effTag(r) { const f = r.f, rule = tagRules(f.pointFolder, f.point);
  return { tagGroup: f.tagGroup || rule[0], historized: f.historized === '' || f.historized == null ? rule[1] : f.historized === true || f.historized === 'true', historySampleMode: f.historySampleMode || rule[2],
    historyDeadband: !isBlank(f.historyDeadband) ? f.historyDeadband : rule[3], retentionDays: isBlank(f.retentionDays) ? rule[4] : +f.retentionDays, dataType: f.dataType || packmlType(f.pointFolder, f.point) || '',
    udtMember: f.udtMember || (f.pointFolder && f.point ? `${f.pointFolder}/${f.point}` : '') }; }
const effAlarmPriority = f => f.priority || ALARM_DEFAULT_PRIORITY[f.alarmCode] || '';
function recMissing(B, r) {
  if (r.type === 'section') return sectionMissing(B, r, 'verified');
  const req = requiredFor(B, r.type, r.type), f = r.f;
  const val = k => r.type === 'tag' && k === 'tagGroup' ? effTag(r).tagGroup : r.type === 'alarm' && k === 'priority' ? effAlarmPriority(f) : f[k];
  const miss = req.filter(k => isBlank(val(k)));
  /* schema 2.1.0 conditional requireds (Alarm / Tag allOf if-then) */
  if (r.type === 'alarm' && ['BitOn', 'BitOff'].includes(f.triggerMode) && isBlank(f.sourceBit)) miss.push('sourceBit');
  if (r.type === 'alarm' && ['Equal', 'NotEqual', 'AboveSetpoint', 'BelowSetpoint'].includes(f.triggerMode) && isBlank(f.setpoint)) miss.push('setpoint');
  if (r.type === 'tag' && f.valueSource === 'opc' && isBlank(f.opcItemPath)) miss.push('opcItemPath');
  if (r.type === 'tag' && f.valueSource === 'expr' && isBlank(f.expression)) miss.push('expression');
  return miss;
}
const STATUS_ORDER = { open: 0, walkdown_verified: 1, data_verified: 2, verified: 3, na: 4 };

/* ---------------- Analyst canonical document (schema.json) ---------------- */
function uuidFrom(str) {   // deterministic RFC-4122-shaped id for objects that have no uuid of their own (checklist responses, days)
  let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0x9e3779b9, h4 = 0x85ebca6b; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822507); h3 = Math.imul(h3 ^ c, 3266489909); h4 = Math.imul(h4 ^ c, 668265263); }
  const hx = [h1, h2, h3, h4].map(h => (h >>> 0).toString(16).padStart(8, '0')).join('');
  return `${hx.slice(0, 8)}-${hx.slice(8, 12)}-5${hx.slice(13, 16)}-${'89ab'[parseInt(hx[16], 16) & 3]}${hx.slice(17, 20)}-${hx.slice(20, 32)}`;
}
const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
const deviceId = () => { let d = localStorage.getItem('sv-device'); if (!d) { d = 'pwa-' + uid().slice(0, 8); localStorage.setItem('sv-device', d); } return d; };
function parseRefs(s) { return splitList(String(s || '').replace(/,/g, ';')).map(x => { const m = x.match(/^(\S+)\s*(.*)$/), doc = m && EN.sourceDoc.includes(m[1]) ? m[1] : 'other';
  return doc === 'other' ? { doc, detail: x } : (m[2] ? { doc, section: m[2] } : { doc }); }); }
const refsText = refs => (refs || []).map(r => `${r.doc} ${r.section || r.detail || ''}`.trim()).join('; ');
function coerce(type, v) {
  if (isBlank(v)) return undefined;
  const t = String(type || 'string').split(':'), base = t[0] === 'array' ? t[1] : t[0];
  const one = x => base === 'boolean' ? (x === true || x === 'yes' || x === 'true' ? true : x === false || x === 'no' || x === 'false' ? false : undefined)
    : base === 'integer' ? (/^-?\d+$/.test(String(x).trim()) ? parseInt(x, 10) : undefined) : base === 'number' ? (isFinite(+x) && String(x).trim() !== '' ? +x : undefined) : String(x);
  if (t[0] === 'array') { const arr = (Array.isArray(v) ? v : splitList(v)).map(one).filter(x => x !== undefined); return arr.length ? arr : undefined; }
  return one(v);
}
function buildAnalystDoc(B, { sensitive = false } = {}) {
  const v = B.visit, site = siteOf(B), dev = deviceId(), warn = [], who0 = v.createdBy || author() || 'unknown';
  const sync = (o, seed) => ({ uuid: isUuid(o.uuid) ? o.uuid : isUuid(o.id) ? o.id : uuidFrom(seed || String(o.id)), createdAt: iso(o.createdAt || v.createdAt), updatedAt: iso(o.updatedAt || o.createdAt || v.updatedAt),
    createdBy: o.createdBy || who0, updatedBy: o.updatedBy || o.createdBy || who0, deviceId: dev, syncStatus: 'local', version: o.rev || 1 });
  /* trips = the trip(s) the record was captured on. Records carry no per-trip history yet, so every record gets the
     visit's trip (NOT the checklist's planned trips, which would put Trip1 work into the closeout phase in gates.py). */
  const T1 = EN.trip.includes(v.trip) ? [v.trip] : ['Trip1'];
  const trips = () => T1.slice();
  const clean = o => { for (const k of Object.keys(o)) { const x = o[k]; if (x === undefined || x === '' || (Array.isArray(x) && !x.length && !['areaIds'].includes(k)) || (x && typeof x === 'object' && !Array.isArray(x) && !Object.keys(clean(x)).length)) delete o[k]; } return o; };
  const uniq = (set, id) => { let x = id, n = 2; while (set.has(x)) x = `${id}-${n++}`; set.add(x); return x; };
  const areaId = code => AREA_CODES.includes(code) ? 'AREA-' + code : undefined;
  const mediaBid = new Map(B.media.map(m => [m.id, m.bid]));
  const mediaFor = pred => B.media.filter(m => pred(m) && m.bid && validMediaName(m.filename)).map(m => m.bid);
  const D = { schemaVersion: AS.version, exportedAt: iso(Date.now()), exportedBy: author() || who0, deviceId: dev, appVersion: APP_VERSION, checklistVersion: CK.checklistVersion };
  /* site */
  const shapeSite = Object.keys(AS.shapes.Site || {}), siteObj = {};
  for (const k of ['siteCode', 'siteCodeConfirmed', 'siteName', 'customer', 'enterprise', 'timezone', 'gatewayHostname', 'architectureModel', 'optoWesInstance', 'idpRealm', 'tagProvider', 'runtimeRoot', 'address'])
    if (!isBlank(site[k]) && (!shapeSite.length || shapeSite.includes(k))) siteObj[k] = site[k];
  D.site = siteObj;
  const tripOrder = TRIPS.indexOf(v.trip);
  D.visits = [clean({ id: 'VIS-' + idSafe(v.trip || 'Trip1'), sync: sync(v), recordStatus: 'open', trips: trips([v.trip]), trip: v.trip || 'Trip1', name: v.name, startDate: v.startDate || dayOf(v.createdAt), endDate: v.endDate || undefined,
    areasInScope: CK.areas.filter(a => (a.trips || []).includes(v.trip)).map(a => a.code),
    team: (v.visitors || []).map(x => { const m = String(x).match(/^(.*?)\s*\((.*)\)\s*$/); const name = (m ? m[1] : x).trim(); return clean({ userId: initialsOf(name) || name, name, org: m ? m[2] : undefined }); }) })];
  if (tripOrder < 0) warn.push('Visit trip is not one of ' + TRIPS.join('/'));
  D.areas = CK.areas.map(a => ({ id: 'AREA-' + a.code, sync: sync({ id: 'area-' + a.code, createdAt: v.createdAt, updatedAt: v.createdAt }, v.id + '|area|' + a.code), recordStatus: (B.stops.find(s => s.kind === 'area' && s.key === a.code)?.recordStatus) || 'open', trips: trips(a.trips), code: a.code, system: a.system, name: `${a.code}` }));
  /* control panels */
  const ids = new Set(), pnlId = new Map(), shapeCP = AS.shapes.ControlPanel;
  const panels = B.stops.filter(s => s.kind === 'panel');
  D.controlPanels = panels.map(s => {
    const id = uniq(ids, panelIdFor(s.panel.label)); pnlId.set(s.id, id);   // 3.0.0: checklist.panels[].panelId
    const o = { id, sync: sync(s), recordStatus: s.recordStatus || 'open', trips: trips(s.trips), notes: s.notes || undefined };
    for (const itemId of s.items) { const it = itemDef(itemId), a = s.resp[itemId]?.a || {};
      for (const f of it.fields || []) {
        const path = f.mapsTo?.startsWith('ControlPanel.') ? f.mapsTo.slice(13) : (!f.mapsTo && shapeCP[f.key] ? f.key : null); if (!path) continue;
        if (path === 'plc.ipAddress' && !sensitive) continue;
        let val = a[f.key]; if (GATES.SOFT.includes(val) && !softFits('ControlPanel', path, val)) continue;   /* the CLR still carries it */
        if (path === 'hmiArrays.statusEnumValuesInUse') { val = [...new Set((Array.isArray(val) ? val : splitList(val)).map(STATUS_ENCODING.toInt).filter(STATUS_ENCODING.validEnum))]; if (val.length) setD(o, path, val.sort((x, y) => x - y)); continue; }
        if (path === 'hmiArrays.equipmentValuesInUse') { val = [...new Set((Array.isArray(val) ? val : splitList(val)).map(STATUS_ENCODING.toInt).filter(x => x !== null && x >= 0))]; if (val.length) setD(o, path, val.sort((x, y) => x - y)); continue; }
        if (path === 'hmiArrays.statusBitMap') { const rows = bitMapRows(val); if (rows.length) setD(o, path, rows); continue; }
        const t = path === 'hmiArrays.bitMapAvailable' || path === 'plc.programAvailable' || path === 'hmiArrays.statusArrayExists' || path === 'hmiArrays.alarmArrayExists' || path === 'existingHmi.present' ? 'boolean' : shapeCP[path];
        const c = coerce(t || 'string', val); if (c !== undefined) setD(o, path, c);
      } }
    o.panelLabel = o.panelLabel || s.panel.label;
    o.panelIdNormalized = s.panel.idNorm && /^CP-[0-9]{3}[A-Z]?$/.test(s.panel.idNorm) ? s.panel.idNorm : null;
    o.panelType = s.panel.type;
    const served = ans(s, 'VP-01', 'areasServed'); const codes = (Array.isArray(served) && served.length ? served : s.areaCodes).filter(c => AREA_CODES.includes(c));
    o.areaIds = codes.map(c => 'AREA-' + c); o.primaryAreaId = o.areaIds[0];
    const sp = seedPanel(s.panel.label), subs = [...(s.panel.subSystemIds || sp?.subSystemIds || [])];   /* unresolvable ids kept -> refErrors */
    const prim = subSystemById(B, ans(s, 'CP-01', 'primarySubSystemId')) ? ans(s, 'CP-01', 'primarySubSystemId') : (s.panel.primarySubSystemId || sp?.primarySubSystemId);
    if (prim && !subs.includes(prim)) subs.unshift(prim);
    if (subs.length) o.subSystemIds = subs; if (prim) o.primarySubSystemId = prim; else delete o.primarySubSystemId;
    o.lineOrCell = (prim && subSystemById(B, prim)?.code) || panelLineOrCell(s) || undefined;
    if (!o.vendorSystem && s.panel.vendorSystems.length) o.vendorSystem = s.panel.vendorSystems.join('; ');
    if (s.panel.subPanels?.length) o.subPanels = s.panel.subPanels;
    if (o.expectedSectionCount === undefined && s.panel.expected != null) o.expectedSectionCount = s.panel.expected;
    o.seedSource = s.panel.seedSource || 'VSOW';
    if (isProvisionalPanel(s.panel) && o.primarySubSystemId) { o.sourceRefs = [...(o.sourceRefs || []), { doc: 'review', section: PROVISIONAL_SUBSYSTEM.issueId, detail: `primarySubSystemId ${o.primarySubSystemId} (fallback for sections without SubSystemCode) - provisional` }];
      o.notes = [o.notes, `[Sub-System ${PROVISIONAL_SUBSYSTEM.marker}]`].filter(Boolean).join('\n'); }
    o.mediaIds = mediaFor(m => m.stopId === s.id && !m.recordId);
    if (!o.areaIds.length) warn.push(`Panel ${s.panel.label}: no area`);
    return clean(o);
  });
  /* equipment (sections) */
  const dupErr = [];   /* 3.6.0 M3: never silently split one device into EQ-…-2 */
  const eqId = new Map(), eqIds = new Set(), shapeEQ = AS.shapes.Equipment, cpById = Object.fromEntries(D.controlPanels.map(p => [p.id, p]));
  D.equipment = [];
  const secs = B.records.filter(r => r.type === 'section');
  for (const r of secs) {
    const p = stopById(B, r.stopId), iid = secIid(r);
    if (p?.kind !== 'panel') { warn.push(`Section ${iid || r.f.name || r.id}: not on a control panel - not exported (schema Equipment.panelId is required)`); continue; }
    if (!validInstanceId(iid)) { warn.push(`Section on ${p.panel.label}: instance ID "${iid}" does not match ${AS.patterns.instanceId} - not exported`); continue; }
    if (!EN.equipmentType.includes(r.f.equipmentType)) { warn.push(`Section ${iid}: equipment type missing - not exported`); continue; }
    const id = 'EQ-' + idSafe(iid);
    if (eqIds.has(id)) { eqId.set(r.id, id); dupErr.push(`duplicate section ${id}: the same device is recorded twice - merge them (Export → Merge these two)`); continue; }
    eqIds.add(id); eqId.set(r.id, id);
    const cp = cpById[pnlId.get(p.id)], o = { id, sync: sync(r), recordStatus: r.recordStatus || 'open', trips: trips(), equipmentType: r.f.equipmentType, udt: udtOf(r.f.equipmentType) || undefined, instanceId: iid };
    for (const [k, t] of Object.entries(shapeEQ)) { if (/^(id|sync|recordStatus|trips|notes|mediaIds|sourceRefs|completeness|equipmentType|udt|instanceId|panelId|areaId|lineOrCell|packml|captureMode|clonedFromUuid|interlocks|packmlExtensions|subSystemId|seedSource|instanceSuffix|presentOnSite)/.test(k)) continue;
      const val = getD(r.f, k); if (GATES.SOFT.includes(val) && !softFits('Equipment', k, val)) continue;
      const c = coerce(t, val); if (c !== undefined) setD(o, k, c); }
    /* 3.0.0 attest: yes/no only from an explicit tap on this record (r.attest.presentOnSite); otherwise unknown/blocked */
    const pos = r.f.presentOnSite; o.presentOnSite = ['yes', 'no'].includes(pos) && r.attest?.presentOnSite ? pos : pos === 'blocked' ? 'blocked' : 'unknown';
    for (const [k, m] of Object.entries(ATTEST_EXPORT_MAP)) {   /* 3.1.0: paired stamp, only on an exported yes/no, only if the schema defines the fields */
      if (!((m.by in shapeEQ) && (m.at in shapeEQ)) || o[k] !== 'yes' && o[k] !== 'no') continue;
      const st = attestStamp(r.attest?.[k], r.createdBy || who0);   /* By falls back exactly like sync.createdBy */ if (st) { o[m.by] = st.by; o[m.at] = st.at; }
      else if (r.attest?.[k]) warn.push(`Section ${iid}: ${k} attestation stamp is malformed - exported without presenceAttestedBy/At`); }
    if (pos === 'blocked' && !accessIssueFor(B, r)) warn.push(`Section ${iid}: present-on-site is Blocked but no access-constraint issue is linked - log one (Section screen) or note why`);
    if (['yes', 'no'].includes(pos) && !r.attest?.presentOnSite) warn.push(`Section ${iid}: present-on-site '${pos}' was not confirmed by a tap - exported as unknown`);
    o.panelId = cp.id; o.areaId = AREA_CODES.includes(r.f.areaCode) ? 'AREA-' + r.f.areaCode : cp.primaryAreaId;
    /* 3.0.0: an explicit but unresolvable Sub-System ref is exported as-is so GATES.refErrors surfaces it (Export screen + pre-export check) instead of silently remapping */
    const sub = subSystemById(B, r.f.subSystemId) || (r.f.subSystemId ? null : subSystemById(B, cp.primarySubSystemId));
    if (sub) o.subSystemId = sub.id; else if (r.f.subSystemId) o.subSystemId = String(r.f.subSystemId); o.lineOrCell = sub?.code || r.f.lineOrCell || cp.lineOrCell || idSafe(p.panel.label);
    const suf = /-(\d{2})$/.exec(iid); if (suf && +suf[1] >= 2) o.instanceSuffix = +suf[1];
    if (SEED_SOURCES_EQ.includes(r.seedSource)) o.seedSource = r.seedSource;
    if (Array.isArray(r.sourceRefs) && r.sourceRefs.length) o.sourceRefs = r.sourceRefs;
    const prov = subSystemProvisional(B, r);   /* Analyst answer 3: flagged inside the schema (sourceRefs + notes), no new fields */
    if (prov) o.sourceRefs = [...(o.sourceRefs || []).filter(x => x.section !== PROVISIONAL_SUBSYSTEM.issueId), { ...PROVISIONAL_SUBSYSTEM.sourceRef }];   /* = checklist uiHints.provisionalSubSystem.sourceRef (gates.subsystem_provisional) */
    const il = (Array.isArray(r.f.interlocks) ? r.f.interlocks : []).filter(x => x && x.signal).map(x => clean({ signal: x.signal, kind: x.kind, direction: x.direction, otherInstanceId: validInstanceId(x.otherInstanceId) ? x.otherInstanceId : undefined, otherDescription: x.otherDescription })); if (il.length) o.interlocks = il;
    if (r.f.packml) { const pk = {}; for (const [fd, mm] of Object.entries(r.f.packml)) if (shapeEQ['packml.' + fd]) { const x = Object.fromEntries(Object.entries(mm || {}).filter(([, a]) => EN.packmlAvail.includes(a))); if (Object.keys(x).length) pk[fd] = x; } if (Object.keys(pk).length) o.packml = pk; }
    if (EN.captureMode.includes(r.f.captureMode || B.visit.captureMode)) o.captureMode = r.f.captureMode || B.visit.captureMode;
    if (r.clonedFrom) { const src = B.records.find(x => x.id === r.clonedFrom); if (src) o.clonedFromUuid = src.id; }
    const extra = []; if (!isBlank(r.f.statusIndex)) extra.push(`statusIndex=${r.f.statusIndex}`);
    for (const [k, x] of Object.entries(r.f.overlay || {})) if (!isBlank(x)) extra.push(`${k}=${Array.isArray(x) ? x.join('/') : x}`);
    o.notes = [r.f.notes, extra.length ? '[overlay] ' + extra.join('; ') : '', prov ? `[Sub-System ${PROVISIONAL_SUBSYSTEM.marker}]` : ''].filter(Boolean).join('\n') || undefined;
    o.mediaIds = mediaFor(m => m.recordId === r.id);
    D.equipment.push(clean(o));
  }
  const eqById = Object.fromEntries(D.equipment.map(e => [e.id, e]));
  const panelIdOf = r => { const p = panelOfRec(B, r); return p ? pnlId.get(p.id) : undefined; };
  /* inventory counts (INV-01 per area) */
  D.inventoryCounts = [];
  for (const s of B.stops.filter(s => s.kind === 'area')) for (const [k, val] of Object.entries(s.resp['INV-01']?.a || {})) {
    const cls = k.replace(/^class\./, ''); if (!EN.inventoryClass.includes(cls) || !EN.presentOnSite.includes(val)) continue;
    D.inventoryCounts.push({ id: 'INV-' + idSafe(s.key + '-' + cls), sync: sync(s, s.id + '|' + k), recordStatus: 'open', trips: trips(), areaId: 'AREA-' + s.key, equipmentClass: cls, present: val });
  }
  D.commPaths = [];
  /* tags */
  const tagIds = new Set(); D.tags = [];
  for (const r of B.records.filter(r => r.type === 'tag')) {
    const f = r.f, e = eqById[eqId.get(f.equipmentId)], pid = e?.panelId || pnlId.get(f.panelId) || panelIdOf(r), p = cpById[pid];
    if (!EN.pointFolder.includes(f.pointFolder) || isBlank(f.point)) { warn.push(`Tag ${f.plcAddress || f.point || r.id}: point folder / point missing - not exported`); continue; }
    const ef = effTag(r), areaCode = (e ? e.areaId : p?.primaryAreaId || '').replace('AREA-', '');
    const paths = tagPaths(site, { area: areaCode, lineOrCell: e?.lineOrCell || p?.lineOrCell || '', equipmentType: e?.equipmentType || (p ? 'ControlPanel' : ''), instanceId: e?.instanceId || p?.panelIdNormalized || '',
      folder: f.pointFolder, point: f.point, panelIdNormalized: p?.panelIdNormalized, conveyorNumber: e?.conveyorNumber, optoProvider: site.optoProvider || 'default' });
    if (!new RegExp(AS.patterns.optoWesPath || '^\\[[A-Za-z0-9_]+\\]OptoWes/MHE/[^ ]+$').test(paths.optoWesPath)) { warn.push(`Tag ${f.point}: OptoWes path "${paths.optoWesPath}" invalid - not exported`); continue; }
    const id = uniq(tagIds, 'TAG-' + idSafe(`${e?.instanceId || p?.panelIdNormalized || 'X'}-${f.pointFolder}-${f.point}`.replace(/\//g, '-')));
    const vs = EN.valueSource?.includes(f.valueSource) ? f.valueSource : (AS.model.VALUE_SOURCES.includes(f.valueSource) ? f.valueSource : undefined);
    if (vs === 'opc' && isBlank(f.opcItemPath)) warn.push(`Tag ${id}: valueSource=opc needs an OPC item path - valueSource not exported`);
    if (vs === 'expr' && isBlank(f.expression)) warn.push(`Tag ${id}: valueSource=expr needs an expression - valueSource not exported`);
    const o = { id, sync: sync(r), recordStatus: r.recordStatus || 'open', trips: trips(), notes: f.notes || undefined,
      equipmentId: e?.id, panelId: pid, subSystemId: e?.subSystemId || p?.primarySubSystemId, pointFolder: f.pointFolder, point: f.point,
      tagType: AS.model.TAG_TYPES.includes(f.tagType) ? f.tagType : undefined, valueSource: (vs === 'opc' && isBlank(f.opcItemPath)) || (vs === 'expr' && isBlank(f.expression)) ? undefined : vs,
      deviceConnection: f.deviceConnection, opcServer: f.opcServer, opcItemPath: f.opcItemPath, expression: f.expression,
      historyProvider: f.historyProvider, historianClass: AS.model.HISTORIAN_CLASSES.includes(f.historianClass) ? f.historianClass : undefined, optoWesPath: paths.optoWesPath,
      isa95Path: new RegExp(AS.patterns.isa95Path || '^\\[[A-Za-z0-9_]+\\][A-Za-z0-9]+/[A-Z]{2,6}[0-9]{2}/[^ ]+$').test(paths.isa95Path) ? paths.isa95Path : undefined, legacyCpPath: paths.legacyCpPath || undefined,
      udt: f.udt || udtOf(e?.equipmentType) || undefined, udtMember: ef.udtMember || undefined, plcAddress: f.plcAddress, plcDataType: f.plcDataType, dataType: EN.dataType.includes(ef.dataType) ? ef.dataType : undefined, engUnits: f.engUnits,
      access: EN.access.includes(f.access) ? f.access : undefined, writeRole: EN.writeRole.includes(f.writeRole) ? f.writeRole : undefined, tagGroup: ef.tagGroup, historized: ef.historized, historySampleMode: ef.historySampleMode,
      historyDeadband: ef.historyDeadband || undefined, retentionDays: ef.retentionDays ?? undefined, packmlRequired: f.packmlRequired === '' || f.packmlRequired == null ? undefined : f.packmlRequired === true || f.packmlRequired === 'true',
      sourceStatus: EN.sourceStatus.includes(f.sourceStatus) ? f.sourceStatus : 'exists_unverified', mediaIds: mediaFor(m => m.recordId === r.id) };
    if (o.isa95Path === undefined) warn.push(`Tag ${id}: ISA-95 path not exported (site code / provider not valid: ${paths.isa95Path})`);
    D.tags.push(clean(o)); r._exportId = id;
  }
  /* alarms */
  D.alarms = [];
  for (const r of B.records.filter(r => r.type === 'alarm')) {
    const f = r.f, e = eqById[eqId.get(f.equipmentId)], pid = pnlId.get(f.panelId) || e?.panelId || panelIdOf(r), pri = effAlarmPriority(f);
    const dev = f.deviceId || e?.instanceId || '';
    if (!EN.alarmCode.includes(f.alarmCode) || isBlank(f.description) || !EN.alarmPriority.includes(pri)) { warn.push(`Alarm ${r.bid}: needs alarm code, description and priority - not exported`); continue; }
    if (dev && !validInstanceId(dev)) warn.push(`Alarm ${r.bid}: device ID "${dev}" is not an instance ID - DeviceID left blank`);
    const ign = f.ignitionPriority || IGNITION_PRIORITY_FOR(pri);
    let tm = EN.triggerMode.includes(f.triggerMode) ? f.triggerMode : undefined; const bit = isBlank(f.sourceBit) ? undefined : coerce('integer', f.sourceBit), sp = coerce('number', f.setpoint);
    if (['BitOn', 'BitOff'].includes(tm) && bit === undefined) { warn.push(`Alarm ${r.bid}: trigger ${tm} needs a source bit - trigger mode not exported`); tm = undefined; }
    if (['Equal', 'NotEqual', 'AboveSetpoint', 'BelowSetpoint'].includes(tm) && sp === undefined) { warn.push(`Alarm ${r.bid}: trigger ${tm} needs a setpoint - trigger mode not exported`); tm = undefined; }
    let col = isBlank(f.colorValue) ? undefined : STATUS_ENCODING.toInt(f.colorValue); if (col !== undefined && !STATUS_ENCODING.validEnum(col)) { warn.push(`Alarm ${r.bid}: colour value ${f.colorValue} is outside the 0-15 status enum - not exported`); col = undefined; }
    const pcp = cpById[pid];
    D.alarms.push(clean({ id: r.bid, sync: sync(r), recordStatus: r.recordStatus || 'open', trips: trips(), notes: f.notes || undefined, panelId: pid, equipmentId: e?.id, subSystemId: e?.subSystemId || pcp?.primarySubSystemId, deviceId: validInstanceId(dev) ? dev : undefined,
      alarmName: f.alarmName, setpoint: sp, ackMode: AS.model.ACK_MODES.includes(f.ackMode) ? f.ackMode : undefined, displayPath: f.displayPath, faultCategory: AS.model.FAULT_CATEGORIES.includes(f.faultCategory) ? f.faultCategory : undefined,
      downtimeClass: AS.model.DOWNTIME_CLASSES.includes(f.downtimeClass) ? f.downtimeClass : undefined,
      alarmCode: f.alarmCode, category: EN.alarmCategory.includes(f.category) ? f.category : 'Alarm', description: f.description, priority: pri, ignitionPriority: EN.ignitionPriority.includes(ign) ? ign : undefined,
      colorValue: col, statusNotAlarm: coerce('boolean', f.statusNotAlarm), sourceWord: f.sourceWord, sourceBit: bit,
      sourceTagPath: f.sourceTagPath, isa95Path: f.isa95Path, triggerMode: tm, onDelaySec: coerce('number', f.onDelaySec), deadband: f.deadband,
      operatorResponse: f.operatorResponse, consequence: f.consequence, notificationPipeline: f.notificationPipeline, shelvingAllowed: coerce('boolean', f.shelvingAllowed), rationalized: coerce('boolean', f.rationalized),
      source: EN.alarmSource.includes(f.source) ? f.source : 'proposed', mediaIds: mediaFor(m => m.recordId === r.id) }));
  }
  /* screens (Navigation Matrix) */
  const scrIds = new Set(), scrId = new Map(), scr = B.records.filter(r => r.type === 'screen');
  const scrDup = new Set();
  scr.forEach(r => { const code = String(r.f.screenCode || '').trim(), base = 'SCR-' + idSafe(code || r.bid || r.id.slice(0, 8));
    if (code && scrIds.has(base)) { scrId.set(r.id, base); scrDup.add(r.id); } else scrId.set(r.id, uniq(scrIds, base)); });
  D.screens = [];
  for (const r of scr) { const f = r.f;
    if (scrDup.has(r.id)) { dupErr.push(`duplicate screen ${scrId.get(r.id)}: the same screen is recorded twice - merge them (Export → Merge these two)`); continue; }
    if (!new RegExp(AS.patterns.screenCode || '^[OMEA]-[0-9]{2}$').test(f.screenCode || '') || !EN.layer.includes(f.layer) || isBlank(f.name)) { warn.push(`Screen ${f.screenCode || f.name || r.id}: needs code (O-01), layer and name - not exported`); continue; }
    D.screens.push(clean({ id: scrId.get(r.id), sync: sync(r), recordStatus: r.recordStatus || 'open', trips: trips(), notes: f.notes || undefined, sourceRefs: parseRefs(f.docRef), screenCode: f.screenCode, codeStatus: EN.codeStatus.includes(f.codeStatus) ? f.codeStatus : 'proposed',
      layer: f.layer, altitude: EN.altitude.includes(f.altitude) ? f.altitude : undefined, name: f.name, viewFolder: f.viewFolder, fullViewName: f.fullViewName, areaId: areaId(stopById(B, f.areaId)?.key || f.areaId), subArea: f.subArea,
      panelId: pnlId.get(f.panelId), parentScreenId: scrId.get(f.parentScreenId), navigatesTo: (f.navigatesTo || []).map(x => scrId.get(x)).filter(Boolean), viewParams: splitList(f.viewParams),
      optoGroups: (f.optoGroups || []).filter(x => EN.optoGroup.includes(x)), permissionKey: f.permissionKey, equipmentTypes: f.equipmentTypes || [], commandsExposed: splitList(f.commandsExposed), mediaIds: mediaFor(m => m.recordId === r.id) }));
  }
  const areaOf = f => areaId(stopById(B, f.areaId)?.key || f.areaId);
  /* issues */
  D.issues = B.records.filter(r => r.type === 'issue').map(r => { const f = r.f, e = eqById[eqId.get(f.equipmentId)];
    return clean({ id: r.bid, sync: sync(r), recordStatus: r.recordStatus || 'open', trips: trips(), notes: f.notes || undefined, sourceRefs: (r.sourceRefs?.length ? r.sourceRefs : null) || parseRefs(f.docRef),
      category: EN.issueCategory.includes(f.category) ? f.category : 'gap', title: f.title || '(untitled)', description: f.description, raisedAt: iso(r.createdAt), raisedBy: r.createdBy || who0,
      areaId: areaOf(f) || (stopById(B, r.stopId)?.kind === 'area' ? 'AREA-' + stopById(B, r.stopId).key : undefined), panelId: pnlId.get(f.panelId) || (stopById(B, r.stopId)?.kind === 'panel' ? pnlId.get(r.stopId) : undefined), equipmentId: e?.id,
      subSystemId: e?.subSystemId || cpById[pnlId.get(f.panelId) || pnlId.get(r.stopId)]?.primarySubSystemId, changeOrderRef: f.changeOrderRef, nteImpact: f.nteImpact,
      impact: f.impact, deliverables: (f.deliverables || []).filter(x => EN.deliverable.includes(x)), priority: EN.issuePriority.includes(f.priority) ? f.priority : 'Medium', owner: f.owner,
      ownerOrg: f.ownerOrg, status: EN.issueStatus.includes(f.status) ? f.status : 'Open', dueDate: f.dueDate || undefined, resolution: f.resolution, closedAt: f.status === 'Closed' && f.closedAt ? iso(f.closedAt) : undefined, mediaIds: mediaFor(m => m.recordId === r.id) }); });
  /* media */
  D.media = [];
  for (const m of B.media) { if (m.deletedAt) continue;
    if (!validMediaName(m.filename)) { warn.push(`Media ${m.bid || m.id}: file "${m.filename}" does not match the Analyst filename pattern (e.g. .webm) - not listed in the canonical doc`); continue; }
    const st = stopById(B, m.stopId), rec = m.recordId && B.records.find(x => x.id === m.recordId);
    D.media.push(clean({ id: m.bid, sync: sync(m), recordStatus: 'open', trips: trips(), notes: m.note || undefined, filename: m.filename, kind: EN.mediaKind.includes(m.kind) ? m.kind : 'photo', photoType: EN.photoType.includes(m.photoType) ? m.photoType : 'other',
      capturedAt: iso(m.capturedAt || m.createdAt), areaId: st?.kind === 'area' ? 'AREA-' + st.key : st?.kind === 'panel' ? cpById[pnlId.get(st.id)]?.primaryAreaId : undefined, panelId: st?.kind === 'panel' && !rec ? pnlId.get(st.id) : undefined,   /* record media link via equipmentId / mediaIds only, so a section nameplate never satisfies the panel's nameplate (gates.py _media_types) */
      equipmentId: rec?.type === 'section' ? eqId.get(rec.id) : undefined, caption: m.caption || undefined, sensitive: !!m.sensitive,
      storage: clean({ blobKey: m.id, mimeType: m.mime, bytes: m.size, maxEdgePx: m.compressed ? (m.maxEdge || PHOTO_MAX_LEGACY) : undefined, jpegQuality: m.compressed ? (m.jpegQ || PHOTO_Q) : undefined }) }));
  }
  D.observations = B.records.filter(r => r.type === 'observation').map(r => clean({ id: r.bid, sync: sync(r), recordStatus: r.recordStatus || 'open', trips: trips(), notes: r.f.notes || undefined, text: r.f.text || '(empty)', observedAt: iso(r.createdAt),
    areaId: areaOf(r.f), panelId: pnlId.get(r.f.panelId), equipmentId: eqId.get(r.f.equipmentId), tags: splitList(r.f.tags), mediaIds: mediaFor(m => m.recordId === r.id) }));
  D.interviews = B.records.filter(r => r.type === 'interview').map(r => clean({ id: r.bid, sync: sync(r), recordStatus: r.recordStatus || 'open', trips: trips(), notes: r.f.notes || undefined, interviewee: r.f.interviewee || '(unnamed)', role: r.f.role, org: r.f.org, at: iso(r.createdAt),
    qa: (r.f.qa || []).filter(x => x.question || x.answer).map(x => ({ question: x.question || '', answer: x.answer || '' })) }));
  /* checklist responses (every answered item on site / area / panel stops) */
  D.checklistResponses = [];
  const clrIds = new Set();
  for (const s of B.stops.filter(s => s.items?.length)) for (const id of s.items) { const r = s.resp[id]; if (!r || (r.state || 'todo') === 'todo' && !r.note && !Object.values(r.a || {}).some(x => !isBlank(x))) continue;
    const it = itemDef(id), key = s.kind === 'panel' ? s.panel.label : s.kind === 'area' ? s.key : 'site';
    const answers = (it.fields || []).filter(f => !isBlank(r.a?.[f.key]) && !(f.key === 'plc.ipAddress' && !sensitive)).map(f => ({ fieldKey: f.key, value: f.type === 'bitMapGrid' ? bitMapRows(r.a[f.key]).map(x => `${x.equipmentType}:${x.value ?? ''}=${x.meaning}`).join(';') : Array.isArray(r.a[f.key]) ? r.a[f.key].join(';') : r.a[f.key] })).filter(x => !isBlank(x.value));
    const q = Object.entries(r.q || {}).filter(([, x]) => x).map(([k, x]) => `${k}: ${x}`);
    D.checklistResponses.push(clean({ id: uniq(clrIds, 'CLR-' + idSafe(id + '-' + key)), sync: sync({ ...s, createdAt: r.at || s.createdAt, updatedAt: r.at || s.updatedAt, createdBy: r.by || s.createdBy }, s.id + '|' + id),
      recordStatus: r.state === 'na' ? 'na' : 'open', trips: trips(), notes: [r.note, ...q].filter(Boolean).join('\n') || undefined, checklistItemId: id, instanceKey: key,
      areaId: s.kind === 'area' ? 'AREA-' + s.key : s.kind === 'panel' ? cpById[pnlId.get(s.id)]?.primaryAreaId : undefined, panelId: s.kind === 'panel' ? pnlId.get(s.id) : undefined, state: r.state || 'todo',
      answers: answers.map(a => ({ fieldKey: a.fieldKey, value: typeof a.value === 'number' || typeof a.value === 'boolean' ? a.value : String(a.value) })) }));
  }
  D.flowNodes = []; D.flowEdges = []; D.oeeInputs = []; D.securityRoles = [];
  /* infra items (INF-01..09) */
  const siteStops = B.stops.filter(s => s.kind === 'site');
  D.infraItems = [];
  for (const s of siteStops) for (const id of s.items.filter(x => /^INF-\d+$/.test(x))) { const a = s.resp[id]?.a || {}; if (isBlank(a.answer) && isBlank(a.owner) && id !== 'INF-09') continue; if (id === 'INF-09') continue;
    D.infraItems.push(clean({ id: id, sync: sync(s, s.id + '|' + id), recordStatus: s.resp[id]?.state === 'na' ? 'na' : 'open', trips: trips(), itemNo: +id.split('-')[1], topic: itemDef(id).title, answer: a.answer, owner: a.owner })); }
  /* daily summaries */
  const dayIds = new Set();
  D.dailySummaries = B.days.map(d => { const inDay = o => o.dayId === d.id;
    return clean({ id: uniq(dayIds, 'DAY-' + d.date), sync: sync(d), recordStatus: 'open', trips: trips(), date: d.date, author: d.createdBy || who0, summary: d.notes || undefined,
      counts: { panelsVerified: B.stops.filter(s => s.kind === 'panel' && isVerified(s.recordStatus) && dayOf(s.verifiedAt || s.updatedAt) === d.date).length, sectionsCaptured: secs.filter(inDay).length,
        photos: B.media.filter(inDay).length, issuesOpened: B.records.filter(r => r.type === 'issue' && inDay(r)).length,
        packmlGaps: secs.filter(inDay).reduce((n, r) => n + Object.values(r.f.packml || {}).reduce((k, mm) => k + Object.values(mm || {}).filter(x => x === 'missing').length, 0), 0) } }); });
  /* sub-systems (2.1.0): seeded from checklist.json + added on site; panelIds = exported panels that list them */
  const subIds = new Set([...D.controlPanels.flatMap(p => p.subSystemIds || []), ...D.equipment.map(e => e.subSystemId).filter(Boolean)]);
  D.subSystems = subSystemsOf(B).filter(x => subIds.has(x.id) || (x.panelLabels || []).some(l => panels.some(s => s.panel.label === l))).map(x => clean({
    id: x.id, sync: sync({ id: x.id, createdAt: v.createdAt, updatedAt: v.createdAt }, 'sub|' + x.id), recordStatus: 'open', trips: trips(),
    notes: (x.sourceRefs || []).filter(r => typeof r === 'string').join('; ') || undefined,                      /* checklist sourceRefs are strings, schema wants SourceRef objects */
    sourceRefs: (x.sourceRefs || []).filter(r => r && typeof r === 'object'),
    code: x.code, name: x.name, areaId: x.areaId || 'AREA-' + x.area, system: x.system, kind: SUBSYSTEM_KIND.includes(x.kind) ? x.kind : undefined,
    membershipStatus: x.membershipStatus, panelIds: D.controlPanels.filter(p => (p.subSystemIds || []).includes(x.id)).map(p => p.id), seedSource: SUBSYSTEM_SEED.includes(x.seedSource) ? x.seedSource : 'site' }));
  /* every record carries trips (schema 2.1.0 #8 minItems 1) */
  for (const [k, arr] of Object.entries(D)) if (Array.isArray(arr) && k !== 'exports') for (const r of arr) if (r && typeof r === 'object' && r.sync && !(r.trips || []).length) r.trips = trips();
  /* gates: completeness = tools/gates.py (ported in gates.js) for panels, sections, areas and checklist responses */
  const comp = GATES.compute(D);
  for (const arr of Object.values(D)) if (Array.isArray(arr)) for (const r of arr) if (r && r.id in comp) { const c = comp[r.id]; r.completeness = c;
    if (isVerified(r.recordStatus) && !GATES.allows(c, r.recordStatus)) { const to = GATES.statusFor(c, r.recordStatus === 'verified' ? 'verified' : r.recordStatus);
      warn.push(`${r.id}: recordStatus ${r.recordStatus} exported as ${to} - gate not met (${c.missing.slice(0, 4).join(', ')})`); r.recordStatus = to; } }
  /* ungated equipment (no conveyorNumber): the schema still needs an attested presentOnSite for walkdown_verified/verified */
  for (const e of D.equipment) if (!(e.id in comp) && isVerified(e.recordStatus) && !['yes', 'no'].includes(e.presentOnSite)) {
    warn.push(`${e.id}: recordStatus ${e.recordStatus} exported as open - present-on-site not confirmed`); e.recordStatus = 'open'; }
  /* records without checklist gates (tags, alarms, screens, issues): one walkdown gate = the app's required fields */
  for (const [k, list] of [['tag', D.tags], ['alarm', D.alarms], ['screen', D.screens], ['issue', D.issues]]) for (const o of list) {
    const r = B.records.find(x => x.type === k && (k === 'screen' ? scrId.get(x.id) === o.id : (x._exportId || x.bid) === o.id)) || null; const miss = r ? recMissing(B, r) : [];
    const req = requiredFor(B, k, k).length, w = { requiredTotal: req, requiredDone: req - miss.length, missing: miss, satisfiedByUnknown: [], passed: !miss.length }, d0 = { requiredTotal: 0, requiredDone: 0, missing: [], satisfiedByUnknown: [], passed: true };
    o.completeness = { phase: GATES.phaseFor(null, o.trips), walkdown: w, data: d0, requiredTotal: req, requiredDone: w.requiredDone, missing: miss, gatePassed: w.passed };
    if (isVerified(o.recordStatus) && !w.passed) { warn.push(`${o.id}: recordStatus ${o.recordStatus} exported as open - missing ${miss.join(', ')}`); o.recordStatus = 'open'; } }
  /* 3.0.0 reference integrity (gates.ref_errors) + JSON-Schema check: surfaced on the Export screen and before any export */
  const refErrors = [...GATES.refErrors(D), ...dupErr];
  for (const w of GATES.attestationWarnings(D)) warn.push('advisory: ' + w);   /* 3.1.0 gates.attestation_warnings - never blocks */
  const idMap = { equipment: Object.fromEntries(eqId), panels: Object.fromEntries(pnlId) };
  return { doc: D, warnings: warn, refErrors, idMap };
}
/* bitMapGrid answer -> StatusBitDef[] (schema $defs/StatusBitDef: meaning+source+confirmed, and bit or value) */
function bitMapRows(val) {
  return (Array.isArray(val) ? val : []).filter(x => x && !isBlank(x.meaning)).map(x => { const int = (y, max) => { const n = STATUS_ENCODING.toInt(y); return n === null || n < 0 || (max != null && n > max) ? null : n; };
    const o = { equipmentType: x.equipmentType || 'Any', value: int(x.value), bit: int(x.bit, 31), meaning: String(x.meaning), mapsToEnum: int(x.mapsToEnum, 15),
      mapsToEnumCandidates: [...new Set((x.mapsToEnumCandidates || []).map(y => int(y, 15)).filter(y => y !== null))], source: STATUS_BIT_SOURCES.includes(x.source) ? x.source : 'site', confirmed: x.confirmed === true || x.confirmed === 'true' };
    return o; }).filter(o => o.value !== null || o.bit !== null);
}
const SEED_SOURCES_EQ = AS.model.SEED_SOURCES;
const validMediaName = fn => new RegExp(AS.patterns.mediaFilename || '^[A-Za-z0-9]+_[A-Za-z0-9()-]+_[A-Za-z0-9-]+_[0-9]{8}_[0-9]{3}\\.(jpg|jpeg|png|heic|mp4|mov|m4a|pdf)$').test(String(fn || ''));

/* ---------------- export rows: exact port of tools/build_exports.py derive_rows ---------------- */
const _j = v => v === null || v === undefined ? '' : Array.isArray(v) ? v.map(pyStr).join(';') : typeof v === 'boolean' ? (v ? 'true' : 'false') : pyStr(v);
const pyStr = v => v === null || v === undefined ? '' : v === true ? 'True' : v === false ? 'False' : String(v);
const g = (o, k, d = '') => o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : d;
function deriveRows(d) {
  const areas = Object.fromEntries(d.areas.map(a => [a.id, a])), pnl = Object.fromEntries(d.controlPanels.map(p => [p.id, p])), eq = Object.fromEntries(d.equipment.map(e => [e.id, e]));
  const acode = aid => aid in areas ? areas[aid].code : '', plab = pid => pid in pnl ? pnl[pid].panelLabel : '';
  const refs = o => _j((o.sourceRefs || []).map(r => `${r.doc} ${g(r, 'section', '')}`.trim()));
  const subs = Object.fromEntries((d.subSystems || []).map(s => [s.id, s]));
  const scode = (...ids) => { for (const x of ids) if (x) return x; return ''; };   // 3.0.0: the Sub-System id (SUB-...), not the code
  const esub = (e, p) => scode(g(e || {}, 'subSystemId', null), g(p || {}, 'primarySubSystemId', null));
  const gate = (r, k) => { const c = (r.completeness || {})[k]; return c == null ? '' : c.passed ? 'passed' : `${c.requiredDone}/${c.requiredTotal}`; };
  const kv = o => _j(Object.keys(o || {}).sort().map(k => `${k}=${pyStr(o[k])}`));
  const legacyN = {}; for (const t of d.tags) if (t.legacyCpPath) legacyN[t.legacyCpPath] = (legacyN[t.legacyCpPath] || 0) + 1;
  const tags = d.tags.map(t => { const e = eq[g(t, 'equipmentId', null)] || null, p = pnl[g(t, 'panelId', null) || g(e || {}, 'panelId', null)] || null, E = e || {}, P = p || {};
    const ver = t.recordStatus === 'verified';
    return { TagMapID: t.id, Area: acode(g(E, 'areaId', null) || g(P, 'primaryAreaId', null)), LineOrCell: g(E, 'lineOrCell', g(P, 'lineOrCell', '')), ControlPanel: g(P, 'panelLabel', ''),
      ConveyorNumber: _j(g(E, 'conveyorNumber', null)), EquipmentType: g(E, 'equipmentType', ''), InstanceID: g(E, 'instanceId', ''), PointFolder: g(t, 'pointFolder', ''), Point: g(t, 'point', ''), OptoWesPath: t.optoWesPath,
      ISA95Path: g(t, 'isa95Path', ''), LegacyCPPath: g(t, 'legacyCpPath', ''), TagProvider: t.optoWesPath.split(']')[0].slice(1), UDT: g(t, 'udt', ''), UDTMember: g(t, 'udtMember', ''),
      PLCAddress: g(t, 'plcAddress', ''), PLCDataType: g(t, 'plcDataType', ''), IgnitionDataType: g(t, 'dataType', ''), EngUnits: g(t, 'engUnits', ''), Access: g(t, 'access', ''), WriteRole: _j(g(t, 'writeRole', null)),
      TagGroup: t.tagGroup, Historized: _j(g(t, 'historized', null)), HistorySampleMode: g(t, 'historySampleMode', ''), HistoryDeadband: g(t, 'historyDeadband', ''), RetentionDays: _j(g(t, 'retentionDays', null)),
      Alarmed: _j(!!(t.alarmIds && t.alarmIds.length)), AlarmMapIDs: _j(g(t, 'alarmIds', [])), PackMLRequired: _j(g(t, 'packmlRequired', null)), SourceStatus: t.sourceStatus, RecordStatus: t.recordStatus,
      Notes: g(t, 'notes', ''), CapturedBy: t.sync.createdBy, VerifiedBy: ver ? g(t.sync, 'updatedBy', '') : '', VerifiedAt: ver ? t.sync.updatedAt : '', RecordUUID: t.sync.uuid,
      SubSystem: scode(g(t, 'subSystemId', null)) || esub(e, p), TagType: g(t, 'tagType', ''), ValueSource: g(t, 'valueSource', ''), DeviceConnection: g(t, 'deviceConnection', ''), OPCServer: g(t, 'opcServer', ''),
      OPCItemPath: g(t, 'opcItemPath', ''), Expression: g(t, 'expression', ''), UDTParams: kv(g(t, 'udtParams', {})), HistoryProvider: g(t, 'historyProvider', ''), HistorianClass: g(t, 'historianClass', ''),
      LegacyCPPathUnique: !t.legacyCpPath ? '' : _j(legacyN[t.legacyCpPath] === 1) }; });
  const alarms = d.alarms.map(a => { const e = eq[g(a, 'equipmentId', null)] || null, p = pnl[g(a, 'panelId', null)] || null, E = e || {}, P = p || {};
    return { AlarmMapID: a.id, Area: acode(g(E, 'areaId', null) || g(P, 'primaryAreaId', null)), ControlPanel: g(P, 'panelLabel', ''), DeviceID: g(a, 'deviceId', ''), ConveyorNumber: _j(g(E, 'conveyorNumber', null)),
      EquipmentType: g(E, 'equipmentType', ''), AlarmCode: a.alarmCode, AlarmEventCategory: a.category, AlarmEventDescription: a.description, PriorityLevel: a.priority, IgnitionPriority: g(a, 'ignitionPriority', ''),
      ColorValue: _j(g(a, 'colorValue', null)), StatusNotAlarm: _j(g(a, 'statusNotAlarm', false)), SourceWord: g(a, 'sourceWord', ''), SourceBit: _j(g(a, 'sourceBit', null)), SourceTagPath: g(a, 'sourceTagPath', ''),
      ISA95Path: g(a, 'isa95Path', ''), TriggerMode: g(a, 'triggerMode', ''), OnDelaySec: _j(g(a, 'onDelaySec', null)), Deadband: g(a, 'deadband', ''), OperatorResponse: g(a, 'operatorResponse', ''),
      Consequence: g(a, 'consequence', ''), NotificationPipeline: g(a, 'notificationPipeline', ''), ShelvingAllowed: _j(g(a, 'shelvingAllowed', null)), Rationalized: _j(g(a, 'rationalized', false)), Source: a.source,
      RecordStatus: a.recordStatus, Notes: g(a, 'notes', ''), RecordUUID: a.sync.uuid, SubSystem: scode(g(a, 'subSystemId', null)) || esub(e, p), AlarmName: g(a, 'alarmName', ''),
      IgnitionAlarmMode: g(AS.model.IGNITION_ALARM_MODE, g(a, 'triggerMode', ''), ''), Setpoint: _j(g(a, 'setpoint', null)),
      OnZero: a.triggerMode === 'BitOff' ? 'true' : a.triggerMode === 'BitOn' ? 'false' : '', AckMode: g(a, 'ackMode', ''), DisplayPath: g(a, 'displayPath', ''), FaultCategory: g(a, 'faultCategory', ''),
      DowntimeClass: g(a, 'downtimeClass', ''), AssociatedData: kv(g(a, 'associatedData', {})) }; });
  const inv = [];
  for (const p of d.controlPanels) { const h = g(p, 'hmiArrays', {}), plc = g(p, 'plc', {}), loc = g(p, 'location', {});
    inv.push({ InventoryID: p.id, RecordType: 'Panel', System: areas[p.primaryAreaId].system, Area: p.areaIds.map(acode).join(';'), Zone: g(p, 'zone', ''), LineOrCell: g(p, 'lineOrCell', ''),
      ControlPanel: p.panelLabel, PanelName: g(p, 'panelName', ''), PanelType: p.panelType, VendorSystem: g(p, 'vendorSystem', ''), ConveyorNumber: '', EquipmentType: 'ControlPanel', InstanceID: g(p, 'panelIdNormalized', null) || '',
      DeviceName: g(p, 'panelName', ''), ParentInstanceID: '', SequenceInRun: '', PhysicalLocation: g(loc, 'columnGrid', ''), Level: g(loc, 'level', ''), LayoutRef: g(loc, 'layoutRef', ''),
      Manufacturer: g(p, 'vendor', ''), Model: '', Firmware: '', DriveType: '', PLCMake: g(plc, 'make', ''), PLCModel: g(plc, 'model', ''), PLCFirmware: g(plc, 'firmware', ''), IPAddress: g(plc, 'ipAddress', ''),
      Protocol: g(plc, 'protocol', ''), PLCOwner: g(p, 'plcOwner', ''), HMIStatusArray: g(h, 'statusArrayTag', ''), HMIStatusArraySize: _j(g(h, 'statusArraySize', null)), HMIAlarmArray: g(h, 'alarmArrayTag', ''),
      HMIAlarmArraySize: _j(g(h, 'alarmArraySize', null)), StatusValuesInUse: _j(g(h, 'statusEnumValuesInUse', []).map(String)), PackMLGaps: '', PresentOnSite: 'yes', PhotoIDs: _j(g(p, 'mediaIds', [])),
      Trips: _j(g(p, 'trips', [])), RecordStatus: p.recordStatus, Notes: g(p, 'notes', ''), RecordUUID: p.sync.uuid,
      SubSystem: _j([...g(p, 'subSystemIds', [])]), StatusEncoding: g(h, 'statusEncoding', ''),
      StatusBitMap: _j(g(h, 'statusBitMap', []).map(r => `${g(r, 'equipmentType', '')}:${r.value == null ? '' : r.value}${r.bit == null ? '' : '/b' + r.bit}=${r.meaning.split(' (')[0]}${r.mapsToEnum == null ? '' : '->' + r.mapsToEnum}${r.confirmed ? '' : '?'}`)),
      DockDoor: g(loc, 'dockDoor', ''), WalkdownGate: gate(p, 'walkdown'), DataGate: gate(p, 'data') }); }
  for (const e of d.equipment) { const p = pnl[e.panelId], loc = g(e, 'location', {});
    const gaps = []; for (const [f, mm] of Object.entries(g(e, 'packml', {}))) for (const [m, v] of Object.entries(mm)) if (v === 'missing') gaps.push(`${f}/${m}`);
    inv.push({ InventoryID: e.id, RecordType: g(e, 'conveyorNumber', null) ? 'Section' : 'Device', System: areas[e.areaId].system, Area: acode(e.areaId), Zone: g(p, 'zone', ''), LineOrCell: e.lineOrCell,
      ControlPanel: p.panelLabel, PanelName: g(p, 'panelName', ''), PanelType: p.panelType, VendorSystem: g(p, 'vendorSystem', ''), ConveyorNumber: _j(g(e, 'conveyorNumber', null)), EquipmentType: e.equipmentType,
      InstanceID: e.instanceId, DeviceName: g(e, 'name', ''), ParentInstanceID: _j(g(e, 'parentInstanceId', null)), SequenceInRun: _j(g(e, 'sequenceInRun', null)), PhysicalLocation: g(loc, 'columnGrid', ''),
      Level: g(loc, 'level', ''), LayoutRef: g(loc, 'layoutRef', ''), Manufacturer: g(e, 'manufacturer', ''), Model: g(e, 'model', ''), Firmware: g(e, 'firmware', ''), DriveType: g(e, 'driveType', ''),
      PLCMake: '', PLCModel: '', PLCFirmware: '', IPAddress: '', Protocol: '', PLCOwner: '', HMIStatusArray: '', HMIStatusArraySize: '', HMIAlarmArray: '', HMIAlarmArraySize: '', StatusValuesInUse: '',
      PackMLGaps: _j(gaps), PresentOnSite: g(e, 'presentOnSite', ''), PhotoIDs: _j(g(e, 'mediaIds', [])), Trips: _j(g(e, 'trips', [])), RecordStatus: e.recordStatus, Notes: g(e, 'notes', ''), RecordUUID: e.sync.uuid,
      SubSystem: esub(e, p), StatusEncoding: '', StatusBitMap: '', DockDoor: g(loc, 'dockDoor', ''), WalkdownGate: gate(e, 'walkdown'), DataGate: gate(e, 'data') }); }
  const nav = d.screens.map(s => ({ ScreenID: s.id, ScreenCode: s.screenCode, CodeStatus: s.codeStatus, Layer: s.layer, Altitude: g(s, 'altitude', ''), ScreenName: s.name, ViewFolder: g(s, 'viewFolder', ''),
    FullViewName: g(s, 'fullViewName', ''), Area: acode(g(s, 'areaId', null)), SubArea: g(s, 'subArea', ''), ControlPanel: plab(g(s, 'panelId', null)), ParentScreenID: g(s, 'parentScreenId', ''),
    NavigatesTo: _j(g(s, 'navigatesTo', [])), ViewParams: _j(g(s, 'viewParams', [])), OptoGroups: _j(g(s, 'optoGroups', [])), PermissionKey: g(s, 'permissionKey', ''), EquipmentTypes: _j(g(s, 'equipmentTypes', [])),
    CommandsExposed: _j(g(s, 'commandsExposed', [])), DocRef: refs(s), RecordStatus: s.recordStatus, Notes: g(s, 'notes', ''), RecordUUID: s.sync.uuid, SubSystem: scode(g(s, 'subSystemId', null)) }));
  const iss = d.issues.map(i => ({ IssueID: i.id, DateRaised: i.raisedAt.slice(0, 10), RaisedBy: g(i, 'raisedBy', ''), Trip: _j(g(i, 'trips', [])), Category: i.category, Title: i.title, Description: g(i, 'description', ''),
    Area: acode(g(i, 'areaId', null)), ControlPanel: plab(g(i, 'panelId', null)), DeviceID: g(i, 'equipmentId', null) in eq ? eq[i.equipmentId].instanceId : '', Impact: g(i, 'impact', ''),
    DeliverablesAffected: _j(g(i, 'deliverables', [])), Priority: i.priority, Owner: g(i, 'owner', ''), OwnerOrg: g(i, 'ownerOrg', ''), Status: i.status, DueDate: _j(g(i, 'dueDate', null)),
    Resolution: g(i, 'resolution', ''), DateClosed: (g(i, 'closedAt', null) || '').slice(0, 10), SourceRef: refs(i), PhotoIDs: _j(g(i, 'mediaIds', [])), RecordUUID: i.sync.uuid,
    SubSystem: scode(g(i, 'subSystemId', null)), ChangeOrderRef: g(i, 'changeOrderRef', ''), NTEImpact: g(i, 'nteImpact', '') }));
  return { 'tag-mapping-matrix': tags, 'alarm-mapping-matrix': alarms, 'device-inventory': inv, 'navigation-matrix': nav, 'issue-log': iss };
}
/* csv.DictWriter(lineterminator='\r\n', QUOTE_MINIMAL): quote when the cell has , " \r or \n; no BOM */
const csvCell = v => { const s = pyStr(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csvText = (key, rows) => [CSV_COLUMNS[key].map(csvCell).join(','), ...rows.map(r => CSV_COLUMNS[key].map(c => csvCell(r[c])).join(','))].map(l => l + CSV_DIALECT.eol).join('');
/* 3.0.0 pre-export checks = what tools/validate.py runs: JSON Schema, gates.status_errors, gates.ref_errors */
function exportChecks(B, opts = { sensitive: !!B.visit.shareSensitive }) {
  const { doc, warnings, refErrors } = buildAnalystDoc(B, opts);
  const blockedNoIssue = B.records.filter(r => r.type === 'section' && r.f.presentOnSite === 'blocked' && !accessIssueFor(B, r)).map(r => secIid(r) || r.id);
  const attestWarnings = GATES.attestationWarnings(doc);
  /* 3.5.0 (Reviewer M1): a human-readable ID used twice blocks the export */
  const seen = new Map(); for (const o of [...B.records, ...B.media]) if (o.bid) seen.set(o.bid, (seen.get(o.bid) || 0) + 1);
  const dupIds = [...seen].filter(([, n]) => n > 1).map(([b, n]) => `duplicate ID ${b} (${n} records)`);
  const dupPhys = dupPhysical(B);   /* 3.6.0 M3: hard block - no "Export anyway" */
  return { doc, warnings, refErrors: [...refErrors, ...dupIds], dupIds, dupPhys, blockedNoIssue, attestWarnings, schemaErrors: SV_SCHEMA.validate(doc), statusErrors: GATES.statusErrors(doc), get count() { return this.refErrors.length + this.schemaErrors.length + this.statusErrors.length; } };
}
function csvFiles(B, opts) { const { doc, warnings } = buildAnalystDoc(B, opts), rows = deriveRows(doc); return { doc, warnings, files: EXPORT_KEYS.map(k => [k + '.csv', csvText(k, rows[k]), rows[k].length]) }; }

/* ---------------- JSON (backup / exchange) ---------------- */
async function buildJson(B, { thumbs = false, base64 = false, mediaFilter = null, analyst = true } = {}) {
  const media = [];
  for (const m of B.media) { const { blob, thumb, ...rest } = m; const o = { ...rest, file: 'media/' + (m.filename || m.id) };
    if (thumbs && thumb) o.thumb = thumb; if (mediaFilter && !mediaFilter(m)) o.inPackage = false;
    if (base64 && blob && (!mediaFilter || mediaFilter(m))) o.dataBase64 = await blobToB64(blob);
    media.push(o); }
  const out = { format: 'site-visit-pwa', schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, analystSchema: { ...ANALYST_SCHEMA, statusEncodings: Object.keys(STATUS_ENCODING.tables || {}) },
    exportedAt: new Date().toISOString(), mediaEmbedded: !!base64, visit: B.visit, days: B.days, stops: B.stops, records: B.records, media };
  if (analyst) { const { doc, warnings } = buildAnalystDoc(B, { sensitive: !!B.visit.shareSensitive }); out.analyst = doc; out.exportWarnings = warnings; }
  return out;
}

/* ---------------- reports (media are linked by filename, never embedded) ---------------- */
const T = (cols, rows) => ({ cols, rows });
function visitHeader(B) { const v = B.visit, s = siteOf(B); return `${v.name} · ${s.siteName} (${s.siteCode}) · ${v.trip} · ${v.startDate || ''} – ${v.endDate || ''} · ${(v.visitors || []).join(', ')}`; }
function navMatrix(doc) { const rows = deriveRows(doc)['navigation-matrix']; return T(['Code', 'Status', 'Layer', 'Altitude', 'Name', 'Parent', 'Navigates to', 'Opto groups', 'Area/panel'], rows.map(r => [r.ScreenCode, r.CodeStatus, r.Layer, r.Altitude, r.ScreenName, r.ParentScreenID, r.NavigatesTo, r.OptoGroups, [r.Area, r.ControlPanel].filter(Boolean).join(' / ')])); }
function mediaLinks(B, list) { return list.filter(m => !m.sensitive || B.visit.shareSensitive).map(m => ({ href: 'media/' + m.filename, label: m.filename })); }
function dailyReport(B, day) {
  const inDay = o => o.dayId === day.id, { doc, warnings } = buildAnalystDoc(B, { sensitive: !!B.visit.shareSensitive }), R = deriveRows(doc);
  const issues = B.records.filter(r => r.type === 'issue' && inDay(r)), secs = B.records.filter(r => r.type === 'section' && inDay(r));
  const panelsTouched = B.stops.filter(s => s.kind === 'panel' && s.items.some(id => s.resp[id]?.at && dayOf(s.resp[id].at) === day.date));
  return { title: `Daily summary · ${day.label} · ${day.date}`, sub: visitHeader(B), sections: [
    { h: 'Summary', text: day.notes || '(no day notes)' },
    { h: 'Counts', table: T(['Panels touched', 'Panels verified', 'Sections captured', 'Photos', 'Issues opened'], [[panelsTouched.length, panelsTouched.filter(s => isVerified(s.recordStatus)).length, secs.length, B.media.filter(inDay).length, issues.length]]) },
    { h: 'Panels walked today', table: T(['Panel', 'Type', 'Areas', 'Status', 'Progress'], panelsTouched.map(s => { const st = stopStats(B, s); return [s.panel.label, s.panel.type, s.areaCodes.join(';'), s.recordStatus, `${st.itemsDone}/${st.items} items · ${st.reqDone}/${st.req} req photos`]; })) },
    { h: 'Issues raised today', table: T(['ID', 'Category', 'Priority', 'Status', 'Title'], issues.map(r => [r.bid, r.f.category, r.f.priority, r.f.status, r.f.title])) },
    { h: 'Media captured today', links: mediaLinks(B, B.media.filter(inDay)) },
    ...(warnings.length ? [{ h: 'Export warnings', list: warnings }] : [])] };
}
function visitReport(B) {
  const { doc, warnings } = buildAnalystDoc(B, { sensitive: !!B.visit.shareSensitive }), R = deriveRows(doc), pick = (rows, cols) => T(cols, rows.map(r => cols.map(c => r[c])));
  const panels = B.stops.filter(s => s.kind === 'panel');
  const isProv = r => String(r.Notes || '').includes(PROVISIONAL_SUBSYSTEM.marker);   /* Analyst answer 3 marker */
  const inv = R['device-inventory'].map(r => isProv(r) ? { ...r, SubSystem: `${r.SubSystem || ''} (${PROVISIONAL_SUBSYSTEM.marker})` } : r), prov = R['device-inventory'].filter(isProv);
  return { title: 'Site visit report (Analyst schema ' + AS.version + ')', sub: visitHeader(B), sections: [
    { h: 'Coverage', table: T(['Areas', 'Panels', 'Panels verified', 'Sections', 'Tags', 'Alarms', 'Screens', 'Issues open', 'Media'], [[CK.areas.length, panels.length, panels.filter(s => isVerified(s.recordStatus)).length, doc.equipment.length, doc.tags.length, doc.alarms.length, doc.screens.length, doc.issues.filter(i => !['Closed', 'Deferred'].includes(i.status)).length, B.media.length]]) },
    { h: 'Site registry', table: T(['Field', 'Value'], Object.entries(doc.site).map(([k, x]) => [k, String(x)])) },
    { h: 'Device inventory', table: pick(inv, ['InventoryID', 'RecordType', 'Area', 'ControlPanel', 'SubSystem', 'EquipmentType', 'InstanceID', 'PLCModel', 'RecordStatus']) },
    ...(prov.length ? [{ h: `Provisional Sub-System (${PROVISIONAL_SUBSYSTEM.issueId})`, text: `Shared vendor panels (${provisionalPanelLabels().join(', ')}): ${prov.length} section(s) carry the panel's fallback Sub-System because the seed had no SubSystemCode. Treat as ${PROVISIONAL_SUBSYSTEM.marker}.` }] : []),
    { h: 'Tag mapping matrix', table: pick(R['tag-mapping-matrix'], ['TagMapID', 'InstanceID', 'PointFolder', 'Point', 'OptoWesPath', 'PLCAddress', 'TagGroup', 'SourceStatus']) },
    { h: 'Alarm mapping matrix', table: pick(R['alarm-mapping-matrix'], ['AlarmMapID', 'ControlPanel', 'DeviceID', 'AlarmCode', 'PriorityLevel', 'IgnitionPriority', 'AlarmEventDescription']) },
    { h: 'Navigation matrix', table: navMatrix(doc) },
    { h: 'Issue log', table: pick(R['issue-log'], ['IssueID', 'Category', 'Priority', 'Status', 'ControlPanel', 'Title', 'Owner']) },
    { h: 'Status encodings', text: 'Two encodings (Analyst 2.1.0): the DES §8.11 colour enum 0-15 (HMIArrays.statusEnumValuesInUse, Alarm.colorValue) and per-equipment bit/value maps (HMIArrays.statusBitMap; Alarm.sourceBit for BitOn/BitOff). Bit-map rows seeded from the XLSX stay unconfirmed (?) until checked on site.' },
    { h: 'Media', links: mediaLinks(B, B.media) },
    ...(warnings.length ? [{ h: 'Export warnings', list: warnings }] : [])] };
}
function reportMd(rep) {
  const cell = x => String(x ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  return `# ${rep.title}\n\n_${rep.sub}_\n\n` + rep.sections.map(s => `## ${s.h}\n\n` + (s.text ? s.text + '\n' : '') + (s.list ? s.list.map(x => '- ' + x).join('\n') + '\n' : '') +
    (s.links ? (s.links.length ? s.links.map(l => `- [${l.label}](${l.href})`).join('\n') : '_none_') + '\n' : '') +
    (s.table ? (s.table.rows.length ? `| ${s.table.cols.map(cell).join(' | ')} |\n|${s.table.cols.map(() => '---').join('|')}|\n` + s.table.rows.map(r => `| ${r.map(cell).join(' | ')} |`).join('\n') : '_none_') + '\n' : '')).join('\n');
}
function reportHtml(rep) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(rep.title)}</title><style>body{font:16px/1.45 system-ui,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;width:100%;margin:8px 0 20px;font-size:14px}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}h2{border-bottom:2px solid #333;margin-top:28px}@media print{a{color:#000}}</style></head><body>
<h1>${esc(rep.title)}</h1><p><i>${esc(rep.sub)}</i></p>${rep.sections.map(s => `<h2>${esc(s.h)}</h2>` + (s.text ? `<p>${esc(s.text).replace(/\n/g, '<br>')}</p>` : '') + (s.list ? `<ul>${s.list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '') +
  (s.links ? (s.links.length ? `<ul>${s.links.map(l => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join('')}</ul>` : '<p><i>none</i></p>') : '') +
  (s.table ? (s.table.rows.length ? `<table><tr>${s.table.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${s.table.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>` : '<p><i>none</i></p>') : '')).join('')}
<p style="color:#666;font-size:12px">Site Visit PWA ${APP_VERSION} · Analyst schema ${AS.version} · checklist ${CK.checklistVersion}</p></body></html>`;
}
/* ---------------- ZIP packages ----------------
   kind 'full'        = backup: visit.json (no thumbs) + analyst/capture.json + every media blob
   kind 'incremental' = backup: visit.json (no thumbs) + analyst/capture.json + only media created after the last confirmed backup
   kind 'export'      = hand-off: full + csv/ + reports/ (media links resolve inside the zip) */
async function buildZip(B, kind = 'export', onProgress) {
  const mark = B.visit.backup?.mediaMark || 0, sel = kind === 'incremental' ? m => (m.createdAt || 0) > mark : () => true;
  const J = await buildJson(B, { thumbs: false, mediaFilter: kind === 'incremental' ? sel : null });
  J.package = { kind, mediaSince: kind === 'incremental' ? mark : 0, createdAt: Date.now(), seq: (B.visit.backup?.seq || 0) + 1, prevSeq: B.visit.backup?.seq || 0 };   /* 3.4.0: seq lets an importer detect a partial incremental chain */
  const files = [{ name: 'visit.json', data: JSON.stringify(J) }, { name: 'analyst/capture.json', data: JSON.stringify(J.analyst, null, 1) }];
  if (kind === 'export') {
    const R = deriveRows(J.analyst); for (const k of EXPORT_KEYS) files.push({ name: `csv/${k}.csv`, data: csvText(k, R[k]) });
    const vr = visitReport(B); files.push({ name: 'visit-report.html', data: reportHtml(vr) }, { name: 'visit-report.md', data: reportMd(vr) });
    for (const d of B.days) { const dr = dailyReport(B, d); files.push({ name: `daily-${d.date}-${idSafe(d.label)}.html`, data: reportHtml(dr) }); }
  }
  let newest = mark;
  for (const m of B.media) if (m.blob && sel(m)) { files.push({ name: 'media/' + (m.filename || m.id), data: m.blob, crc: m.crc, date: new Date(m.createdAt) }); newest = Math.max(newest, m.createdAt || 0); }
  const blob = await makeZip(files, onProgress);
  return { blob, mediaCount: files.filter(f => f.name.startsWith('media/')).length, newestMedia: newest, warnings: J.exportWarnings };
}
