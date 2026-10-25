/* templates.js - seeding (what a new visit contains) and record editor specs.
   Everything Analyst-owned comes from analyst-schema.js (generated) through schema-map.js; nothing here hard-codes
   panel lists, enums or checklist items. */
const SCHEMA_VERSION = 6;        // internal store schema (v1 2026-10 PWA, v2 review §4, v3 Analyst 2.0.0, v4 Analyst 2.1.0, v5 Analyst 3.0.0, v6 Analyst 3.1.0)
const APP_VERSION = '3.7.1';

const AREA_CODES = CK.areas.map(a => a.code);                       // Ambient / Freezer / Cooler
const AREA_SYSTEM = Object.fromEntries(CK.areas.map(a => [a.code, a.system]));
const TRIPS = Object.keys(CK.trips);
const PANEL_SET_KEY = t => t === 'vendor' ? 'vendorPanel' : 'conveyorPanel';

/* ---------- stop (walk-down unit) seeding: site sections, areas, panels (checklist.json) ---------- */
function itemsFor(scope, list) { return list.filter(i => (i.scope || scope) === scope).map(i => i.id); }
function defaultAnswers(itemId, ctx = {}) {
  const it = itemDef(itemId), a = {};
  for (const f of it?.fields || []) {
    if (f.default !== undefined && f.default !== 'previous') a[f.key] = f.default;
    if (ctx.prefill && ctx.prefill[f.key] !== undefined && ctx.prefill[f.key] !== null && ctx.prefill[f.key] !== '') a[f.key] = ctx.prefill[f.key];
  }
  return a;
}
function shotsFor(items, setKey) {
  const out = [], seen = new Set();
  for (const pt of (setKey ? REQUIRED_PHOTO_SETS[setKey] : []) || []) {
    const src = items.flatMap(id => (itemDef(id)?.photos || []).map(p => ({ ...p, itemId: id }))).find(p => p.photoType === pt);
    out.push({ id: uid(), photoType: pt, text: src?.prompt || PHOTO_TYPE[pt]?.label || pt, req: true, itemId: src?.itemId || '', na: false, naReason: '' }); seen.add(pt);
  }
  for (const id of items) for (const p of itemDef(id)?.photos || []) {
    if (seen.has(p.photoType)) continue; seen.add(p.photoType);
    out.push({ id: uid(), photoType: p.photoType, text: p.prompt || PHOTO_TYPE[p.photoType]?.label, req: !!p.required, itemId: id, na: false, naReason: '' });
  }
  return out;
}
function baseStop(visitId, o) {
  const now = Date.now();
  return { id: uid(), visitId, kind: o.kind, key: o.key, name: o.name, group: o.group, order: o.order, areaCodes: o.areaCodes || [], panel: o.panel || null,
    items: o.items || [], resp: o.resp || {}, shots: o.shots || [], trips: o.trips || [], recordStatus: 'open', gates: {}, notes: '',
    createdAt: now, updatedAt: now, ...who() };
}
function seedStops(visitId) {
  const out = []; let order = 0;
  for (const sec of CK.crossCutting) {
    const items = itemsFor('site', sec.items); if (!items.length) continue;
    out.push(baseStop(visitId, { kind: 'site', key: sec.id, name: sec.title, group: 'Site-wide', order: order++, items,
      resp: Object.fromEntries(items.map(id => [id, { state: 'todo', a: defaultAnswers(id), q: {}, note: '' }])), shots: shotsFor(items, null),
      trips: [...new Set(items.flatMap(id => itemDef(id).trips || []))] }));
  }
  for (const a of CK.areas) {
    const items = CK.crossCutting.flatMap(sec => itemsFor('area', sec.items));
    out.push(baseStop(visitId, { kind: 'area', key: a.code, name: `${a.code} area (${a.system})`, group: 'Areas', order: order++, areaCodes: [a.code], items,
      resp: Object.fromEntries(items.map(id => [id, { state: 'todo', a: defaultAnswers(id), q: {}, note: '' }])), shots: shotsFor(items, null), trips: a.trips }));
  }
  for (const p of CK.panels) {
    const items = (CK.panelTemplates[p.panelType] || []).map(i => i.id);
    const prefill = { panelLabel: p.panelLabel, vendorSystem: (p.vendorSystems || []).join('; '), areasServed: p.areas, expectedSectionCount: p.expectedSectionCount,
      'hmiArrays.statusBitMap': p.panelType === 'conveyor' ? STATUS_ENCODING.bitMapSeed() : undefined };
    out.push(baseStop(visitId, { kind: 'panel', key: p.panelLabel, name: p.panelLabel, group: p.areas.length > 1 ? 'Multi-area' : p.areas[0], order: order++, areaCodes: [...p.areas],
      panel: { label: p.panelLabel, idNorm: p.panelIdNormalized, type: p.panelType, vendorSystems: p.vendorSystems || [], flags: p.flags || [], subPanels: p.subPanels || [], expected: p.expectedSectionCount,
        subSystemIds: p.subSystemIds || [], primarySubSystemId: p.primarySubSystemId || null, seedSource: 'VSOW' },
      items, resp: Object.fromEntries(items.map(id => [id, { state: 'todo', a: defaultAnswers(id, { prefill }), q: {}, note: '' }])),
      shots: shotsFor(items, PANEL_SET_KEY(p.panelType)), trips: p.trips }));
  }
  return out;
}
/* A panel discovered on site that is not in the VSOW roster */
function newPanelStop(visitId, label, type, areas, order) {
  const items = (CK.panelTemplates[type] || []).map(i => i.id), prefill = { panelLabel: label, areasServed: areas, 'hmiArrays.statusBitMap': type === 'conveyor' ? STATUS_ENCODING.bitMapSeed() : undefined };
  return baseStop(visitId, { kind: 'panel', key: label, name: label, group: areas.length > 1 ? 'Multi-area' : areas[0], order, areaCodes: areas,
    panel: { label, idNorm: normalizePanelId(label), type, vendorSystems: [], flags: ['Added on site - not in VSOW roster'], subPanels: [], expected: null, seedSource: 'site' },
    items, resp: Object.fromEntries(items.map(id => [id, { state: 'todo', a: defaultAnswers(id, { prefill }), q: {}, note: '' }])), shots: shotsFor(items, PANEL_SET_KEY(type)), trips: [] });
}
const stopTitle = s => s.kind === 'panel' ? `${s.panel.label}${s.panel.vendorSystems.length ? ' · ' + s.panel.vendorSystems.join(' / ') : s.panel.type === 'conveyor' ? ' · conveyor' : ''}` : s.name;
const panelLineOrCell = s => idSafe(s?.resp?.['CP-01']?.a?.lineOrCell || s?.panel?.idNorm || s?.panel?.label || '').replace(/[^A-Za-z0-9_-]/g, '');

