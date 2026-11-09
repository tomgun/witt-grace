/**
 * must: under evidence-v4-reasons a claim with reasons starts neutral and its own credence never enters the score
 *       (own 80 % with one 100 %/−3.83 reason gives −38.3, not +21.7 as under evidence-v3-links); with none of its
 *       reasons assessed it has no result; a leaf keeps its own credence; the same holds for one assessor's
 *       viewpoint; `project.setScoring` switches the version both ways and refuses an unknown one; a new app
 *       document gets v4 while the prototype's documents stay v3 (owner decision 2026-11-09)
 * test: tests/unit/scoring-v4.test.ts
 * red-against: the own credence still used as the base, an unassessed claim scored as 0, the v3 golden numbers moved
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCommand,
  createBlankProject,
  evaluate,
  evaluateAssessor,
  SCORING_V3,
  SCORING_V4,
} from '../../src/domain/index.ts';
import type { Command, Project, ScoringVersion } from '../../src/domain/index.ts';

const ctx = { now: '2026-11-09T10:00:00.000Z', actorId: 'u1' };
const run = (p: Project, ...commands: Command[]) => commands.reduce((acc, c) => applyCommand(acc, c, ctx), p);
const S = (internal: number | null | undefined) =>
  internal == null ? null : Number((2 * internal - 100).toFixed(1));

function tree(scoring: ScoringVersion, rateChild = true): Project {
  let p = createBlankProject({ projectId: 'p', rootId: 'T', userId: 'u1', now: ctx.now, scoring });
  p = run(
    p,
    { type: 'node.add', id: 'C', parentId: 'T', relation: 'support', title: 'Kokemus riittää' },
    { type: 'review.credence', id: 'v1', nodeId: 'C', userId: 'u1', credence: 80 },
    {
      type: 'review.influence',
      id: 'a1',
      subjectType: 'primary',
      subjectId: 'C',
      userId: 'u1',
      influence: 4,
    },
    { type: 'node.add', id: 'E', parentId: 'C', relation: 'oppose', title: 'Viisi vuotta B2B' },
    { type: 'review.credence', id: 'v2', nodeId: 'E', userId: 'u1', credence: 100 }
  );
  if (rateChild)
    p = run(p, {
      type: 'review.influence',
      id: 'a2',
      subjectType: 'primary',
      subjectId: 'E',
      userId: 'u1',
      influence: -3.5,
    });
  return p;
}

test('a claim with reasons takes its result from them alone; v3 keeps the own credence as the base', () => {
  const v4 = evaluate(tree(SCORING_V4));
  assert.equal(S(v4.get('C')?.score), -35);
  assert.equal(v4.get('C')?.base, 50);
  assert.equal(S(v4.get('E')?.score), 100);
  const v3 = evaluate(tree(SCORING_V3));
  assert.equal(S(v3.get('C')?.score), 25);
  assert.equal(v3.get('C')?.base, 80);
  assert.equal(S(evaluateAssessor(tree(SCORING_V4), 'u1').get('C')?.score), -35);
  assert.equal(S(evaluateAssessor(tree(SCORING_V3), 'u1').get('C')?.score), 25);
});

test('with none of its reasons assessed a claim has no result, and its parent is incomplete', () => {
  const scores = evaluate(tree(SCORING_V4, false));
  assert.equal(scores.get('C')?.score, null);
  assert.equal(scores.get('C')?.incomplete, true);
  assert.equal(scores.get('T')?.incomplete, true);
});

test('the scoring version switches both ways and refuses an unknown one', () => {
  const p = run(tree(SCORING_V4), { type: 'project.setScoring', scoring: SCORING_V3 });
  assert.equal(p.settings.scoring, SCORING_V3);
  assert.equal(S(evaluate(p).get('C')?.score), 25);
  assert.throws(() => run(p, { type: 'project.setScoring', scoring: 'evidence-v9' as ScoringVersion }));
  assert.equal(
    createBlankProject({ projectId: 'q', rootId: 'R', userId: 'u', now: ctx.now }).settings.scoring,
    SCORING_V3
  );
});
