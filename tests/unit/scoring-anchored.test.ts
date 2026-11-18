/**
 * must: anchored-reasons-v1 (owner decisions 2026-11-18, G-02): a rated claim's rating is the anchor its reasons move,
 *       I = 100·(2τ + P)/(2 + P + N); an option and the thesis weigh around a neutral prior worth one full reason,
 *       I = 100·(2.5 + P)/(5 + P + N), with no cap (+50, +66.7, +75; ten reasons +90.9); an unrated claim with
 *       reasons starts neutral, shows the net of its reasons and passes that net upward cut at 0 (one 100 %/+1
 *       support reads +33.3 and never a minus; only objections read a minus and pass nothing); adding a reason
 *       under a rated claim never moves the target against it, a 0 % reason and an influence of 0 change nothing,
 *       splitting a reason changes nothing; an objection, its rebuttal and the rebuttal's rebuttal come out in that
 *       order; missing stays missing. direct-reasons-v1: a rated claim passes exactly its rating upward and keeps the
 *       tree value as `derived`. One assessor's view follows the same rules; Δ uses the same formula; switching the
 *       version keeps every review; a new app document's version is `SCORING_VERSION`.
 * test: tests/unit/scoring-anchored.test.ts
 * red-against: the capped sum left in place (two reasons +100), the claim's weight used for the thesis (one reason
 *              +71.4), the v4 base rule (a rating dropped for 50: +34.8 where +42.7 is due), a 0 % reason switching the
 *              base (+28.6), influence 0 read as missing, a noisy-OR in the claim formula (a split reason differs),
 *              strength taken from the rating instead of the computed credence, an unrated claim passing a credence
 *              (a contested one passing half its weight) or passing its minus upward, the neutral 50 leaking from a
 *              claim whose only support is false (+43.8 where 0.0 is due), the computed value passed upward in direct
 *              mode (+48.5 where +44.4 is due), `derived` copied from the rating, Δ on the capped sum, pooled reviews
 *              leaking into a personal view, a missing review read as zero
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCommand,
  createBlankProject,
  evaluate,
  evaluateAssessor,
  marginalIndexEffects,
  marginalTargetEffects,
  parseProject,
  SCORING_ANCHORED,
  SCORING_DIRECT,
  SCORING_RULES,
  SCORING_V4,
  SCORING_VERSION,
  serializeProjectFile,
} from '../../src/domain/index.ts';
import type { Command, Project, ScoringVersion, Scores } from '../../src/domain/index.ts';

const ctx = { now: '2026-11-09T10:00:00.000Z', actorId: 'u1' };
let n = 0;
const run = (p: Project, ...commands: Command[]) => commands.reduce((acc, c) => applyCommand(acc, c, ctx), p);
const blank = (scoring: ScoringVersion = SCORING_ANCHORED) =>
  createBlankProject({ projectId: 'p', rootId: 'T', userId: 'u1', now: ctx.now, scoring });
/** A reason under `parentId`; `credence` null leaves the claim unrated, `influence` null leaves the relation unrated. */
const reason = (
  p: Project,
  id: string,
  parentId: string,
  credence: number | null,
  influence: number | null,
  userId = 'u1'
): Project => {
  if (!p.nodes.some((node) => node.id === id))
    p = run(p, {
      type: 'node.add',
      id,
      parentId,
      relation: influence !== null && influence < 0 ? 'oppose' : 'support',
      title: id,
    });
  if (credence !== null) p = run(p, { type: 'review.credence', id: `v${++n}`, nodeId: id, userId, credence });
  if (influence !== null)
    p = run(p, {
      type: 'review.influence',
      id: `a${++n}`,
      subjectType: 'primary',
      subjectId: id,
      userId,
      influence,
    });
  return p;
};
type Spec = [id: string, parentId: string, credence: number | null, influence: number | null];
const tree = (scoring: ScoringVersion, ...specs: Spec[]) =>
  specs.reduce(
    (p, [id, parentId, credence, influence]) => reason(p, id, parentId, credence, influence),
    blank(scoring)
  );
const S = (scores: Scores, id: string) => {
  const score = scores.get(id)?.score;
  return score == null ? null : Number((2 * score - 100).toFixed(1));
};
const I = (scores: Scores, id: string) => {
  const score = scores.get(id)?.score;
  return score == null ? null : Number(score.toFixed(1));
};
const balance = (...specs: Spec[]) => S(evaluate(tree(SCORING_ANCHORED, ...specs)), 'T');

