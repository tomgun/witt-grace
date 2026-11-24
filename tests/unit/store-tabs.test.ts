/**
 * must: the store keeps the project and its shown tab (WG-059): `project` is always the shown tab's diagram; a
 *       command changes only that diagram; attaching adds tabs and shows the first added one; Kumoa belongs to the
 *       shown diagram (owner 2026-11-23): it never takes back a change made in another tab, nor a change to the
 *       project's structure, except the step that brought the shown diagram into the project once that diagram
 *       has nothing of its own left to undo; a structure step (a tab removed, attached, moved, a name, a
 *       sketchpad, an opened project) is taken back by the Kumoa offered after a removal or from the history
 *       list, and keeps what the diagrams hold now; looking at another tab is not a step; the
 *       history list shows the shown diagram's and the structure's steps in order with what they concerned, and
 *       a jump goes to the state after any of them, forward too until a new change is made; one unnamed diagram
 *       is replaced by an opened document (after the replace question), while in a project the document opens in
 *       a new tab without a question and a document another tab holds is refused; in the browser's storage the
 *       shown diagram keeps the prototype's key `witt-project-v3`, the whole project is under `witt-workbook-v1`
 *       only when it is more than one unnamed diagram, and a reload brings back every tab with the newest content
 *       of the shown one; a project has several sketchpads: drawing on one is not a history step, undoing a
 *       diagram edit leaves the drawings, a removed or renamed sketchpad comes back, only drawn ones are stored
 *       the sketchpads this browser kept apart from the project before 2026-11-23 (`witt-sketch-v1`,
 *       `witt-sketch-session-v1`) move into the project once when they hold a drawing, and their old entries go
 *       only when the project is stored; strokes that follow each other closely are written to the project's entry
 *       as one, at most once a second (the first at once, the rest together after it), and a stroke does not
 *       rewrite the shown diagram's autosave
 * test: tests/unit/store-tabs.test.ts
 * red-against: an edit written into the first tab whatever is shown, undo in one tab taking back the newest change
 *              of another (work lost out of sight), Kumoa in one tab removing a tab that was added since, a
 *              removed tab with no way back, a project file with the same diagram ids opened over the person's
 *              work with nothing recorded to take it back, a jump that wanders into another tab and undoes its
 *              steps, redo writing an old edit over a newer file opened under the same id, a sketchpad that comes
 *              back empty after a jump back and forward, undo of a removed tab reverting the edits made since in other
 *              diagrams, a jump that stops one step short or redoes over a new change, a removed diagram that undo cannot bring back, the project entry rewritten
 *              on every keystroke-sized command (it holds every diagram), a one-diagram browser gaining a second
 *              storage entry, a reload showing the stale copy of the diagram that was being edited, the autosave
 *              overwritten before the project entry is safely written (a full quota then loses the diagram that
 *              lived only in the autosave), an entry this build cannot read removed by the next opened document,
 *              undo of a diagram edit taking the drawing made since back with it, a drawn sketchpad lost on
 *              reload, an attached sketchpad written over the person's own, every stroke rewriting the whole project entry (it holds
 *              every diagram) or the shown diagram a stroke does not touch, the last strokes of a burst never written,
 *              an opened file silently taking the place of the shown tab's diagram in a project
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlankProject, rootNode } from '../../src/domain/index.ts';
import type { Project } from '../../src/domain/index.ts';
import { addElement, blankSketch, serializeSketch } from '../../src/domain/sketch.ts';
import type { Sketch } from '../../src/domain/sketch.ts';
import { PROJECT_KEY, memoryStore } from '../../src/lib/storage.ts';
import type { KeyValueStore } from '../../src/lib/storage.ts';
import { WORKBOOK_KEY } from '../../src/lib/workbookStorage.ts';
import { createStore } from '../../src/app/store.ts';

const NOW = '2026-11-23T10:00:00.000Z';
const doc = (id: string, title: string): Project => ({
  ...createBlankProject({ projectId: id, rootId: `${id}-root`, userId: 'u-1', now: NOW }),
  title,
});
const open = (kv: KeyValueStore = memoryStore()) => {
  const store = createStore({ store: kv, persistent: true, windowWidth: 1440 });
  return { store, kv, titles: () => store.get().workbook.documents.map((d) => d.title) };
};
const stored = (kv: KeyValueStore, key: string) => {
  const raw = kv.getItem(key);
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
};
/** A storage that counts writes per key. */
const counting = () => {
  const inner = memoryStore();
  const writes = new Map<string, number>();
  const kv: KeyValueStore = {
    getItem: (k) => inner.getItem(k),
    setItem: (k, v) => {
      writes.set(k, (writes.get(k) ?? 0) + 1);
      inner.setItem(k, v);
    },
    removeItem: (k) => inner.removeItem(k),
  };
  return { kv, writes: (k: string) => writes.get(k) ?? 0 };
};

