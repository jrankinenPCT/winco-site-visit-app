/* schema-map.js - the ONE place that binds the app to the Site Visit Analyst's canonical schema.
   Raw enums / checklist / export headers come from js/analyst-schema.js (generated from ../system by
   tools/gen_analyst.py; never hand-edited). This file holds every RULE that uses them, as data where possible:
   site defaults, hierarchy, path + filename templates, ID formats, statuses + verify gates, required-field
   profiles, the two status encodings, tag-group rules, CSV dialect, redaction and seed-import hooks.
   Gate logic itself is js/gates.js (1:1 port of the Analyst's tools/gates.py). */
const AS = ANALYST, EN = AS.enums;
const ANALYST_SCHEMA = { version: AS.version, $id: AS.id, checklistVersion: AS.checklist.checklistVersion, sourceHash: AS.sourceHash };

/* ---------- site / tag model (SUP §1.4, §1.6, §3) ---------- */
const SITE_DEFAULTS = { ...AS.site, siteName: 'WinCo Foods Ellensburg DC', customer: 'WinCo Foods', timezone: 'America/Los_Angeles', architectureModel: 'TBD' };
const siteOf = B => ({ ...SITE_DEFAULTS, ...(B.visit.site || {}) });

/* ---------- hierarchy (checklist.json "hierarchy") ----------
   2.1.0: Area -> SubSystem -> ControlPanel -> Section. The Sub-System code IS the ISA-95 LineOrCell segment
   (SUP §1.1), so tag paths ({lineOrCell}) follow it; seeded Sub-Systems come from checklist.json subSystems. */
const HIERARCHY = [...AS.checklist.hierarchy];                       // ['Area','SubSystem','ControlPanel','Section']
const SUBSYSTEM_CODE_RE = new RegExp(AS.model.SUBSYSTEM_CODE_PATTERN || '^[A-Za-z0-9_-]{2,32}$');
const SUBSYSTEM_KIND = AS.defs.SubSystem.properties.kind.enum, SUBSYSTEM_SEED = AS.defs.SubSystem.properties.seedSource.enum;
const subSystemId = (area, code) => `SUB-${area}-${code}`;
/* all Sub-Systems for a visit: seeded (checklist.json) + added on site (visit.subSystems) */
const subSystemsOf = B => [...AS.checklist.subSystems, ...((B && B.visit && B.visit.subSystems) || [])];
const subSystemById = (B, id) => subSystemsOf(B).find(x => x.id === id);
const subSystemsForArea = (B, area) => subSystemsOf(B).filter(x => x.area === area);
const seedPanel = label => AS.checklist.panels.find(p => p.panelLabel === label);
const HIERARCHY_LABEL = { Area: 'Area', ControlPanel: 'Control panel', Section: 'Section', SubSystem: 'Sub-system' };

/* ---------- path templates (exports.md OptoWesPath / ISA95Path / LegacyCPPath; tools/build_exports.py) ---------- */
const PATH_TEMPLATES = {
  optoWes: '[{optoProvider}]{runtimeRoot}/{area}/{lineOrCell}/{equipmentType}/{instanceId}/{folder}/{point}',
  isa95: '[{tagProvider}]{enterprise}/{siteCode}/{area}/{lineOrCell}/{equipmentType}/{instanceId}/{folder}/{point}',
  legacyCp: '{panelIdNormalized}/{areaBlock}/{subArea}/{point}'      // DES §6.3; only for 5-digit conveyor numbers
};
const fillTpl = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const tidyPath = p => p.replace(/(?<!\])\/{2,}/g, '/').replace(/\/$/, '');
function tagPaths(site, x) {   // x = {area, lineOrCell, equipmentType, instanceId, folder, point, panelIdNormalized, conveyorNumber}
  const v = { ...site, ...x };
  const cn = String(x.conveyorNumber || '');
  const legacy = x.panelIdNormalized && /^\d{5}$/.test(cn) ? fillTpl(PATH_TEMPLATES.legacyCp, { ...v, areaBlock: +cn[0] * 10000, subArea: cn.slice(1) }) : '';
  return { optoWesPath: tidyPath(fillTpl(PATH_TEMPLATES.optoWes, v)), isa95Path: tidyPath(fillTpl(PATH_TEMPLATES.isa95, v)), legacyCpPath: legacy };
}

