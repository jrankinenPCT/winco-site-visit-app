/* migrations.js - upgrade on-device data and imported bundles through the chain v1/v2 -> v3 (Analyst 2.0.0) -> v4 (2.1.0) -> v5 (3.0.0) -> v6 (3.1.0, version strings only).
   v1 (first PWA) and v2 (review §4) share a shape: free-form stops with checklist/shots, records {type, f}.
   v3 seeds the Analyst site / area / panel stops and maps every old record onto an Analyst entity. Nothing is
   dropped: old stops survive as 'legacy' stops and every converted record keeps r.legacy = {type, f}. */
const OLD_PHOTO_TYPE = { panel_ext: 'panel_exterior', panel_int: 'panel_interior', net_switch: 'network_switch', hmi_screen: 'existing_hmi', io: 'io_card', drive: 'vfd', safety: 'device',
  plc: 'plc_rack', plc_rack: 'plc_rack', overview: 'overview', nameplate: 'nameplate', layout: 'layout', drawing: 'drawing', device: 'device', sensor: 'sensor', vfd: 'vfd', other: 'other' };
function guessPhotoType(text) {
  const t = String(text || '').toLowerCase();
  for (const [re, k] of [[/nameplate|label plate|sccr/, 'nameplate'], [/interior|inside|open door/, 'panel_interior'], [/rack|plc|processor/, 'plc_rack'], [/switch|network|ethernet/, 'network_switch'],
    [/hmi|screen|operator station/, 'existing_hmi'], [/\bio\b|i\/o|card/, 'io_card'], [/vfd|drive/, 'vfd'], [/stack ?light|beacon/, 'stack_light'], [/sensor|photo-?eye|prox/, 'sensor'],
    [/layout|plan|map|site plan/, 'layout'], [/drawing|schematic/, 'drawing'], [/video|running|operation/, 'video_operation'], [/panel|door|enclosure/, 'panel_exterior'], [/overview|wide|perimeter|general/, 'overview']])
    if (re.test(t)) return k;
  return 'other';
}
const mapPhotoType = (type, text) => EN.photoType.includes(type) ? type : OLD_PHOTO_TYPE[type] || guessPhotoType(text);
const OLD_EQUIP_TYPE = { 'MDR Zone': 'MDRZone', 'Photo-eye': 'Photoeye', 'Print & Apply': 'PandA', 'Pallet Conveyor': 'PalletConveyor', DWS: 'Dimensioner', Palletizer: 'VendorSystem' };
const mapEquipType = t => EN.equipmentType.includes(t) ? t : OLD_EQUIP_TYPE[t] || 'Other';
/* old IDs like PE-12 become PE-012 (instance IDs need >= 3 digits); the original is kept in legacyId */
function padInstanceId(id) { const m = String(id || '').trim().toUpperCase().match(/^([A-Z][A-Z0-9]*-)(\d{1,2})([A-Z]?)$/); return m ? m[1] + m[2].padStart(INSTANCE_ID.minDigits, '0') + m[3] : String(id || '').trim(); }
const PRIORITY_V1 = { Critical: 'P1', High: 'P1', Medium: 'P2', Low: 'P3', Diagnostic: 'P3' };
const ISSUE_CAT = c => { c = String(c || '').toLowerCase(); return /rfi|question|info/.test(c) ? 'rfi' : /risk/.test(c) ? 'risk' : /punch/.test(c) ? 'punch' : /decision/.test(c) ? 'decision' : /discrep/.test(c) ? 'discrepancy' : 'gap'; };
const ISSUE_PRI = s => ({ Critical: 'High', High: 'High', Medium: 'Medium', Low: 'Low' })[s] || 'Medium';
const ISSUE_STATUS = s => ({ Open: 'Open', 'In progress': 'InProgress', InProgress: 'InProgress', Answered: 'Answered', Resolved: 'Closed', Closed: 'Closed', Deferred: 'Deferred' })[s] || 'Open';
const ACCESS = rw => /write|rw/i.test(rw || '') ? 'RW' : rw ? 'R' : '';
const FOLDER_ALIAS = { Status: 'StatusPoints', Control: 'ControlPoints', Admin: 'AdminPoints', Cmd: 'ControlPoints', Recipe: 'Recipe', IO: 'IO', System: '_System', _System: '_System' };

