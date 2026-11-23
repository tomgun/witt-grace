/**
 * must: the change history (owner 2026-11-23) keeps every diagram's steps apart and the project structure's in
 *       their own stack: Kumoa takes the shown diagram's own newest step, and a structure step only when that step
 *       brought the shown diagram into the project; the history list walks the shown diagram's and the
 *       structure's steps in the order they were made; a removed tab's Kumoa takes the newest structure step; a new change in a diagram drops that diagram's undone steps and the structure's, never
 *       another diagram's; each stack holds 60 steps; a change is a structure step when the diagrams, their order,
 *       a name or the sketchpads' ids and names differ, a diagram step when only the shown diagram's content does,
 *       and no step when another tab is shown or a sketchpad is drawn on; a command is listed by its family with
 *       the claim it concerned
 * test: tests/unit/history.test.ts
 * red-against: undo popping the globally newest step whatever tab is shown, Kumoa in one tab removing a tab added
 *              since (with the work in it), redo taking the newest undone step
 *              (states applied out of order), a drawing recorded as a structure step (undo would wipe strokes),
 *              a tab switch recorded as a step, the 61st step growing the stack, a rating listed as "Muokattu"
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlankProject } from '../../src/domain/index.ts';
import type { Project, Workbook } from '../../src/domain/index.ts';
import { addElement, blankSketch } from '../../src/domain/sketch.ts';
import { commandLabel, createHistory, stepKind } from '../../src/app/history.ts';

const NOW = '2026-11-23T10:00:00.000Z';
const doc = (id: string, title = id): Project => ({
  ...createBlankProject({ projectId: id, rootId: `${id}-root`, userId: 'u-1', now: NOW }),
  title,
});
const book = (documents: Project[], extra: Partial<Workbook> = {}): Workbook => ({
  id: 'wb',
  title: '',
  documents,
  sketches: [],
  ...extra,
});
const label = { key: 'historyChange' as const };

test('Kumoa stays with the shown diagram; the list walks its steps and the structure’s', () => {
  const make = () => {
    const history = createHistory();
    const a = doc('a');
    const b = doc('b');
    const diagram = (d: Project) => ({ scope: 'diagram' as const, docId: d.id, before: d, after: d });
    history.record(diagram(a), label, NOW); // 1
    history.record(
      {
        scope: 'project',
        before: { workbook: book([a]), shownId: 'a' },
        after: { workbook: book([a, b]), shownId: 'b' },
      },
      label,
      NOW
    ); // 2: b comes into the project while a is shown
    history.record(diagram(b), label, NOW); // 3
    history.record(diagram(a), label, NOW); // 4
    history.record(diagram(b), label, NOW); // 5
    return history;
  };
  const seqs = (take: () => { seq: number } | null) => {
    const out: number[] = [];
    for (let step = take(); step; step = take()) out.push(step.seq);
    return out;
  };
  assert.deepEqual(
    make()
      .list('a')
      .map((s) => s.step.seq),
    [1, 2, 4]
  );
  assert.deepEqual(
    make()
      .list('b')
      .map((s) => s.step.seq),
    [2, 3, 5]
  );
  // Shown a: only a's own steps. The structure step did not bring a into the project, so Kumoa leaves it.
  let history = make();
  assert.deepEqual(
    seqs(() => history.takeUndo('a')),
    [4, 1]
  );
  assert.deepEqual(history.can('a'), { undo: false, redo: true });
  assert.deepEqual(history.can('b'), { undo: true, redo: false });
  assert.deepEqual(
    seqs(() => history.takeRedo('a')),
    [1, 4]
  );
  // Shown b: its own steps, and then the step that added b, since b has nothing of its own left after it.
  history = make();
  assert.deepEqual(
    seqs(() => history.takeUndo('b')),
    [5, 3, 2]
  );
  // b is gone and a is shown: Tee uudelleen makes the step again because it was made from a.
  assert.deepEqual(history.can('a'), { undo: true, redo: true });
  assert.equal(history.takeRedo('a')?.seq, 2);
  // The list walks the structure step from either diagram, in order.
  history = make();
  assert.deepEqual(
    seqs(() => history.takeUndo('a', true)),
    [4, 2, 1]
  );
  assert.deepEqual(
    seqs(() => history.takeRedo('a', true)),
    [1, 2, 4]
  );
  // A removed tab's own Kumoa: only while that step is the newest structure step.
  history = make();
  assert.equal(history.newestStructure(), 2);
  assert.equal(history.takeStructureUndo(1), null);
  assert.equal(history.takeStructureUndo(2)?.seq, 2);
  assert.equal(history.newestStructure(), null);
});

test('a new change drops the undone steps of its own diagram and of the structure, not another diagram’s', () => {
  const history = createHistory();
  const a = doc('a');
  const b = doc('b');
  const diagram = (d: Project) => ({ scope: 'diagram' as const, docId: d.id, before: d, after: d });
  history.record(diagram(a), label, NOW);
  history.record(diagram(b), label, NOW);
  history.takeUndo('a');
  history.takeUndo('b');
  history.record(diagram(a), label, NOW);
  assert.deepEqual(history.can('a'), { undo: true, redo: false });
  assert.deepEqual(history.can('b'), { undo: false, redo: true });
});

test('a stack holds 60 steps: the 61st pushes the oldest out', () => {
  const history = createHistory();
  const a = doc('a');
  for (let i = 0; i < 61; i++)
    history.record({ scope: 'diagram', docId: 'a', before: a, after: a }, label, NOW);
  const seqs = history.list('a').map((s) => s.step.seq);
  assert.equal(seqs.length, 60);
  assert.equal(seqs[0], 2);
  assert.equal(seqs[59], 61);
});

test('what kind of step a change is', () => {
  const a = doc('a');
  const b = doc('b');
  const base = book([a, b]);
  const at = (workbook: Workbook, shownId: string) => ({ workbook, shownId });
  const edited = doc('a', 'muokattu');
  assert.equal(stepKind(at(base, 'a'), at(book([edited, b]), 'a')), 'diagram');
  assert.equal(stepKind(at(base, 'a'), at(base, 'b')), 'none');
  assert.equal(stepKind(at(base, 'a'), at(base, 'a')), 'none');
  assert.equal(stepKind(at(base, 'a'), at(book([b, a]), 'a')), 'project');
  assert.equal(stepKind(at(base, 'a'), at(book([a]), 'a')), 'project');
  assert.equal(stepKind(at(base, 'a'), at(book([a, b], { title: 'Hanke' }), 'a')), 'project');
  // Sketchpads: one added or renamed is structure; a drawing on one is not a step here.
  const pad = { id: 's1', name: 'Lehtiö 1', sketch: blankSketch('f1') };
  const withPad = book([a, b], { sketches: [pad] });
  const drawnOn = addElement(pad.sketch, 0, {
    id: 'p',
    type: 'pen',
    color: 0,
    size: 4,
    points: [1, 1, 2, 2],
  });
  assert.equal(stepKind(at(base, 'a'), at(withPad, 'a')), 'project');
  assert.equal(
    stepKind(at(withPad, 'a'), at(book([a, b], { sketches: [{ ...pad, name: 'Animaatio' }] }), 'a')),
    'project'
  );
  assert.equal(
    stepKind(at(withPad, 'a'), at(book([a, b], { sketches: [{ ...pad, sketch: drawnOn }] }), 'a')),
    'none'
  );
});

test('a command is listed by its family, with the claim it concerned', () => {
  const before = doc('a', 'A');
  const root = before.nodes[0] as { id: string; title: string };
  const keyOf = (type: string, extra: object = {}) =>
    commandLabel({ type, ...extra } as never, before, before).key;
  assert.deepEqual(commandLabel({ type: 'node.edit', id: root.id } as never, before, before), {
    key: 'historyNodeEdit',
    detail: root.title,
  });
  assert.deepEqual(commandLabel({ type: 'project.setTitle', title: 'Uusi' }, before, doc('a', 'Uusi')), {
    key: 'historyTitle',
    detail: 'Uusi',
  });
  assert.deepEqual(
    [
      'project.setScoring',
      'node.add',
      'node.remove',
      'node.move',
      'node.position',
      'layout.auto',
      'node.collapse',
      'review.credence',
      'link.add',
      'comment.add',
      'concept.attach',
      'shared.add',
      'user.rename',
      'ballot.cast',
      'round.start',
    ].map((type) => keyOf(type)),
    [
      'historySettings',
      'historyNodeAdd',
      'historyNodeRemove',
      'historyNodeMove',
      'historyLayout',
      'historyLayout',
      'historyLayout',
      'historyReview',
      'historyLink',
      'historyComment',
      'historyReason',
      'historyReason',
      'historyPeople',
      'historyVote',
      'historyVote',
    ]
  );
  // A long claim is cut at 60 characters.
  const long = { ...before, nodes: [{ ...before.nodes[0], title: 'x'.repeat(80) }] } as Project;
  assert.equal(commandLabel({ type: 'node.edit', id: root.id } as never, long, long).detail?.length, 60);
});
