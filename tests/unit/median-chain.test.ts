/**
 * must: the `median` weighting takes the middle review of each credence and influence, so one assessor's extreme
 *       ratings on four opposing reasons cannot outweigh the one reason the others rate strong (the owner's
 *       "vastarannan kiiski" case: −17.9 by the mean, +37 by the median under v4); chain-logodds-v1 passes a reason's
 *       net upward and lets one fully credible ±5 reason alone reach ±95, so a five-level chain of such links still
 *       gives +93.8 where v4 gives +33.4 and signed-reasons-v1 +3.1; a contested link damps it to 0
 *       (owner requests 2026-11-10)
 * test: tests/unit/median-chain.test.ts
 * red-against: the median computed as a mean, a strong deep chain that fades like the other methods
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCommand,
  createBlankProject,
  evaluate,
  median,
  SCORING_CHAIN,
  SCORING_SIGNED,
  SCORING_V4,
} from '../../src/domain/index.ts';
import type { AssessmentWeighting, Command, Project, ScoringVersion } from '../../src/domain/index.ts';

const ctx = { now: '2026-11-10T10:00:00.000Z', actorId: 'k' };
const run = (p: Project, ...commands: Command[]) => commands.reduce((acc, c) => applyCommand(acc, c, ctx), p);
const S = (internal: number | null | undefined) =>
  internal == null ? null : Number((2 * internal - 100).toFixed(1));
let n = 0;
const rate = (nodeId: string, userId: string, credence: number, influence: number): Command[] => [
  { type: 'review.credence', id: `v${n++}`, nodeId, userId, credence },
  { type: 'review.influence', id: `a${n++}`, subjectType: 'primary', subjectId: nodeId, userId, influence },
];

function contrarian(weighting: AssessmentWeighting, scoring: ScoringVersion = SCORING_V4): number | null {
  let p = createBlankProject({ projectId: 'p', rootId: 'A', userId: 'k', now: ctx.now, scoring });
  p = run(
    p,
    { type: 'user.add', id: 'u2', name: 'Bea' },
    { type: 'user.add', id: 'u3', name: 'Cem' },
    { type: 'project.setAssessmentWeighting', weighting }
  );
  for (const id of ['B', 'C', 'D', 'E'])
    p = run(
      p,
      { type: 'node.add', id, parentId: 'A', relation: 'oppose' },
      ...rate(id, 'k', 100, -5),
      ...rate(id, 'u2', 20, -1),
      ...rate(id, 'u3', 20, -1)
    );
  p = run(
    p,
    { type: 'node.add', id: 'F', parentId: 'A', relation: 'support' },
    ...rate('F', 'k', 30, 1),
    ...rate('F', 'u2', 90, 5),
    ...rate('F', 'u3', 90, 5)
  );
  return S(evaluate(p).get('A')?.score);
}

test('the median: middle value, and one extreme assessor no longer decides', () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(contrarian('equal'), -17.9);
  assert.equal(contrarian('median'), 37);
  assert.equal(contrarian('median', SCORING_SIGNED), 40);
});

function chain(scoring: ScoringVersion, influences: number[]): number | null {
  let p = createBlankProject({ projectId: 'p', rootId: 'T', userId: 'k', now: ctx.now, scoring });
  let parent = 'T';
  influences.forEach((influence, i) => {
    const id = `L${i}`;
    p = run(
      p,
      { type: 'node.add', id, parentId: parent, relation: influence < 0 ? 'oppose' : 'support' },
      ...rate(id, 'k', 100, influence)
    );
    parent = id;
  });
  return S(evaluate(p).get('T')?.score);
}

test('chain-logodds-v1 carries a strong chain up; a contested link damps it', () => {
  const strong = [5, 5, 5, 5, 5];
  assert.equal(chain(SCORING_V4, strong), 33.4);
  assert.equal(chain(SCORING_SIGNED, strong), 3.1);
  assert.equal(chain(SCORING_CHAIN, [5]), 95);
  assert.equal(chain(SCORING_CHAIN, strong), 93.8);
  // A contested middle claim (one +4 and one −4 reason) passes nothing upward.
  let p = createBlankProject({
    projectId: 'p',
    rootId: 'T',
    userId: 'k',
    now: ctx.now,
    scoring: SCORING_CHAIN,
  });
  p = run(
    p,
    { type: 'node.add', id: 'M', parentId: 'T', relation: 'support' },
    { type: 'review.influence', id: 'aM', subjectType: 'primary', subjectId: 'M', userId: 'k', influence: 5 },
    { type: 'node.add', id: 'P', parentId: 'M', relation: 'support' },
    ...rate('P', 'k', 100, 4),
    { type: 'node.add', id: 'O', parentId: 'M', relation: 'oppose' },
    ...rate('O', 'k', 100, -4)
  );
  assert.equal(S(evaluate(p).get('T')?.score), 0);
});