test('targets weigh without a cap', () => {
  const full = (count: number, opposing = 0): Spec[] => [
    ...Array.from({ length: count }, (_, i): Spec => [`P${i}`, 'T', 100, 5]),
    ...Array.from({ length: opposing }, (_, i): Spec => [`N${i}`, 'T', 100, -5]),
  ];
  assert.equal(balance(...full(1)), 50);
  assert.equal(balance(...full(2)), 66.7);
  assert.equal(balance(...full(3)), 75);
  assert.equal(balance(...full(1, 1)), 0);
  assert.equal(balance(...full(10)), 90.9);
  assert.equal(balance(...full(0, 1)), -50);
  assert.equal(SCORING_RULES[SCORING_ANCHORED].capped, false);
  assert.equal(SCORING_RULES[SCORING_DIRECT].capped, false);
});

test('elaborating a rated claim never moves the target against it', () => {
  const c: Spec = ['C', 'T', 90, 4];
  assert.equal(balance(c), 41.9);
  assert.equal(balance(c, ['E', 'C', 100, 1]), 42.7);
  assert.equal(balance(c, ['E', 'C', 100, 3], ['F', 'C', 100, 3], ['G', 'C', 90, 3], ['H', 'G', 100, 4]), 44);
  assert.equal(balance(c, ['E', 'C', 100, -1]), 32.4);
  assert.equal(balance(c, ['E', 'C', 0, 5]), 41.9);
  for (const credence of [100, null]) {
    const scores = evaluate(tree(SCORING_ANCHORED, c, ['E', 'C', credence, 0]));
    assert.equal(S(scores, 'T'), 41.9);
    assert.equal(I(scores, 'C'), 90);
    assert.equal(scores.get('C')?.incomplete, false);
    assert.equal(scores.get('T')?.incomplete, false);
    const zero = scores.get('C')?.contributions.find((x) => x.id === 'E');
    assert.equal(zero?.missing, false);
    assert.equal(zero?.magnitude, 0);
  }
  // The same additions under the v4 rule move the wrong way (the reason this version exists).
  assert.equal(S(evaluate(tree(SCORING_V4, c, ['E', 'C', 100, 1])), 'T'), 22);
});

test('splitting a reason changes nothing', () => {
  assert.equal(balance(['A', 'T', 100, 4]), 44.4);
  assert.equal(balance(['A', 'T', 100, 2], ['B', 'T', 100, 2]), 44.4);
  const one = evaluate(tree(SCORING_ANCHORED, ['C', 'T', 60, 5], ['A', 'C', 100, 4]));
  const two = evaluate(tree(SCORING_ANCHORED, ['C', 'T', 60, 5], ['A', 'C', 100, 2], ['B', 'C', 100, 2]));
  assert.equal(I(one, 'C'), 86.7);
  assert.equal(I(two, 'C'), 86.7);
  assert.equal(one.get('T')?.score, two.get('T')?.score);
});

test('an objection, its rebuttal and the rebuttal of the rebuttal', () => {
  const c: Spec = ['C', 'T', 90, 5];
  const a: Spec = ['A', 'C', 100, -5];
  const b: Spec = ['B', 'A', 100, -5];
  const d: Spec = ['D', 'B', 100, -5];
  assert.equal(balance(c), 47.4);
  assert.equal(balance(c, a), 20.5);
  assert.equal(balance(c, a, b), 34.4);
  assert.equal(balance(c, a, b, d), 26.8);
});

test('an unrated claim shows the net of its reasons and passes it upward cut at zero', () => {
  const c: Spec = ['C', 'T', null, 5];
  const both = (...below: Spec[]) => {
    const scores = evaluate(tree(SCORING_ANCHORED, c, ...below));
    return [S(scores, 'C'), S(scores, 'T'), scores.get('C')?.net ?? false];
  };
  assert.deepEqual(both(['E', 'C', 100, 1]), [33.3, 25, true]);
  assert.deepEqual(both(['E', 'C', 100, 5]), [71.4, 41.7, true]);
  assert.deepEqual(both(['E', 'C', 0, 5]), [0, 0, true]);
  assert.deepEqual(both(['E', 'C', 100, -3]), [-60, 0, true]);
  assert.deepEqual(both(['E', 'C', 100, 4], ['F', 'C', 100, -4]), [0, 0, true]);
  assert.deepEqual(both(['E', 'C', 100, 4], ['F', 'C', 100, -2]), [25, 20, true]);
  // A rated claim is a credence, not a net.
  assert.equal(
    evaluate(tree(SCORING_ANCHORED, ['C', 'T', 60, 5], ['E', 'C', 100, 1])).get('C')?.net,
    undefined
  );
  // The sole support three levels down decides.
  const chain = (leaf: number): Spec[] => [c, ['D', 'C', null, 5], ['L', 'D', leaf, 5]];
  assert.equal(balance(...chain(100)), 39.1);
  assert.equal(balance(...chain(50)), 36.8);
  assert.equal(balance(...chain(0)), 0);
});