/* ---------- business IDs (schema: prefixed, stable, never reused) ---------- */
const ID_PREFIX = { visit: 'VIS', area: 'AREA', panel: 'PNL', section: 'EQ', tag: 'TAG', alarm: 'ALM', screen: 'SCR', issue: 'ISS', media: 'MED', observation: 'OBS', interview: 'INT', checklist: 'CLR', day: 'DAY' };
const ID_WIDTH = 4;                                                  // ISS-0001, ALM-0001, MED-0001 (sample-data.json)
const idSafe = s => String(s ?? '').replace(/[^A-Za-z0-9._()-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
/* 3.6.0 (Reviewer M2): human-readable IDs carry the author's device code - ISS-JR-0003, OBS-KL-0012, MED-JR-0007 - so two phones never
   mint the same ID. Schema patterns ^ISS-[A-Za-z0-9._()-]+$ etc. allow it. Legacy unprefixed IDs (ISS-0003) stay valid. */
const seqId = (kind, n, code) => `${ID_PREFIX[kind]}-${code ? code + '-' : ''}${String(n).padStart(ID_WIDTH, '0')}`;
/* 3.7.0 S2: optional single-digit suffix when two people share initials (JR, JR2) - still matches ^ISS-[A-Za-z0-9._()-]+$ */
const validDevCode = c => /^[A-Z]{2,4}[0-9]?$/.test(String(c || ''));
const bidCode = b => { const m = /^[A-Z]+-([A-Z]{2,4}[0-9]?)-\d+(?:-[0-9a-f]{6})?$/.exec(b || ''); return m ? m[1] : ''; };

/* ---------- instance IDs (schema Equipment.instanceId; SUP §1.4; tag-naming.md D4) ---------- */
const INSTANCE_ID = { re: new RegExp(AS.patterns.instanceId), conveyorRe: new RegExp(AS.patterns.conveyorNumber), minDigits: 3,
  hint: '{Abbr}-{NNN}[-NN], 3-6 digits + optional letter + optional 2-digit suffix (MDR-20101, PE-20101-02, DIV-004A)' };
const abbrOf = type => AS.equipmentTypes[type]?.abbr || 'OTH';
const udtOf = type => AS.equipmentTypes[type]?.udt || '';
/* nth=1 -> bare (PE-20101); nth>=2 -> PE-20101-02 (tools/naming.py instance_id; Equipment.instanceSuffix 2-99) */
const sectionInstanceId = (type, conv, nth = 1) => conv ? (+nth >= 2 ? `${abbrOf(type)}-${conv}-${String(+nth).padStart(2, '0')}` : `${abbrOf(type)}-${conv}`) : '';
const validInstanceId = id => INSTANCE_ID.re.test(String(id || ''));
/* next ID keeps >= 3 digits: SCN-09 -> SCN-010, MDR-20101 -> MDR-20102, DIV-004A -> DIV-005A, 20199 -> 20200 */
function nextInstanceId(id, step = 1) {
  const m = String(id || '').trim().match(/^(.*?)(\d+)([A-Z]?)$/);
  if (!m) return '';
  return m[1] + String(+m[2] + (+step || 1)).padStart(Math.max(m[2].length, INSTANCE_ID.minDigits), '0') + m[3];
}
const nextConveyorNumber = (n, step = 1) => nextInstanceId(n, step);
/* generic "next name" for non-ID clones (screens, observations) */
function nextName(s) { s = String(s || '').trim(); const m = s.match(/^(.*?)(\d+)(\D*)$/); if (!m) return s ? s + ' 2' : ''; return m[1] + String(+m[2] + 1).padStart(m[2].length, '0') + m[3]; }
/* panel label MCP-20 -> CP-020 (DES §6.3; checklist.json panelIdNormalized) */
function normalizePanelId(label) { const m = String(label || '').match(/^[A-Z]*-?0*(\d{1,3})([A-Z]?)(\(.*\))?$/); return m ? `CP-${m[1].padStart(3, '0')}${m[2]}` : null; }

/* ---------- record status + verify gates (review §4; schema RecordStatus) ----------
   v2.1 "walkdown verified" + "data verified": add a second gate here, e.g.
   { id:'walkdown', label:'Walkdown verified', profile:'walkdown' }, { id:'data', label:'Data verified', profile:'data' };
   recordStatus becomes 'verified' only when every gate in VERIFY_GATES has passed. */
/* Analyst answer 2 (2026-10-25): on Trip 1 (intro phase) sections stop at walkdown_verified; the UI calls that "Seen".
   Display label only - the stored/exported value stays walkdown_verified. */
const INTRO_STATUS_LABEL = { walkdown_verified: 'Seen ✓' };
/* Analyst answer 1: presentOnSite = blocked -> offer an access-constraint Issue linked to the section (Issue.category enum has no
   'access' value; 'gap' = information that could not be captured). Edit here, not in app.js. */
/* 3.1.0: = checklist uiHints.blockedAccessIssue.prefill (sample ISS-0021): title 'Access constraint: {instanceId}', category gap. */
const ACCESS_ISSUE = (() => { const h = AS.checklist.uiHints?.blockedAccessIssue?.prefill || {};
  return { category: EN.issueCategory.includes(h.category) ? h.category : 'gap', priority: h.priority || 'Medium', status: h.status || 'Open', deliverables: h.deliverables || ['DeviceInventory'],
    titlePrefix: 'Access constraint', title: iid => `Access constraint: ${iid}` }; })();
/* Analyst answer 3: shared vendor panels whose Sub-System / Area assignment is provisional until ISS-0020 closes.
   3.7.2: driven by checklist.json, same rule as tools/gates.shared_vendor_panel (used by seed_import.py):
   checklist.panels[] with panelType 'vendor' and more than one entry in areas. Matched on the panel label, panelId (without PNL-),
   the label without its "(A-I)" suffix and every listed sub-panel (MCP-50A..MCP-50I, also written MCP-50-A); leading zeros
   in the number are ignored (MCP-1 = MCP-01). Read live from the checklist on every call, so a new checklist needs no code change. */
const PROVISIONAL_SUBSYSTEM = { issueId: 'ISS-0020', marker: 'provisional, see ISS-0020',
  sourceRef: AS.checklist.uiHints?.provisionalSubSystem?.sourceRef || { doc: 'review', section: 'ISS-0020', detail: 'subSystemFallback=panelPrimary' } };
const sharedVendorPanels = () => (AS.checklist.panels || []).filter(p => p.panelType === 'vendor' && (p.areas || []).length > 1);
const provKey = x => String(x || '').toUpperCase().replace(/\s+/g, '').replace(/^PNL-/, '').replace(/-0+(?=\d)/g, '-');
const provKeys = () => { const k = new Set();
  for (const p of sharedVendorPanels()) { const base = String(p.panelLabel || '').replace(/\(.*\)$/, '');
    [p.panelLabel, p.panelId, base].forEach(x => x && k.add(provKey(x)));
    for (const sp of p.subPanels || []) { k.add(provKey(sp)); const m = String(sp).match(/^(.*\d)([A-Z])$/i); if (m) k.add(provKey(m[1] + '-' + m[2])); } }
  k.delete(''); return k; };
const provisionalPanelLabels = () => sharedVendorPanels().map(p => p.panelLabel);
const isProvisionalPanel = p => { if (!p) return false; const K = provKeys();
  return [p.label, p.panelLabel, p.panelId || p.id].filter(Boolean).some(x => K.has(provKey(x))); };
/* 3.1.0 (additive, coming): presenceAttestedBy / presenceAttestedAt. The app stores r.attest.presentOnSite = { by, at(ms) };
   this map is the rename. 3.1.0: ON - emitted (both or neither, ISO UTC) whenever the exported presentOnSite is yes/no and the schema defines them. */
const ATTEST_EXPORT_MAP = { presentOnSite: { by: 'presenceAttestedBy', at: 'presenceAttestedAt' } };
const RECORD_STATUS = Object.fromEntries(EN.recordStatus.map(s => [s, { open: 'Open', walkdown_verified: 'Walkdown ✓', data_verified: 'Data ✓', verified: 'Verified ✓✓', na: 'N/A' }[s] || s]));
/* 2.1.0: two gates (checklist fieldMeta.gateRule; schema if/then). recordStatus = the gates that passed. */
const VERIFY_GATES = [{ id: 'walkdown', label: 'Walkdown verified', status: 'walkdown_verified' }, { id: 'data', label: 'Data verified', status: 'data_verified' }];
const isVerified = st => ['walkdown_verified', 'data_verified', 'verified'].includes(st);
const isDone = st => st === 'verified' || st === 'na';
const CHECKLIST_STATE = Object.fromEntries(EN.checklistState.map(s => [s, { todo: 'To do', done: '✓ Done', na: 'N/A', blocked: '⛔ Blocked' }[s] || s]));

/* ---------- required-field profiles ----------
   Defaults come from the Analyst: checklist field.required, sectionTemplate.completenessGate, and each schema
   def's "required" list. REQUIRED_OVERRIDES[trip][scope] replaces a set for one trip/profile
   (v2.1 "far fewer required fields for Trip 1": REQUIRED_OVERRIDES.Trip1 = { section: { verified: [...] }, items: { 'CP-02': ['plc.make'] } }). */
const REQUIRED_OVERRIDES = {};
const SYS_FIELDS = ['id', 'sync', 'recordStatus'];
const RECORD_REQUIRED = { tag: AS.required.Tag, alarm: AS.required.Alarm, screen: AS.required.Screen, issue: AS.required.Issue, observation: AS.required.Observation, interview: AS.required.Interview };
const DERIVED_FIELDS = { tag: ['optoWesPath'], issue: ['raisedAt'], observation: ['observedAt'], interview: ['at'] };  // filled by the app
/* 2.1.0: each checklist field carries required / requiredAt / source / gate (checklist fieldMeta). requiredFor()
   is for UI asterisks only; the gates themselves are evaluated by js/gates.js. */
const FIELD_SOURCE_LABEL = { field: 'walk-down', owner: 'owner / KPI', desk: 'desk', program: 'PLC program' };
const reqBadge = f => f && f.required ? `${f.requiredAt}${f.gate === 'data' ? ' · data' : ''}` : '';
function requiredFor(B, scope, key) {
  const o = REQUIRED_OVERRIDES[B?.visit?.trip]?.[scope];
  if (scope === 'section') return (o && o[key]) || AS.checklist.sectionTemplate.completenessGate[key] || [];
  if (scope === 'items') { const it = itemDef(key); return (o && o[key]) || (it?.fields || []).filter(f => f.required).map(f => f.key); }
  return ((o && o[key]) || RECORD_REQUIRED[key] || []).filter(f => !SYS_FIELDS.includes(f) && !(DERIVED_FIELDS[key] || []).includes(f));
}

/* ---------- status encodings (2.1.0: DEVELOPER-NOTES #4/#5; replaces the 2.0 HELD placeholder) ----------
   Encoding 1 'statusWord' = DES §8.11 colour enum 0-15 (highest wins) -> HMIArrays.statusEnumValuesInUse, Alarm.colorValue.
   Encoding 2 'equipmentValues' = XLSX §2 raw PLC values by equipment type (MDR 0/4/8/16 = bit weights) ->
   HMIArrays.equipmentValuesInUse / statusBitMap[] and Alarm.sourceBit.  Equipment values are NOT range-checked
   against 0-15 (DEVELOPER-NOTES gotcha). Tables come from tools/model.py via analyst-schema.js. */
const STATUS_ENCODING = {
  held: false, encodings: AS.statusEncodings,                                   // ordinalEnum | bitField | mixed | unknown
  tables: { statusWord: AS.statusWord, equipmentValues: AS.statusEquipValues },
  enumMax: AS.defs.Alarm.properties.colorValue.maximum ?? 15,
  fields: { enum: ['ControlPanel.hmiArrays.statusEnumValuesInUse', 'Alarm.colorValue'], equipment: ['ControlPanel.hmiArrays.equipmentValuesInUse', 'ControlPanel.hmiArrays.statusBitMap', 'Alarm.sourceBit'] },
  enumOptions: () => Object.entries(AS.statusWord).map(([k, v]) => `${k} ${v}`),
  optionsFor: field => field.options || [],
  toInt: v => { const m = String(v ?? '').match(/^\s*(-?\d+)/); return m ? +m[1] : null; },
  label: v => v === null || v === undefined || v === '' ? '' : `${v} ${AS.statusWord[String(v)] || '?'}`,
  validEnum: v => Number.isInteger(v) && v >= 0 && v <= 15,
  /* seed rows for the panel's statusBitMap (checklist statusBitMapSeed) -> StatusBitDef */
  bitMapSeed: (types) => (AS.checklist.statusBitMapSeed || []).filter(r => !types || types.includes(r.equipmentType))
    .map(r => ({ equipmentType: r.equipmentType, value: r.value, bit: r.bit, meaning: r.meaning, mapsToEnum: r.mapsToEnum, mapsToEnumCandidates: r.candidates || [], source: 'XLSX', confirmed: false }))
};
const STATUS_BIT_SOURCES = AS.defs.StatusBitDef.properties.source.enum;

/* ---------- tag rules (SUP §4.3 / §5.2 / §5.3) - port of tools/build_exports.py tag_rules ---------- */
function tagRules(folder, point) {
  const p = String(point || '');
  if (folder === 'StatusPoints' && p.startsWith('EquipmentInterlock/')) return ['TG_Fast', true, 'OnChange', 'On change', 90];
  if (folder === 'StatusPoints' && ['StateCurrent', 'Running', 'Faulted', 'UnitModeCurrent'].includes(p)) return ['TG_Standard', true, 'OnChange', 'On change', 90];
  if (folder === 'StatusPoints' && ['MachSpeed', 'CurMachSpeed'].includes(p)) return ['TG_Standard', true, 'Periodic', '0.1% span or 1 unit', 90];
  if (folder === 'StatusPoints' && p === 'CommsOK') return ['TG_Standard', true, 'OnChange', 'On change', 90];
  if (folder === 'StatusPoints') return ['TG_OnChange', false, 'None', '', null];
  if (folder === 'AdminPoints' && p.startsWith('Prod') && p.endsWith('Count')) return ['TG_History', true, 'Periodic', '0', 395];
  if (folder === 'AdminPoints' && (p.startsWith('Runtime') || p === 'MTBF')) return ['TG_Slow', true, 'Periodic', '0.1% span or 1 unit', 395];
  if (folder === 'AdminPoints') return ['TG_OnChange', false, 'None', '', null];
  if (folder === 'Recipe') return ['TG_Manual', false, 'None', '', null];
  if (folder === 'IO') return ['TG_Diagnostic', true, 'OnChange', 'On change', 30];
  if (folder === 'ControlPoints') return ['TG_Standard', false, 'None', '', null];
  if (folder === '_System') return ['TG_Standard', true, 'OnChange', 'On change', 90];
  return ['TG_Standard', false, 'None', '', null];
}
const packmlType = (folder, point) => (AS.packml[folder] || []).find(m => m[0] === point)?.[1] || '';
const PACKML_TO_SOURCE = { available: 'exists_unverified', derivable: 'derived', missing: 'required_missing' };   // "Create PackML tags" (unknown/na skipped)

/* ---------- alarms (DES §7.4) ---------- */
const ALARM_DEFAULT_PRIORITY = { 'E-Stop': 'P1', Fault: 'P1', Jam: 'P2', Full: 'P3' };   // from AS.alarmPriorityText
const IGNITION_PRIORITY_FOR = p => AS.ignitionPriorityProposed[p] || '';

/* ---------- photos (schema Media.photoType, checklist requiredPhotoSets) ---------- */
const PHOTO_LABEL = { overview: 'Overview', nameplate: 'Nameplate', panel_exterior: 'Panel exterior / label', panel_interior: 'Panel interior', plc_rack: 'PLC rack', io_card: 'IO cards',
  network_switch: 'Network switch', existing_hmi: 'Existing HMI', layout: 'Layout / drawing', drawing: 'Drawing', device: 'Device / section', sensor: 'Sensor', vfd: 'VFD', stack_light: 'Stack light',
  video_operation: 'Video of operation', other: 'Other' };
const PHOTO_TYPES = EN.photoType.map(k => [k, PHOTO_LABEL[k] || k, k.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('')]);
const PHOTO_TYPE = Object.fromEntries(PHOTO_TYPES.map(([k, l, t]) => [k, { label: l, token: t }]));
const REQUIRED_PHOTO_SETS = AS.checklist.requiredPhotoSets;           // union (2.1.0 #12) - display only
const REQUIRED_PHOTO_BY_PHASE = AS.checklist.requiredPhotoSetsByPhase; // gate uses each photo's requiredAt (gates.js)
const REQUIRED_PHOTO_NA_ALLOWED = [];                                  // gates.py has no photo N/A: a required photo must exist

/* ---------- media filename (2.1.0 #6; port of tools/naming.py media_filename) ----------
   {Area|Site}_{Subject}_{shot-type}_{YYYYMMDD}_{INITIALS}-{NNN}-{uuid6}.{ext}
   NNN = the author's per-day counter; uuid6 = first 6 hex of Media.sync.uuid. Both are fixed at capture. */
const MEDIA_FILENAME = {
  template: '{area}_{subject}_{shot}_{date}_{initials}-{seq}-{hex6}', seqScope: '{initials}|{date}', seqWidth: 3, siteArea: 'Site',
  ext: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'audio/mp4': 'm4a', 'application/pdf': 'pdf' }
};
const initialsOf = name => String(name || '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().replace(/[^A-Z]/g, '');
/* author initials must be 2-4 letters (pattern [A-Z]{2,4}); 1 letter is padded with X, >4 truncated */
const fileInitials = name => { const i = initialsOf(name) || 'XX'; return (i.length < 2 ? i + 'X' : i).slice(0, 4); };
const sanitizeSubject = label => String(label || '').replace(/[()]/g, '').replace(/[^A-Za-z0-9-]/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '') || 'Unknown';
const shotSlug = t => String(t || 'other').replace(/_/g, '-');
function mediaFilename({ area, subject, photoType, yyyymmdd, initials, seq, uuid, ext = 'jpg' }) {
  const a = /^[A-Z][A-Za-z0-9]{1,23}$/.test(area || '') ? area : MEDIA_FILENAME.siteArea;
  return fillTpl(MEDIA_FILENAME.template, { area: a, subject: sanitizeSubject(subject), shot: shotSlug(photoType), date: yyyymmdd, initials: fileInitials(initials),
    seq: String(seq).padStart(MEDIA_FILENAME.seqWidth, '0'), hex6: String(uuid || '').replace(/-/g, '').slice(0, 6).toLowerCase() }) + '.' + ext;
}
const mediaExt = mime => MEDIA_FILENAME.ext[String(mime || '').split(';')[0]] || (String(mime || '').split('/')[1] || 'bin').split(';')[0];

/* ---------- CSV exports (exports.md; exports/*.csv) ---------- */
const EXPORT_KEYS = Object.keys(AS.exports);                          // tag-mapping-matrix, alarm-mapping-matrix, device-inventory, navigation-matrix, issue-log
const CSV_COLUMNS = Object.fromEntries(EXPORT_KEYS.map(k => [k, AS.exports[k].cols]));
const CSV_DIALECT = { bom: false, eol: '\r\n' };                      // matches the Analyst header files byte-for-byte (Python csv QUOTE_MINIMAL)
const SENSITIVE_COLUMNS = { 'device-inventory': ['IPAddress'] };      // blank in shared exports unless the visit approves sharing

/* ---------- section seed import hook (v2.1: CSV / L5X) ----------
   Each importer returns [{conveyorNumber, equipmentType, driveType, name, location:{level,columnGrid}, parentInstanceId, ...}].
   'l5x' is a seam only: add {label, accept, parse(text) -> rows} when the format is agreed. */
const SEED_CSV_ALIASES = { conveyorNumber: ['conveyornumber', 'conveyor', 'section', 'number', 'conveyor_number'], equipmentType: ['equipmenttype', 'type'], driveType: ['drivetype', 'drive'],
  name: ['name', 'description', 'devicename'], 'location.level': ['level'], 'location.columnGrid': ['columngrid', 'grid', 'physicallocation'], parentInstanceId: ['parentinstanceid', 'parent'], instanceId: ['instanceid'] };
function parseCsvText(text) {
  const rows = []; let row = [], cell = '', q = false; text = String(text).replace(/^\ufeff/, '');
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
/* ---------- seeding (2.1.0 #10; 1:1 port of tools/seed_import.py + import-format.md) ----------
   CSV: header must be exactly SECTION_SEED_COLUMNS (BOM tolerated). L5X: parsed in-browser with DOMParser.
   Both produce Equipment records {id: EQ-{iid}, sync.uuid: uuid5(NS, id)} identical to seed_import.py, so a
   re-import is idempotent and the Python tool and the PWA agree byte-for-byte on ids. */
const SEED_NS = AS.seedNamespace;                                        // 6f1c2a52-... (build_sample.py / seed_import.py)
const SEED_TYPE_MAP = AS.seedTypeMap.map(([rx, t]) => [new RegExp(rx, 'i'), t]);
const SEED_CONV_RE = /(?<!\d)(\d{5})(?!\d)/;
function sha1Bytes(bytes) {                                               // small sync SHA-1 (uuid5 needs it; SubtleCrypto is async)
  const l = bytes.length, n = ((l + 8) >> 6) + 1, w = new Uint32Array(n * 16);
  for (let i = 0; i < l; i++) w[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  w[l >> 2] |= 0x80 << (24 - (l % 4) * 8); w[n * 16 - 1] = l * 8;
  let [a0, b0, c0, d0, e0] = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0]; const W = new Uint32Array(80), rl = (x, k) => (x << k) | (x >>> (32 - k));
  for (let blk = 0; blk < n * 16; blk += 16) {
    for (let t = 0; t < 80; t++) W[t] = t < 16 ? w[blk + t] : rl(W[t - 3] ^ W[t - 8] ^ W[t - 14] ^ W[t - 16], 1);
    let a = a0, b = b0, c = c0, d = d0, e = e0;
    for (let t = 0; t < 80; t++) { const f = t < 20 ? (b & c) | (~b & d) : t < 40 ? b ^ c ^ d : t < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = t < 20 ? 0x5A827999 : t < 40 ? 0x6ED9EBA1 : t < 60 ? 0x8F1BBCDC : 0xCA62C1D6, tmp = (rl(a, 5) + f + e + k + W[t]) >>> 0; e = d; d = c; c = rl(b, 30) >>> 0; b = a; a = tmp; }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0; e0 = (e0 + e) >>> 0; }
  const out = new Uint8Array(20); [a0, b0, c0, d0, e0].forEach((v, i) => { out[i * 4] = v >>> 24; out[i * 4 + 1] = (v >>> 16) & 255; out[i * 4 + 2] = (v >>> 8) & 255; out[i * 4 + 3] = v & 255; }); return out;
}
function uuid5(ns, name) {
  const nb = String(ns).replace(/-/g, '').match(/../g).map(h => parseInt(h, 16)), h = sha1Bytes(new Uint8Array([...nb, ...new TextEncoder().encode(name)])).slice(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80; const x = [...h].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
const normalizePanelStrict = label => { const m = String(label || '').match(/^MCP-(\d+)([A-Z]?)/); return m ? `CP-${String(+m[1]).padStart(3, '0')}${m[2]}` : null; };
const SEED_COLUMNS = AS.model.SECTION_SEED_COLUMNS;
function seedParseCsv(text) {
  const [h, ...rows] = parseCsvText(text);
  if (!h || h.join(',') !== SEED_COLUMNS.join(',')) throw new Error('Seed CSV header must be exactly: ' + SEED_COLUMNS.join(','));
  return rows.map(r => Object.fromEntries(SEED_COLUMNS.map((c, i) => [c, (r[i] || '').trim()])));
}
function seedParseL5x(text, fileName, panel) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('Not a valid L5X/XML file');
  const kids = (el, name) => el ? [...el.children].filter(c => c.tagName === name) : [];
  const tags = [];
  for (const ctl of xml.getElementsByTagName('Controller')) for (const ts of kids(ctl, 'Tags')) tags.push(...kids(ts, 'Tag'));            // .//Controller/Tags/Tag
  for (const ps of xml.getElementsByTagName('Programs')) for (const pg of kids(ps, 'Program')) for (const ts of kids(pg, 'Tags')) tags.push(...kids(ts, 'Tag'));
  const idx = {};
  for (const t of tags) if (/^HMI_STATUS_CP\d+/.test(t.getAttribute('Name') || ''))
    for (const cs of kids(t, 'Comments')) for (const c of kids(cs, 'Comment')) { const m = SEED_CONV_RE.exec(c.textContent || ''), o = /^\[(\d+)\]/.exec(c.getAttribute('Operand') || ''); if (m && o && !(m[1] in idx)) idx[m[1]] = o[1]; }
  const rows = [], seen = new Set();
  for (const t of tags) { const name = t.getAttribute('Name') || '', dt = t.getAttribute('DataType') || '';
    if (name.startsWith('HMI_') || seen.has(name)) continue;
    const hit = SEED_TYPE_MAP.find(([rx]) => rx.test(dt)), m = SEED_CONV_RE.exec(name); if (!hit || !m) continue;
    seen.add(name); const etype = hit[1], desc = ((kids(t, 'Description')[0] || {}).textContent || '').trim();
    const r = { PanelLabel: panel, ConveyorNumber: m[1], EquipmentType: etype, DeviceName: desc, StatusArrayIndex: etype !== 'Photoeye' ? (idx[m[1]] || '') : '',
      PLCTag: name, Source: 'L5X', SourceRef: `${fileName} ${dt}` };
    rows.push(Object.fromEntries(SEED_COLUMNS.map(c => [c, r[c] || '']))); }
  return rows;
}
/* port of seed_import.to_equipment (3.0.0): -> {equipment, warnings, errors, exitCode}. References come from checklist.json, never
   built from strings: panelId = checklist.panels[].panelId, subSystemId = SUB-{area}-{SubSystemCode} (must be seeded) or the panel's
   own Sub-System in the area, lineOrCell = that Sub-System's code. exitCode as seed_import.py: 2 = any skipped row or bad
   reference/value (errors[]), 1 = schema errors only, 0 = clean. The app merges ONLY on 0 (no partial merge). */
function seedToEquipment(rows, { area, at = new Date().toISOString(), by = 'JR', device = 'pwa', trip = 'Trip1' }) {
  const sync = rid => ({ uuid: uuid5(SEED_NS, rid), createdAt: at, updatedAt: at, createdBy: by, updatedBy: by, deviceId: device, syncStatus: 'local', version: 1, baseVersion: null, deletedAt: null, conflictOf: null, lastSyncedAt: null });
  const CKP = Object.fromEntries(AS.checklist.panels.map(p => [p.panelLabel, p])), CKS = Object.fromEntries(AS.checklist.subSystems.map(x => [x.id, x]));
  const out = [], warn = [], err = [], nth = {}, first = {}, fallback = [];
  if (!AS.checklist.areas.some(x => x.code === area)) return { equipment: [], warnings: [], errors: [`--area '${area}' is not a checklist area`], schemaErrors: [], exitCode: 2 };
  rows.forEach((r, i) => { const n = i + 2, et = r.EquipmentType;
    if (!AS.equipmentTypes[et]) { err.push(`row ${n}: unknown EquipmentType '${et}' - skipped`); return; }
    if (!AS.model.SEED_SOURCES.includes(r.Source)) { err.push(`row ${n}: Source '${r.Source}' not in ${AS.model.SEED_SOURCES.join('/')} - skipped`); return; }
    const pnl = CKP[r.PanelLabel];
    if (!pnl) { err.push(`row ${n}: PanelLabel '${r.PanelLabel}' is not in checklist.panels - skipped`); return; }
    if (!pnl.areas.includes(area)) { err.push(`row ${n}: panel ${r.PanelLabel} is not listed in area ${area} (VSOW areas ${pnl.areas.join('/')}) - skipped`); return; }
    const inArea = pnl.subSystemIds.filter(x => CKS[x]?.area === area); let sid, isFb = false;
    if (r.SubSystemCode) { sid = `SUB-${area}-${r.SubSystemCode}`;
      if (!CKS[sid]) { err.push(`row ${n}: SubSystemCode '${r.SubSystemCode}' -> ${sid} is not a seeded Sub-System - skipped`); return; }
      if (!inArea.includes(sid)) warn.push(`row ${n}: ${sid} is not one of ${r.PanelLabel}'s Sub-Systems ${inArea.join('/')} (allowed; confirm)`); }
    else { sid = inArea.includes(pnl.primarySubSystemId) ? pnl.primarySubSystemId : inArea[0]; isFb = true;
      if (!sid) { err.push(`row ${n}: panel ${r.PanelLabel} has no Sub-System in ${area} - skipped`); return; } }
    const abbr = abbrOf(et), cn = r.ConveyorNumber, k = cn + '|' + abbr; nth[k] = (nth[k] || 0) + 1;
    const want = r.InstanceSuffix ? parseInt(r.InstanceSuffix, 10) : nth[k];
    if (r.InstanceSuffix && want !== nth[k] && want !== 1) warn.push(`row ${n}: InstanceSuffix ${want} differs from file order (${nth[k]}) - using ${want}`);
    const iid = sectionInstanceId(et, cn, want); if (!validInstanceId(iid)) { err.push(`row ${n}: cannot build instance id from ${abbr}/'${cn}' - skipped`); return; }
    if (!(cn in first)) first[cn] = iid;
    const loc = Object.fromEntries([['level', r.Level], ['columnGrid', r.ColumnGrid], ['layoutRef', r.LayoutRef], ['dockDoor', r.DockDoor]].filter(([, v]) => v));
    const detail = [r.PLCTag ? `PLCTag=${r.PLCTag}` : '', r.StatusArrayIndex ? `StatusArrayIndex=${r.StatusArrayIndex}` : ''].filter(Boolean).join('; ');
    const rec = { id: `EQ-${iid}`, sync: sync(`EQ-${iid}`), recordStatus: 'open', trips: [trip], equipmentType: et, udt: udtOf(et), instanceId: iid, conveyorNumber: cn,
      panelId: pnl.panelId, areaId: `AREA-${area}`, lineOrCell: CKS[sid].code, subSystemId: sid,
      seedSource: r.Source === 'L5X' ? 'L5X' : ['CSV', 'manual'].includes(r.Source) ? 'CSV' : r.Source === 'DWG' ? 'drawing' : 'VSOW', presentOnSite: 'unknown', captureMode: 'quick',
      sourceRefs: [{ doc: 'import', ...(r.SourceRef ? { section: r.SourceRef } : {}), ...(detail ? { detail } : {}) }] };
    if (want >= 2) rec.instanceSuffix = want; if (r.DeviceName) rec.name = r.DeviceName; if (r.DriveType) rec.driveType = r.DriveType;
    if (Object.keys(loc).length) rec.location = loc; if (r.SequenceInRun) rec.sequenceInRun = parseInt(r.SequenceInRun, 10); if (r.Notes) rec.notes = r.Notes;
    if (r.ParentConveyorNumber) { if (r.ParentConveyorNumber in first) rec.parentInstanceId = first[r.ParentConveyorNumber]; else err.push(`row ${n}: ParentConveyorNumber ${r.ParentConveyorNumber} not seen earlier in the file (parent left unset)`); }
    if (isFb) fallback.push(rec.id); out.push(rec); });
  const ids = out.map(e => e.id), dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))].sort();
  for (const d of dup) err.push(`duplicate id ${d} (set InstanceSuffix)`);
  if (typeof GATES !== 'undefined') err.push(...GATES.refErrors({ equipment: out }).map(x => 'reference: ' + x));     // belt and braces, as seed_import.py
  const schemaErrors = typeof SV_SCHEMA !== 'undefined' ? out.flatMap(e => SV_SCHEMA.validate(e, 'Equipment').map(x => `${e.id}: ${x}`)) : [];
  return { equipment: out, fallback, warnings: warn, errors: err, schemaErrors, exitCode: err.length ? 2 : schemaErrors.length ? 1 : 0 };
}
/* canonical ControlPanel.id (3.0.0): checklist.panels[].panelId; panels added on site use naming.panel_id = PNL- + sanitized label */
const panelIdFor = label => seedPanel(label)?.panelId || 'PNL-' + sanitizeSubject(label);
const SEED_IMPORTERS = {
  csv: { label: 'Seed from CSV', accept: '.csv,text/csv', rows: (text) => seedParseCsv(text) },
  l5x: { label: 'Seed from L5X', accept: '.l5x,.L5X,.xml,application/xml,text/xml', rows: (text, fileName, panel) => seedParseL5x(text, fileName, panel) },
  toEquipment: seedToEquipment
};

/* ---------- checklist lookups ---------- */
const CK = AS.checklist;
const ITEM_INDEX = (() => { const m = {}; for (const [t, items] of Object.entries(CK.panelTemplates)) items.forEach(i => m[i.id] = { ...i, template: t });
  CK.crossCutting.forEach(sec => sec.items.forEach(i => m[i.id] = { ...i, section: sec.id })); return m; })();
const itemDef = id => ITEM_INDEX[id];
const SECTION_FIELDS = [...CK.sectionTemplate.quickFields, ...CK.sectionTemplate.fullFields];

/* ---------- 2.1.0 field helpers ---------- */
const _resolveDef = d => d && d.$ref ? AS.defs[d.$ref.split('/').pop()] : d;
function schemaAt(entity, path) { let d = AS.defs[entity]; for (const k of String(path).split('.')) { d = _resolveDef(d); d = d?.properties?.[k]; if (!d) return null; } return _resolveDef(d); }
/* may this required field take 'unknown' / 'blocked'? Only on the intro walk-down gate (gates.py SOFT rule), and only where the
   record can hold the word: mapsTo null (answer lives on the ChecklistResponse) or a free string / an enum that lists it. */
function softAllowed(fd) {
  if (!fd || !fd.required || fd.requiredAt !== 'intro' || fd.gate !== 'walkdown') return false;
  if (!fd.mapsTo) return true; const [ent, ...p] = fd.mapsTo.split('.'); if (!p.length) return true;
  return softFits(ent, p.join('.'), 'unknown');
}
function softFits(entity, path, val) { const s = schemaAt(entity, path); if (!s) return true; if (s.enum) return s.enum.includes(val);
  if (s.pattern || s.format) return false; return [].concat(s.type || 'string').includes('string'); }
/* statusBitMap rows <-> text lines (same notation as the device-inventory StatusBitMap column, full meaning kept) */
const bitMapLine = r => `${r.equipmentType || 'Any'}:${r.value == null ? '' : r.value}${r.bit == null ? '' : '/b' + r.bit}=${r.meaning || ''}${r.mapsToEnum == null ? '' : '->' + r.mapsToEnum}${r.confirmed ? '' : '?'}`;
function parseBitMapLine(line) {
  const m = /^\s*([^:=]*):\s*(\d*)\s*(?:\/b(\d+))?\s*=\s*(.*?)\s*(?:->\s*(\d+))?\s*(\?)?\s*$/.exec(line || ''); if (!m || !m[4]) return null;
  const n = x => x === undefined || x === '' ? null : +x, et = m[1].trim() || 'Any', value = n(m[2]), bit = n(m[3]), confirmed = !m[6];
  if (value === null && bit === null) return null;
  const seed = (AS.checklist.statusBitMapSeed || []).find(r => r.equipmentType === et && (r.value ?? null) === value && (r.bit ?? null) === bit);
  return { equipmentType: et, value, bit, meaning: m[4], mapsToEnum: n(m[5]), mapsToEnumCandidates: seed?.candidates || [], source: seed && !confirmed ? 'XLSX' : 'site', confirmed };
}
const INTERLOCK_KINDS = AS.defs.Interlock.properties.kind.enum;
const interlockLine = x => [x.signal, x.kind, x.direction, x.otherInstanceId || x.otherDescription].map(y => y ?? '').join(' | ');
function parseInterlockLine(line) {
  const [signal, kind, direction, other] = String(line || '').split('|').map(x => x.trim()); if (!signal) return null;
  return { signal, kind: INTERLOCK_KINDS.includes(kind) ? kind : 'other', direction: ['in', 'out'].includes(direction) ? direction : undefined,
    ...(other ? (validInstanceId(other) ? { otherInstanceId: other } : { otherDescription: other }) : {}) };
}
