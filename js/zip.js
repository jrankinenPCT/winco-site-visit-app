/* Store-only ZIP writer + reader built on Blob parts, so a backup with hundreds of photos never holds
   all media in JS memory at once. Writer: CRC32 comes from the media record (computed once at capture) or is
   computed in 1 MB slices; output is `new Blob([header, blobPart, ...])` - the browser keeps the blobs on disk.
   Reader: parses only the end-of-central-directory + central directory, then returns Blob slices per entry. */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32Update(c, u8) { for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return c; }
const crc32 = u8 => (crc32Update(0xFFFFFFFF, u8) ^ 0xFFFFFFFF) >>> 0;
async function crc32Blob(blob, chunk = 1 << 20) { let c = 0xFFFFFFFF; for (let o = 0; o < blob.size; o += chunk) c = crc32Update(c, new Uint8Array(await blob.slice(o, o + chunk).arrayBuffer())); return (c ^ 0xFFFFFFFF) >>> 0; }
function dosTime(d) { return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; }
/* files: [{name, data: string|Blob|Uint8Array, crc?, date?}] -> Blob (zip32: < 4 GB, < 65535 entries) */
async function makeZip(files, onProgress) {
  const parts = [], central = []; let offset = 0, i = 0;
  for (const f of files) {
    let data = f.data, crc = f.crc;
    if (typeof data === 'string') data = new TextEncoder().encode(data);
    const size = data instanceof Blob ? data.size : data.length;
    if (!crc) crc = data instanceof Blob ? await crc32Blob(data) : crc32(data);
    const name = new TextEncoder().encode(f.name), { time, date } = dosTime(f.date || new Date());
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc >>> 0, true);
    lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(lh.buffer, name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc >>> 0, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(ch.buffer, name);
    offset += 30 + name.length + size;
    if (onProgress) onProgress(++i, files.length);
  }
  const cdSize = central.reduce((a, b) => a + (b.byteLength ?? b.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}
/* -> {name: Blob}; only the directory is read into memory */
/* 3.4.0 (Reviewer S-c): readZipEntries also returns each entry's CRC32 from the central directory so the importer can
   verify every file; readZip keeps its old shape {name: Blob}. */
async function readZip(blob) { return (await readZipEntries(blob)).files; }
async function readZipEntries(blob) {
  const tailLen = Math.min(blob.size, 65557), tailOff = blob.size - tailLen;
  const tail = new Uint8Array(await blob.slice(tailOff).arrayBuffer()), tv = new DataView(tail.buffer);
  let e = tail.length - 22; while (e >= 0 && tv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Not a zip file');
  const n = tv.getUint16(e + 10, true), cdSize = tv.getUint32(e + 12, true), cdOff = tv.getUint32(e + 16, true);
  const cd = new Uint8Array(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer()), dv = new DataView(cd.buffer);
  const out = {}, crcs = {}, sizes = {}; let p = 0;
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt zip directory');
    const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true),
      xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nl));
    if (method !== 0) throw new Error('Compressed zip entries are not supported (' + name + '). Use a zip exported by this app.');
    const lh = new DataView(await blob.slice(lo, lo + 30).arrayBuffer());
    const start = lo + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    out[name] = blob.slice(start, start + size); crcs[name] = crc; sizes[name] = size;
    p += 46 + nl + xl + cl;
  }
  return { files: out, crcs, sizes };
}
/* -> [names whose bytes do not match the central-directory CRC32 / size] */
async function verifyZipEntries(Z) { const bad = []; for (const [n, b] of Object.entries(Z.files)) { if (b.size !== Z.sizes[n] || (await crc32Blob(b)) !== Z.crcs[n]) bad.push(n); } return bad; }
const zipText = b => b.text();
