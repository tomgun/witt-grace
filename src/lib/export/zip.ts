// A minimal ZIP writer (stored entries, no compression, UTF-8 names) for the PNG tile bundle, byte-for-byte the
// prototype's `zipStored`. Pure: bytes in, bytes out.
export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (crcTable[(c ^ b) & 255] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u16 = (data: Uint8Array, p: number, v: number) => {
  data[p] = v & 255;
  data[p + 1] = (v >>> 8) & 255;
};
const u32 = (data: Uint8Array, p: number, v: number) => {
  u16(data, p, v & 65535);
  u16(data, p + 2, v >>> 16);
};

/** The ZIP file bytes for the entries in order. */
export function zipStoredBytes(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  const add = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  for (const entry of entries) {
    const name = enc.encode(entry.name);
    const bytes = entry.bytes;
    if (name.length > 65535 || bytes.length > 0xffffffff) throw new Error('ZIP entry too large');
    const crc = crc32(bytes);
    const start = offset;
    const local = new Uint8Array(30 + name.length);
    u32(local, 0, 0x04034b50);
    u16(local, 4, 20);
    u16(local, 6, 0x800);
    u16(local, 8, 0);
    u32(local, 14, crc);
    u32(local, 18, bytes.length);
    u32(local, 22, bytes.length);
    u16(local, 26, name.length);
    local.set(name, 30);
    add(local);
    add(bytes);
    const central = new Uint8Array(46 + name.length);
    u32(central, 0, 0x02014b50);
    u16(central, 4, 20);
    u16(central, 6, 20);
    u16(central, 8, 0x800);
    u32(central, 16, crc);
    u32(central, 20, bytes.length);
    u32(central, 24, bytes.length);
    u16(central, 28, name.length);
    u32(central, 42, start);
    central.set(name, 46);
    directory.push(central);
  }
  const directoryStart = offset;
  for (const entry of directory) add(entry);
  const directoryLength = offset - directoryStart;
  if (entries.length > 65535 || offset > 0xffffffff) throw new Error('ZIP too large');
  const ending = new Uint8Array(22);
  u32(ending, 0, 0x06054b50);
  u16(ending, 8, entries.length);
  u16(ending, 10, entries.length);
  u32(ending, 12, directoryLength);
  u32(ending, 16, directoryStart);
  add(ending);
  const out = new Uint8Array(offset);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
/** The same bytes as a downloadable Blob. */
export const zipStored = (entries: ZipEntry[]): Blob =>
  new Blob([zipStoredBytes(entries)], { type: 'application/zip' });