test('a fresh store is a project of one diagram and writes no project entry', () => {
  const { store, kv } = open();
  assert.equal(store.get().workbook.documents.length, 1);
  assert.equal(store.get().activeTab, 0);
  assert.equal(store.get().project, store.get().workbook.documents[0]);
  store.dispatch({ type: 'project.setTitle', title: 'Yksi' });
  assert.equal(stored(kv, PROJECT_KEY)?.title, 'Yksi');
  assert.equal(kv.getItem(WORKBOOK_KEY), null);
});

test('attaching adds tabs and shows the first added; a command changes the shown diagram only', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  assert.equal(store.attachTabs([doc('b', 'B'), doc('c', 'C')]), 2);
  assert.deepEqual(titles(), ['A', 'B', 'C']);
  assert.equal(store.get().activeTab, 1);
  assert.equal(store.get().project.id, 'b');
  assert.equal(store.get().selectedId, 'b-root');
  store.dispatch({ type: 'project.setTitle', title: 'B muokattu' });
  assert.deepEqual(titles(), ['A', 'B muokattu', 'C']);
  assert.equal(store.get().project, store.get().workbook.documents[1]);
});

test('attaching a diagram the project holds makes a copy, never an overwrite', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  store.dispatch({ type: 'project.setTitle', title: 'A muokattu' });
  assert.equal(store.attachTabs([doc('a', 'A tiedostosta')]), 1);
  assert.deepEqual(titles(), ['A muokattu', 'A tiedostosta']);
  const [first, second] = store.get().workbook.documents;
  assert.equal(first?.id, 'a');
  assert.notEqual(second?.id, 'a');
});

test('undo belongs to the shown diagram: it never takes back a change made in another tab', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  store.attachTabs([doc('b', 'B')]);
  store.selectTab(0);
  store.dispatch({ type: 'project.setTitle', title: 'A2' });
  store.selectTab(1);
  store.dispatch({ type: 'project.setTitle', title: 'B2' });
  store.dispatch({ type: 'project.setTitle', title: 'B3' });
  store.selectTab(0);
  // The newest change of all is B3, but tab A is shown: undo takes back A's own change and stays here.
  store.undo();
  assert.deepEqual(titles(), ['A', 'B3']);
  assert.equal(store.get().activeTab, 0);
  store.redo();
  assert.deepEqual(titles(), ['A2', 'B3']);
  assert.equal(store.get().canRedo, false);
  // In tab B its two changes come back one at a time; A's is not touched.
  store.selectTab(1);
  store.undo();
  store.undo();
  assert.deepEqual(titles(), ['A2', 'B']);
  assert.equal(store.get().activeTab, 1);
  store.redo();
  assert.deepEqual(titles(), ['A2', 'B2']);
});

test('Kumoa leaves the structure alone; a removed tab comes back by its own Kumoa and keeps later edits', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  store.attachTabs([doc('b', 'B'), doc('c', 'C')]);
  store.removeTab(2);
  const restore = store.get().notice?.restore;
  assert.match(store.get().notice?.text ?? '', /Kaavio ”C” poistettu projektista/);
  store.dispatch({ type: 'project.setTitle', title: 'B muokattu' });
  store.selectTab(0);
  // Shown: A, which has no change of its own. Kumoa has nothing to take: it does not bring C back from here.
  assert.equal(store.get().canUndo, false);
  store.undo();
  assert.deepEqual(titles(), ['A', 'B muokattu']);
  // The removal's own Kumoa brings C back, and B's later edit stays.
  assert.equal(store.undoStructure(restore), true);
  assert.deepEqual(titles(), ['A', 'B muokattu', 'C']);
  // Once another structure step is newer, an old notice's Kumoa does nothing.
  store.renameProject('Hanke');
  assert.equal(store.undoStructure(restore), false);
  assert.deepEqual(titles(), ['A', 'B muokattu', 'C']);
});

