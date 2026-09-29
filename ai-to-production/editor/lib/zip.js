// Minimal store-only (no compression) ZIP writer for the browser.
// Enough for HTML/CSS/JS/PNG. No dependencies. Returns a Uint8Array.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 over a Uint8Array. Returns a signed 32-bit int; caller may `>>> 0`. */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(v) { return [v & 0xff, (v >>> 8) & 0xff]; }
function u32(v) { return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]; }

/**
 * Build a ZIP archive.
 * @param {Array<{path:string, bytes:Uint8Array}>} files
 * @returns {Uint8Array}
 */
export function buildZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.path);
    const crc = crc32(f.bytes);
    const size = f.bytes.length;
    // Local file header
    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(size), ...u32(size),
      ...u16(nameBytes.length), ...u16(0),
    ];
    const localHeader = Uint8Array.from(local);
    chunks.push(localHeader, nameBytes, f.bytes);
    // Central directory record
    const cd = [
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(size), ...u32(size),
      ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset),
    ];
    central.push({ header: Uint8Array.from(cd), name: nameBytes });
    offset += localHeader.length + nameBytes.length + f.bytes.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) {
    chunks.push(c.header, c.name);
    centralSize += c.header.length + c.name.length;
  }

  const eocd = Uint8Array.from([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(centralStart), ...u16(0),
  ]);
  chunks.push(eocd);

  const totalLen = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(totalLen);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}
