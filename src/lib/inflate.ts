// Unpacks the payload of a packed draft link (S-15, 2026-11-20): base64url (or plain base64) of zlib-compressed
// UTF-8 text, with the browser's own DecompressionStream. Untrusted input: the output is capped while it is read.

/** The text packed in `payload`; throws when it is not base64, not zlib data, or unpacks to more than `maxBytes`. */
export async function inflateBase64Url(payload: string, maxBytes: number): Promise<string> {
  const base64 = payload.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('TOO_LARGE');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(out);
}

/** The reverse: `text` as base64url of its zlib-compressed UTF-8 bytes, as short as a link payload gets. */
export async function deflateBase64Url(text: string): Promise<string> {
  const packed = await new Response(
    new Blob([text]).stream().pipeThrough(new CompressionStream('deflate'))
  ).arrayBuffer();
  let binary = '';
  for (const byte of new Uint8Array(packed)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A link that carries a whole document (S-15, 2026-11-20): `<app address>#doc=z.<packed JSON>`. */
export const DOC_LINK_PREFIX = '#doc=z.';
/** Longer links than this are not offered: messengers and link shorteners cut them. */
export const DOC_LINK_LIMIT = 30000;

/** The link for `json` at the app address `base` (its own fragment and query dropped). */
export async function buildDocLink(base: string, json: string): Promise<string> {
  const url = new URL(base);
  return `${url.origin}${url.pathname}${DOC_LINK_PREFIX}${await deflateBase64Url(json)}`;
}

/** The JSON text a document link carries, or null when `fragment` is not one; throws when it cannot be unpacked. */
export async function readDocLink(fragment: string, maxBytes: number): Promise<string | null> {
  if (!fragment.startsWith(DOC_LINK_PREFIX)) return null;
  return inflateBase64Url(fragment.slice(DOC_LINK_PREFIX.length), maxBytes);
}