test('a diagram added to the project is taken away by Kumoa only from that diagram, with nothing of its own left', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  store.attachTabs([doc('b', 'B')]);
  store.dispatch({ type: 'project.setTitle', title: 'B2' });
  store.undo();
  assert.deepEqual(titles(), ['A', 'B']);
  store.undo();
  assert.deepEqual(titles(), ['A']);
  store.redo();
  assert.deepEqual(titles(), ['A', 'B']);
  assert.equal(store.get().project.id, 'b');
});

test('the history list: the shown diagram’s and the structure’s steps in order, and a jump to any of them', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  store.attachTabs([doc('b', 'B')]);
  store.dispatch({ type: 'project.setTitle', title: 'B2' });
  store.dispatch({ type: 'project.setTitle', title: 'B3' });
  store.renameProject('Hanke');
  const rows = () => store.historyList().map(({ step, done }) => [step.label.key, step.label.detail, done]);
  assert.deepEqual(rows(), [
    ['historyReplaced', 'A', true],
    ['historyTabAdd', 'B', true],
    ['historyTitle', 'B2', true],
    ['historyTitle', 'B3', true],
    ['historyProjectRename', 'Hanke', true],
  ]);
  const seqOf = (detail: string) =>
    store.historyList().find(({ step }) => step.label.detail === detail)?.step.seq as number;
  // Back to right after "B2": the rename and B3 are undone and stay listed.
  store.jumpTo(seqOf('B2'));
  assert.deepEqual(titles(), ['A', 'B2']);
  assert.equal(store.get().workbook.title, '');
  assert.deepEqual(
    rows().map((row) => row[2]),
    [true, true, true, false, false]
  );
  // Forward again, since no new change was made.
  store.jumpTo(seqOf('Hanke'));
  assert.deepEqual(titles(), ['A', 'B3']);
  assert.equal(store.get().workbook.title, 'Hanke');
  // A new change after going back drops what was undone.
  store.jumpTo(seqOf('B2'));
  store.dispatch({ type: 'project.setTitle', title: 'B uusi suunta' });
  assert.deepEqual(
    rows().map((row) => row[1]),
    ['A', 'B', 'B2', 'B uusi suunta']
  );
  // The other tab lists its own steps and the structure's, not B's.
  store.selectTab(0);
  assert.deepEqual(
    rows().map((row) => row[0]),
    ['historyReplaced', 'historyTabAdd']
  );
  // The starting state: everything undone.
  store.jumpTo(0);
  assert.equal(store.get().canUndo, false);
  assert.equal(store.get().workbook.documents.length, 1);
});

test('removed tabs come back newest first; the neighbour is shown meanwhile; the last tab stays', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  store.attachTabs([doc('b', 'B'), doc('c', 'C')]);
  store.selectTab(2);
  assert.equal(store.removeTab(2), true);
  assert.deepEqual(titles(), ['A', 'B']);
  assert.equal(store.get().project.id, 'b');
  // Removing a tab left of the shown one keeps the shown diagram shown.
  assert.equal(store.removeTab(0), true);
  assert.equal(store.get().project.id, 'b');
  assert.equal(store.get().activeTab, 0);
  assert.equal(store.removeTab(0), false);
  assert.match(store.get().notice?.text ?? '', /viimeistä kaaviota ei voi poistaa/);
  assert.equal(store.undoStructure(), true);
  assert.equal(store.undoStructure(), true);
  assert.deepEqual(titles(), ['A', 'B', 'C']);
  assert.equal(store.get().project.id, 'c');
});

test('moving a tab keeps the shown diagram shown', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  store.attachTabs([doc('b', 'B'), doc('c', 'C')]);
  assert.equal(store.get().project.id, 'b');
  assert.equal(store.moveTab(1, 0), true);
  assert.deepEqual(titles(), ['B', 'A', 'C']);
  assert.equal(store.get().activeTab, 0);
  assert.equal(store.get().project.id, 'b');
  assert.equal(store.moveTab(0, -1), false);
});

