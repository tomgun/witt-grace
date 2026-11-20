/**
 * must: a supporter package's page is one file: the script and the stylesheet are inline, the data block with the
 *       edition and the examples sits before the script and cannot end its own element, nothing points beside the
 *       file, and the content security policy allows exactly that script by its hash; a build without the expected
 *       parts is refused; the data block is read back, and a missing, malformed or unknown one gives the hosted
 *       site's defaults; the zip archive lists every file with its size and checksum (owner 2026-11-20, S-15)
 * test: tests/unit/static-package.test.ts
 * red-against: a `$&` in the script expanded by String.replace, `</script>` inside the code or the data ending the
 *              element early, the policy hash taken before escaping, an unknown edition shown as a badge, the zip's
 *              directory offset or checksum wrong so it cannot be unpacked
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { crc32, inflateRawSync } from 'node:zlib';
import { embeddedJson, parseEmbedded, servedOverWeb } from '../../src/lib/embedded.ts';
import { inlineBuild, zip } from '../../scripts/static-package.ts';

const HTML = `<!doctype html>
<html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'" />
<script type="module" crossorigin src="./assets/index-abc.js"></script>
<link rel="modulepreload" crossorigin href="./assets/x.js">
<link rel="stylesheet" crossorigin href="./assets/index-abc.css">
</head><body><div id="app"></div></body></html>`;

test('the page is one file with a policy that names its script', () => {
  const script = 'const a = "$&"; const b = "</script><!--";';
  const embedded = embeddedJson({
    edition: 'professional',
    examples: { 'a.json': { title: '</script><b>' } },
  });
  const page = inlineBuild({ html: HTML, script, style: 'body{color:red}', embedded });
  assert.equal(page.includes('./assets/'), false);
  assert.equal(page.includes('modulepreload'), false);
  assert.ok(page.includes('<style>body{color:red}</style>'));
  const code = 'const a = "$&"; const b = "<\\/script><\\!--";';
  assert.ok(page.includes(`<script type="module">${code}</script>`));
  const hash = createHash('sha256').update(code, 'utf8').digest('base64');
  assert.ok(page.includes(`script-src 'sha256-${hash}'; style-src 'unsafe-inline'`));
  assert.ok(page.includes("default-src 'none'"));
  assert.ok(page.includes('connect-src wss:'));
  // The data block: before the script, and with no "<" that could end it.
  const block = /<script type="application\/json" id="wittEmbedded">(.*?)<\/script>/s.exec(page)![1]!;
  assert.equal(block.includes('<'), false);
  assert.ok(page.indexOf('wittEmbedded') < page.indexOf('<script type="module">'));
  assert.deepEqual(parseEmbedded(block), {
    edition: 'professional',
    examples: { 'a.json': { title: '</script><b>' } },
  });
  assert.throws(
    () => inlineBuild({ html: '<html></html>', script, style: '', embedded }),
    /no module script/
  );
});

test('a missing, malformed or unknown data block gives the hosted defaults', () => {
  const none = { edition: null, examples: {} };
  assert.deepEqual(parseEmbedded(null), none);
  assert.deepEqual(parseEmbedded('{'), none);
  assert.deepEqual(parseEmbedded('[]'), none);
  assert.deepEqual(parseEmbedded('{"edition":"enterprise","examples":[1]}'), none);
  assert.equal(parseEmbedded('{"edition":"thinker"}').edition, 'thinker');
  assert.equal(servedOverWeb('https:'), true);
  assert.equal(servedOverWeb('file:'), false);
});

test('the zip archive can be read back', () => {
  const files = [
    { name: 'witt/witt.html', data: Buffer.from('<html>ä</html>'.repeat(50), 'utf8') },
    { name: 'witt/LUE-MINUT-ä.txt', data: Buffer.from('kiitos', 'utf8') },
  ];
  const archive = zip(files, new Date(Date.UTC(2026, 10, 20, 12, 30, 0)));
  const end = archive.length - 22;
  assert.equal(archive.readUInt32LE(end), 0x06054b50);
  assert.equal(archive.readUInt16LE(end + 10), 2);
  let at = archive.readUInt32LE(end + 16);
  for (const file of files) {
    assert.equal(archive.readUInt32LE(at), 0x02014b50);
    const packedSize = archive.readUInt32LE(at + 20);
    const nameLength = archive.readUInt16LE(at + 28);
    const local = archive.readUInt32LE(at + 42);
    assert.equal(archive.subarray(at + 46, at + 46 + nameLength).toString('utf8'), file.name);
    assert.equal(archive.readUInt32LE(at + 16), crc32(file.data));
    assert.equal(archive.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    assert.deepEqual(inflateRawSync(archive.subarray(start, start + packedSize)), file.data);
    at += 46 + nameLength;
  }
});
