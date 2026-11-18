/**
 * must: the range of people's ratings is said in the tooltip of a card's rating chip and of a target's result chip,
 *       with the sentence about opposite directions when signs differ; the card itself shows the range only when
 *       the view asks for it, never in a personal view, and never for one rater alone; an unrated claim's result
 *       tooltip says what it passes upward (owner 2026-11-18, WG-032, S-15)
 * test: tests/unit/review-spread-chips.test.ts
 * red-against: the spread chip on the card by default, a range shown for a single rater, the sign conflict dropped,
 *              the group's range leaking into one person's view
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { cardChips } from '../../src/app/derive.ts';
import type { DeriveContext } from '../../src/app/derive.ts';
import { LAYER_PRESETS, defaultView } from '../../src/app/view.ts';
import type { ViewState } from '../../src/app/view.ts';
import {
  applyCommand,
  createBlankProject,
  evaluate,
  evaluateAssessor,
  projectLens,
  SCORING_ANCHORED,
} from '../../src/domain/index.ts';
import type { Command, Project } from '../../src/domain/index.ts';
import { FI, translator } from '../../src/lib/i18n/i18n.ts';

const t = translator(FI);
const at = { now: '2026-11-18T10:00:00.000Z', actorId: 'u1' };
let n = 0;
const run = (p: Project, ...commands: Command[]) => commands.reduce((acc, c) => applyCommand(acc, c, at), p);
const review = (p: Project, nodeId: string, userId: string, credence: number, influence: number) =>
  run(
    p,
    { type: 'review.credence', id: `v${++n}`, nodeId, userId, credence },
    { type: 'review.influence', id: `a${++n}`, subjectType: 'primary', subjectId: nodeId, userId, influence }
  );
function chips(project: Project, nodeId: string, changes: Partial<ViewState> = {}) {
  const view: ViewState = { ...defaultView(), layers: { ...LAYER_PRESETS.analysis }, ...changes };
  const ctx: DeriveContext = {
    project,
    view,
    actorId: 'u1',
    scores: evaluate(project),
    personalScores: view.indexMode === 'personal' ? evaluateAssessor(project, 'u1') : new Map(),
    lens: projectLens(project),
  };
  const node = project.nodes.find((x) => x.id === nodeId)!;
  return cardChips(ctx, t, node, view.layers, { effects: new Map(), importantIds: new Set() });
}
const chip = (list: ReturnType<typeof chips>, cls: string) => list.find((c) => c.cls?.includes(cls));

let base = createBlankProject({
  projectId: 'p',
  rootId: 'T',
  userId: 'u1',
  now: at.now,
  scoring: SCORING_ANCHORED,
});
base = run(
  base,
  { type: 'user.add', id: 'u2', name: 'Second' },
  { type: 'node.add', id: 'A', parentId: 'T', relation: 'support', title: 'A' }
);

test('two raters: the tooltips carry the ranges, the card only when the view asks', () => {
  const p = review(review(base, 'A', 'u1', 40, 2), 'A', 'u2', 90, -1);
  const plain = chips(p, 'A');
  assert.equal(chip(plain, 'meta-spread'), undefined, 'not on the card by default');
  const rating = chip(plain, 'meta-assessment')!.title!;
  assert.match(rating, /Uskottavuusarviot 40–90 % \(arvioijia 2\)\./);
  assert.match(rating, /Merkittävyysarviot -1…\+2 \(arvioijia 2\)\./);
  assert.match(rating, /Arvioijat ovat eri mieltä vaikutuksen suunnasta\./);
  // The thesis: u1 sees 100·(2.5 + 0.8)/5.8 = 56.9 (+14), u2 sees 100·2.5/5.9 = 42.4 (−15).
  assert.match(
    chip(chips(p, 'T'), 'meta-index')!.title!,
    /Arvioijien omat tulokset -15…\+14 \(arvioijia 2\)\./
  );

  const shown = chip(chips(p, 'A', { showSpread: true }), 'meta-spread')!;
  assert.equal(shown.value, '40–90%/-1…+2!');
  assert.match(shown.cls!, /conflict/);
  assert.equal(chip(chips(p, 'T', { showSpread: true }), 'meta-spread')!.value, '-15…+14');
  assert.equal(
    chip(chips(p, 'A', { showSpread: true, indexMode: 'personal' }), 'meta-spread'),
    undefined,
    "one person's view has no range"
  );
});

test('one rater alone gives no range, and an unrated claim says what it passes upward', () => {
  let p = review(base, 'A', 'u1', 40, 2);
  assert.equal(chip(chips(p, 'A', { showSpread: true }), 'meta-spread'), undefined);
  assert.doesNotMatch(chip(chips(p, 'A'), 'meta-assessment')!.title!, /arvioijia/);
  // B is rated by nobody; its one 100 % / +1 reason gives the net +33.3, and B passes 33 % of its influence.
  p = run(
    p,
    { type: 'node.add', id: 'B', parentId: 'T', relation: 'support', title: 'B' },
    { type: 'node.add', id: 'B1', parentId: 'B', relation: 'support', title: 'B1' }
  );
  p = review(p, 'B1', 'u1', 100, 1);
  assert.match(chip(chips(p, 'B'), 'meta-index')!.title!, /välittää ylöspäin 33 % merkittävyydestään/);
});
