/**
 * must: the marginal effect Δ is the change of the thesis balance when only that relation is removed, walked up
 *       through each ancestor with the others as assessed: Thesis ← A 100 %/+5 gives A +50; Thesis ← A 80 %/+4 ←
 *       B 100 %/−2 gives A +28, thesis +28, B −4 on the thesis and −20 on A (GRACE_AND_DATA_MODEL G-02 Δ table)
 *       ; the local and the propagated Δ are pinned per scoring version for one two-level tree, so a change to how
 *       a version picks its strength or combination shows here
 * test: tests/unit/marginal-effects.test.ts
 * red-against: Δ in internal instead of visible points, a grandchild's effect added to the thesis directly, the
 *              removed relation's parent left unchanged on the way up, signed/chain propagating Δ with strength I/100
 *              instead of the net factor, log-odds Δ recomputed with the capped sum
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCommand,
  createBlankProject,
  evaluate,
  marginalIndexEffects,
  marginalTargetEffects,
} from '../../src/domain/index.ts';
import type { Command, Project, ScoringVersion } from '../../src/domain/index.ts';

const ctx = { now: '2026-11-09T10:00:00.000Z', actorId: 'u1' };
let n = 0;
const run = (p: Project, ...commands: Command[]) => commands.reduce((acc, c) => applyCommand(acc, c, ctx), p);
const reason = (p: Project, id: string, parentId: string, credence: number, influence: number) =>
  run(
    p,
    { type: 'node.add', id, parentId, relation: influence >= 0 ? 'support' : 'oppose', title: id },
    { type: 'review.credence', id: `v${++n}`, nodeId: id, userId: 'u1', credence },
    {
      type: 'review.influence',
      id: `a${++n}`,
      subjectType: 'primary',
      subjectId: id,
      userId: 'u1',
      influence,
    }
  );
const blank = () => createBlankProject({ projectId: 'p', rootId: 'T', userId: 'u1', now: ctx.now });
const visible = (internal: number | null | undefined) => (internal == null ? null : 2 * internal - 100);

test('one 100 %/+5 reason: the thesis is +50 and Δ of the reason is +50', () => {
  const p = reason(blank(), 'A', 'T', 100, 5);
  const scores = evaluate(p);
  assert.equal(visible(scores.get('T')?.score), 50);
  const effect = marginalTargetEffects(p, scores).get('A')!;
  assert.equal(effect.targetId, 'T');
  assert.equal(2 * effect.delta, 50);
});

test('a chain: Δ walks up through the parent and is smaller than the local effect', () => {
  let p = reason(blank(), 'A', 'T', 80, 4);
  p = reason(p, 'B', 'A', 100, -2);
  const scores = evaluate(p);
  assert.equal(visible(scores.get('A')?.score), 40);
  assert.equal(Number(visible(scores.get('T')?.score)!.toFixed(6)), 28);
  const local = marginalIndexEffects(p, scores);
  assert.equal(Number((2 * local.get('B')!.delta).toFixed(6)), -20);
  const target = marginalTargetEffects(p, scores, local);
  assert.equal(Number((2 * target.get('A')!.delta).toFixed(6)), 28);
  assert.equal(Number((2 * target.get('B')!.delta).toFixed(6)), -4);
  assert.equal(target.get('B')!.targetId, 'T');
});

test('Δ per scoring version: T ← A 80 %/+4 (← B 100 %/+3, C 90 %/−2), D 70 %/−3', () => {
  const pinned: Record<string, { T: number; A: number; local: number[]; target: number[] }> = {
    'evidence-v3-links': { T: 56.7, A: 86, local: [17.2, 15, -9, -10.5], target: [17.2, 3, -1.8, -10.5] },
    'evidence-v4-reasons': { T: 50.7, A: 56, local: [11.2, 15, -9, -10.5], target: [11.2, 3, -1.8, -10.5] },
    'logodds-reasons-v1': {
      T: 50.8906,
      A: 56.5537,
      local: [12.2256, 16.3144, -9.3536, -11.2859],
      target: [12.2256, 3.5819, -2.0519, -11.2859],
    },
    'signed-reasons-v1': { T: 46.8, A: 57, local: [2.8, 15, -8, -6], target: [2.8, 2.8, -3.2, -6] },
    'chain-logodds-v1': {
      T: 62.3562,
      A: 73.61,
      local: [33.023, 49.9668, -16.3982, -17.6063],
      target: [33.023, 33.023, -18.8872, -17.6063],
    },
  };
  const round = (x: number | null | undefined) => (x == null ? null : Number(x.toFixed(4)));
  for (const [scoring, want] of Object.entries(pinned)) {
    let p = createBlankProject({
      projectId: 'p',
      rootId: 'T',
      userId: 'u1',
      now: ctx.now,
      scoring: scoring as ScoringVersion,
    });
    p = reason(p, 'A', 'T', 80, 4);
    p = reason(p, 'B', 'A', 100, 3);
    p = reason(p, 'C', 'A', 90, -2);
    p = reason(p, 'D', 'T', 70, -3);
    const scores = evaluate(p);
    const local = marginalIndexEffects(p, scores);
    const target = marginalTargetEffects(p, scores, local);
    const ids = ['A', 'B', 'C', 'D'];
    assert.deepEqual(
      {
        T: round(scores.get('T')?.score),
        A: round(scores.get('A')?.score),
        local: ids.map((id) => round(local.get(id)?.delta)),
        target: ids.map((id) => round(target.get(id)?.delta)),
      },
      want,
      scoring
    );
  }
});
