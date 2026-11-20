/**
 * must: a document link is `<app address>#doc=z.<base64url of the zlib-compressed JSON>`, built on the app's
 *       address without its own fragment or query; reading it gives back the JSON exactly (non-ASCII included);
 *       another fragment is not a document link; a cut link is refused, not half-read (S-15, owner 2026-11-20)
 * test: tests/unit/doc-link.test.ts
 * red-against: the old fragment or query kept in the link, base64 with + and / that a URL mangles, text packed as
 *              Latin-1, `#draft=` or `#join=` read as a document, a truncated payload returning partial JSON
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOC_LINK_PREFIX, buildDocLink, readDocLink } from '../../src/lib/inflate.ts';

test('a document link carries the JSON there and back', async () => {
  const json = JSON.stringify({
    title: 'Etätyö vai lähityö? 日本語 100 %',
    filler: 'perustelu '.repeat(400),
  });
  const link = await buildDocLink('https://example.org/witt/?x=1#join=abc', json);
  assert.ok(link.startsWith('https://example.org/witt/#doc=z.'));
  assert.match(link.slice('https://example.org/witt/#doc=z.'.length), /^[A-Za-z0-9_-]+$/);
  assert.ok(link.length < json.length / 4, 'repetitive text packs well');
  const fragment = link.slice(link.indexOf('#'));
  assert.equal(await readDocLink(fragment, 5_000_000), json);
  assert.equal(await readDocLink('#draft=z.abc', 5_000_000), null);
  assert.equal(await readDocLink('#join=abc', 5_000_000), null);
  assert.equal(await readDocLink('', 5_000_000), null);
  await assert.rejects(readDocLink(fragment.slice(0, DOC_LINK_PREFIX.length + 20), 5_000_000));
});
