/**
 * must: the marginal effect Δ is the change of the thesis balance when only that relation is removed, walked up
 *       through each ancestor with the others as assessed: Thesis ← A 100 %/+5 gives A +50; Thesis ← A 80 %/+4 ←
 *       B 100 %/−2 gives A +28, thesis +28, B −4 on the thesis and −20 on A (GRACE_AND_DATA_MODEL G-02 Δ table)
 * test: tests/unit/marginal-effects.test.ts
 * red-against: Δ in internal instead of visible points, a grandchild's effect added to the thesis directly, the
 *              removed relation's parent left unchanged on the way up
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
import type { Command, Project } from '../../src/domain/index.ts';

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
