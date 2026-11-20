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
