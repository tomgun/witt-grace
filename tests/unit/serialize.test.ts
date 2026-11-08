/**
 * must: every example round-trips byte-stably through parse → serialize → parse → serialize; the file form equals the
 *       prototype's export bytes for the same document; the filename slug is the prototype's (G-06, UX-E05)
 * test: tests/unit/serialize.test.ts
 * red-against: a key order changed by a rewrite, an optional field serialized as null, a four-space indent
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  exportFilename,
  parseProject,
  serializeProjectCompact,
  serializeProjectFile,
} from '../../src/domain/index.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const core: any = createRequire(import.meta.url)(
  path.join(process.cwd(), 'witt-grace-gpt-proto', 'src', 'core.js')
);
const examples = path.join(process.cwd(), 'witt-grace-gpt-proto', 'examples');

for (const file of readdirSync(examples)
  .filter((f) => f.endsWith('.witt.json'))
  .sort()) {
  const raw = JSON.parse(readFileSync(path.join(examples, file), 'utf8')) as { schemaVersion?: number };
  if (raw.schemaVersion !== 8) continue;
  test(`${file}: serialize is byte-stable and equals the prototype's export`, () => {
    const once = serializeProjectFile(parseProject(raw));
    const twice = serializeProjectFile(parseProject(JSON.parse(once)));
    assert.equal(twice, once);
    assert.equal(once, JSON.stringify(core.validateProject(raw), null, 2) + '\n');
    assert.deepEqual(JSON.parse(serializeProjectCompact(parseProject(raw))), JSON.parse(once));
  });
}

test('export filename follows the prototype slug', () => {
  // The prototype decomposes ä to a + U+0308 and replaces the combining mark with a dash: pinned as-is (UX-E05).
  assert.equal(exportFilename('Mikä on paras päätös?'), 'mika-on-paras-pa-a-to-s.witt.json');
  assert.equal(exportFilename('   '), 'witt.witt.json');
  assert.equal(exportFilename('a'.repeat(60)), 'a'.repeat(45) + '.witt.json');
});
