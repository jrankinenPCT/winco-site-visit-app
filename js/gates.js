/* gates.js - 1:1 port of the Analyst's tools/gates.py (schema 3.0.0): the two verify gates, attest fields and ref_errors,
   plus SV_SCHEMA, a small JSON-Schema 2020-12 validator for the keywords schema.json uses (exit-1 checks in the app).
   walkdown gate: required fields with gate=walkdown and requiredAt <= phase, plus required photos with requiredAt <= phase.
                  Intro-level fields accept unknown/blocked (listed in satisfiedByUnknown).
   attest:        (3.0.0) a walkdown field with `attest` ({values:[yes,no], anyPhase}) counts at EVERY phase and is done only
                  with one of attest.values - never via the intro unknown/blocked soft-accept (Equipment.presentOnSite).
   data gate:     required fields with gate=data (any phase); unknown/blocked/empty do not count.
   Pure functions over a schema.json-shaped document, so the app's UI and its export agree with validate.py. */
const GATES = (() => {
  const PHASE_ORDER = Object.fromEntries(CK.phases.order.map((p, i) => [p, i]));   // intro 0, commissioning 1, closeout 2
  const SOFT = ['unknown', 'blocked'];
  const _get = (o, path) => { for (const k of String(path).split('.')) { if (!o || typeof o !== 'object' || Array.isArray(o) || !(k in o)) return null; o = o[k]; } return o; };
  const _empty = v => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) || (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
  function phaseFor(areaCode, trips) {
    const apt = CK.phases.areaPhaseTrips, pt = apt[areaCode || 'Ambient'] || apt.Ambient; let best = 'intro';
    for (const [ph, trip] of Object.entries(pt)) if ((trips || []).includes(trip) && PHASE_ORDER[ph] > PHASE_ORDER[best]) best = ph;
    return best;
  }
  function evaluate(fields, photos, valueOf, photoTypes, phase) {
    const lim = PHASE_ORDER[phase], out = {};
    for (const gate of ['walkdown', 'data']) {
      let tot = 0, done = 0; const missing = [], soft = [];
      for (const f of fields) {
        if (!f.required || f.gate !== gate) continue;
        const att = gate === 'walkdown' ? f.attest : null;
        if (att) { tot++; const v = valueOf(f); if (att.values.includes(v)) done++; else missing.push(f.key); continue; }   /* any phase, explicit values only */
        if (gate === 'walkdown' && PHASE_ORDER[f.requiredAt] > lim) continue;
        tot++; const v = valueOf(f);
        if (_empty(v)) { missing.push(f.key); continue; }
        if (typeof v === 'string' && SOFT.includes(v)) { if (gate === 'walkdown' && f.requiredAt === 'intro') { soft.push(f.key); done++; } else missing.push(f.key); continue; }
        done++;
      }
      if (gate === 'walkdown') for (const p of photos) {
        if (!p.required || PHASE_ORDER[p.requiredAt] > lim) continue;
        tot++; if (photoTypes.has(p.photoType)) done++; else missing.push('photo:' + p.photoType);
      }
      out[gate] = { requiredTotal: tot, requiredDone: done, missing, satisfiedByUnknown: soft, passed: !missing.length };
    }
    return out;
  }
  function completeness(fields, photos, valueOf, photoTypes, phase) {
    const g = evaluate(fields, photos, valueOf, photoTypes, phase), w = g.walkdown, d = g.data;
    return { phase, walkdown: w, data: d, requiredTotal: w.requiredTotal + d.requiredTotal, requiredDone: w.requiredDone + d.requiredDone,
      missing: [...w.missing, ...d.missing], gatePassed: w.passed && d.passed };
  }
  const _answers = (doc, match) => { const out = {};
    for (const r of doc.checklistResponses || []) if (Object.entries(match).every(([k, v]) => r[k] === v)) for (const a of r.answers || []) out[a.fieldKey] = a.value ?? null;
    return out; };
  const _valueFn = (record, entity, answers) => f => { const m = f.mapsTo || '';
    if (m.startsWith(entity + '.')) { const v = _get(record, m.slice(entity.length + 1)); if (!_empty(v)) return v; }
    return answers[f.key] ?? null; };
  const _mediaTypes = (doc, match) => new Set((doc.media || []).filter(m => Object.entries(match).every(([k, v]) => m[k] === v) && !(m.sync || {}).deletedAt).map(m => m.photoType));
  function expandPackml(st, fields) {
    const out = [];
    for (const f of fields) { if (f.key !== 'packml') { out.push(f); continue; }
      for (const k of st.completenessGate.data.filter(x => x.startsWith('packml.'))) out.push({ ...f, key: k, mapsTo: 'Equipment.' + k, label: k.split('.').slice(1).join('.') }); }
    return out;
  }
  const panelFields = type => { const tpl = CK.panelTemplates[type] || []; return { fields: tpl.flatMap(it => it.fields), photos: tpl.flatMap(it => it.photos || []) }; };
  const sectionFields = type => { const st = CK.sectionTemplate; return { fields: expandPackml(st, [...st.quickFields, ...st.fullFields, ...(st.typeOverlays[type] || [])]), photos: st.photos }; };
  const AREA_ITEMS = CK.crossCutting.flatMap(s => s.items).filter(it => it.scope === 'area');
  const ITEMS = Object.fromEntries(CK.crossCutting.flatMap(s => s.items).map(it => [it.id, it]));
  function compute(doc) {
    const areas = Object.fromEntries((doc.areas || []).map(a => [a.id, a.code])), res = {};
    for (const p of doc.controlPanels || []) { const { fields, photos } = panelFields(p.panelType);
      res[p.id] = completeness(fields, photos, _valueFn(p, 'ControlPanel', _answers(doc, { panelId: p.id })), _mediaTypes(doc, { panelId: p.id }), phaseFor(areas[p.primaryAreaId], p.trips)); }
    for (const e of doc.equipment || []) { if (!e.conveyorNumber) continue; const { fields, photos } = sectionFields(e.equipmentType);
      res[e.id] = completeness(fields, photos, _valueFn(e, 'Equipment', _answers(doc, { equipmentId: e.id })), _mediaTypes(doc, { equipmentId: e.id }), phaseFor(areas[e.areaId], e.trips)); }
    for (const a of doc.areas || []) { const ans = {};
      for (const it of AREA_ITEMS) Object.assign(ans, _answers(doc, { checklistItemId: it.id, instanceKey: a.code }));
      res[a.id] = completeness(AREA_ITEMS.flatMap(it => it.fields), AREA_ITEMS.flatMap(it => it.photos || []), f => ans[f.key] ?? null, _mediaTypes(doc, { areaId: a.id }), phaseFor(a.code, a.trips)); }
    for (const r of doc.checklistResponses || []) { const it = ITEMS[r.checklistItemId]; if (!it) continue;
      const ans = Object.fromEntries((r.answers || []).map(x => [x.fieldKey, x.value ?? null]));
      const area = areas[r.areaId] || (r.instanceKey in CK.phases.areaPhaseTrips ? r.instanceKey : null);
      res[r.id] = completeness(it.fields, it.photos || [], f => ans[f.key] ?? null, new Set(), phaseFor(area, r.trips)); }
    return res;
  }
  const ALLOWED = { walkdown_verified: ['walkdown'], data_verified: ['data'], verified: ['walkdown', 'data'] };
  /* best recordStatus the gates allow (never upgrades past what the user asked for) */
  const statusFor = (c, want = 'verified') => { const w = c.walkdown.passed, d = c.data.passed;
    if (want === 'verified') return w && d ? 'verified' : w ? 'walkdown_verified' : d ? 'data_verified' : 'open';
    if (want === 'walkdown_verified') return w ? want : 'open'; if (want === 'data_verified') return d ? want : 'open'; return want; };
  const allows = (c, status) => (ALLOWED[status] || []).every(g => c[g].passed);
  function statusErrors(doc) {
    const comp = compute(doc), errs = [];
    for (const recs of Object.values(doc)) { if (!Array.isArray(recs)) continue;
      for (const r of recs) { if (!r || typeof r !== 'object' || !(r.id in comp)) continue; const c = comp[r.id];
        for (const g of ALLOWED[r.recordStatus] || []) if (!c[g].passed) errs.push(`${r.id}: recordStatus=${r.recordStatus} but ${g} gate fails ${JSON.stringify(c[g].missing.slice(0, 4))}`);
        if (r.completeness != null && JSON.stringify(r.completeness) !== JSON.stringify(c)) errs.push(`${r.id}: stored completeness differs from tools/gates.py`); } }
    return errs;
  }
  /* 3.0.0 gates.ref_errors: every SUB-/PNL-/AREA- reference resolves to a seeded checklist id or a record in the document */
  function refErrors(doc) {
    const known = { SUB: new Set([...CK.subSystems.map(s => s.id), ...(doc.subSystems || []).map(s => s.id)]),
      PNL: new Set([...CK.panels.map(p => p.panelId), ...(doc.controlPanels || []).map(p => p.id)]),
      AREA: new Set([...CK.areas.map(a => 'AREA-' + a.code), ...(doc.areas || []).map(a => a.id)]) };
    const keys = { subSystemId: 'SUB', primarySubSystemId: 'SUB', subSystemIds: 'SUB', panelId: 'PNL', panelIds: 'PNL', areaId: 'AREA', primaryAreaId: 'AREA' }, errs = [];
    for (const [coll, recs] of Object.entries(doc)) { if (!Array.isArray(recs)) continue;
      for (const r of recs) { if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
        for (const [k, kind] of Object.entries(keys)) { const v = r[k];
          for (const x of Array.isArray(v) ? v : v ? [v] : []) if (!known[kind].has(x)) errs.push(`${r.id || coll}: ${k} '${x}' is not a seeded/known ${kind} id`); } } }
    return errs;
  }
  /* 3.1.0 gates.attestation_warnings: advisories only (validate.py prints WARN, never fails) */
  const ATTESTED = ['presenceAttestedBy', 'presenceAttestedAt'];
  function attestationWarnings(doc) {
    const areas = Object.fromEntries((doc.areas || []).map(a => [a.id, a.code])), out = [];
    for (const e of doc.equipment || []) { const st = e.recordStatus;
      if (['walkdown_verified', 'verified'].includes(st) && ['yes', 'no'].includes(e.presentOnSite) && !ATTESTED.every(k => e[k]))
        out.push(`${e.id}: recordStatus=${st}, presentOnSite=${e.presentOnSite} but no presenceAttestedBy/At (pre-3.1.0 record?)`);
      if (e.conveyorNumber && ['data_verified', 'verified'].includes(st) && phaseFor(areas[e.areaId], e.trips) === 'intro')
        out.push(`${e.id}: recordStatus=${st} on the intro trip - Trip 1 sections are expected to stop at walkdown_verified ('Seen')`); }
    return out;
  }
  return { attestationWarnings, ATTESTED, refErrors, PHASE_ORDER, SOFT, phaseFor, evaluate, completeness, expandPackml, panelFields, sectionFields, compute, statusErrors, statusFor, allows, ALLOWED, _get, _empty };
})();