test('one unnamed diagram is replaced by an opened document; in a project the document opens in a new tab', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  store.load(doc('b', 'B'));
  assert.deepEqual(titles(), ['B']);
  store.attachTabs([doc('c', 'C')]);
  store.selectTab(0);
  store.load(doc('z', 'Z'));
  assert.deepEqual(titles(), ['B', 'C', 'Z']);
  assert.equal(store.get().project.id, 'z');
  assert.match(store.get().notice?.text ?? '', /Avattu uudelle välilehdelle: ”Z”/);
  // The shown diagram's own newer version replaces it in place; one another tab holds is refused.
  store.load(doc('z', 'Z uudempi'));
  assert.deepEqual(titles(), ['B', 'C', 'Z uudempi']);
  store.load(doc('b', 'B toisesta tiedostosta'));
  assert.deepEqual(titles(), ['B', 'C', 'Z uudempi']);
  assert.match(store.get().notice?.text ?? '', /on jo auki toisella välilehdellä/);
});

test('the replace question: asked for one diagram with work, not in a project for a document that adds a tab', async () => {
  const { store } = open();
  store.load(doc('a', 'A'));
  void store.prepareReplacement('Korvataanko?', 'new-id');
  assert.equal(store.get().modal?.kind, 'replace');
  store.closeModal();
  store.attachTabs([doc('b', 'B')]);
  assert.equal(await store.prepareReplacement('Korvataanko?', 'new-id'), 'forget');
  assert.equal(store.get().modal, null);
  // The shown diagram's own id means its newer version would replace it: asked as before.
  void store.prepareReplacement('Korvataanko?', store.get().project.id);
  assert.equal(store.get().modal?.kind, 'replace');
  store.closeModal();
  // A diagram open in another tab is refused before anything is asked.
  assert.equal(await store.prepareReplacement('Korvataanko?', 'a'), null);
  assert.equal(store.get().modal, null);
  assert.match(store.get().notice?.text ?? '', /Kaavio ”A” on jo auki toisella välilehdellä/);
});

test('removing a tab right of the shown one keeps the shown one; a move and a project name are taken back', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  store.attachTabs([doc('b', 'B'), doc('c', 'C')]);
  store.removeTab(2);
  assert.equal(store.get().project.id, 'b');
  assert.equal(store.get().activeTab, 1);
  store.moveTab(1, 0);
  store.renameProject('Hanke');
  store.undoStructure();
  assert.equal(store.get().workbook.title, '');
  store.undoStructure();
  assert.deepEqual(titles(), ['A', 'B']);
  assert.equal(store.get().project.id, 'b');
});

/** A storage whose writes to one key fail, as a full quota does for the larger entry. */
const failing = (key: string) => {
  const inner = memoryStore();
  let broken = false;
  const kv: KeyValueStore = {
    getItem: (k) => inner.getItem(k),
    setItem: (k, v) => {
      if (broken && k === key) throw new Error('QuotaExceededError');
      inner.setItem(k, v);
    },
    removeItem: (k) => inner.removeItem(k),
  };
  return { kv, breakNow: () => (broken = true) };
};

test('a failed project write never costs a stored diagram: the shown diagram’s autosave is left as it was', () => {
  // One diagram with work, then an attach whose project entry cannot be written.
  const first = failing(WORKBOOK_KEY);
  const a = open(first.kv);
  a.store.load(doc('own', 'Oma työ'));
  first.breakNow();
  a.store.attachTabs([doc('att', 'Liitetty')]);
  assert.equal(a.store.get().saveStatus, 'saveFailed');
  assert.deepEqual(a.titles(), ['Oma työ', 'Liitetty']);
  assert.deepEqual(open(first.kv).titles(), ['Oma työ']);
  // Two tabs, an edit in the first, then a tab switch whose project entry cannot be written.
  const second = failing(WORKBOOK_KEY);
  const b = open(second.kv);
  b.store.load(doc('a', 'A0'));
  b.store.attachTabs([doc('b', 'B')]);
  b.store.selectTab(0);
  b.store.dispatch({ type: 'project.setTitle', title: 'A muokattu' });
  second.breakNow();
  b.store.selectTab(1);
  assert.deepEqual(open(second.kv).titles(), ['A muokattu', 'B']);
});

