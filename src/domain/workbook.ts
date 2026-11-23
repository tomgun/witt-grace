// A project as the person sees it (owner 2026-11-23, WG-059): several diagrams kept together, shown as tabs and
// saved as one file. In code it is a workbook, because `Project` already names one diagram's document. The workbook
// is an envelope: every diagram inside is a whole document that parses, scores and exports on its own.
import { parseProject, ParseError } from './parse.ts';
import { BLANK_TITLE } from './project.ts';
import { exportFilename } from './serialize.ts';
import { withOfferedScoring } from './model.ts';
import type { Project } from './model.ts';

export const WORKBOOK_FORMAT = 'witt-project';
export const WORKBOOK_VERSION = 1;
export const WORKBOOK_MAX_DOCUMENTS = 50;
export const WORKBOOK_TITLE_MAX = 120;

export interface Workbook {
  id: string;
  /** The project's own name; empty until the person gives one. */
  title: string;
  /** The diagrams in tab order; never empty, ids unique. */
  documents: readonly Project[];
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x);
const cleanTitle = (title: string): string => title.trim().slice(0, WORKBOOK_TITLE_MAX);

/** A project of one diagram, as a file of one document opens. */
export const workbookOf = (diagram: Project, id: string): Workbook => ({
  id,
  title: '',
  documents: [diagram],
});

/** What a tab calls its diagram: the document's title, or its question while the title is still the blank
 * document's, so several new diagrams can be told apart. */
export function diagramLabel(diagram: Project): string {
  if (diagram.title !== BLANK_TITLE) return diagram.title;
  return diagram.nodes.find((n) => n.parentId === null)?.title || diagram.title;
}

/** One unnamed diagram: such a project is its diagram, shown, stored and saved exactly as a document was before
 * projects (no tab row, no project entry in storage, a `.witt.json` file). */
export const isPlainDocument = (workbook: Workbook): boolean =>
  workbook.documents.length === 1 && workbook.title === '';

export const isWorkbookFile = (raw: unknown): boolean => isRecord(raw) && raw.format === WORKBOOK_FORMAT;

/** The boundary for a project file: refuses with the path of what is wrong; every diagram goes through
 * `parseProject`, and an archived calculation method opens under the offered one, as a single document does. */
