/**
 * must: a project (workbook) is an envelope of whole documents (WG-059, owner 2026-11-23): its file is
 *       `format: witt-project`, `version: 1`, two-space indented with a trailing newline, and round-trips byte-stably;
 *       the boundary refuses a wrong format or version, an empty or over-long diagram list, a diagram that does not
 *       parse (with its index in the message) and two diagrams with one id; attaching keeps the present diagrams,
 *       appends in order and gives a colliding diagram a new id; the last diagram cannot be removed; moving keeps
 *       every diagram; a tab never takes a document another tab holds; the browser restore puts the shown
 *       diagram's own autosave into the tab that holds its id, and adds a diagram it does not know as a new tab
 *       (never over a stored one); a tab is called by the document's title, or its question while unnamed
 * test: tests/unit/workbook.test.ts
 * red-against: an attached diagram overwriting the one with the same id (work lost on attaching a file twice), the
 *              rename map dropped, removing the only diagram leaving an empty project, a move that drops or
 *              doubles a diagram, a stale stored copy winning over the fresh autosave, a fresh autosave doubled
 *              into a second tab, an unknown autosave written over the shown tab's stored diagram, a version-2 file read as version 1, an error that does not say which diagram
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCORING_VERSION,
  attachDocuments,
  createBlankProject,
  diagramLabel,
  moveDocument,
  parseWorkbook,
  readWorkbookText,
  removeDocument,
  renameWorkbook,
  replaceDocument,
  restoreWorkbook,
  serializeProjectFile,
  serializeWorkbookFile,
  workbookFilename,
  workbookOf,
} from '../../src/domain/index.ts';
import type { Project, Workbook } from '../../src/domain/index.ts';

const NOW = '2026-11-23T10:00:00.000Z';
const doc = (id: string, title = `Kaavio ${id}`): Project => ({
  ...createBlankProject({
    projectId: id,
    rootId: `${id}-root`,
    userId: 'u-1',
    now: NOW,
    scoring: SCORING_VERSION,
  }),
  title,
});
const book = (...ids: string[]): Workbook => ({
  id: 'wb-1',
  title: 'Hanke',
  documents: ids.map((id) => doc(id)),
});
const ids = (workbook: Workbook): string[] => workbook.documents.map((d) => d.id);
const counter = (prefix: string) => {
  let n = 0;
  return () => `${prefix}-${++n}`;
};

test('the project file: format and version first, the documents as their own file form, byte-stable', () => {
  const text = serializeWorkbookFile(book('a', 'b'));
  assert.ok(
    text.startsWith('{\n  "format": "witt-project",\n  "version": 1,\n  "id": "wb-1",\n  "title": "Hanke",\n')
  );
  assert.ok(text.endsWith('}\n'));
  const parsed = parseWorkbook(JSON.parse(text));
  assert.deepEqual(ids(parsed), ['a', 'b']);
  assert.equal(serializeWorkbookFile(parsed), text);
  // Each diagram inside is exactly the document a single-diagram file holds.
  assert.equal(
    JSON.stringify((JSON.parse(text) as { documents: unknown[] }).documents[1], null, 2) + '\n',
    serializeProjectFile(doc('b'))
  );
});

test('the boundary refuses what is not a version 1 project, naming the place', () => {
  const good = JSON.parse(serializeWorkbookFile(book('a', 'b'))) as Record<string, unknown>;
  const refusal = (patch: Record<string, unknown>): string => {
    try {
      parseWorkbook({ ...good, ...patch });
    } catch (error) {
      return (error as Error).message;
    }
    return 'accepted';
  };
  assert.match(refusal({ format: 'witt-sketch' }), /^\$\.format/);
  assert.match(refusal({ version: 2 }), /^\$\.version: tuettu versio on 1, tiedostossa 2$/);
  assert.match(refusal({ id: '' }), /^\$\.id/);
  assert.match(refusal({ title: 7 }), /^\$\.title/);
  assert.match(refusal({ documents: [] }), /^\$\.documents: projektissa on oltava vähintään yksi kaavio$/);
  assert.match(
    refusal({ documents: Array.from({ length: 51 }, (_, i) => doc(`d${i}`)) }),
    /^\$\.documents: enintään 50 kaaviota$/
  );
  assert.equal(
    parseWorkbook({ ...good, documents: Array.from({ length: 50 }, (_, i) => doc(`d${i}`)) }).documents
      .length,
    50
  );
  assert.match(refusal({ documents: [doc('a'), { schemaVersion: 8 }] }), /^\$\.documents\[1\]: /);
  assert.match(refusal({ documents: [doc('a'), doc('a')] }), /^\$\.documents\[1\]\.id: sama tunniste/);
});

test('a project name is trimmed and cut at 120 characters', () => {
  assert.equal(renameWorkbook(book('a'), '  Uusi nimi  ').title, 'Uusi nimi');
  assert.equal(renameWorkbook(book('a'), 'x'.repeat(130)).title.length, 120);
  assert.equal(renameWorkbook(book('a'), '   ').title, '');
});

test('the file name comes from the project name, else from the first diagram, slugged as a document’s is', () => {
  assert.equal(workbookFilename(book('a')), 'hanke.witt-project.json');
  assert.equal(
    workbookFilename({ ...book('a'), title: '', documents: [doc('a', 'Etätyö ja lähityö')] }),
    'eta-tyo-ja-la-hityo.witt-project.json'
  );
});

test('attaching appends in order; a colliding id becomes a copy with a new id and the map says which', () => {
  const before = book('a', 'b');
  const incoming = [doc('c'), doc('a', 'Toinen A'), doc('c', 'Toinen C')];
  const { workbook, renamed } = attachDocuments(before, incoming, counter('new'));
  assert.deepEqual(ids(workbook), ['a', 'b', 'c', 'new-1', 'new-2']);
  assert.deepEqual(
    [...renamed],
    [
      ['a', 'new-1'],
      ['c', 'new-2'],
    ]
  );
  // The diagram that was there is untouched, the copy carries the incoming content.
  assert.equal(workbook.documents[0], before.documents[0]);
  assert.equal((workbook.documents[3] as Project).title, 'Toinen A');
  assert.equal((workbook.documents[4] as Project).title, 'Toinen C');
  assert.deepEqual(ids(before), ['a', 'b']);
});

test('attaching stops at 50 diagrams and changes nothing then', () => {
  const full: Workbook = {
    id: 'wb',
    title: '',
    documents: Array.from({ length: 49 }, (_, i) => doc(`d${i}`)),
  };
  assert.equal(attachDocuments(full, [doc('x')], counter('n')).workbook.documents.length, 50);
  assert.throws(() => attachDocuments(full, [doc('x'), doc('y')], counter('n')), /enintään 50 kaaviota/);
});

test('removing: any diagram but the last one', () => {
  assert.deepEqual(ids(removeDocument(book('a', 'b', 'c'), 1)), ['a', 'c']);
  assert.throws(() => removeDocument(book('a'), 0), /viimeistä kaaviota ei voi poistaa/);
  assert.throws(() => removeDocument(book('a', 'b'), 2), /Välilehteä ei ole/);
});

test('moving keeps every diagram once; a position outside the tabs changes nothing', () => {
  const start = book('a', 'b', 'c', 'd');
  assert.deepEqual(ids(moveDocument(start, 0, 2)), ['b', 'c', 'a', 'd']);
  assert.deepEqual(ids(moveDocument(start, 3, 0)), ['d', 'a', 'b', 'c']);
  assert.equal(moveDocument(start, 1, 1), start);
  assert.equal(moveDocument(start, 0, 4), start);
  assert.equal(moveDocument(start, -1, 2), start);
});

test('a tab takes another document, but never one that another tab holds', () => {
  const start = book('a', 'b');
  assert.deepEqual(ids(replaceDocument(start, 1, doc('z'))), ['a', 'z']);
  assert.deepEqual(ids(replaceDocument(start, 1, doc('b', 'Muokattu'))), ['a', 'b']);
  assert.throws(() => replaceDocument(start, 1, doc('a')), /jo auki toisella välilehdellä/);
});

test('reading a text: a project file, a broken project file, anything else', () => {
  const read = readWorkbookText(serializeWorkbookFile(book('a', 'b')));
  assert.equal(read.kind, 'workbook');
  assert.deepEqual(readWorkbookText(serializeProjectFile(doc('a'))), { kind: 'other' });
  assert.deepEqual(readWorkbookText('not json'), { kind: 'other' });
  assert.deepEqual(readWorkbookText('{"format":"witt-project","version":3}'), {
    kind: 'error',
    reason: '$.version: tuettu versio on 1, tiedostossa 3',
  });
});

test('restore: the fresh autosave takes the tab with its id; an unknown one becomes a tab of its own', () => {
  const stored = { workbook: book('a', 'b', 'c'), active: 1 };
  const freshB = doc('b', 'B uusin');
  const sameTab = restoreWorkbook(stored, freshB, counter('wb'));
  assert.deepEqual(sameTab && ids(sameTab.workbook), ['a', 'b', 'c']);
  assert.equal(sameTab?.active, 1);
  assert.equal(sameTab?.workbook.documents[1], freshB);
  // The autosave is of another tab's diagram (a tab switch was half written): it goes to that tab, once.
  const otherTab = restoreWorkbook(stored, doc('c', 'C uusin'), counter('wb'));
  assert.deepEqual(otherTab && ids(otherTab.workbook), ['a', 'b', 'c']);
  assert.equal(otherTab?.active, 2);
  assert.equal((otherTab?.workbook.documents[2] as Project).title, 'C uusin');
  // A document the stored project does not know never overwrites a stored diagram: it is added and shown.
  const unknown = restoreWorkbook(stored, doc('z'), counter('wb'));
  assert.deepEqual(unknown && ids(unknown.workbook), ['a', 'b', 'c', 'z']);
  assert.equal(unknown?.active, 3);
  // Only a full project leaves it out, and then the stored tabs stay as they were.
  const full = {
    workbook: { ...book(), documents: Array.from({ length: 50 }, (_, i) => doc(`d${i}`)) },
    active: 4,
  };
  const kept = restoreWorkbook(full, doc('z'), counter('wb'));
  assert.equal(kept?.workbook, full.workbook);
  assert.equal(kept?.active, 4);
});

test('a tab is called by its title, or by its question while the title is the blank document’s', () => {
  assert.equal(diagramLabel(doc('a', 'Riskit')), 'Riskit');
  assert.equal(diagramLabel(doc('a', 'Nimetön pohdinta')), 'Mikä on tarkasteltava väite?');
});

test('restore: nothing stored gives a project of the one diagram, or nothing; a wild tab number is clamped', () => {
  const alone = restoreWorkbook(null, doc('a'), counter('wb'));
  assert.deepEqual(alone, { workbook: workbookOf(doc('a'), 'wb-1'), active: 0 });
  assert.equal(restoreWorkbook(null, null, counter('wb')), null);
  assert.equal(restoreWorkbook({ workbook: book('a', 'b'), active: 9 }, null, counter('wb'))?.active, 1);
  assert.equal(restoreWorkbook({ workbook: book('a', 'b'), active: -3 }, null, counter('wb'))?.active, 0);
  assert.equal(restoreWorkbook({ workbook: book('a', 'b'), active: 0.5 }, null, counter('wb'))?.active, 0);
});
