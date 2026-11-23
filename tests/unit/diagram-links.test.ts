/**
 * must: a node may link to another diagram of the same project by that diagram's id (WG-060, owner 2026-11-23):
 *       `node.edit` sets and clears the link and refuses a link to the node's own diagram or an empty id; the link
 *       survives the file boundary; it is navigation only and changes no score; a link leads somewhere only while
 *       its diagram is in the project (a removed diagram leaves the link in place, leading nowhere, and it leads
 *       there again when the diagram is back); the nodes that link to a diagram are found from the other diagrams;
 *       a diagram's linked set is itself and everything its links reach through any number of links, itself first
 *       and the rest in tab order, ending on a loop; attaching a set whose diagrams get new ids keeps the links
 *       inside the set (they lead to the copies), while a link to a diagram the project already has stays; the
 *       store follows a link to its tab, remembers where from, and goes back to that node; a link without its
 *       diagram goes nowhere and says so
 * test: tests/unit/diagram-links.test.ts
 * red-against: a link read as a reason and scored, the field dropped on save, a diagram linking to itself, an
 *              attached copy whose links still lead to the original diagrams (edits then land in the wrong
 *              diagram), a link to an existing diagram rewritten on attach, a linked set that stops after one
 *              link or never ends on a loop, a way back that shows the first tab instead of the node the link
 *              was followed from, a missing diagram followed to some other tab
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCommand,
  attachDocuments,
  createBlankProject,
  evaluate,
  linkTarget,
  linkedSet,
  linksInto,
  parseProject,
  removeDocument,
  serializeProjectFile,
  workbookOf,
} from '../../src/domain/index.ts';
import type { Command, Project, Workbook } from '../../src/domain/index.ts';
import { memoryStore } from '../../src/lib/storage.ts';
import { createStore } from '../../src/app/store.ts';

const NOW = '2026-11-23T10:00:00.000Z';
const ctx = { now: NOW, actorId: 'u1' };
const run = (p: Project, ...commands: Command[]) => commands.reduce((acc, c) => applyCommand(acc, c, ctx), p);
const doc = (id: string): Project =>
  run(
    {
      ...createBlankProject({
        mode: 'decision',
        projectId: id,
        rootId: `${id}-root`,
        userId: 'u1',
        now: NOW,
      }),
      title: id,
    },
    { type: 'node.add', id: `${id}-opt`, parentId: `${id}-root`, relation: 'option', title: `${id} option` },
    { type: 'node.add', id: `${id}-why`, parentId: `${id}-opt`, relation: 'support', title: `${id} reason` }
  );
const linked = (p: Project, nodeId: string, to: string | null) =>
  run(p, { type: 'node.edit', id: nodeId, linkedDiagramId: to });
const node = (p: Project, id: string) => p.nodes.find((n) => n.id === id)!;
const book = (...documents: Project[]): Workbook => ({ ...workbookOf(documents[0]!, 'wb'), documents });
const linkOf = (w: Workbook, docIndex: number, nodeId: string) =>
  node(w.documents[docIndex]!, nodeId).linkedDiagramId;

test('node.edit sets and clears the link; a diagram cannot link to itself, nor to nothing', () => {
  const a = linked(doc('A'), 'A-opt', 'B');
  assert.equal(node(a, 'A-opt').linkedDiagramId, 'B');
  assert.equal('linkedDiagramId' in node(linked(a, 'A-opt', null), 'A-opt'), false);
  assert.throws(() => linked(doc('A'), 'A-opt', 'A'));
  assert.throws(() => linked(doc('A'), 'A-opt', ''));
  assert.throws(() => linked(doc('A'), 'A-opt', 'x'.repeat(101)));
});

test('the link survives the file boundary and changes no score', () => {
  const plain = run(doc('A'), {
    type: 'review.credence',
    id: 'v1',
    nodeId: 'A-why',
    userId: 'u1',
    credence: 80,
  });
  const a = linked(linked(plain, 'A-opt', 'B'), 'A-why', 'C');
  const back = parseProject(JSON.parse(serializeProjectFile(a)));
  assert.equal(node(back, 'A-opt').linkedDiagramId, 'B');
  assert.equal(node(back, 'A-why').linkedDiagramId, 'C');
  assert.deepEqual(evaluate(a), evaluate(plain));
  assert.throws(() =>
    parseProject({
      ...JSON.parse(serializeProjectFile(a)),
      nodes: a.nodes.map((n) => (n.id === 'A-opt' ? { ...n, linkedDiagramId: 7 } : n)),
    })
  );
});

test('a link leads somewhere only while its diagram is in the project; the ways back are found', () => {
  const a = linked(linked(doc('A'), 'A-opt', 'B'), 'A-why', 'B');
  const b = doc('B');
  const c = linked(doc('C'), 'C-opt', 'B');
  const w = book(a, b, c);
  assert.equal(linkTarget(w, a, node(a, 'A-opt')), b);
  assert.equal(linkTarget(w, a, node(a, 'A-root')), null);
  assert.deepEqual(
    linksInto(w, 'B').map(({ diagram, node: n }) => `${diagram.id}:${n.id}`),
    ['A:A-opt', 'A:A-why', 'C:C-opt']
  );
  assert.deepEqual(linksInto(w, 'A'), []);
  // The diagram removed: the link stays where it is and leads nowhere.
  const without = removeDocument(w, 1);
  assert.equal(linkTarget(without, a, node(a, 'A-opt')), null);
  assert.equal(node(without.documents[0]!, 'A-opt').linkedDiagramId, 'B');
});

test('the linked set: the diagram first, then all its links reach in tab order, ending on a loop', () => {
  const a = linked(doc('A'), 'A-opt', 'C');
  const b = doc('B');
  const c = linked(linked(doc('C'), 'C-opt', 'D'), 'C-why', 'gone');
  const d = linked(doc('D'), 'D-opt', 'A');
  const w = book(d, a, b, c);
  assert.deepEqual(
    linkedSet(w, 'A').map((x) => x.id),
    ['A', 'D', 'C']
  );
  assert.deepEqual(
    linkedSet(w, 'B').map((x) => x.id),
    ['B']
  );
  assert.deepEqual(linkedSet(w, 'nowhere'), []);
});

test('attaching a set under new ids keeps its links inside the set; a link to a present diagram stays', () => {
  const a = linked(linked(doc('A'), 'A-opt', 'B'), 'A-why', 'X');
  const b = linked(doc('B'), 'B-opt', 'A');
  const x = doc('X');
  const ids = ['A2', 'B2'];
  const { workbook, renamed } = attachDocuments(book(a, b, x), [a, b], () => ids.shift()!);
  assert.deepEqual(
    workbook.documents.map((d) => d.id),
    ['A', 'B', 'X', 'A2', 'B2']
  );
  assert.deepEqual(
    [...renamed],
    [
      ['A', 'A2'],
      ['B', 'B2'],
    ]
  );
  // The copies link to each other, and to X, which was not part of what came in.
  assert.equal(linkOf(workbook, 3, 'A-opt'), 'B2');
  assert.equal(linkOf(workbook, 4, 'B-opt'), 'A2');
  assert.equal(linkOf(workbook, 3, 'A-why'), 'X');
  // The originals are as they were.
  assert.equal(linkOf(workbook, 0, 'A-opt'), 'B');
  assert.equal(workbook.documents[0], a);
  // A set that comes in under its own ids is not touched at all.
  const fresh = attachDocuments(book(x), [a, b], () => 'never');
  assert.equal(fresh.workbook.documents[1], a);
  assert.equal(fresh.renamed.size, 0);
});

test('the store follows a link to its tab and comes back to the node it was followed from', () => {
  const store = createStore({ store: memoryStore(), persistent: true, windowWidth: 1440 });
  store.load(doc('A'));
  store.attachTabs([doc('B'), doc('C')]);
  store.selectTab(0);
  store.dispatch({ type: 'node.edit', id: 'A-why', linkedDiagramId: 'C' });
  store.select('A-root');
  assert.equal(store.followLink('A-why'), true);
  assert.equal(store.get().project.id, 'C');
  assert.deepEqual(store.get().linkTrail, [{ docId: 'A', nodeId: 'A-why' }]);
  // Following a link is looking: nothing to undo came of it, and the diagrams are untouched.
  assert.equal(store.get().workbook.documents.length, 3);
  assert.equal(store.linkBack(), true);
  assert.equal(store.get().project.id, 'A');
  assert.equal(store.get().selectedId, 'A-why');
  assert.equal(store.get().centerRequest?.id, 'A-why');
  assert.deepEqual(store.get().linkTrail, []);
  assert.equal(store.linkBack(), false);
});

test('a link without its diagram goes nowhere and says so; a way back whose diagram is gone is passed over', () => {
  const store = createStore({ store: memoryStore(), persistent: true, windowWidth: 1440 });
  store.load(doc('A'));
  store.attachTabs([doc('B'), doc('C')]);
  store.selectTab(0);
  store.dispatch({ type: 'node.edit', id: 'A-opt', linkedDiagramId: 'B' });
  store.dispatch({ type: 'node.edit', id: 'A-why', linkedDiagramId: 'nowhere' });
  assert.equal(store.followLink('A-why'), false);
  assert.equal(store.get().project.id, 'A');
  assert.equal(store.get().notice?.kind, 'error');
  assert.deepEqual(store.get().linkTrail, []);
  // A → B → C by links, then A is removed: from C the way back is B, and from B there is none.
  store.followLink('A-opt');
  store.dispatch({ type: 'node.edit', id: 'B-opt', linkedDiagramId: 'C' });
  store.followLink('B-opt');
  assert.equal(store.get().project.id, 'C');
  store.removeTab(0);
  assert.equal(store.linkBack(), true);
  assert.equal(store.get().project.id, 'B');
  assert.equal(store.get().selectedId, 'B-opt');
  assert.equal(store.linkBack(), false);
  assert.equal(store.get().project.id, 'B');
});
