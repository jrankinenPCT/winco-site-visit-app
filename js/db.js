/* IndexedDB wrapper. Stores: visits, days, stops, records, media (blobs inline) + staging (import replace).
   v2 (DB_VER 2): adds 'staging' so an import Replace is staged, validated, then swapped in ONE transaction. */
const DB_NAME = 'site-visit-pwa', DB_VER = 2, STORES = ['visits', 'days', 'stops', 'records', 'media'];
let _db;
function dbOpen() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of STORES) if (!d.objectStoreNames.contains(s)) {
        const os = d.createObjectStore(s, { keyPath: 'id' });
        if (s !== 'visits') os.createIndex('visitId', 'visitId');
      }
      if (!d.objectStoreNames.contains('staging')) d.createObjectStore('staging', { keyPath: 'key' });
    };
    r.onsuccess = () => { _db = r.result; _db.onversionchange = () => { _db.close(); _db = null; }; res(_db); };
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('Database upgrade blocked by another open tab - close other Site Visit tabs'));
  });
}
async function dbTx(store, mode, fn) {
  const d = await dbOpen();
  return new Promise((res, rej) => {
    let t; try { t = d.transaction(store, mode); } catch (e) { return rej(e); }
    const os = t.objectStore(store);
    let out; let r; try { r = fn(os); } catch (e) { try { t.abort(); } catch (_) {} return rej(e); }
    if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new DOMException('aborted', 'AbortError'));
  });
}
const dbPut = (s, o) => dbTx(s, 'readwrite', os => os.put(o)).then(() => o);
const dbGet = (s, id) => dbTx(s, 'readonly', os => os.get(id));
const dbDel = (s, id) => dbTx(s, 'readwrite', os => os.delete(id));
const dbAll = s => dbTx(s, 'readonly', os => os.getAll());
const dbByVisit = (s, vid) => dbTx(s, 'readonly', os => os.index('visitId').getAll(vid));
const dbKeysByVisit = (s, vid) => dbTx(s, 'readonly', os => os.index('visitId').getAllKeys(vid));
/* one transaction across all stores: either every delete lands or none */
async function dbDeleteVisit(vid) {
  const d = await dbOpen();
  return new Promise((res, rej) => {
    const t = d.transaction(STORES, 'readwrite');
    for (const s of STORES.slice(1)) { const r = t.objectStore(s).index('visitId').getAllKeys(vid); r.onsuccess = () => r.result.forEach(k => t.objectStore(s).delete(k)); }
    t.objectStore('visits').delete(vid);
    t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
/* ---- import Replace: 1) stage  2) validate staged copy  3) atomic swap. Cancel/failed validation = staging cleared, live data untouched. ---- */
async function dbStage(P) {   // P = {visit, days, stops, records, media}; one staging row per object, keyed store|id
  const d = await dbOpen();
  await new Promise((res, rej) => { const t = d.transaction('staging', 'readwrite'), os = t.objectStore('staging'); os.clear();
    os.put({ key: 'visits|' + P.visit.id, store: 'visits', obj: P.visit });
    for (const s of STORES.slice(1)) for (const o of P[s] || []) os.put({ key: s + '|' + o.id, store: s, obj: o });
    t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('staging aborted')); });
}
const dbClearStaging = () => dbTx('staging', 'readwrite', os => os.clear());
async function dbReadStaging() { const rows = await dbAll('staging'), P = { visit: null, days: [], stops: [], records: [], media: [] };
  for (const r of rows) { if (r.store === 'visits') P.visit = r.obj; else P[r.store].push(r.obj); } return P; }
/* swap: put every staged object, delete live objects of that visit that are not in the stage (keeping local media blobs the
   package did not carry - incremental restore chains), clear staging - all inside ONE readwrite transaction. */
async function dbCommitStaging(vid, opts = {}) {
  const d = await dbOpen();
  return new Promise((res, rej) => {
    const t = d.transaction([...STORES, 'staging'], 'readwrite'), st = t.objectStore('staging');
    const r = st.getAll();
    r.onsuccess = () => {
      const staged = r.result, keep = {}; STORES.forEach(s => keep[s] = new Set());
      for (const row of staged) {
        keep[row.store].add(row.obj.id);
        if (row.store === 'media' && !row.obj.blob) { const g = t.objectStore('media').get(row.obj.id);
          g.onsuccess = () => { const local = g.result; t.objectStore('media').put(local && local.blob ? { ...row.obj, blob: local.blob, thumb: row.obj.thumb || local.thumb } : row.obj); }; }
        else t.objectStore(row.store).put(row.obj);
      }
      let left = STORES.length - 1;
      for (const s of STORES.slice(1)) { const k = t.objectStore(s).index('visitId').getAllKeys(vid); k.onsuccess = () => { k.result.forEach(id => { if (!keep[s].has(id)) t.objectStore(s).delete(id); });
        if (--left === 0 && opts.failAfterPuts) t.abort(); /* test hook: every put/delete issued, then abort -> nothing may land */ }; }
      st.clear();
    };
    t.oncomplete = () => res(); t.onerror = () => rej(t.error || new Error('Replace failed - nothing was changed')); t.onabort = () => rej(t.error || new Error('Replace aborted - nothing was changed'));
  });
}
/* the save queue writes everything pending in ONE transaction (all or nothing; QuotaExceededError -> retried) */
async function dbPutMany(items) {   // [[store, obj], ...]
  const d = await dbOpen(), stores = [...new Set(items.map(x => x[0]))];
  return new Promise((res, rej) => {
    let t; try { t = d.transaction(stores, 'readwrite'); } catch (e) { return rej(e); }
    try { for (const [s, o] of items) t.objectStore(s).put(o); } catch (e) { try { t.abort(); } catch (_) {} return rej(e); }
    t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new DOMException('Write aborted', 'AbortError'));
  });
}
