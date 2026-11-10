/**
 * must: every example in the manifest is a file in public/examples/ that `parseProject` accepts, with the node count
 *       the card states; the two recruitment examples are exactly what scripts/build-recruitment-examples.ts builds
 *       and show criteria and candidates under their own type names (owner 2026-11-09, UI_INVENTORY S-15); the
 *       scoring comparison example is what scripts/build-scoring-example.ts builds, and its four options read
 *       +27.6/+100/+30/+0.1 under v4, +29.5/+82.9/+31.8/+0.2 under log-odds and +38.8/+100/+30/−20.1 under v3;
 *       the deep debate example reaches 14 and 11 levels under two options and its nets are pinned the same way
 *       (owner 2026-11-10)
 * test: tests/unit/examples.test.ts
 * red-against: a card pointing at a missing or invalid file, a stale node count, a hand-edited generated example
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { evaluate, parseProject, SCORING_LOGODDS, SCORING_V3, SCORING_V4 } from '../../src/domain/index.ts';
import type { ScoringVersion } from '../../src/domain/index.ts';
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

test('the scoring comparison examples are the generator output and its options differ by method as documented', () => {
  const names = ['laskentatapojen-vertailu.witt.json', 'syva-vaittely-ruuhkat.witt.json'];
  const before = names.map(read);
  execFileSync(process.execPath, ['scripts/build-scoring-example.ts']);
  assert.deepEqual(names.map(read), before);
  const project = parseProject(JSON.parse(before[0]!));
  const nets = (scoring: ScoringVersion) => {
    const scores = evaluate({ ...project, settings: { ...project.settings, scoring } });
    return ['o-light', 'o-lease', 'o-repair', 'o-power'].map((id) =>
      Number((2 * (scores.get(id)?.score ?? NaN) - 100).toFixed(1))
    );
  };
  assert.deepEqual(nets(SCORING_V4), [27.6, 100, 30, 0.1]);
  assert.deepEqual(nets(SCORING_LOGODDS), [29.5, 82.9, 31.8, 0.2]);
  assert.deepEqual(nets(SCORING_V3), [38.8, 100, 30, -20.1]);
});

test('the deep debate example is the generator output, 14 and 11 levels deep, and its nets per method are pinned', () => {
  const project = parseProject(JSON.parse(read('syva-vaittely-ruuhkat.witt.json')));
  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  /** The most steps from a node up to the option, over every node below it. */
  const depthUnder = (optionId: string): number => {
    let deepest = 0;
    for (const node of project.nodes) {
      let steps = 0;
      for (let up = byId.get(node.id); up; up = byId.get(up.parentId ?? '')) {
        if (up.id === optionId) {
          deepest = Math.max(deepest, steps);
          break;
        }
        steps++;
      }
    }
    return deepest;
  };
  assert.equal(depthUnder('d-maksu'), 14);
  assert.equal(depthUnder('d-vuorot'), 11);
  const nets = (scoring: ScoringVersion) => {
    const scores = evaluate({ ...project, settings: { ...project.settings, scoring } });
    return ['d-maksu', 'd-vuorot', 'd-pysakointi', 'd-ei'].map((id) =>
      Number((2 * (scores.get(id)?.score ?? NaN) - 100).toFixed(1))
    );
  };
  assert.deepEqual(nets(SCORING_V4), [0.6, 9.2, 16, -10]);
  assert.deepEqual(nets(SCORING_LOGODDS), [1.1, 10, 17.4, -10.9]);
  assert.deepEqual(nets(SCORING_V3), [-3.9, 4.1, 16, -10]);
});
