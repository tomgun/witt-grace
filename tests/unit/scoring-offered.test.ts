/**
 * must: the app offers two calculation methods and keeps no document under an archived one (owner 2026-11-18):
 *       `withOfferedScoring` turns an archived version into the default and leaves every node, review and setting
 *       else as it was; a document under an offered version is returned as it is; the engine still computes the
 *       archived versions when asked (the golden fixtures and the method study depend on it)
 * test: tests/unit/scoring-offered.test.ts
 * red-against: direct-reasons-v1 treated as archived, a review dropped with the method, the archived rows removed
 *              from the engine
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCommand,
  createBlankProject,
  evaluate,
  SCORING_OFFERED,
  SCORING_RULES,
  SCORING_VERSION,
  SCORING_VERSIONS,
  withOfferedScoring,
} from '../../src/domain/index.ts';
import type { Command, Project } from '../../src/domain/index.ts';

const at = { now: '2026-11-18T10:00:00.000Z', actorId: 'u1' };
const run = (p: Project, ...commands: Command[]) => commands.reduce((acc, c) => applyCommand(acc, c, at), p);

test('an archived method becomes the default; reviews stay; offered methods are untouched', () => {
  assert.deepEqual([...SCORING_OFFERED], ['anchored-reasons-v1', 'direct-reasons-v1']);
  assert.equal(SCORING_VERSION, 'anchored-reasons-v1');
  let old = createBlankProject({ projectId: 'p', rootId: 'T', userId: 'u1', now: at.now });
  assert.equal(old.settings.scoring, 'evidence-v3-links');
  old = run(
    old,
    { type: 'node.add', id: 'A', parentId: 'T', relation: 'support', title: 'A' },
    { type: 'review.credence', id: 'v1', nodeId: 'A', userId: 'u1', credence: 100 },
    { type: 'review.influence', id: 'a1', subjectType: 'primary', subjectId: 'A', userId: 'u1', influence: 5 }
  );
  const opened = withOfferedScoring(old);
  assert.equal(opened.settings.scoring, 'anchored-reasons-v1');
  assert.deepEqual({ ...opened, settings: old.settings }, old, 'nothing else changed');
  // One 100 % / +5 reason: +50 under the default (the prototype's method would add it to the thesis' own rating).
  assert.equal((2 * (evaluate(opened).get('T')?.score ?? NaN) - 100).toFixed(1), '50.0');
  for (const scoring of SCORING_OFFERED) {
    const doc = { ...old, settings: { ...old.settings, scoring } };
    assert.equal(withOfferedScoring(doc), doc);
  }
  for (const scoring of SCORING_VERSIONS) assert.ok(SCORING_RULES[scoring], `${scoring} is still computed`);
});