/* P = {visit, days, stops, records, media}; mutates in place; returns a list of human-readable notes */
function migrateBundle(P) {
  const from = P.visit.schemaVersion || 1;
  if (from >= SCHEMA_VERSION) return null;
  const notes = from < 3 ? migrateToV3(P) : [];
  if (from < 4) notes.push(...migrateV3toV4(P, from));
  if (from < 5) notes.push(...migrateV4toV5(P, from));
  notes.push(...migrateV5toV6(P, from));
  P.visit.schemaVersion = SCHEMA_VERSION; P.visit.migratedFrom = from; P.visit.analystSchema = ANALYST_SCHEMA.version;
  return notes;
}
/* v3 (Analyst 2.0.0) -> v4 (Analyst 2.1.0). Also runs right after migrateToV3 so v1/v2 land on the same shape. */
function migrateV3toV4(P, from) {
  const notes = []; let moved = 0, renamed = 0, added = 0;
  for (const s of P.stops.filter(x => x.kind === 'panel')) {
    const sp = seedPanel(s.panel.label);
    if (!s.panel.subSystemIds) { s.panel.subSystemIds = sp?.subSystemIds || []; s.panel.primarySubSystemId = sp?.primarySubSystemId || null; }
    for (const id of (CK.panelTemplates[s.panel.type] || []).map(i => i.id)) if (!s.items.includes(id)) { s.items.push(id); s.resp[id] = { state: 'todo', a: defaultAnswers(id, { prefill: { panelLabel: s.panel.label } }), q: {}, note: '' }; added++; }
    for (const r of Object.values(s.resp)) { const a = r.a || (r.a = {});
      if (a.statusValuesInUse !== undefined) { a['hmiArrays.statusEnumValuesInUse'] = (Array.isArray(a.statusValuesInUse) ? a.statusValuesInUse : []).map(STATUS_ENCODING.toInt).filter(STATUS_ENCODING.validEnum).map(String); delete a.statusValuesInUse; moved++; } }
    const cp3 = s.resp['CP-03']; if (cp3 && s.panel.type === 'conveyor' && !Array.isArray(cp3.a['hmiArrays.statusBitMap'])) cp3.a['hmiArrays.statusBitMap'] = STATUS_ENCODING.bitMapSeed();
    if (s.recordStatus === 'verified') { s.recordStatus = 'walkdown_verified'; }
  }
  for (const r of P.records.filter(x => x.type === 'section')) if (r.recordStatus === 'verified') r.recordStatus = 'walkdown_verified';
  if (from >= 3) for (const m of P.media) if (m.filename && !validMediaName(m.filename)) { m.legacyFilename = m.filename; delete m.filename; }
  P.media.sort((a, b) => a.createdAt - b.createdAt).forEach(m => { if (!m.filename) { assignMediaName(P, m); renamed++; } });
  if (from >= 3) notes.push(`Upgraded to Analyst ${ANALYST_SCHEMA.version}: ${added} new checklist items, ${moved} status-value answers moved to hmiArrays.statusEnumValuesInUse, ${renamed} media renamed to {Area}_{Subject}_{shot}_{date}_{INITIALS}-{NNN}-{hex6} (old names kept in legacyFilename); 'verified' became 'walkdown_verified' - re-check the data gate before marking verified.`);
  return notes;
}
/* v4 (Analyst 2.1.0) -> v5 (Analyst 3.0.0): the store-level twin of migrations/migrate_2_1_to_3_0.py step 3.
   presentOnSite is now an attest field: only an explicit on-site yes/no tap (r.attest.presentOnSite = {by, at}) counts.
   Earlier builds prefilled 'yes' on every section, so an unattested value is NOT evidence: it is cleared (= unknown) and a
   walkdown_verified/verified section goes back to open (the data gate is re-checked on export). Never auto-set yes/no. */