export function parseWorkbook(raw: unknown): Workbook {
  if (!isRecord(raw) || raw.format !== WORKBOOK_FORMAT)
    throw new ParseError(`$.format: odotettiin "${WORKBOOK_FORMAT}"`);
  if (raw.version !== WORKBOOK_VERSION)
    throw new ParseError(
      `$.version: tuettu versio on ${WORKBOOK_VERSION}, tiedostossa ${String(raw.version)}`
    );
  if (typeof raw.id !== 'string' || !raw.id.trim()) throw new ParseError('$.id: projektin tunniste puuttuu');
  if (typeof raw.title !== 'string') throw new ParseError('$.title: projektin nimen on oltava tekstiä');
  if (!Array.isArray(raw.documents) || raw.documents.length === 0)
    throw new ParseError('$.documents: projektissa on oltava vähintään yksi kaavio');
  if (raw.documents.length > WORKBOOK_MAX_DOCUMENTS)
    throw new ParseError(`$.documents: enintään ${WORKBOOK_MAX_DOCUMENTS} kaaviota`);
  const seen = new Set<string>();
  const documents = raw.documents.map((entry: unknown, i: number) => {
    let diagram: Project;
    try {
      diagram = withOfferedScoring(parseProject(entry));
    } catch (error) {
      throw new ParseError(`$.documents[${i}]: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (seen.has(diagram.id))
      throw new ParseError(`$.documents[${i}].id: sama tunniste kahdella kaaviolla (${diagram.id})`);
    seen.add(diagram.id);
    return diagram;
  });
  return { id: raw.id, title: cleanTitle(raw.title), documents };
}

/** The project file's bytes: validated, two-space indented, trailing newline, like a document's file. */
export const serializeWorkbookFile = (workbook: Workbook): string =>
  JSON.stringify(workbookFileObject(workbook), null, 2) + '\n';
/** The project file as a plain object, every diagram validated: what the file and the browser's entry are made of. */
export const workbookFileObject = (workbook: Workbook) => ({
  format: WORKBOOK_FORMAT,
  version: WORKBOOK_VERSION,
  id: workbook.id,
  title: workbook.title,
  documents: workbook.documents.map((diagram) => parseProject(diagram)),
});

/** A filename for the project file: the project's name, else the first diagram's title, slugged as a document's. */
export const workbookFilename = (workbook: Workbook): string =>
  exportFilename(workbook.title || (workbook.documents[0] as Project).title).replace(
    /\.witt\.json$/,
    '.witt-project.json'
  );

export const renameWorkbook = (workbook: Workbook, title: string): Workbook => ({
  ...workbook,
  title: cleanTitle(title),
});

/** The diagram at `index` replaced by `diagram` (an edit, or another diagram opened in that tab). A diagram
 * whose id another tab already holds is refused: two tabs must never be one diagram. */
export function replaceDocument(workbook: Workbook, index: number, diagram: Project): Workbook {
  if (!workbook.documents[index]) throw new Error('Välilehteä ei ole');
  if (workbook.documents.some((d, i) => i !== index && d.id === diagram.id))
    throw new Error('Kaavio on jo auki toisella välilehdellä');
  return { ...workbook, documents: workbook.documents.map((d, i) => (i === index ? diagram : d)) };
}

/**
 * Diagrams added after the present ones, in the order given. An incoming diagram whose id is already in the
 * project (or repeats within the incoming set) gets a new id from `newId`, so attaching the same file twice
 * makes a copy instead of overwriting; the returned `renamed` maps old ids to new ones for whoever keeps
 * references between diagrams.
 */
export function attachDocuments(
  workbook: Workbook,
  incoming: readonly Project[],
  newId: () => string
): { workbook: Workbook; renamed: ReadonlyMap<string, string> } {
  if (workbook.documents.length + incoming.length > WORKBOOK_MAX_DOCUMENTS)
    throw new Error(`Projektissa voi olla enintään ${WORKBOOK_MAX_DOCUMENTS} kaaviota`);
  const taken = new Set(workbook.documents.map((d) => d.id));
  const renamed = new Map<string, string>();
  const added = incoming.map((diagram) => {
    if (!taken.has(diagram.id)) {
      taken.add(diagram.id);
      return diagram;
    }
    const id = newId();
    if (taken.has(id)) throw new Error('Uusi tunniste on jo käytössä');
    taken.add(id);
    renamed.set(diagram.id, id);
    return { ...diagram, id };
  });
  return { workbook: { ...workbook, documents: [...workbook.documents, ...added] }, renamed };
}

/** The project without the diagram at `index`; the last diagram cannot be removed. */
export function removeDocument(workbook: Workbook, index: number): Workbook {
  if (!workbook.documents[index]) throw new Error('Välilehteä ei ole');
  if (workbook.documents.length === 1) throw new Error('Projektin viimeistä kaaviota ei voi poistaa');
  return { ...workbook, documents: workbook.documents.filter((_, i) => i !== index) };
}

/** The diagram at `from` moved to position `to`; positions outside the tabs change nothing. */
export function moveDocument(workbook: Workbook, from: number, to: number): Workbook {
  const count = workbook.documents.length;
  if (from === to || from < 0 || to < 0 || from >= count || to >= count) return workbook;
  const documents = [...workbook.documents];
  const [moved] = documents.splice(from, 1);
  documents.splice(to, 0, moved as Project);
  return { ...workbook, documents };
}

/** What a text holds, for the open and attach flows: a project file, something else, or a broken project file. */
export type WorkbookRead =
  { kind: 'workbook'; workbook: Workbook } | { kind: 'other' } | { kind: 'error'; reason: string };
export function readWorkbookText(text: string): WorkbookRead {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'other' };
  }
  if (!isWorkbookFile(raw)) return { kind: 'other' };
  try {
    return { kind: 'workbook', workbook: parseWorkbook(raw) };
  } catch (error) {
    return { kind: 'error', reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The project as it was left in the browser: `stored` is the project last written (its shown diagram may be
 * older than `fresh`), `fresh` the shown diagram's own autosave. The fresh diagram takes the tab that holds its
 * id. A diagram the stored project does not know (another build wrote the autosave, or a write failed half way)
 * is added as a tab of its own and shown: nothing stored is ever overwritten by it. Only a full project (50
 * diagrams) leaves it out. Null when there is nothing to restore.
 */
export function restoreWorkbook(
  stored: { workbook: Workbook; active: number } | null,
  fresh: Project | null,
  newId: () => string
): { workbook: Workbook; active: number } | null {
  if (!stored) return fresh ? { workbook: workbookOf(fresh, newId()), active: 0 } : null;
  const { documents } = stored.workbook;
  const active = Number.isInteger(stored.active)
    ? Math.max(0, Math.min(documents.length - 1, stored.active))
    : 0;
  if (!fresh) return { workbook: stored.workbook, active };
  const known = documents.findIndex((d) => d.id === fresh.id);
  if (known !== -1)
    return {
      workbook: { ...stored.workbook, documents: documents.map((d, i) => (i === known ? fresh : d)) },
      active: known,
    };
  if (documents.length >= WORKBOOK_MAX_DOCUMENTS) return { workbook: stored.workbook, active };
  return { workbook: { ...stored.workbook, documents: [...documents, fresh] }, active: documents.length };
}