test('an unreadable project entry stays in storage while the person has one diagram', () => {
  const kv = memoryStore();
  open(kv).store.load(doc('a', 'A'));
  const foreign = '{"format":"witt-project","version":2,"documents":[]}';
  kv.setItem(WORKBOOK_KEY, foreign);
  const { store } = open(kv);
  store.load(doc('b', 'B'));
  store.dispatch({ type: 'project.setTitle', title: 'B2' });
  assert.equal(kv.getItem(WORKBOOK_KEY), foreign);
});

test('one unnamed diagram never touches the project entry, not even to remove it', () => {
  const inner = memoryStore();
  const touched: string[] = [];
  const kv: KeyValueStore = {
    getItem: (k) => inner.getItem(k),
    setItem: (k, v) => {
      touched.push(`set ${k}`);
      inner.setItem(k, v);
    },
    removeItem: (k) => {
      touched.push(`remove ${k}`);
      inner.removeItem(k);
    },
  };
  open(kv).store.load(doc('a', 'A'));
  const { store } = open(kv);
  store.load(doc('b', 'B'));
  store.dispatch({ type: 'project.setTitle', title: 'B2' });
  assert.deepEqual(
    touched.filter((line) => line.includes(WORKBOOK_KEY)),
    []
  );
});

test('storage: the shown diagram under the prototype’s key on every change, the project only when tabs change', () => {
  const { kv, writes } = counting();
  const { store } = open(kv);
  store.load(doc('a', 'A'));
  assert.equal(writes(WORKBOOK_KEY), 0);
  store.attachTabs([doc('b', 'B')]);
  assert.equal(writes(WORKBOOK_KEY), 1);
  assert.equal(stored(kv, PROJECT_KEY)?.id, 'b');
  const before = writes(PROJECT_KEY);
  store.dispatch({ type: 'project.setTitle', title: 'B2' });
  store.dispatch({ type: 'project.setTitle', title: 'B3' });
  assert.ok(writes(PROJECT_KEY) > before);
  assert.equal(stored(kv, PROJECT_KEY)?.title, 'B3');
  assert.equal(writes(WORKBOOK_KEY), 1);
  store.selectTab(0);
  assert.equal(writes(WORKBOOK_KEY), 2);
  const entry = stored(kv, WORKBOOK_KEY) as {
    format: string;
    version: number;
    active: number;
    documents: Project[];
  };
  assert.equal(entry.format, 'witt-project');
  assert.equal(entry.version, 1);
  assert.equal(entry.active, 0);
  assert.deepEqual(
    entry.documents.map((d) => d.title),
    ['A', 'B3']
  );
});

test('a reload brings back every tab, the shown one with its newest content', () => {
  const kv = memoryStore();
  const first = open(kv);
  first.store.load(doc('a', 'A'));
  first.store.attachTabs([doc('b', 'B')]);
  first.store.renameProject('Hanke');
  first.store.dispatch({ type: 'project.setTitle', title: 'B uusin' });
  const second = open(kv);
  assert.equal(second.store.get().workbook.title, 'Hanke');
  assert.deepEqual(second.titles(), ['A', 'B uusin']);
  assert.equal(second.store.get().activeTab, 1);
  assert.equal(second.store.get().selectedId, rootNode(second.store.get().project)?.id);
  assert.equal(second.store.get().hydrationFailed, false);
});

test('back to one unnamed diagram: the project entry is removed again', () => {
  const { store, kv } = open();
  store.load(doc('a', 'A'));
  store.attachTabs([doc('b', 'B')]);
  assert.notEqual(kv.getItem(WORKBOOK_KEY), null);
  store.removeTab(1);
  assert.equal(kv.getItem(WORKBOOK_KEY), null);
  assert.equal(stored(kv, PROJECT_KEY)?.id, 'a');
});

test('an unreadable project entry is reported and the shown diagram still opens', () => {
  const kv = memoryStore();
  const first = open(kv);
  first.store.load(doc('a', 'A'));
  kv.setItem(WORKBOOK_KEY, '{"format":"witt-project","version":99}');
  const second = open(kv);
  assert.deepEqual(second.titles(), ['A']);
  assert.equal(second.store.get().hydrationFailed, true);
  assert.match(second.store.get().notice?.text ?? '', /\$\.version/);
});