test('missing stays missing', () => {
  // An unrated leaf has no result and its parent is incomplete; nothing is read as zero.
  const leaf = evaluate(tree(SCORING_ANCHORED, ['C', 'T', null, 5]));
  assert.equal(leaf.get('C')?.score, null);
  assert.equal(leaf.get('C')?.balance, null);
  assert.equal(leaf.get('C')?.incomplete, true);
  assert.equal(leaf.get('T')?.score, null);
  assert.equal(leaf.get('T')?.incomplete, true);
  // An unrated claim whose only reason is not rated yet: no result either.
  const pending = evaluate(tree(SCORING_ANCHORED, ['C', 'T', null, 5], ['E', 'C', 100, null]));
  assert.equal(pending.get('C')?.score, null);
  assert.equal(pending.get('C')?.incomplete, true);
  assert.equal(pending.get('T')?.incomplete, true);
  // A rated claim with a reason whose influence is missing: scored from the rating, marked incomplete.
  const partial = evaluate(tree(SCORING_ANCHORED, ['C', 'T', 80, 5], ['E', 'C', 100, null]));
  assert.equal(I(partial, 'C'), 80);
  assert.equal(partial.get('C')?.incomplete, true);
  // The thesis' own vote is not used once it has reasons; without reasons it is what it was.
  const voted = run(tree(SCORING_ANCHORED, ['A', 'T', 100, 5]), {
    type: 'review.credence',
    id: 'vt',
    nodeId: 'T',
    userId: 'u1',
    credence: 10,
  });
  assert.equal(S(evaluate(voted), 'T'), 50);
  const bare = run(blank(), { type: 'review.credence', id: 'vt', nodeId: 'T', userId: 'u1', credence: 10 });
  assert.equal(S(evaluate(bare), 'T'), -80);
  assert.equal(S(evaluate(blank()), 'T'), 0);
});

test('two people: pooled reviews, each own view, and a partly rated claim', () => {
  let p = run(blank(), { type: 'user.add', id: 'u2', name: 'Toinen' });
  p = reason(p, 'A', 'T', 100, 5, 'u1');
  p = reason(p, 'A', 'T', 50, 3, 'u2');
  assert.equal(S(evaluate(p), 'T'), 37.5);
  assert.equal(S(evaluateAssessor(p, 'u1'), 'T'), 50);
  assert.equal(S(evaluateAssessor(p, 'u2'), 'T'), 23.1);
  // Only one of two rated the claim's credence: scored from that rating, incomplete.
  let q = run(blank(), { type: 'user.add', id: 'u2', name: 'Toinen' });
  q = reason(q, 'C', 'T', 80, 5, 'u1');
  q = reason(q, 'C', 'T', null, 5, 'u2');
  q = reason(q, 'E', 'C', 100, 2, 'u1');
  q = reason(q, 'E', 'C', 100, 2, 'u2');
  const pooled = evaluate(q);
  assert.equal(I(pooled, 'C'), 90);
  assert.equal(pooled.get('C')?.incomplete, true);
  // u2 did not rate C: in u2's own view it is the net of its reasons.
  const own = evaluateAssessor(q, 'u2');
  assert.equal(S(own, 'C'), 50);
  assert.equal(own.get('C')?.net, true);
  // Median pooling still applies to the credence and the influence separately.
  let m = run(blank(), { type: 'user.add', id: 'u2', name: 'B' }, { type: 'user.add', id: 'u3', name: 'C' });
  for (const [user, credence] of [
    ['u1', 100],
    ['u2', 20],
    ['u3', 20],
  ] as const)
    m = reason(m, 'A', 'T', credence, 5, user);
  assert.equal(S(evaluate(m), 'T'), 31.8);
  assert.equal(
    S(evaluate(run(m, { type: 'project.setAssessmentWeighting', weighting: 'median' })), 'T'),
    16.7
  );
});

test('a secondary link counts once more, with the source computed once', () => {
  let p = tree(SCORING_ANCHORED, ['A', 'T', 100, 5], ['B', 'T', 100, 1], ['X', 'B', 100, 5]);
  assert.equal(S(evaluate(p), 'T'), 54.5);
  p = run(
    p,
    { type: 'link.add', id: 'k', sourceId: 'X', targetId: 'T', value: 5 },
    {
      type: 'review.influence',
      id: 'ak',
      subjectType: 'secondary',
      subjectId: 'k',
      userId: 'u1',
      influence: 5,
    }
  );
  assert.equal(S(evaluate(p), 'T'), 68.8);
});

