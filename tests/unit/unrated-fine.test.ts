/**
 * must: an unrated note (node.unrated) never scores into its parent and never leaves it incomplete, refuses a
 *       credence, keeps the reviews given earlier and counts them again when switched back, and its own reasons can
 *       still be rated without reaching above it; "no effect" (influence 0 without a credence) is a complete review
 *       under the reasons-decide versions and still a missing one under evidence-v3-links; influences are accepted in
 *       0.1 steps (0.3 yes, 1.25 no), so twenty small 0.1 reasons give +20 under v4 where twenty 0.5 ones hit +100;
 *       both flags survive a save and reload; a person's "no effect" on a reason excuses their reviews in the branch
 *       below it from the shared result, their own viewpoint and the lens alike (they are not expected there either),
 *       and `review.retractInfluence` takes the 0 back so the branch counts again (owner decisions 2026-11-10)
 * test: tests/unit/unrated-fine.test.ts
 * red-against: an unrated note counted as a 0 or as missing, its earlier reviews deleted, a "no effect" review that
 *              still waits for a credence, 0.1 steps refused or rounded to 0.5
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCommand,
  baseConfidence,
  noEffectExcusals,
  projectLens,
  createBlankProject,
  evaluate,
  evaluateAssessor,
  parseProject,
  SCORING_LOGODDS,
  SCORING_V3,
  SCORING_V4,
} from '../../src/domain/index.ts';
import type { Command, Project, ScoringVersion } from '../../src/domain/index.ts';

const ctx = { now: '2026-11-10T10:00:00.000Z', actorId: 'u1' };
const run = (p: Project, ...commands: Command[]) => commands.reduce((acc, c) => applyCommand(acc, c, ctx), p);
const S = (internal: number | null | undefined) =>
  internal == null ? null : Number((2 * internal - 100).toFixed(1));
const rate = (id: string, credence: number, influence: number): Command[] => [
  { type: 'review.credence', id: `v-${id}`, nodeId: id, userId: 'u1', credence },
  {
    type: 'review.influence',
    id: `a-${id}`,
    subjectType: 'primary',
    subjectId: id,
    userId: 'u1',
    influence,
  },
];

function base(scoring: ScoringVersion = SCORING_V4): Project {
  const p = createBlankProject({ projectId: 'p', rootId: 'T', userId: 'u1', now: ctx.now, scoring });
  return run(
    p,
    { type: 'node.add', id: 'A', parentId: 'T', relation: 'support', title: 'Haastattelu meni hyvin' },
    ...rate('A', 100, 2),
    { type: 'node.add', id: 'N', parentId: 'T', relation: 'neutral', title: 'Asui ennen Tampereella' },
    ...rate('N', 100, -4)
  );
}

test('an unrated note never scores and never leaves its parent incomplete; switching back restores its reviews', () => {
  const rated = evaluate(base());
  assert.equal(S(rated.get('T')?.score), -20);
  const note = run(base(), { type: 'node.edit', id: 'N', unrated: true });
  assert.equal(note.nodes.find((n) => n.id === 'N')?.unrated, true);
  assert.equal(note.votes.filter((v) => v.nodeId === 'N').length, 1);
  const scores = evaluate(note);
  assert.equal(S(scores.get('T')?.score), 20);
  assert.equal(scores.get('T')?.incomplete, false);
  assert.equal(
    scores.get('T')?.contributions.some((c) => c.id === 'N'),
    false
  );
  assert.equal(S(evaluateAssessor(note, 'u1').get('T')?.score), 20);
  const back = run(note, { type: 'node.edit', id: 'N', unrated: false });
  assert.equal(back.nodes.find((n) => n.id === 'N')?.unrated, undefined);
  assert.equal(S(evaluate(back).get('T')?.score), -20);
});

test('a new unrated note leaves its parent complete, refuses a credence, and its own reasons do not reach above it', () => {
  let p = createBlankProject({
    projectId: 'p',
    rootId: 'T',
    userId: 'u1',
    now: ctx.now,
    scoring: SCORING_V4,
  });
  p = run(p, { type: 'node.add', id: 'A', parentId: 'T', relation: 'support' }, ...rate('A', 100, 2), {
    type: 'node.add',
    id: 'N',
    parentId: 'T',
    relation: 'neutral',
    unrated: true,
  });
  assert.equal(evaluate(p).get('T')?.incomplete, false);
  assert.throws(() =>
    applyCommand(p, { type: 'review.credence', id: 'x', nodeId: 'N', userId: 'u1', credence: 50 }, ctx)
  );
  assert.throws(() => applyCommand(p, { type: 'node.edit', id: 'T', unrated: true }, ctx));
  p = run(p, { type: 'node.add', id: 'D', parentId: 'N', relation: 'support' }, ...rate('D', 100, 5));
  assert.equal(S(evaluate(p).get('T')?.score), 20);
});

test('"no effect" is a complete review without a credence under v4 and log-odds, a missing one under v3', () => {
  const noEffect = (scoring: ScoringVersion) => {
    let p = createBlankProject({ projectId: 'p', rootId: 'T', userId: 'u1', now: ctx.now, scoring });
    p = run(
      p,
      { type: 'node.add', id: 'C', parentId: 'T', relation: 'support' },
      { type: 'node.add', id: 'E', parentId: 'C', relation: 'support' },
      {
        type: 'review.personal',
        voteId: 'v',
        assessmentId: 'a',
        nodeId: 'E',
        userId: 'u1',
        credence: null,
        influence: 0,
      }
    );
    return p;
  };
  for (const scoring of [SCORING_V4, SCORING_LOGODDS]) {
    const p = noEffect(scoring);
    assert.equal(p.votes.length, 0);
    assert.equal(p.edgeAssessments.length, 1);
    const c = evaluate(p).get('C');
    assert.equal(S(c?.score), 0);
    assert.equal(c?.contributions[0]?.missing, false);
    assert.equal(c?.incomplete, false);
    assert.equal(S(evaluateAssessor(p, 'u1').get('C')?.score), 0);
  }
  const v3 = evaluate(noEffect(SCORING_V3)).get('C');
  assert.equal(v3?.contributions[0]?.missing, true);
});

test('influence is accepted in 0.1 steps; twenty small reasons stay small', () => {
  const many = (scoring: ScoringVersion, influence: number) => {
    let p = createBlankProject({ projectId: 'p', rootId: 'T', userId: 'u1', now: ctx.now, scoring });
    for (let i = 0; i < 20; i++)
      p = run(
        p,
        { type: 'node.add', id: `R${i}`, parentId: 'T', relation: 'support' },
        ...rate(`R${i}`, 100, influence)
      );
    return S(evaluate(p).get('T')?.score);
  };
  assert.equal(many(SCORING_V4, 0.5), 100);
  assert.equal(many(SCORING_V4, 0.1), 20);
  assert.equal(many(SCORING_LOGODDS, 0.5), 80);
  assert.equal(many(SCORING_LOGODDS, 0.1), 21.6);
  const p = run(base(), {
    type: 'review.influence',
    id: 'a-A',
    subjectType: 'primary',
    subjectId: 'A',
    userId: 'u1',
    influence: 0.1 + 0.2,
  });
  assert.equal(p.edgeAssessments.find((a) => a.subjectId === 'A')?.influence, 0.3);
  assert.throws(
    () =>
      applyCommand(
        p,
        {
          type: 'review.influence',
          id: 'x',
          subjectType: 'primary',
          subjectId: 'A',
          userId: 'u1',
          influence: 1.25,
        },
        ctx
      ),
    /0,1 pisteen/
  );
});

test('the unrated and fine-scale flags survive a save and reload', () => {
  const p = run(
    base(),
    { type: 'node.edit', id: 'N', unrated: true },
    { type: 'node.edit', id: 'A', fineInfluence: true },
    {
      type: 'review.influence',
      id: 'a-A',
      subjectType: 'primary',
      subjectId: 'A',
      userId: 'u1',
      influence: 0.3,
    }
  );
  const reloaded = parseProject(JSON.parse(JSON.stringify(p)));
  assert.equal(reloaded.nodes.find((n) => n.id === 'N')?.unrated, true);
  assert.equal(reloaded.nodes.find((n) => n.id === 'A')?.fineInfluence, true);
  assert.equal(reloaded.edgeAssessments.find((a) => a.subjectId === 'A')?.influence, 0.3);
  const off = run(reloaded, { type: 'node.edit', id: 'A', fineInfluence: false });
  assert.equal(off.nodes.find((n) => n.id === 'A')?.fineInfluence, undefined);
});

function twoPeople(scoring: ScoringVersion = SCORING_V4): Project {
  let p = createBlankProject({ projectId: 'p', rootId: 'T', userId: 'u1', now: ctx.now, scoring });
  p = run(
    p,
    { type: 'user.add', id: 'u2', name: 'Bea' },
    { type: 'node.add', id: 'C', parentId: 'T', relation: 'support' },
    { type: 'node.add', id: 'E', parentId: 'C', relation: 'support' },
    {
      type: 'review.personal',
      voteId: 'v1',
      assessmentId: 'a1',
      nodeId: 'C',
      userId: 'u1',
      credence: null,
      influence: 0,
    },
    {
      type: 'review.influence',
      id: 'a2',
      subjectType: 'primary',
      subjectId: 'C',
      userId: 'u2',
      influence: 4,
    },
    { type: 'review.credence', id: 'v3', nodeId: 'E', userId: 'u1', credence: 40 },
    {
      type: 'review.influence',
      id: 'a3',
      subjectType: 'primary',
      subjectId: 'E',
      userId: 'u1',
      influence: -5,
    },
    { type: 'review.credence', id: 'v4', nodeId: 'E', userId: 'u2', credence: 100 },
    { type: 'review.influence', id: 'a4', subjectType: 'primary', subjectId: 'E', userId: 'u2', influence: 5 }
  );
  return p;
}

test('"no effect" excuses the person\'s reviews below the reason everywhere; retracting it brings them back', () => {
  const p = twoPeople();
  assert.deepEqual([...(noEffectExcusals(p).get('E') ?? [])], ['u1']);
  const shared = evaluate(p);
  assert.equal(S(shared.get('C')?.score), 50);
  assert.equal(shared.get('C')?.incomplete, false);
  assert.equal(S(shared.get('T')?.score), 15);
  assert.equal(shared.get('T')?.incomplete, false);
  assert.equal(
    baseConfidence(
      p,
      p.nodes.find((n) => n.id === 'E')!
    ).base,
    100
  );
  assert.equal(projectLens(p).credence.get('E')?.count, 1);
  const own = evaluateAssessor(p, 'u1');
  assert.equal(own.get('C')?.score, null);
  assert.equal(S(own.get('T')?.score), 0);
  assert.equal(own.get('T')?.incomplete, false);
  const back = run(p, { type: 'review.retractInfluence', nodeId: 'C', userId: 'u1' });
  assert.equal(noEffectExcusals(back).size, 0);
  assert.equal(S(evaluate(back).get('C')?.score), 0);
  assert.equal(S(evaluate(back).get('T')?.score), 20);
  assert.equal(evaluate(back).get('T')?.incomplete, true);
  assert.equal(back.votes.length, 2);
  assert.throws(() =>
    applyCommand(back, { type: 'review.retractInfluence', nodeId: 'C', userId: 'u1' }, ctx)
  );
  assert.equal(noEffectExcusals(twoPeople(SCORING_V3)).size, 0);
});