test('opening a project file replaces the whole project, and undo brings the previous one back', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  store.attachTabs([doc('b', 'B')]);
  assert.equal(
    store.loadWorkbook({
      id: 'wb-new',
      title: 'Toinen',
      documents: [doc('x', 'X'), doc('y', 'Y')],
      sketches: [],
    }),
    true
  );
  assert.deepEqual(titles(), ['X', 'Y']);
  assert.equal(store.get().activeTab, 0);
  assert.equal(store.get().workbook.title, 'Toinen');
  store.undo();
  assert.deepEqual(titles(), ['A', 'B']);
  assert.equal(store.get().workbook.title, '');
});

const drawn = (id: string): Sketch =>
  addElement(blankSketch('f1'), 0, { id, type: 'pen', color: 0, size: 4, points: [10, 10, 40, 40] });
const sketchOf = (store: ReturnType<typeof createStore>, id: string) =>
  store.get().workbook.sketches.find((s) => s.id === id)?.sketch;

test('sketchpads: several per project; drawing is not a history step and undoing a diagram edit keeps it', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  const first = store.addProjectSketch('Lehtiö 1') as string;
  const second = store.addProjectSketch('Lehtiö 2') as string;
  assert.deepEqual(
    store.get().workbook.sketches.map((s) => s.name),
    ['Lehtiö 1', 'Lehtiö 2']
  );
  store.dispatch({ type: 'project.setTitle', title: 'A2' });
  const steps = store.historyList().length;
  store.drawProjectSketch(second, drawn('p2'));
  assert.equal(store.historyList().length, steps);
  store.undo();
  assert.deepEqual(titles(), ['A']);
  assert.deepEqual(sketchOf(store, second), drawn('p2'));
  // A removed sketchpad comes back with its drawing; a renamed one gets its name back.
  store.renameProjectSketch(second, 'Animaatio');
  store.removeProjectSketch(second);
  assert.deepEqual(
    store.get().workbook.sketches.map((s) => s.id),
    [first]
  );
  store.undoStructure();
  assert.deepEqual(sketchOf(store, second), drawn('p2'));
  assert.equal(store.get().workbook.sketches[1]?.name, 'Animaatio');
  store.undoStructure();
  assert.equal(store.get().workbook.sketches[1]?.name, 'Lehtiö 2');
});

test('sketchpads on reload: the drawn ones come back, an empty one is not kept; an attached project brings its own', () => {
  const kv = memoryStore();
  const first = open(kv);
  first.store.load(doc('a', 'A'));
  const empty = first.store.addProjectSketch('Tyhjä') as string;
  const used = first.store.addProjectSketch('Piirretty') as string;
  first.store.drawProjectSketch(used, drawn('p1'));
  const again = open(kv).store.get().workbook.sketches;
  assert.deepEqual(
    again.map((s) => [s.id, s.name]),
    [[used, 'Piirretty']]
  );
  assert.equal(
    again.some((s) => s.id === empty),
    false
  );
  // Attach: the same sketchpad id comes in as another sketchpad, and the person's own keeps its drawing.
  const count = first.store.attachTabs([doc('b', 'B')], [{ id: used, name: 'Tuotu', sketch: drawn('p9') }]);
  assert.equal(count, 1);
  const names = first.store.get().workbook.sketches.map((s) => s.name);
  assert.deepEqual(names, ['Tyhjä', 'Piirretty', 'Tuotu']);
  assert.deepEqual(sketchOf(first.store, used), drawn('p1'));
});

test('an opened project replaces the sketchpads too, and undoing it brings the previous ones back', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  const mine = store.addProjectSketch('Oma') as string;
  store.drawProjectSketch(mine, drawn('p1'));
  store.loadWorkbook({
    id: 'wb-new',
    title: 'Toinen',
    documents: [doc('x', 'X')],
    sketches: [{ id: 'sx', name: 'Heidän', sketch: drawn('p2') }],
  });
  assert.deepEqual(
    store.get().workbook.sketches.map((s) => s.name),
    ['Heidän']
  );
  store.undo();
  assert.deepEqual(titles(), ['A']);
  assert.deepEqual(
    store.get().workbook.sketches.map((s) => s.name),
    ['Oma']
  );
  assert.deepEqual(sketchOf(store, mine), drawn('p1'));
});

