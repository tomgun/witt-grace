// The pure half of the supporter packages (scripts/build-static.ts): one HTML file out of a build's parts, and a
// zip archive of a package's files. No file system, no clock: the caller passes the parts and the date.
import { createHash } from 'node:crypto';
import { crc32, deflateRawSync } from 'node:zlib';

export interface BuildParts {
  /** The built index.html, with its module script and stylesheet link. */
  html: string;
  /** The single script chunk. */
  script: string;
  /** The single stylesheet, fonts inlined as data: addresses. */
  style: string;
  /** The text of the embedded JSON data block (src/lib/embedded.ts `embeddedJson`). */
  embedded: string;
}

const SCRIPT_TAG = /<script type="module"[^>]*\ssrc="[^"]*"[^>]*><\/script>/;
const STYLE_TAG = /<link[^>]*rel="stylesheet"[^>]*>/;
const PRELOAD_TAG = /\s*<link[^>]*rel="modulepreload"[^>]*>/g;
const CSP_TAG = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")[^"]*(")/;

/**
 * One self-contained page: script and style inline, the data block before the script, and a content security
 * policy that allows exactly this script (by hash), inline styles, data: fonts and images, and wss: for the
 * collaboration the person starts. Nothing is loaded from beside the file, so it opens from a disk.
 */
export function inlineBuild({ html, script, style, embedded }: BuildParts): string {
  for (const [name, tag] of [
    ['module script', SCRIPT_TAG],
    ['stylesheet link', STYLE_TAG],
    ['content security policy', CSP_TAG],
  ] as const)
    if (!tag.test(html)) throw new Error(`inlineBuild: the built page has no ${name}`);
  const code = script.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  const hash = createHash('sha256').update(code, 'utf8').digest('base64');
  const policy = [
    "default-src 'none'",
    `script-src 'sha256-${hash}'`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    'connect-src wss:',
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return html
    .replace(PRELOAD_TAG, '')
    .replace(CSP_TAG, (_all, before: string, after: string) => `${before}${policy}${after}`)
    .replace(STYLE_TAG, () => `<style>${style.replace(/<\/style/gi, '<\\/style')}</style>`)
    .replace(
      SCRIPT_TAG,
      () =>
        `<script type="application/json" id="wittEmbedded">${embedded}</script>\n    <script type="module">${code}</script>`
    );
}

export interface ZipEntry {
  name: string;
  data: Buffer;
}

/** A zip archive (deflate, UTF-8 names) of `entries`, every file dated `when`. */
export function zip(entries: readonly ZipEntry[], when: Date): Buffer {
  const time = (when.getUTCHours() << 11) | (when.getUTCMinutes() << 5) | (when.getUTCSeconds() >> 1);
  const date = ((when.getUTCFullYear() - 1980) << 9) | ((when.getUTCMonth() + 1) << 5) | when.getUTCDate();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const packed = deflateRawSync(entry.data, { level: 9 });
    const shared = Buffer.alloc(26);
    shared.writeUInt16LE(20, 0); // version needed
    shared.writeUInt16LE(0x0800, 2); // UTF-8 names
    shared.writeUInt16LE(8, 4); // deflate
    shared.writeUInt16LE(time, 6);
    shared.writeUInt16LE(date, 8);
    shared.writeUInt32LE(crc32(entry.data), 10);
    shared.writeUInt32LE(packed.length, 14);
    shared.writeUInt32LE(entry.data.length, 18);
    shared.writeUInt16LE(name.length, 22);
    shared.writeUInt16LE(0, 24);
    const local = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), shared, name, packed]);
    const tail = Buffer.alloc(14);
    tail.writeUInt32LE(offset, 10);
    centrals.push(Buffer.concat([Buffer.from([0x50, 0x4b, 0x01, 0x02, 20, 0]), shared, tail, name]));
    locals.push(local);
    offset += local.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