function migrateV4toV5(P) {
  let cleared = 0, down = 0;
  for (const r of P.records.filter(x => x.type === 'section')) {
    if (r.attest?.presentOnSite) continue;
    if (r.f && r.f.presentOnSite !== undefined) { if (r.f.presentOnSite !== 'blocked') { delete r.f.presentOnSite; cleared++; } }
    const was = r.recordStatus;
    if (was === 'walkdown_verified' || was === 'verified') { r.recordStatus = 'open'; down++;
      r.f = r.f || {}; r.f.notes = [r.f.notes, `[3.0.0 upgrade] status reset from ${was}: present-on-site was never confirmed by a tap - confirm Yes/No on site, then verify again.`].filter(Boolean).join('\n'); }
  }
  return [`Upgraded to Analyst 3.0.0: present-on-site is now an explicit Yes/No tap - ${cleared} unconfirmed (prefilled) values cleared to unknown, ${down} verified sections reopened. Panel ids now come from checklist.json.`];
}
/* v5 (Analyst 3.0.0) -> v6 (Analyst 3.1.0): additive schema - version strings only, NO backfill. presenceAttestedBy/At are
   never invented: they export only from a genuine on-site tap record (r.attest.presentOnSite = {by, at}, kept by the app since 3.0.0). */
function migrateV5toV6(P, from) {
  if (from < 5) return [];
  const taps = P.records.filter(r => r.type === 'section' && r.attest?.presentOnSite && ['yes', 'no'].includes(r.f?.presentOnSite)).length;
  return [`Upgraded to Analyst 3.1.0: version bump only (no backfill) - ${taps} recorded on-site taps carry presenceAttestedBy/At; nothing else changed.`];
}
function migrateToV3(P) {
  const from = P.visit.schemaVersion || 1, notes = [];
  const v = P.visit, now = Date.now();
  const stamp = o => { o.createdBy = o.createdBy || v.createdBy || ''; o.updatedBy = o.updatedBy || o.createdBy; o.createdAt = o.createdAt || now; o.updatedAt = o.updatedAt || o.createdAt; return o; };
  /* visit */
  stamp(v);
  const tm = v.tagModel || {}, oldSite = typeof v.site === 'string' ? v.site : '';
  v.name = v.name || oldSite || 'Imported visit';
  v.site = { ...(typeof v.site === 'object' && v.site ? v.site : {}), customer: v.client || SITE_DEFAULTS.customer, address: v.address || '' };
  if (tm.siteCode && new RegExp(AS.patterns.siteCode || '^[A-Z]{2,6}[0-9]{2}$').test(tm.siteCode)) v.site.siteCode = tm.siteCode;
  if (tm.enterprise) v.site.enterprise = tm.enterprise;
  if (tm.optoRoot) v.site.runtimeRoot = tm.optoRoot;
  if (tm.provider) v.site.optoProvider = tm.provider;
  if (v.tagRoot) notes.push(`v1 tag root "${v.tagRoot}" kept in visit.legacy (v3 builds paths from the Analyst site registry)`);
  v.legacy = { site: oldSite, client: v.client, address: v.address, tagRoot: v.tagRoot, tagModel: v.tagModel, backupMode: v.backupMode };
  delete v.client; delete v.address; delete v.tagRoot; delete v.tagModel; delete v.backupMode;
  v.trip = v.trip || 'Trip1'; v.captureMode = v.captureMode || 'full'; v.seq = v.seq || {}; v.mediaSeq = v.mediaSeq || {};
  v.visitors = v.visitors || []; v.backup = v.backup || { lastAt: v.lastBackupAt || 0, kind: '', mediaMark: 0, seq: 0 };
  const nextBid = kind => seqId(kind, v.seq[kind] = (v.seq[kind] || 0) + 1);
  P.days.forEach(stamp);
  /* stops: old ones become legacy, the Analyst stops are seeded after them */
  const legacy = P.stops.map(stamp);
  legacy.forEach((s, i) => {
    s.legacyKind = s.kind; s.kind = 'legacy'; s.key = s.key || s.id; s.group = 'Earlier walk-down (v' + from + ')'; s.order = 1000 + i;
    s.items = []; s.resp = {}; s.areaCodes = []; s.trips = []; s.gates = {}; s.recordStatus = s.status === 'complete' ? 'verified' : s.status === 'na' ? 'na' : 'open'; delete s.status;
    s.shots = (s.shots || []).map(sh => ({ ...sh, id: sh.id || uid(), photoType: mapPhotoType(sh.type, sh.text), text: sh.text, req: !!sh.req, na: sh.status === 'na' || !!sh.na, naReason: sh.naReason || '' }));
    s.shots.forEach(sh => delete sh.type);
  });
  const seeded = seedStops(v.id); seeded.forEach(s => { stamp(s); s.createdBy = v.createdBy || ''; s.updatedBy = s.createdBy; });
  P.stops = [...seeded, ...legacy];
  const panelByNorm = {}; seeded.filter(s => s.kind === 'panel').forEach(s => { panelByNorm[normalizePanelId(s.panel.label) || s.panel.label] = s; panelByNorm[s.panel.label] = s; });
  const findPanel = name => { const n = String(name || '').trim(); return n ? panelByNorm[n] || panelByNorm[normalizePanelId(n)] || panelByNorm[normalizePanelId(n.replace(/^CP-/, 'MCP-'))] || null : null; };
  /* records */
  const old = P.records.map(stamp), out = [], byOldId = {}, mediaRelink = {};
  const base = (r, type, f, extra = {}) => { const n = { id: r.id, visitId: r.visitId, dayId: r.dayId, stopId: r.stopId, type, f, recordStatus: r.status === 'verified' || r.status === 'complete' ? 'verified' : r.status === 'na' ? 'na' : 'open',
    gates: {}, legacy: { type: r.type, f: r.f }, createdAt: r.createdAt, updatedAt: r.updatedAt, createdBy: r.createdBy, updatedBy: r.updatedBy, ...extra };
    if (REC[type]?.bid) n.bid = nextBid(REC[type].bid); out.push(n); byOldId[r.id] = n; return n; };
  // pass 1: equipment -> sections
  for (const r of old.filter(r => r.type === 'equipment')) {
    const f = r.f || {}, panel = findPanel(f.plc || f.cp), iid = padInstanceId(f.equipId || f.instanceId);
    const sf = { equipmentType: mapEquipType(f.type), name: f.name || '', manufacturer: f.manufacturer || '', model: f.model || '', serial: f.serial || '', firmware: f.firmware || '',
      instanceIdOverride: iid, legacyId: f.equipId && f.equipId !== iid ? f.equipId : '', notes: [f.nameplate && 'Nameplate: ' + f.nameplate, f.type && !EN.equipmentType.includes(f.type) && `Old type: ${f.type}`, f.notes].filter(Boolean).join('\n') };
    const n = base(r, 'section', sf); if (panel) n.stopId = panel.id; else notes.push(`Equipment ${f.equipId || f.name} has no matching control panel - kept on its old stop; link a panel before export (schema Equipment.panelId is required)`);
  }
  const sectionByIid = {}; out.filter(r => r.type === 'section').forEach(r => { sectionByIid[r.f.instanceIdOverride] = r; if (r.f.legacyId) sectionByIid[r.f.legacyId] = r; });
  // pass 2: the rest
  for (const r of old) {
    const f = r.f || {};
    if (r.type === 'equipment') continue;
    if (r.type === 'plc') {
      const panel = findPanel(f.name), item = panel && (panel.panel.type === 'vendor' ? 'VP-02' : 'CP-02');
      if (panel) { const a = panel.resp[item].a;
        Object.assign(a, Object.fromEntries(Object.entries({ 'plc.make': f.make, 'plc.model': f.model, 'plc.firmware': f.firmware, 'plc.ipAddress': f.ip, 'plc.protocol': f.protocol }).filter(([, x]) => x)));
        panel.resp[item].note = [panel.resp[item].note, `Migrated from v${from} PLC record${f.program ? '; program ' + f.program : ''}`].filter(Boolean).join('\n');
        byOldId[r.id] = { panelStop: panel }; mediaRelink[r.id] = panel.id; continue; }
      base(r, 'observation', { text: `PLC ${f.name || ''}: ${[f.make, f.model, f.firmware && 'fw ' + f.firmware, f.ip, f.protocol, f.program].filter(Boolean).join(', ')}`, tags: ['plc'], notes: f.notes || '' });
      notes.push(`PLC ${f.name} is not in the VSOW panel roster - kept as an observation`); continue;
    }
    if (r.type === 'tag') {
      const parts = String(f.point || '').split('/'), folder = FOLDER_ALIAS[parts[0]] || (EN.pointFolder.includes(parts[0]) ? parts[0] : '');
      const tf = { pointFolder: folder, point: folder ? parts.slice(1).join('/') : f.point || '', plcAddress: f.address || '', dataType: EN.dataType.includes(f.dataType) ? f.dataType : '', access: ACCESS(f.rw),
        engUnits: f.units || '', sourceStatus: 'exists_unverified', equipmentId: f.equipRef || '', notes: [f.description, f.rangeLo !== undefined && `Range ${f.rangeLo}..${f.rangeHi}`, f.alarmCondition && `Alarm: ${f.alarmCondition} (${f.alarmPriority || ''})`, f.notes].filter(Boolean).join('\n') };
      const n = base(r, 'tag', tf); n._plcRef = f.plcRef; continue;
    }
    if (r.type === 'alarm') {
      const panel = findPanel(f.cp), sec = sectionByIid[padInstanceId(f.deviceId)] || sectionByIid[f.deviceId];
      const af = { panelId: panel ? panel.id : '', equipmentId: sec ? sec.id : '', deviceId: f.deviceId ? padInstanceId(f.deviceId) : '', alarmCode: EN.alarmCode.includes(f.alarmCode) ? f.alarmCode : 'Other',
        category: /status/i.test(f.classification || '') ? 'Status' : 'Alarm', statusNotAlarm: /status/i.test(f.classification || ''), description: f.description || f.condition || f.tagPath || '(migrated alarm)',
        priority: EN.alarmPriority.includes(f.priority) ? f.priority : PRIORITY_V1[f.priority] || '', ignitionPriority: f.priority === 'Diagnostic' ? 'Diagnostic' : '',
        sourceTagPath: f.tagPath || '', notificationPipeline: f.notification || '', source: 'proposed', notes: [f.condition && 'Condition: ' + f.condition, f.setpoint && 'Setpoint: ' + f.setpoint, f.delay && 'Delay: ' + f.delay, f.notes].filter(Boolean).join('\n') };
      base(r, 'alarm', af); continue;
    }
    if (r.type === 'gap' || r.type === 'issue') {
      base(r, 'issue', { category: ISSUE_CAT(f.category), title: f.title || '(untitled)', description: [f.description, f.recommendedAction && 'Recommended action: ' + f.recommendedAction].filter(Boolean).join('\n'),
        priority: ISSUE_PRI(f.severity || f.priority), status: ISSUE_STATUS(f.status), owner: f.owner || '', dueDate: f.dueDate || '', resolution: f.resolution || '', impact: f.impact || '', notes: f.notes || '' });
      continue;
    }
    if (r.type === 'operator') { base(r, 'observation', { text: `Operator need (${[f.role, f.priority].filter(Boolean).join(', ')}): ${f.need || ''}${f.screen ? ' [screen: ' + f.screen + ']' : ''}`, tags: ['operator'], notes: f.notes || '' }); continue; }
    if (r.type === 'observation') { base(r, 'observation', { text: [f.title, f.description].filter(Boolean).join(': ') || f.text || '', tags: f.category ? [f.category] : [], notes: f.notes || '' }); continue; }
    base(r, 'observation', { text: `${r.type}: ` + Object.entries(f).map(([k, x]) => `${k}=${x}`).join('; '), tags: [r.type] });
  }
  // tag links
  for (const t of out.filter(r => r.type === 'tag')) { const p = byOldId[t._plcRef]; if (p?.panelStop) t.f.panelId = p.panelStop.id; delete t._plcRef;
    if (t.f.equipmentId && !out.some(r => r.id === t.f.equipmentId && r.type === 'section')) t.f.equipmentId = ''; }
  // legacy checklist items marked "issue" become Issue records
  for (const s of legacy) for (const i of s.checklist || []) if (i.status === 'issue')
    base(stamp({ id: uid(), visitId: v.id, dayId: v.activeDayId, stopId: s.id, createdBy: s.createdBy, createdAt: i.updatedAt || s.updatedAt }), 'issue',
      { category: 'gap', title: i.text, description: i.note || '', priority: 'Medium', status: 'Open', notes: `From v${from} checklist "${s.name}"` });
  P.records = out;
  /* media */
  P.media.forEach(m => { stamp(m);
    const st = P.stops.find(s => s.id === m.stopId), sh = st?.shots?.find(x => x.id === m.shotId);
    m.photoType = mapPhotoType(m.photoType || sh?.photoType, sh?.text || m.name);
    if (mediaRelink[m.recordId]) { m.stopId = mediaRelink[m.recordId]; m.recordId = ''; }
    if (!m.bid) m.bid = nextBid('media');
    m.capturedAt = m.capturedAt || m.takenAt || m.createdAt;
    delete m.file;
  });
  P.media.sort((a, b) => a.createdAt - b.createdAt).forEach(m => { if (!m.filename) assignMediaName(P, m); });
  v.schemaVersion = SCHEMA_VERSION; v.migratedFrom = from; v.analystSchema = ANALYST_SCHEMA.version;
  notes.unshift(`Upgraded from schema v${from} to v${SCHEMA_VERSION} (Analyst ${ANALYST_SCHEMA.version}): ${legacy.length} old stops kept as legacy, ${out.length} records mapped, ${P.media.length} media renamed`);
  return notes;
}