test('opening a project that shares diagrams with the open one is undone as a whole: no work is lost', () => {
  for (const shownWhenOpening of [0, 1]) {
    const { store, titles } = open();
    store.load(doc('a', 'A'));
    store.attachTabs([doc('b', 'B')]);
    const saved = store.get().workbook;
    store.dispatch({ type: 'project.setTitle', title: 'B työ' });
    store.selectTab(0);
    store.dispatch({ type: 'project.setTitle', title: 'A työ' });
    store.selectTab(shownWhenOpening);
    store.loadWorkbook(saved);
    assert.deepEqual(titles(), ['A', 'B']);
    // The opened project shows its first diagram, whose only step is the opening: Kumoa takes it back whole.
    store.undo();
    assert.deepEqual(titles(), ['A työ', 'B työ'], `shown tab ${shownWhenOpening}`);
    store.redo();
    assert.deepEqual(titles(), ['A', 'B']);
  }
});

test('a project with another structure that shares a diagram: taking the opening back restores the person’s own', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  store.attachTabs([doc('b', 'B')]);
  store.selectTab(0);
  store.dispatch({ type: 'project.setTitle', title: 'A työ' });
  store.loadWorkbook({
    id: 'wb-file',
    title: 'Tiedosto',
    documents: [doc('a', 'A tiedostosta')],
    sketches: [],
  });
  assert.deepEqual(titles(), ['A tiedostosta']);
  assert.equal(store.undoStructure(), true);
  assert.deepEqual(titles(), ['A työ', 'B']);
});

test('a jump stays with the shown diagram: a structure step on the way does not pull in another tab’s steps', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  store.attachTabs([doc('b', 'B')]);
  store.selectTab(0);
  store.dispatch({ type: 'project.setTitle', title: 'A1' });
  const target = store.historyList().pop()?.step.seq as number;
  store.selectTab(1);
  store.renameProject('P');
  store.dispatch({ type: 'project.setTitle', title: 'B1' });
  store.selectTab(0);
  store.dispatch({ type: 'project.setTitle', title: 'A2' });
  store.jumpTo(target);
  assert.deepEqual(titles(), ['A1', 'B1']);
  assert.equal(store.get().activeTab, 0);
  assert.equal(store.get().workbook.title, '');
});

test('a diagram that comes into the project starts without steps, whatever an older copy with its id did', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  store.dispatch({ type: 'project.setTitle', title: 'A vanha muokkaus' });
  store.undo();
  store.load(doc('b', 'B'));
  store.load(doc('a', 'A uudempi tiedosto'));
  assert.equal(store.get().canRedo, false);
  store.redo();
  assert.deepEqual(titles(), ['A uudempi tiedosto']);
  // Its only step is the opening itself.
  store.undo();
  assert.deepEqual(titles(), ['B']);
});

test('what left and came back by the history keeps what it had become', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  const start = store.historyList().pop()?.step.seq as number;
  // A sketchpad added and drawn on, then a jump to before it and back.
  const pad = store.addProjectSketch('Lehtiö 1') as string;
  const added = store.historyList().pop()?.step.seq as number;
  store.drawProjectSketch(pad, drawn('p1'));
  store.jumpTo(start);
  assert.deepEqual(store.get().workbook.sketches, []);
  store.jumpTo(added);
  assert.deepEqual(sketchOf(store, pad), drawn('p1'));
  // Removed, brought back, drawn on again, removed again by redo, brought back: the later stroke is there.
  store.removeProjectSketch(pad);
  const removal = store.historyList().pop()?.step.seq as number;
  store.undoStructure();
  store.drawProjectSketch(pad, drawn('p2'));
  store.jumpTo(removal);
  assert.deepEqual(store.get().workbook.sketches, []);
  store.undoStructure();
  assert.deepEqual(sketchOf(store, pad), drawn('p2'));
  // An attached diagram edited, then from the first tab a jump to before the attach and back.
  store.attachTabs([doc('b', 'B')]);
  const attach = store.historyList().find(({ step }) => step.label.key === 'historyTabAdd')?.step
    .seq as number;
  store.dispatch({ type: 'project.setTitle', title: 'B muokattu' });
  store.selectTab(0);
  store.jumpTo(attach - 1);
  assert.deepEqual(titles(), ['A']);
  store.jumpTo(attach);
  assert.deepEqual(titles(), ['A', 'B muokattu']);
});

