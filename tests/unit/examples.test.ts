/**
 * must: every example in the manifest is a file in public/examples/ that `parseProject` accepts, with the node count
 *       the card states; the two recruitment examples are exactly what scripts/build-recruitment-examples.ts builds
 *       and show criteria and candidates under their own type names (owner 2026-11-09, UI_INVENTORY S-15)
 * test: tests/unit/examples.test.ts
 * red-against: a card pointing at a missing or invalid file, a stale node count, a hand-edited generated example
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parseProject } from '../../src/domain/index.ts';
import { EXAMPLES } from '../../src/app/examples.ts';

const dir = path.join(process.cwd(), 'public', 'examples');
const read = (name: string) => readFileSync(path.join(dir, name), 'utf8');

test('every manifest entry parses and has the stated node count', () => {
  for (const entry of EXAMPLES) {
    const project = parseProject(JSON.parse(read(entry.filename)));
    assert.equal(project.nodes.length, entry.nodeCount, entry.filename);
  }
});

test('the recruitment examples are the generator output and carry their type names', () => {
  const names = ['rekrytointi-yksi-kandidaatti.witt.json', 'rekrytointi-kolme-kandidaattia.witt.json'];
  const before = names.map(read);
  execFileSync(process.execPath, ['scripts/build-recruitment-examples.ts']);
  assert.deepEqual(names.map(read), before);
  const three = parseProject(JSON.parse(before[1]!));
  assert.deepEqual(
    three.nodes.filter((n) => n.kind === 'option').map((n) => n.typeLabel),
    ['Kandidaatti', 'Kandidaatti', 'Kandidaatti']
  );
  assert.equal(three.nodes.filter((n) => n.typeLabel === 'Kriteeri').length, 9);
});