/* ---------- record editor specs ---------- [key, label, type, options]
   types: text textarea int num select multi bool date list ref:section ref:panel ref:area ref:screen refs:screen qa held:int */
const ynu = ['true', 'false'];
const REC = {
  section: { label: 'Section / device', icon: '⚙️', bid: false, title: r => [r.f.instanceId || sectionInstanceId(r.f.equipmentType, r.f.conveyorNumber), r.f.name].filter(Boolean).join(' · ') || '(new section)' },
  tag: { label: 'Tag', icon: '🏷️', bid: false, title: r => [r.f.pointFolder, r.f.point].filter(Boolean).join('/') || r.f.plcAddress,
    fields: [['equipmentId', 'Section / device', 'ref:section'], ['panelId', 'Control panel (if no section)', 'ref:panel'], ['pointFolder', 'Point folder', 'select', EN.pointFolder], ['point', 'Point (PackML member, e.g. StateCurrent)', 'point'],
      ['plcAddress', 'PLC address (e.g. HMI_STATUS_CP20[0])'], ['plcDataType', 'PLC data type (BOOL, DINT, REAL…)'], ['dataType', 'Ignition data type (blank = PackML default)', 'select', EN.dataType], ['engUnits', 'Eng. units'],
      ['access', 'Access', 'select', EN.access], ['writeRole', 'Write role', 'select', EN.writeRole], ['tagGroup', 'Tag Group (blank = SUP §4.3 rule)', 'select', EN.tagGroup], ['historized', 'Historized (blank = rule)', 'bool'],
      ['historySampleMode', 'History sample mode (blank = rule)', 'select', EN.historySampleMode], ['historyDeadband', 'History deadband'], ['retentionDays', 'Retention days', 'int'], ['packmlRequired', 'PackML required member', 'bool'],
      ['sourceStatus', 'Source status', 'select', EN.sourceStatus], ['udt', 'UDT (blank = from equipment type)'], ['udtMember', 'UDT member (blank = Folder/Point)'], ['notes', 'Notes', 'textarea']] },
  alarm: { label: 'Alarm', icon: '🚨', bid: 'alarm', title: r => [r.f.deviceId, r.f.alarmCode, r.f.description].filter(Boolean).join(' · '),
    fields: [['panelId', 'Control panel', 'ref:panel'], ['equipmentId', 'Section / device', 'ref:section'], ['deviceId', 'Device ID (blank = section instance ID)'], ['alarmCode', 'Alarm code (DES §7.4)', 'select', EN.alarmCode],
      ['category', 'Category', 'select', EN.alarmCategory], ['description', 'Description (as on alarm banner)'], ['priority', 'Priority (blank = DES §7.4 default for code)', 'select', EN.alarmPriority],
      ['ignitionPriority', 'Ignition priority (blank = proposed map)', 'select', EN.ignitionPriority], ['colorValue', 'Color value (HOLD - not interpreted)', 'held:int'], ['statusNotAlarm', 'Status only, not an alarm', 'bool'],
      ['sourceWord', 'Source word (e.g. HMI_ALARM_CP20[3])'], ['sourceBit', 'Source bit', 'int'], ['sourceTagPath', 'Source tag path'], ['isa95Path', 'ISA-95 path'], ['triggerMode', 'Trigger mode', 'select', EN.triggerMode],
      ['onDelaySec', 'On-delay (s)', 'num'], ['deadband', 'Deadband'], ['operatorResponse', 'Operator response', 'textarea'], ['consequence', 'Consequence'], ['notificationPipeline', 'Notification pipeline'],
      ['shelvingAllowed', 'Shelving allowed', 'bool'], ['rationalized', 'Rationalized', 'bool'], ['source', 'Source', 'select', EN.alarmSource], ['notes', 'Notes', 'textarea']] },
  screen: { label: 'Screen (nav matrix)', icon: '🖥️', bid: false, title: r => [r.f.screenCode, r.f.name].filter(Boolean).join(' · '),
    fields: [['screenCode', 'Screen code (O-01, M-02, E-01, A-01)'], ['codeStatus', 'Code status', 'select', EN.codeStatus], ['layer', 'Layer', 'select', EN.layer], ['altitude', 'Altitude', 'select', EN.altitude],
      ['name', 'Screen name'], ['viewFolder', 'View folder'], ['fullViewName', 'Full view name'], ['areaId', 'Area', 'ref:area'], ['subArea', 'Sub-area'], ['panelId', 'Control panel', 'ref:panel'],
      ['parentScreenId', 'Parent screen', 'ref:screen'], ['navigatesTo', 'Navigates to', 'refs:screen'], ['viewParams', 'View params (; separated)', 'list'], ['optoGroups', 'Opto groups', 'multi', EN.optoGroup],
      ['permissionKey', 'Permission key'], ['equipmentTypes', 'Equipment types', 'multi', EN.screenEquipmentType || EN.equipmentType], ['commandsExposed', 'Commands exposed (; separated)', 'list'], ['docRef', 'Doc refs (e.g. DES §7.2.1.1; SUP §11)'], ['notes', 'Notes', 'textarea']] },
  issue: { label: 'Issue', icon: '⚠️', bid: 'issue', title: r => r.f.title,
    fields: [['category', 'Category', 'select', EN.issueCategory], ['title', 'Title'], ['description', 'Description', 'textarea'], ['priority', 'Priority', 'select', EN.issuePriority], ['status', 'Status', 'select', EN.issueStatus],
      ['areaId', 'Area', 'ref:area'], ['panelId', 'Control panel', 'ref:panel'], ['equipmentId', 'Section / device', 'ref:section'], ['impact', 'Impact'], ['deliverables', 'Deliverables affected', 'multi', EN.deliverable],
      ['owner', 'Owner'], ['ownerOrg', 'Owner org', 'select', EN.issueOwnerOrg], ['dueDate', 'Due date', 'date'], ['resolution', 'Resolution', 'textarea'], ['docRef', 'Source refs (e.g. DES §8.11)'], ['notes', 'Notes', 'textarea']] },
  observation: { label: 'Observation', icon: '👁️', bid: 'observation', title: r => String(r.f.text || '').slice(0, 80),
    fields: [['text', 'What did you see?', 'textarea'], ['areaId', 'Area', 'ref:area'], ['panelId', 'Control panel', 'ref:panel'], ['equipmentId', 'Section / device', 'ref:section'], ['tags', 'Keywords (; separated)', 'list'], ['notes', 'Notes', 'textarea']] },
  interview: { label: 'Interview', icon: '🧑‍🏭', bid: 'interview', title: r => [r.f.interviewee, r.f.role].filter(Boolean).join(' · '),
    fields: [['interviewee', 'Interviewee'], ['role', 'Role'], ['org', 'Organisation'], ['qa', 'Q&A - one per line:  question :: answer', 'qa'], ['notes', 'Notes', 'textarea']] }
};
const REC_DEFAULTS = { issue: { category: 'gap', priority: 'Medium', status: 'Open' }, alarm: { category: 'Alarm', source: 'proposed' }, tag: { sourceStatus: 'exists_unverified', access: 'R' }, screen: { codeStatus: 'proposed' } };
const ADDABLE = ['issue', 'observation', 'tag', 'alarm', 'interview', 'screen'];
