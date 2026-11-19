/**
 * must: the result box reads a balance in words from the figure it shows: above zero "kallistuu puolesta", below
 *       "kallistuu vastaan", a shown 0.0 "tasan"; a computed credence (a rated claim under the anchored method) and
 *       a claim without a derived result get no reading, because a percentage needs none and "—" is not zero
 *       (owner 2026-11-19, S-15; CLAUDE.md rule 3)
 * test: tests/unit/result-reading.test.ts
 * red-against: the sign taken from the internal value around 50 inverted, a missing result read as "tasan", a
 *              reading given to a credence percentage, −0.04 shown as −0.0 and read as "vastaan"
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { balanceReading, resultText } from '../../src/app/derive.ts';
import { applyCommand, createBlankProject, evaluate, SCORING_ANCHORED } from '../../src/domain/index.ts';
import type { Command, NodeScore, Project } from '../../src/domain/index.ts';

const at = { now: '2026-11-19T10:00:00.000Z', actorId: 'u1' };
let n = 0;
const run = (p: Project, ...commands: Command[]) => commands.reduce((acc, c) => applyCommand(acc, c, at), p);
const review = (p: Project, nodeId: string, credence: number, influence: number) =>
  run(
    p,
    { type: 'review.credence', id: `v${++n}`, nodeId, userId: 'u1', credence },
    {
      type: 'review.influence',
      id: `a${++n}`,
      subjectType: 'primary',
      subjectId: nodeId,
      userId: 'u1',
      influence,
    }
  );
const blank = run(
  createBlankProject({ projectId: 'p', rootId: 'T', userId: 'u1', now: at.now, scoring: SCORING_ANCHORED }),
  { type: 'node.add', id: 'A', parentId: 'T', relation: 'support', title: 'A' },
  { type: 'node.add', id: 'B', parentId: 'A', relation: 'support', title: 'B' }
);
const node = (p: Project, id: string) => p.nodes.find((x) => x.id === id)!;

test('an unrated thesis leans the way its reason points', () => {
  const pro = review(blank, 'A', 100, 5);
  assert.equal(resultText(node(pro, 'T'), evaluate(pro).get('T')), '+50.0 †');
  assert.equal(balanceReading(node(pro, 'T'), evaluate(pro).get('T')), 'leansFor');
  const con = review(blank, 'A', 100, -5);
  assert.equal(resultText(node(con, 'T'), evaluate(con).get('T')), '-50.0 †');
  assert.equal(balanceReading(node(con, 'T'), evaluate(con).get('T')), 'leansAgainst');
});

test('nothing derived is no reading: "—" is not "tasan"', () => {
  assert.equal(resultText(node(blank, 'T'), evaluate(blank).get('T')), '—');
  assert.equal(balanceReading(node(blank, 'T'), evaluate(blank).get('T')), null);
  assert.equal(balanceReading(node(blank, 'T'), undefined), null);
});

test('a computed credence is a percentage and gets no reading', () => {
  const p = review(review(blank, 'A', 80, 3), 'B', 100, 5);
  const a = evaluate(p).get('A');
  assert.equal(a?.credence, true);
  assert.match(resultText(node(p, 'A'), a), / %$/);
  assert.equal(balanceReading(node(p, 'A'), a), null);
});

test('the word follows the shown figure: a balance that rounds to 0.0 is "tasan"', () => {
  const p = review(blank, 'A', 100, 5);
  const real = evaluate(p).get('T') as NodeScore;
  const shown = (score: number) => balanceReading(node(p, 'T'), { ...real, score });
  assert.equal(shown(50), 'leansNeither');
  assert.equal(shown(49.98), 'leansNeither'); // −0.04 → shown 0.0
  assert.equal(shown(50.02), 'leansNeither');
  assert.equal(shown(50.03), 'leansFor'); // +0.06 → shown +0.1
  assert.equal(shown(49.97), 'leansAgainst');
});
