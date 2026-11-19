/**
 * must: a walkthrough step that asks for an action is passed only when the document shows it was done: a supporting
 *       reason exists and has the person's own words, both reasons carry that person's two ratings, the table is
 *       open; in the second walkthrough a second human assessor exists and that assessor, not the first, has rated;
 *       in the third the collaboration dialog has been opened and closed. A step that only explains is never passed
 *       by the document. The callout sits beside its target on the first side with room, below the header rows, with
 *       its arrow at the target's height, and nowhere when there is no room (owner 2026-11-19, UI_INVENTORY S-15)
 * test: tests/unit/tutorials.test.ts
 * red-against: the default title counted as a wording, one rating counted as both, the first assessor's ratings
 *              read as the second's, an AI profile counted as the added assessor, the dialog step passed while the
 *              dialog is still open, a manual step skipped because a later condition already holds, the callout
 *              drawn over the toolbar
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BASICS,
  COLLAB,
  PEOPLE,
  TUTORIALS,
  advance,
  lastStep,
  placeBeside,
} from '../../src/app/tutorials.ts';
import type { TutorialFacts, TutorialRun } from '../../src/app/tutorials.ts';
import { applyCommand, createBlankProject, SCORING_ANCHORED } from '../../src/domain/index.ts';
import type { Command, Project } from '../../src/domain/index.ts';

const at = { now: '2026-11-19T10:00:00.000Z', actorId: 'u1' };
let n = 0;
const run = (p: Project, ...commands: Command[]) => commands.reduce((acc, c) => applyCommand(acc, c, at), p);
const blank = createBlankProject({
  projectId: 'p',
  rootId: 'T',
  userId: 'u1',
  now: at.now,
  scoring: SCORING_ANCHORED,
});
const facts = (project: Project, over: Partial<TutorialFacts> = {}): TutorialFacts => ({
  project,
  actorId: 'u1',
  presentation: 'tree',
  workflow: 'explore',
  dialog: null,
  ...over,
});
const start = (id: TutorialRun['id'], over: Partial<TutorialRun> = {}): TutorialRun => ({
  id,
  step: 0,
  rootId: 'T',
  supportId: null,
  opposeId: null,
  firstUserId: 'u1',
  secondUserId: null,
  messShown: false,
  collabOpened: false,
  // A run that starts at a step has reached it.
  furthest: over.step ?? 0,
  ...over,
});
const credence = (p: Project, nodeId: string, userId: string) =>
  run(p, { type: 'review.credence', id: `v${++n}`, nodeId, userId, credence: 70 });
const influence = (p: Project, nodeId: string, userId: string) =>
  run(p, {
    type: 'review.influence',
    id: `a${++n}`,
    subjectType: 'primary',
    subjectId: nodeId,
    userId,
    influence: 2,
  });

test('the three walkthroughs: counted steps and the order of the phases', () => {
  assert.deepEqual([lastStep('basics'), lastStep('people'), lastStep('collab')], [16, 5, 4]);
  // Doing first: Kartoita, then the look around, then Punnitse, Tulos and Näkymät.
  assert.deepEqual(TUTORIALS.basics.phases, [
    'explore',
    'tutPhaseTour',
    'evaluate',
    'tutPhaseResult',
    'tutPhaseViews',
  ]);
  assert.deepEqual(
    TUTORIALS.basics.steps.map((s) => s.phase),
    [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 4, 4, 4, 4]
  );
  // The list of the tree is shown only once the tree has reasons in it.
  assert.ok(BASICS.tourLeft > BASICS.nameOppose);
  assert.equal(TUTORIALS.basics.steps[BASICS.addSupport]?.text, 'tutorialStep0');
  assert.equal(TUTORIALS.basics.next?.id, 'people');
  assert.equal(TUTORIALS.people.next?.id, 'collab');
  assert.equal(TUTORIALS.collab.next, undefined);
});

test('basics: a step that explains waits, whatever the document already shows', () => {
  const withReason = run(blank, {
    type: 'node.add',
    id: 'A',
    parentId: 'T',
    relation: 'support',
    title: 'Oma',
  });
  for (const step of [
    BASICS.tourTree,
    BASICS.tourLeft,
    BASICS.tourInspector,
    BASICS.tourZones,
    BASICS.round,
    BASICS.readResult,
    BASICS.done,
  ])
    assert.equal(advance(start('basics', { step }), facts(withReason)).step, step);
});

test('basics: adding, wording and rating each pass exactly their own step', () => {
  let r = start('basics', { step: BASICS.addSupport });
  assert.equal(advance(r, facts(blank)).step, BASICS.addSupport);
  let p = run(blank, { type: 'node.add', id: 'A', parentId: 'T', relation: 'support' });
  r = advance(r, facts(p));
  assert.deepEqual([r.step, r.supportId, r.furthest], [BASICS.nameSupport, 'A', BASICS.nameSupport]);
  // The title a new reason is born with is not the person's wording.
  assert.equal(p.nodes.find((x) => x.id === 'A')?.title, 'Puoltava argumentti');
  p = run(p, { type: 'node.edit', id: 'A', title: 'Työmatkat vähenevät' });
  r = advance(r, facts(p));
  assert.equal(r.step, BASICS.addOppose);
  p = run(p, { type: 'node.add', id: 'B', parentId: 'T', relation: 'oppose', title: 'Maksaa liikaa' });
  r = advance(r, facts(p));
  // Added with its wording at once: both steps are passed together, and the look around begins. It waits.
  assert.deepEqual([r.step, r.opposeId], [BASICS.tourLeft, 'B']);
  p = influence(credence(p, 'A', 'u1'), 'A', 'u1');
  assert.equal(advance(r, facts(p)).step, BASICS.tourLeft, 'ratings do not skip the look around');
  r = { ...r, step: BASICS.rateSupport, furthest: BASICS.rateSupport };
  const half = credence(
    run(blank, { type: 'node.add', id: 'A', parentId: 'T', relation: 'support', title: 'x' }),
    'A',
    'u1'
  );
  assert.equal(advance(r, facts(half)).step, BASICS.rateSupport, 'one of the two ratings is not both');
  r = advance(r, facts(p));
  assert.equal(r.step, BASICS.rateOppose);
  p = influence(credence(p, 'B', 'u1'), 'B', 'u1');
  r = advance(r, facts(p));
  // Both rated: the round is explained next, and that step waits for the person.
  assert.equal(r.step, BASICS.round);
  assert.equal(advance(r, facts(p)).step, BASICS.round);
});

test('basics: switching to Punnitse is its own step, passed by the switch alone', () => {
  const r = start('basics', { step: BASICS.toEvaluate });
  assert.equal(advance(r, facts(blank)).step, BASICS.toEvaluate);
  assert.equal(advance(r, facts(blank, { workflow: 'evaluate' })).step, BASICS.rateSupport);
});

test('basics: the table is opened, looked at and left before the tree is arranged', () => {
  let r = start('basics', { step: BASICS.table });
  assert.equal(advance(r, facts(blank)).step, BASICS.table);
  r = advance(r, facts(blank, { presentation: 'table' }));
  assert.equal(r.step, BASICS.tableBack);
  assert.equal(
    advance(r, facts(blank, { presentation: 'table' })).step,
    BASICS.tableBack,
    'it stays while the table is open'
  );
  assert.equal(advance(r, facts(blank)).step, BASICS.arrange);
  // Opening the table earlier does not pass a step that has not been reached.
  assert.equal(
    advance(start('basics', { step: BASICS.readResult }), facts(blank, { presentation: 'table' })).step,
    BASICS.readResult
  );
});

test('going back to a step looks at it again: the document no longer moves it on', () => {
  const p = run(blank, { type: 'node.add', id: 'A', parentId: 'T', relation: 'support', title: 'Oma' });
  const back = start('basics', { step: BASICS.addSupport, furthest: BASICS.readResult, supportId: 'A' });
  // The reason exists, which would pass the step at once; looked at again, it waits for the person.
  assert.equal(advance(back, facts(p)), back);
  // At the furthest step the document moves it on as before.
  const front = start('basics', { step: BASICS.addSupport });
  assert.equal(advance(front, facts(p)).step, BASICS.addOppose);
});

test('people: the added human assessor, and that assessor’s own ratings', () => {
  const base = run(blank, { type: 'node.add', id: 'A', parentId: 'T', relation: 'support', title: 'Oma' });
  const mine = influence(credence(base, 'A', 'u1'), 'A', 'u1');
  let r = start('people', { step: PEOPLE.addAssessor, supportId: 'A' });
  assert.equal(advance(r, facts(mine)).step, PEOPLE.addAssessor);
  const two = run(mine, { type: 'user.add', id: 'u2', name: 'Bea' });
  r = advance(r, facts(two));
  assert.deepEqual([r.step, r.secondUserId], [PEOPLE.rateAsSecond, 'u2']);
  // u1 has rated A; Bea has not.
  assert.equal(advance(r, facts(two)).step, PEOPLE.rateAsSecond);
  const both = influence(credence(two, 'A', 'u2'), 'A', 'u2');
  assert.equal(advance(r, facts(both)).step, PEOPLE.compare);
  assert.equal(advance({ ...r, step: PEOPLE.intro }, facts(both)).step, PEOPLE.intro);
});

test('collab: the dialog opened, then closed', () => {
  let r = start('collab', { step: COLLAB.openDialog });
  assert.equal(advance(r, facts(blank)).step, COLLAB.openDialog);
  r = advance(r, facts(blank, { dialog: 'collab' }));
  assert.deepEqual([r.step, r.collabOpened], [COLLAB.openDialog, true]);
  assert.equal(advance(r, facts(blank, { dialog: 'collab' })), r, 'nothing changes while it stays open');
  assert.equal(advance(r, facts(blank)).step, COLLAB.joining);
  // Another dialog opened first does not count.
  assert.equal(
    advance(start('collab', { step: COLLAB.openDialog }), facts(blank, { dialog: 'help' })).collabOpened,
    false
  );
});

test('the callout sits beside its target, below the header rows, its arrow at the target', () => {
  const view = { w: 1440, h: 900, top: 128 };
  const panel = { w: 345, h: 260 };
  // A card in the middle: to its right, centred on it.
  assert.deepEqual(placeBeside({ left: 540, top: 440, right: 830, bottom: 550 }, panel, view), {
    side: 'right',
    x: 846,
    y: 365,
    arrow: 130,
  });
  // The left panel (tall): to its right, pointing near its top, not above the toolbar.
  assert.deepEqual(placeBeside({ left: 0, top: 128, right: 243, bottom: 860 }, panel, view), {
    side: 'right',
    x: 259,
    y: 136,
    arrow: 72,
  });
  // The inspector at the right edge: no room on the right, so on the left.
  assert.equal(placeBeside({ left: 1127, top: 128, right: 1440, bottom: 860 }, panel, view)?.side, 'left');
  // A menu in the toolbar: from below, the arrow under the menu's middle, the header rows left uncovered.
  assert.deepEqual(
    placeBeside({ left: 960, top: 83, right: 1060, bottom: 117 }, panel, { w: 1440, h: 900, top: 0 }),
    {
      side: 'below',
      x: 837.5,
      y: 133,
      arrow: 172.5,
    }
  );
  // No room anywhere: the caller keeps the panel in its corner.
  assert.equal(placeBeside({ left: 0, top: 0, right: 390, bottom: 844 }, panel, { w: 390, h: 844 }), null);
});