test('a person renamed in one diagram has the new name in the project’s other diagrams too', () => {
  const { store } = open();
  store.load(doc('a', 'A'));
  store.dispatch({ type: 'user.add', id: 'u-2', name: 'Noora', shares: 1, role: 'editor' });
  // A new diagram made from this one carries the same people; here it is attached with them.
  store.attachTabs([{ ...doc('b', 'B'), users: store.get().project.users }]);
  store.dispatch({ type: 'user.rename', id: 'u-2', name: 'Noora Virtanen' });
  const names = store.get().workbook.documents.map((d) => d.users.find((u) => u.id === 'u-2')?.name);
  assert.deepEqual(names, ['Noora Virtanen', 'Noora Virtanen']);
});

test('the old sketchpad of the browser moves into the project once; an empty old one just goes', () => {
  const kv = memoryStore();
  kv.setItem('witt-sketch-v1', serializeSketch(drawn('old')));
  kv.setItem('witt-sketch-session-v1', serializeSketch(blankSketch('f-s')));
  const first = open(kv).store;
  assert.deepEqual(
    first.get().workbook.sketches.map((s) => [s.name, s.sketch.frames[0]?.elements[0]?.id]),
    [['Oma lehtiö', 'old']]
  );
  assert.equal(kv.getItem('witt-sketch-v1'), null);
  assert.equal(kv.getItem('witt-sketch-session-v1'), null);
  assert.equal((stored(kv, WORKBOOK_KEY)?.sketches as unknown[]).length, 1);
  // It is the project's now: a reload has it once, and undo has nothing to take away.
  assert.equal(first.get().canUndo, false);
  assert.equal(open(kv).store.get().workbook.sketches.length, 1);

  // A storage that cannot take the project keeps the old entry: the drawing is not lost.
  const inner = memoryStore();
  inner.setItem('witt-sketch-v1', serializeSketch(drawn('old')));
  const full: KeyValueStore = {
    ...inner,
    setItem(key, value) {
      if (key === WORKBOOK_KEY) throw new Error('QuotaExceededError');
      inner.setItem(key, value);
    },
  };
  assert.equal(open(full).store.get().workbook.sketches.length, 1);
  assert.notEqual(inner.getItem('witt-sketch-v1'), null);
});

test('strokes in a burst: the first is written at once, the rest together a second later, the diagram not at all', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const { kv, writes } = counting();
  const { store } = open(kv);
  store.load(doc('a', 'A'));
  const pad = store.addProjectSketch('Lehtiö 1') as string;
  const entry = writes(WORKBOOK_KEY);
  const diagram = writes(PROJECT_KEY);
  const strokes = ['p1', 'p2', 'p3', 'p4', 'p5'];
  for (const name of strokes) {
    store.drawProjectSketch(pad, drawn(name));
    t.mock.timers.tick(100);
  }
  // The first stroke was written; the four after it wait for their second.
  assert.equal(writes(WORKBOOK_KEY), entry + 1);
  assert.deepEqual(sketchOf(open(kv).store, pad), drawn('p1'));
  t.mock.timers.tick(1_000);
  assert.equal(writes(WORKBOOK_KEY), entry + 2);
  assert.deepEqual(sketchOf(open(kv).store, pad), drawn('p5'));
  // No stroke rewrote the shown diagram's own autosave.
  assert.equal(writes(PROJECT_KEY), diagram);
  // A change of the diagram meanwhile writes the held strokes with it, and nothing is written twice.
  store.drawProjectSketch(pad, drawn('p6'));
  store.drawProjectSketch(pad, drawn('p7'));
  store.dispatch({ type: 'project.setTitle', title: 'A2' });
  assert.deepEqual(sketchOf(open(kv).store, pad), drawn('p7'));
  const after = writes(WORKBOOK_KEY);
  t.mock.timers.tick(2_000);
  assert.equal(writes(WORKBOOK_KEY), after);
});
