/**
 * must: the store keeps the project and its shown tab (WG-059): `project` is always the shown tab's diagram; a
 *       command changes only that diagram; attaching adds tabs and shows the first added one; undo is one history
 *       for the project and goes back to the tab the change was made in, a removed tab included; looking at another
 *       tab is not an undo step; one unnamed diagram is replaced by an opened document (after the replace question),
 *       while in a project the document opens in a new tab without a question and a document another tab holds is
 *       refused; in the browser's storage the shown diagram keeps the prototype's key `witt-project-v3`, the whole
 *       project is under `witt-workbook-v1` only when there is more than one diagram or a project name, and a
 *       reload brings back every tab with the newest content of the shown one
 * test: tests/unit/store-tabs.test.ts
 * red-against: an edit written into the first tab whatever is shown, undo taking back the right change but leaving
 *              the wrong tab shown, a removed diagram that undo cannot bring back, the project entry rewritten
 *              on every keystroke-sized command (it holds every diagram), a one-diagram browser gaining a second
 *              storage entry, a reload showing the stale copy of the diagram that was being edited, the autosave
 *              overwritten before the project entry is safely written (a full quota then loses the diagram that
 *              lived only in the autosave), an entry this build cannot read removed by the next opened document,
 *              an opened file silently taking the place of the shown tab's diagram in a project
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlankProject, rootNode } from '../../src/domain/index.ts';
import type { Project } from '../../src/domain/index.ts';
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

test('undo is one history: it returns to the tab of the change; looking at a tab is not a step', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  store.attachTabs([doc('b', 'B')]);
  store.selectTab(0);
  store.dispatch({ type: 'project.setTitle', title: 'A2' });
  store.selectTab(1);
  store.dispatch({ type: 'project.setTitle', title: 'B2' });
  store.selectTab(0);
  // The newest change was in tab 1: undo goes there and takes it back.
  store.undo();
  assert.deepEqual(titles(), ['A2', 'B']);
  assert.equal(store.get().activeTab, 1);
  store.undo();
  assert.deepEqual(titles(), ['A', 'B']);
  assert.equal(store.get().activeTab, 0);
  store.redo();
  store.redo();
  assert.deepEqual(titles(), ['A2', 'B2']);
  assert.equal(store.get().activeTab, 1);
  assert.equal(store.get().canRedo, false);
});

test('a removed tab comes back with undo; the neighbour is shown meanwhile; the last tab stays', () => {
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
  store.undo();
  store.undo();
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

test('removing a tab right of the shown one keeps the shown one; undo takes back a move and a project name', () => {
  const { store, titles } = open();
  store.load(doc('a', 'A'));
  store.attachTabs([doc('b', 'B'), doc('c', 'C')]);
  store.removeTab(2);
  assert.equal(store.get().project.id, 'b');
  assert.equal(store.get().activeTab, 1);
  store.moveTab(1, 0);
  store.renameProject('Hanke');
  store.undo();
  assert.equal(store.get().workbook.title, '');
  store.undo();
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
    store.loadWorkbook({ id: 'wb-new', title: 'Toinen', documents: [doc('x', 'X'), doc('y', 'Y')] }),
    true
  );
  assert.deepEqual(titles(), ['X', 'Y']);
  assert.equal(store.get().activeTab, 0);
  assert.equal(store.get().workbook.title, 'Toinen');
  store.undo();
  assert.deepEqual(titles(), ['A', 'B']);
  assert.equal(store.get().workbook.title, '');
});