test('direct-reasons-v1: a rated claim passes its rating, the tree value stays beside it', () => {
  const specs = (leaf: number, c: number | null = 80): Spec[] => [
    ['C', 'T', c, 5],
    ['D', 'C', 80, 5],
    ['L', 'D', leaf, 5],
  ];
  const derived = (scores: Scores, id: string) => {
    const value = scores.get(id)?.derived;
    return value === undefined ? undefined : Number(value.toFixed(1));
  };
  for (const leaf of [100, 0]) {
    const scores = evaluate(tree(SCORING_DIRECT, ...specs(leaf)));
    assert.equal(S(scores, 'T'), 44.4);
    assert.equal(I(scores, 'C'), 80);
    assert.equal(derived(scores, 'C'), 93.3);
    assert.equal(I(scores, 'D'), 80);
    assert.equal(derived(scores, 'D'), leaf === 100 ? 94.3 : 80);
    assert.equal(scores.get('L')?.derived, undefined);
    assert.equal(scores.get('T')?.derived, undefined);
    assert.equal(S(evaluateAssessor(tree(SCORING_DIRECT, ...specs(leaf)), 'u1'), 'T'), 44.4);
  }
  // An unrated claim is still computed from its direct reasons.
  const unrated = evaluate(tree(SCORING_DIRECT, ...specs(100, null)));
  assert.equal(S(unrated, 'C'), 66.7);
  assert.equal(S(unrated, 'T'), 40);
  // The same tree under the tree-wide version lets the leaf through.
  assert.equal(S(evaluate(tree(SCORING_ANCHORED, ...specs(100))), 'T'), 48.5);
  assert.equal(S(evaluate(tree(SCORING_ANCHORED, ...specs(0))), 'T'), 48.3);
});

test('Δ uses the version formula; under direct nothing changes above a rated claim', () => {
  const three = tree(SCORING_ANCHORED, ['A', 'T', 100, 5], ['B', 'T', 100, 5], ['C', 'T', 100, 5]);
  const local = marginalIndexEffects(three, evaluate(three));
  assert.equal(Number(local.get('A')!.delta.toFixed(2)), 4.17);
  const specs: Spec[] = [
    ['C', 'T', 90, 4],
    ['R', 'C', 100, 1],
  ];
  const anchored = tree(SCORING_ANCHORED, ...specs);
  const effects = marginalTargetEffects(anchored, evaluate(anchored));
  assert.equal(Number(effects.get('R')!.localDelta.toFixed(2)), 3.33);
  assert.equal(Number(effects.get('R')!.delta.toFixed(2)), 0.44);
  assert.equal(effects.get('R')!.targetId, 'T');
  const direct = tree(SCORING_DIRECT, ...specs);
  const directEffects = marginalTargetEffects(direct, evaluate(direct));
  assert.equal(Number(directEffects.get('R')!.localDelta.toFixed(2)), 3.33);
  assert.equal(directEffects.get('R')!.delta, 0);
  // Through an unrated claim the net is what changes above.
  const net = tree(SCORING_ANCHORED, ['C', 'T', null, 5], ['E', 'C', 100, 4], ['F', 'C', 100, -2]);
  const netEffects = marginalTargetEffects(net, evaluate(net));
  assert.equal(Number((2 * netEffects.get('F')!.delta).toFixed(1)), -20);
});

test('switching, parsing and the default for new documents', () => {
  const start = tree(SCORING_V4, ['C', 'T', 90, 4], ['E', 'C', 100, 1]);
  const there = run(start, { type: 'project.setScoring', scoring: SCORING_ANCHORED });
  assert.equal(S(evaluate(there), 'T'), 42.7);
  const direct = run(there, { type: 'project.setScoring', scoring: SCORING_DIRECT });
  assert.equal(S(evaluate(direct), 'T'), 41.9);
  const back = run(direct, { type: 'project.setScoring', scoring: SCORING_V4 });
  assert.deepEqual(back.votes, start.votes);
  assert.deepEqual(back.edgeAssessments, start.edgeAssessments);
  assert.equal(S(evaluate(back), 'T'), 22);
  assert.throws(
    () => run(start, { type: 'project.setScoring', scoring: 'anchored-reasons-v2' as ScoringVersion }),
    /Tuntematon laskentatapa/
  );
  for (const scoring of [SCORING_ANCHORED, SCORING_DIRECT])
    assert.equal(parseProject(JSON.parse(serializeProjectFile(blank(scoring)))).settings.scoring, scoring);
  const unknown = JSON.parse(serializeProjectFile(blank()));
  unknown.settings.scoring = 'anchored-reasons-v9';
  assert.throws(
    () => parseProject(unknown),
    /Tiedosto käyttää laskentatapaa "anchored-reasons-v9", jota tämä WITT-versio ei tunne/
  );
  assert.equal(SCORING_VERSION, SCORING_ANCHORED);
});
