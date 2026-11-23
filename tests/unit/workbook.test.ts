/**
 * must: a project (workbook) is an envelope of whole documents (WG-059, owner 2026-11-23): its file is
 *       `format: witt-project`, `version: 1`, two-space indented with a trailing newline, and round-trips byte-stably;
 *       the boundary refuses a wrong format or version, an empty or over-long diagram list, a diagram that does not
 *       parse (with its index in the message) and two diagrams with one id; attaching keeps the present diagrams,
 *       appends in order and gives a colliding diagram a new id; the last diagram cannot be removed; moving keeps
 *       every diagram; a tab never takes a document another tab holds; the browser restore puts the shown
 *       diagram's own autosave into the tab that holds its id, and adds a diagram it does not know as a new tab
 *       (never over a stored one); a tab is called by the document's title, or its question while unnamed; a
 *       project has up to 20 named sketchpads, written to the file only when something is drawn on them (an
 *       empty one does not make a plain document a project), refused
 *       with the place when one does not parse; attaching a whole project brings its sketchpads without
 *       overwriting one; a step in the project's structure keeps the content every diagram and sketchpad has now
 *       one person is one stable id across the project's diagrams: a name the project knows gets the id it has
 *       elsewhere (never an AI viewpoint's, never one this diagram holds under another name), the people of other
 *       diagrams can be added as they are, and a new name reaches every diagram that has the person
 * test: tests/unit/workbook.test.ts
 *       a session's host sends a sketchpad whole and names the ones there are: it takes the place of the one
 *       with its id or comes after the others, and of the session's sketchpads one that is not named leaves
 * red-against: a sketchpad of the person's own dropped because the host did not name it, the same person added to a second diagram under a new id (their ratings then read as two people's),
 *              a rename that leaves the old name in the other diagrams, an AI viewpoint's id given to a person,
 *              an attached diagram overwriting the one with the same id (work lost on attaching a file twice), the
 *              rename map dropped, removing the only diagram leaving an empty project, a move that drops or
 *              doubles a diagram, a stale stored copy winning over the fresh autosave, a fresh autosave doubled
 *              into a second tab, an empty sketchpad written to every file, a drawing left out of the saved
 *              project file, an attached sketchpad written over the person's own with the same id, undoing a
 *              removed tab taking back the edits made in other diagrams since, an unknown autosave written over the shown tab's stored diagram, a version-2 file read as version 1, an error that does not say which diagram
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCORING_VERSION,
  attachDocuments,
  createBlankProject,
  addSketch,
  drawSketch,
  isPlainDocument,
  peopleElsewhere,
  personIdFor,
  projectPeople,
  renamePersonElsewhere,
  removeSketch,
  renameSketch,
  restructure,
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
  putSketch,
  keepSketches,
} from '../../src/domain/index.ts';
import type { Project, ProjectSketch, User, Workbook } from '../../src/domain/index.ts';
import { addElement, blankSketch } from '../../src/domain/sketch.ts';
import type { Sketch } from '../../src/domain/sketch.ts';

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
  sketches: [],
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
    sketches: [],
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

const drawn = (id = 'p1'): Sketch =>
  addElement(blankSketch('f1'), 0, { id, type: 'pen', color: 0, size: 4, points: [10, 10, 40, 40] });
const pad = (id: string, name: string, sketch: Sketch = drawn()): ProjectSketch => ({ id, name, sketch });

test('sketchpads: several per project, named, drawn on, removed; an empty one is not saved and does not make a project', () => {
  const plain = { ...book('a'), title: '' };
  assert.equal(isPlainDocument(plain), true);
  let project = addSketch(plain, 's1', '  Luonnos  ', blankSketch('f1'));
  // Looking at the sketchpad screen makes an empty sketchpad: the document is still the plain document it was.
  assert.equal(isPlainDocument(project), true);
  assert.equal(isPlainDocument(drawSketch(project, 's1', drawn())), false);
  assert.deepEqual(
    project.sketches.map((s) => s.name),
    ['Luonnos']
  );
  // Nothing drawn yet: the file has no `sketches` and reads back as the plain diagram.
  assert.equal('sketches' in (JSON.parse(serializeWorkbookFile(project)) as object), false);
  project = addSketch(project, 's2', 'Animaatio', blankSketch('f2'));
  project = drawSketch(project, 's2', drawn());
  assert.equal(drawSketch(project, 'no-such', drawn()), project);
  project = renameSketch(project, 's2', 'x'.repeat(50));
  assert.equal(project.sketches[1]?.name.length, 40);
  assert.equal(renameSketch(project, 's2', '   '), project);
  const text = serializeWorkbookFile(project);
  const back = parseWorkbook(JSON.parse(text));
  assert.deepEqual(
    back.sketches.map((s) => s.id),
    ['s2']
  );
  assert.deepEqual(back.sketches[0]?.sketch, drawn());
  assert.equal(serializeWorkbookFile(back), text);
  assert.deepEqual(
    removeSketch(project, 's1').sketches.map((s) => s.id),
    ['s2']
  );
  assert.equal(removeSketch(project, 'no-such'), project);
  assert.throws(() => addSketch(project, 's2', 'Sama', blankSketch('f3')), /tunniste on jo käytössä/);
});

test('at most 20 sketchpads, in a project and in a file', () => {
  let project = book('a');
  for (let i = 0; i < 20; i++) project = addSketch(project, `s${i}`, `L${i}`, drawn());
  assert.throws(() => addSketch(project, 's20', 'L20', drawn()), /enintään 20 lehtiötä/);
  const good = JSON.parse(serializeWorkbookFile(project)) as { sketches: unknown[] };
  assert.equal(good.sketches.length, 20);
  assert.throws(
    () => parseWorkbook({ ...good, sketches: [...good.sketches, good.sketches[0]] }),
    /^ParseError: \$\.sketches: enintään 20 lehtiötä$/
  );
});

test('a project file refuses a sketchpad that does not parse, a missing id and a doubled id, naming the place', () => {
  const good = JSON.parse(serializeWorkbookFile(book('a'))) as Record<string, unknown>;
  const refusal = (sketches: unknown): string => {
    try {
      parseWorkbook({ ...good, sketches });
    } catch (error) {
      return (error as Error).message;
    }
    return 'accepted';
  };
  assert.match(
    refusal([{ id: 's1', name: 'A', sketch: { format: 'witt-sketch', version: 9 } }]),
    /^\$\.sketches\[0\]\.sketch: /
  );
  assert.match(refusal([{ name: 'A', sketch: drawn() }]), /^\$\.sketches\[0\]\.id: /);
  assert.match(refusal([pad('s1', 'A'), pad('s1', 'B')]), /^\$\.sketches\[1\]\.id: sama tunniste/);
  assert.match(refusal([{ id: 's1', name: 7, sketch: drawn() }]), /^\$\.sketches\[0\]\.name: /);
  // An untouched sketchpad in a file is dropped.
  assert.equal(refusal([pad('s1', 'A', blankSketch('f1'))]), 'accepted');
  assert.deepEqual(parseWorkbook({ ...good, sketches: [pad('s1', 'A', blankSketch('f1'))] }).sketches, []);
});

test('attaching a whole project brings its sketchpads; one whose id is taken comes under a new id', () => {
  const mine = { ...book('a'), sketches: [pad('s1', 'Oma')] };
  const { workbook } = attachDocuments(mine, [doc('b')], counter('new'), [
    pad('s1', 'Tuotu'),
    pad('s2', 'Toinen'),
  ]);
  assert.deepEqual(
    workbook.sketches.map((s) => [s.id, s.name]),
    [
      ['s1', 'Oma'],
      ['new-1', 'Tuotu'],
      ['s2', 'Toinen'],
    ]
  );
  assert.equal(workbook.sketches[0], mine.sketches[0]);
});

test('restructure: the tabs, names and sketchpads of the target with the content each has now', () => {
  const before = { ...book('a', 'b', 'c'), sketches: [pad('s1', 'Vanha nimi', drawn('old'))] };
  // Since then: c was removed, a was edited, the sketchpad was drawn on and renamed, the project renamed.
  const editedA = doc('a', 'A muokattu');
  const current: Workbook = {
    id: 'wb-1',
    title: 'Uusi nimi',
    documents: [editedA, before.documents[1] as Project],
    sketches: [pad('s1', 'Uusi nimi', drawn('new'))],
  };
  const back = restructure(before, current);
  assert.deepEqual(ids(back), ['a', 'b', 'c']);
  assert.equal(back.title, 'Hanke');
  assert.equal(back.documents[0], editedA);
  assert.equal(back.documents[2], before.documents[2]);
  assert.equal(back.sketches[0]?.name, 'Vanha nimi');
  assert.deepEqual(back.sketches[0]?.sketch, drawn('new'));
});

const person = (id: string, name: string, ai = false): User => ({
  id,
  name,
  shares: ai ? 0 : 1,
  role: ai ? 'viewer' : 'editor',
  ...(ai ? { profileKind: 'ai' as const } : {}),
});
const withPeople = (id: string, ...people: User[]): Project => {
  const base = doc(id);
  return { ...base, users: [...base.users, ...people] };
};

test('one person is one id across the project: the people, who can be added here, and the id for a name', () => {
  const a = withPeople('a', person('u-2', 'Noora'), person('ai-1', 'Kriitikko', true));
  const b = withPeople('b', person('u-3', 'Ville'));
  const project: Workbook = { id: 'wb', title: '', documents: [a, b], sketches: [] };
  assert.deepEqual(
    projectPeople(project).map((u) => u.id),
    ['u-1', 'u-2', 'ai-1', 'u-3']
  );
  // In b: Noora and the AI viewpoint can come in as they are; Minä (u-1) is already there.
  assert.deepEqual(
    peopleElsewhere(project, b).map((u) => u.name),
    ['Noora', 'Kriitikko']
  );
  assert.deepEqual(
    peopleElsewhere(project, a).map((u) => u.name),
    ['Ville']
  );
  // A name the project knows gets that person's id; case and surrounding space do not count.
  assert.equal(personIdFor(project, b, '  noora ', 'fresh'), 'u-2');
  assert.equal(personIdFor(project, b, 'Uusi ihminen', 'fresh'), 'fresh');
  // An AI viewpoint's id is never given to a person, nor an id this diagram already holds under another name.
  assert.equal(personIdFor(project, b, 'Kriitikko', 'fresh'), 'fresh');
  const renamedHere = { ...b, users: [...b.users, person('u-2', 'N. Virtanen')] };
  assert.equal(
    personIdFor({ ...project, documents: [a, renamedHere] }, renamedHere, 'Noora', 'fresh'),
    'fresh'
  );
});

test('a new name reaches every diagram that has the person, and leaves a diagram where the name is taken', () => {
  const a = withPeople('a', person('u-2', 'Noora'));
  const b = withPeople('b', person('u-2', 'Noora'));
  const c = withPeople('c', person('u-2', 'Noora'), person('u-9', 'Noora Virtanen'));
  const d = doc('d');
  const project: Workbook = { id: 'wb', title: '', documents: [a, b, c, d], sketches: [] };
  const ctx = { now: NOW, actorId: 'u-1' };
  const renamed = renamePersonElsewhere(project, 0, 'u-2', 'Noora Virtanen', ctx);
  const nameIn = (index: number) => renamed.documents[index]?.users.find((u) => u.id === 'u-2')?.name;
  // a is the diagram the command renamed already: left as it is here.
  assert.deepEqual([nameIn(0), nameIn(1), nameIn(2)], ['Noora', 'Noora Virtanen', 'Noora']);
  assert.equal(renamed.documents[3], d);
  assert.equal(renamed.documents[2], c);
  // Nothing to change: the same project back.
  assert.equal(
    renamePersonElsewhere(renamed, 0, 'u-2', 'Noora Virtanen', ctx).documents[1],
    renamed.documents[1]
  );
  assert.equal(renamePersonElsewhere(project, 0, 'no-such', 'X', ctx), project);
});

test('a sketchpad given whole takes the place of its namesake or comes last; the named ones stay, in that order', () => {
  let project = addSketch({ ...book('a'), title: '' }, 's1', 'Yksi', blankSketch('f1'));
  project = putSketch(project, { id: 's2', name: ' Kaksi ', sketch: drawn() });
  project = putSketch(project, { id: 's1', name: 'Uusi nimi', sketch: drawn() });
  assert.deepEqual(
    project.sketches.map((s) => [s.id, s.name, s.sketch.frames[0]?.elements.length]),
    [
      ['s1', 'Uusi nimi', 1],
      ['s2', 'Kaksi', 1],
    ]
  );
  project = addSketch(project, 'mine', 'Oma', blankSketch('f3'));
  // The host names s2 and a new one that has not come yet: s1 leaves, and what is not the session's stays.
  const kept = keepSketches(project, ['s2', 'later'], new Set(['s1', 's2']));
  assert.deepEqual(
    kept.sketches.map((s) => s.id),
    ['s2', 'mine']
  );
  assert.deepEqual(
    keepSketches(project, ['s2', 's1'], new Set(['s1', 's2'])).sketches.map((s) => s.id),
    ['s2', 's1', 'mine']
  );
  assert.equal(keepSketches(project, ['s1', 's2'], new Set(['s1', 's2'])), project);
});
