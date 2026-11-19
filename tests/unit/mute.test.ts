/**
 * must: muting a reason for a what-if (owner 2026-11-18, S-15) scores the document exactly as if the reason and
 *       everything below it were not there, for the pooled result and for one person's view alike, including a
 *       secondary link that starts inside the muted branch; it is a copy for evaluation only (no review or node of
 *       the document changes, and nothing muted returns the document itself); the root, an option and an unrated
 *       note cannot be muted
 * test: tests/unit/mute.test.ts
 * red-against: only the muting person's reviews left out (the "En arvioi" rule), the branch below still scoring
 *              through a secondary link, the document's own nodes marked unrated, an option muted out of a decision
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCommand,
  createBlankProject,
  evaluate,
  evaluateAssessor,
  mutable,
  SCORING_ANCHORED,
  withoutBranches,
} from '../../src/domain/index.ts';
import type { Command, Project } from '../../src/domain/index.ts';

const at = { now: '2026-11-18T10:00:00.000Z', actorId: 'u1' };
let n = 0;
const run = (p: Project, ...commands: Command[]) => commands.reduce((acc, c) => applyCommand(acc, c, at), p);
const reason = (p: Project, id: string, parentId: string, influence: number, raters = ['u1', 'u2']) => {
  p = run(p, { type: 'node.add', id, parentId, relation: influence < 0 ? 'oppose' : 'support', title: id });
  for (const userId of raters)
    p = run(
      p,
      { type: 'review.credence', id: `v${++n}`, nodeId: id, userId, credence: 100 },
      { type: 'review.influence', id: `a${++n}`, subjectType: 'primary', subjectId: id, userId, influence }
    );
  return p;
};
const net = (p: Project, id = 'T') => (2 * (evaluate(p).get(id)?.score ?? NaN) - 100).toFixed(1);

let base = createBlankProject({
  projectId: 'p',
  rootId: 'T',
  userId: 'u1',
  now: at.now,
  scoring: SCORING_ANCHORED,
});
base = run(base, { type: 'user.add', id: 'u2', name: 'Second' });
base = reason(base, 'A', 'T', 5);
const onlyA = base;
base = reason(reason(base, 'B', 'T', -5), 'B1', 'B', 5);

test('a muted reason and its branch leave the result for everyone, and come back', () => {
  assert.equal(net(onlyA), '50.0', 'one 100 % / +5 reason');
  assert.equal(net(base), '0.0', 'a +5 and a −5 reason');
  const muted = withoutBranches(base, new Set(['B']));
  assert.equal(net(muted), '50.0', 'as if B were not there, though two people rated it');
  assert.equal((2 * (evaluateAssessor(muted, 'u2').get('T')?.score ?? NaN) - 100).toFixed(1), '50.0');
  assert.equal(net(withoutBranches(base, new Set())), '0.0');
  assert.equal(withoutBranches(base, new Set()), base, 'nothing muted is the document itself');
});

test('a secondary link from inside a muted branch stops scoring too', () => {
  // B1 (100 %) also speaks against A at −3: A = 100·2/(2 + 3) = 40 %, T = 100·(2.5 + 2)/(5 + 2 + 5) = 37.5 → −25.
  let linked = run(base, { type: 'link.add', id: 'L1', sourceId: 'B1', targetId: 'A', value: -3 });
  for (const userId of ['u1', 'u2'])
    linked = run(linked, {
      type: 'review.influence',
      id: `l${userId}`,
      subjectType: 'secondary',
      subjectId: 'L1',
      userId,
      influence: -3,
    });
  assert.equal(net(linked), '-25.0');
  assert.equal(net(withoutBranches(linked, new Set(['B']))), '50.0');
});

test('muting is a copy for evaluation: the document is untouched, and only reasons can be muted', () => {
  const before = JSON.stringify(base);
  const muted = withoutBranches(base, new Set(['B']));
  assert.equal(JSON.stringify(base), before);
  assert.deepEqual(muted.votes, base.votes);
  assert.equal(
    muted.nodes.find((x) => x.id === 'A'),
    base.nodes.find((x) => x.id === 'A')
  );
  assert.equal(withoutBranches(base, new Set(['T'])), base, 'the root is not a reason');
  assert.equal(mutable(base.nodes.find((x) => x.id === 'T')), false);
  assert.equal(mutable(base.nodes.find((x) => x.id === 'B')), true);
  const note = run(base, { type: 'node.edit', id: 'B', unrated: true });
  assert.equal(mutable(note.nodes.find((x) => x.id === 'B')), false, 'a note is already out of the result');
});