/* SV_SCHEMA: JSON Schema 2020-12 subset (the keywords schema.json uses: $ref allOf anyOf if/then/else type enum const pattern
   minimum maximum minLength items minItems uniqueItems required dependentRequired properties additionalProperties propertyNames format). Errors as
   "path: message". Used to reject a seed import that seed_import.py would exit 1 on, and to check records before export.
   validate.py (jsonschema) stays the reference; tests compare both on the Analyst sample and negative cases. */
const SV_SCHEMA = (() => {
  const ROOT = { ...AS.root, $defs: AS.defs }, rx = {};
  const re = p => rx[p] || (rx[p] = new RegExp(p, 'u'));
  const FMT = { date: v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z')),
    'date-time': v => /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/.test(v) && !isNaN(Date.parse(v)),
    uuid: v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), email: v => /^[^@\s]+@[^@\s]+$/.test(v) };
  const typeOk = (t, v) => t === 'null' ? v === null : t === 'array' ? Array.isArray(v) : t === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v)
    : t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' && isFinite(v) : t === 'boolean' ? typeof v === 'boolean' : t === 'string' ? typeof v === 'string' : true;
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const resolve = ref => ref.replace(/^#\//, '').split('/').reduce((o, k) => o[k.replace(/~1/g, '/').replace(/~0/g, '~')], ROOT);
  function check(s, v, path, out) {
    if (s === true || s == null) return; if (s === false) { out.push(`${path}: not allowed`); return; }
    if (s.$ref) check(resolve(s.$ref), v, path, out);
    if (s.type) { const ts = [].concat(s.type); if (!ts.some(t => typeOk(t, v))) { out.push(`${path}: ${JSON.stringify(v)?.slice(0, 40)} is not of type ${ts.join('/')}`); return; } }
    if ('const' in s && !eq(s.const, v)) out.push(`${path}: must be ${JSON.stringify(s.const)}`);
    if (s.enum && !s.enum.some(x => eq(x, v))) out.push(`${path}: ${JSON.stringify(v)} is not one of ${JSON.stringify(s.enum).slice(0, 80)}`);
    if (typeof v === 'string') { if (s.minLength != null && [...v].length < s.minLength) out.push(`${path}: shorter than ${s.minLength}`);
      if (s.pattern && !re(s.pattern).test(v)) out.push(`${path}: '${v}' does not match ${s.pattern}`);
      if (s.format && FMT[s.format] && !FMT[s.format](v)) out.push(`${path}: '${v}' is not a ${s.format}`); }
    if (typeof v === 'number') { if (s.minimum != null && v < s.minimum) out.push(`${path}: ${v} < ${s.minimum}`); if (s.maximum != null && v > s.maximum) out.push(`${path}: ${v} > ${s.maximum}`); }
    if (Array.isArray(v)) { if (s.minItems != null && v.length < s.minItems) out.push(`${path}: fewer than ${s.minItems} items`);
      if (s.uniqueItems && new Set(v.map(x => JSON.stringify(x))).size !== v.length) out.push(`${path}: items not unique`);
      if (s.items) v.forEach((x, i) => check(s.items, x, `${path}[${i}]`, out)); }
    if (typeOk('object', v)) {
      for (const k of s.required || []) if (!(k in v)) out.push(`${path}: '${k}' is required`);
      for (const [k, deps] of Object.entries(s.dependentRequired || {})) if (k in v) for (const d of deps) if (!(d in v)) out.push(`${path}: '${d}' is required when '${k}' is present`);
      const props = s.properties || {};
      for (const [k, x] of Object.entries(v)) { if (k in props) check(props[k], x, `${path}.${k}`, out);
        else if (s.additionalProperties !== undefined) check(s.additionalProperties, x, `${path}.${k}`, out);
        if (s.propertyNames) check(s.propertyNames, k, `${path}{${k}}`, out); } }
    for (const sub of s.allOf || []) check(sub, v, path, out);
    if (s.anyOf) { const ok = s.anyOf.some(sub => { const o = []; check(sub, v, path, o); return !o.length; }); if (!ok) out.push(`${path}: matches none of anyOf`); }
    if (s.if !== undefined) { const o = []; check(s.if, v, path, o); if (!o.length) { if (s.then !== undefined) check(s.then, v, path, out); } else if (s.else !== undefined) check(s.else, v, path, out); }
  }
  const validate = (v, def) => { const out = []; check(def ? AS.defs[def] : ROOT, v, def || '$', out); return out; };
  return { validate };
})();
