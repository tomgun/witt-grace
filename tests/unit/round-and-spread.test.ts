/**
 * must: a credence rating stores a digest of what lay below the claim, and `credenceSubtreeChanged` is true exactly
 *       when a reason below was added, removed, renamed, switched to a note or linked in after the rating; saving
 *       the same figure again clears it; another person's rating, and a rating saved before the digest existed,
 *       never mark it; the digest survives save and open (owner 2026-11-18, WG-031). Under the anchored methods
 *       the guided round asks a claim after its reasons, under the earlier methods before them. `credenceSpread`
 *       and `viewpointSpread` give the lowest and highest counted rating and own result, leave an AI profile and a
 *       person without a result out, and never read a missing one as zero (WG-032).
 * test: tests/unit/round-and-spread.test.ts
 * red-against: the digest taken from the direct children only (a rename two levels down goes unseen), ratings folded
 *              into the digest (a colleague's rating marks mine), a missing digest read as changed, the digest left
 *              unstamped when the figure is unchanged, the reasons-first order applied to the prototype's method, an
 *              AI rating widening the range, a person with no reviews counted as a result of 50
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCommand,
  assessmentOrder,
  createBlankProject,
  credenceSpread,
  credenceSubtreeChanged,
  influenceSummary,
  parseProject,
  personalCredence,
  SCORING_ANCHORED,
  SCORING_DIRECT,
  SCORING_V3,
  SCORING_V4,
  serializeProjectFile,
  subtreeFingerprint,
  viewpointSpread,
} from '../../src/domain/index.ts';
import type { Command, Project, ScoringVersion } from '../../src/domain/index.ts';

const ctx = { now: '2026-11-18T10:00:00.000Z', actorId: 'u1' };
let n = 0;
const run = (p: Project, ...commands: Command[]) => commands.reduce((acc, c) => applyCommand(acc, c, ctx), p);
const blank = (scoring: ScoringVersion = SCORING_ANCHORED) =>
  createBlankProject({ projectId: 'p', rootId: 'T', userId: 'u1', now: ctx.now, scoring });
const add = (p: Project, id: string, parentId: string, relation: 'support' | 'oppose' = 'support') =>
  run(p, { type: 'node.add', id, parentId, relation, title: id });
const rate = (p: Project, nodeId: string, credence: number, userId = 'u1') =>
  run(p, { type: 'review.credence', id: `v${++n}`, nodeId, userId, credence });
const weigh = (p: Project, subjectId: string, influence: number, userId = 'u1') =>
  run(p, { type: 'review.influence', id: `a${++n}`, subjectType: 'primary', subjectId, userId, influence });
const changed = (p: Project, nodeId: string, userId = 'u1') =>
  credenceSubtreeChanged(p, personalCredence(p, nodeId, userId));

test('a rating is marked when something below the claim changed after it, and saving it again clears the mark', () => {
  let p = rate(add(blank(), 'A', 'T'), 'A', 70);
  assert.equal(personalCredence(p, 'A', 'u1')?.subtree, subtreeFingerprint(p, 'A'));
  assert.equal(changed(p, 'A'), false, 'nothing below changed');

  p = add(p, 'A1', 'A');
  assert.equal(changed(p, 'A'), true, 'a reason was added under a rated leaf');
  p = rate(p, 'A', 70);
  assert.equal(changed(p, 'A'), false, 'the same figure saved again is current');

  p = add(p, 'A1a', 'A1');
  assert.equal(changed(p, 'A'), true, 'a reason two levels down was added');
  p = rate(p, 'A', 70);
  p = run(p, { type: 'node.edit', id: 'A1a', title: 'Another wording' });
  assert.equal(changed(p, 'A'), true, 'a reason two levels down was renamed');
  p = rate(p, 'A', 70);
  p = run(p, { type: 'node.edit', id: 'A1', unrated: true });
  assert.equal(changed(p, 'A'), true, 'a reason became a note');
  p = rate(p, 'A', 70);
  p = run(p, { type: 'node.remove', id: 'A1a' });
  assert.equal(changed(p, 'A'), true, 'a reason was removed');
});

test("another person's rating, the claim's own title and a rating without a digest never mark it", () => {
  let p = run(blank(), { type: 'user.add', id: 'u2', name: 'Second' });
  p = rate(add(add(p, 'A', 'T'), 'A1', 'A'), 'A', 60);
  p = weigh(rate(p, 'A1', 20, 'u2'), 'A1', 3, 'u2');
  assert.equal(changed(p, 'A'), false, "a colleague's ratings below are not a change of the tree");
  p = run(p, { type: 'node.edit', id: 'A', title: 'Reworded claim' });
  assert.equal(changed(p, 'A'), false, 'the claim itself is not below itself');
  assert.equal(changed(p, 'A', 'u2'), false, 'no rating, nothing to mark');

  const file = JSON.parse(serializeProjectFile(p)) as { votes: { subtree?: string }[] };
  assert.equal(parseProject(file).votes[0]?.subtree, subtreeFingerprint(p, 'A'), 'kept over save and open');
  for (const vote of file.votes) delete vote.subtree;
  const old = add(parseProject(file), 'A2', 'A');
  assert.equal(changed(old, 'A'), false, 'an older rating has no digest and is never marked');
});

test('a secondary link into the branch changes the digest; the order of siblings does not', () => {
  let p = add(add(add(blank(), 'A', 'T'), 'A1', 'A'), 'B', 'T');
  const before = subtreeFingerprint(p, 'A');
  assert.equal(subtreeFingerprint({ ...p, nodes: [...p.nodes].reverse() }, 'A'), before);
  p = run(p, { type: 'link.add', id: 'L1', sourceId: 'B', targetId: 'A1', value: 2 });
  assert.notEqual(subtreeFingerprint(p, 'A'), before);
  assert.equal(subtreeFingerprint(p, 'B'), subtreeFingerprint(blank(), 'T'), 'a leaf has the empty digest');
});

test('the guided round asks a claim after its reasons under the anchored methods only', () => {
  const tree = (scoring: ScoringVersion) =>
    add(add(add(add(blank(scoring), 'A', 'T'), 'A1', 'A'), 'A2', 'A'), 'B', 'T');
  assert.deepEqual(assessmentOrder(tree(SCORING_ANCHORED)), ['A1', 'A2', 'A', 'B', 'T']);
  assert.deepEqual(assessmentOrder(tree(SCORING_DIRECT)), ['A1', 'A2', 'A', 'B', 'T']);
  assert.deepEqual(assessmentOrder(tree(SCORING_V4)), ['T', 'A', 'A1', 'A2', 'B']);
  assert.deepEqual(assessmentOrder(tree(SCORING_V3)), ['T', 'A', 'A1', 'A2', 'B']);
});

test('the spread is the lowest and highest counted figure; AI and missing viewpoints stay out', () => {
  let p = run(
    blank(),
    { type: 'user.add', id: 'u2', name: 'Second' },
    { type: 'user.add', id: 'u3', name: 'Silent' },
    { type: 'user.add', id: 'ai', name: 'Model', profileKind: 'ai' }
  );
  p = add(p, 'A', 'T');
  assert.equal(credenceSpread(p, 'A'), null, 'no ratings, no range');
  assert.equal(viewpointSpread(p, 'T'), null);
  p = weigh(rate(p, 'A', 40), 'A', 2);
  p = weigh(rate(p, 'A', 90, 'u2'), 'A', -1, 'u2');
  p = weigh(rate(p, 'A', 0, 'ai'), 'A', -5, 'ai');
  assert.deepEqual(credenceSpread(p, 'A'), { count: 2, min: 40, max: 90 });
  const influence = influenceSummary(p, 'primary', 'A');
  assert.deepEqual([influence.count, influence.min, influence.max, influence.signConflict], [2, -1, 2, true]);
  // u1: 100·(2.5 + 0.4·2)/(5 + 0.8) = 56.9; u2: 100·2.5/(5 + 0.9·1) = 42.4; u3 has no result.
  const range = viewpointSpread(p, 'T');
  assert.equal(range?.count, 2);
  assert.equal(range?.min.toFixed(3), '42.373');
  assert.equal(range?.max.toFixed(3), '56.897');
});