/* Analyst 2.1.0 filename (tools/naming.py): {Area|Site}_{Subject}_{shot}_{YYYYMMDD}_{INITIALS}-{NNN}-{hex6}.ext
   NNN = the author's per-day sequence, hex6 = first 6 hex of the media sync.uuid. Fixed at capture; never renamed implicitly. */
function mediaTokens(P, m) {
  const st = P.stops.find(s => s.id === m.stopId), rec = m.recordId && P.records.find(r => r.id === m.recordId);
  const area = st?.areaCodes?.[0] || (rec && rec.f.areaId ? (P.stops.find(s => s.id === rec.f.areaId)?.areaCodes?.[0]) : '') || MEDIA_FILENAME.siteArea;
  const inst = rec?.type === 'section' ? (rec.f.instanceIdOverride || rec.f.instanceId || sectionInstanceId(rec.f.equipmentType, rec.f.conveyorNumber)) : '';
  const subject = inst || (st?.kind === 'panel' ? st.panel.label : st?.kind === 'area' ? 'Area' : st?.kind === 'site' ? st.key : 'Legacy');
  const d = new Date(m.capturedAt || m.createdAt || Date.now());
  const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return { area, subject, photoType: m.photoType || 'other', yyyymmdd, initials: fileInitials(m.createdBy) };
}
const _isUuid = x => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x || ''));
function assignMediaName(P, m) {
  const t = mediaTokens(P, m); P.visit.mediaSeq = P.visit.mediaSeq || {};
  if (!_isUuid(m.uuid)) m.uuid = _isUuid(m.id) ? m.id : (crypto.randomUUID ? crypto.randomUUID() : uuid5(SEED_NS, 'media|' + m.id));
  const scope = `${t.initials}|${t.yyyymmdd}`, seq = P.visit.mediaSeq[scope] = (P.visit.mediaSeq[scope] || 0) + 1;
  m.seq = seq; m.filename = mediaFilename({ ...t, seq, uuid: m.uuid, ext: mediaExt(m.mime) });
  if (!m.capName) m.capName = m.filename;   /* 3.7.0 S1: original capture name, never changed by a rename (legacy ID derivation) */
  return m.filename;
}
