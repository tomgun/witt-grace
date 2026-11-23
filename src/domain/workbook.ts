// A project as the person sees it (owner 2026-11-23, WG-059): several diagrams kept together, shown as tabs and
// saved as one file. In code it is a workbook, because `Project` already names one diagram's document. The workbook
// is an envelope: every diagram inside is a whole document that parses, scores and exports on its own.
import { parseProject, ParseError } from './parse.ts';
import { BLANK_TITLE } from './project.ts';
import { exportFilename } from './serialize.ts';
import { parseSketch, sketchHasDrawing } from './sketch.ts';
import type { Sketch } from './sketch.ts';
import { applyCommand } from './commands.ts';
import type { CommandContext } from './commands.ts';
import { sameName, withOfferedScoring } from './model.ts';
import type { Project, User } from './model.ts';

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
  /** The project's sketchpads in tab order (owner 2026-11-23); ids unique. One with nothing drawn lives only
   * while the project is open: it is never written to a file or to storage. */
  sketches: readonly ProjectSketch[];
}
export interface ProjectSketch {
  id: string;
  name: string;
  sketch: Sketch;
}
export const WORKBOOK_MAX_SKETCHES = 20;
export const SKETCH_NAME_MAX = 40;

const isRecord = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x);
const cleanTitle = (title: string): string => title.trim().slice(0, WORKBOOK_TITLE_MAX);

/** A project of one diagram, as a file of one document opens. */
export const workbookOf = (diagram: Project, id: string): Workbook => ({
  sketches: [],
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
  workbook.documents.length === 1 &&
  workbook.title === '' &&
  !workbook.sketches.some((s) => sketchHasDrawing(s.sketch));

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
  const sketches: ProjectSketch[] = [];
  if (raw.sketches !== undefined) {
    if (!Array.isArray(raw.sketches) || raw.sketches.length > WORKBOOK_MAX_SKETCHES)
      throw new ParseError(`$.sketches: enintään ${WORKBOOK_MAX_SKETCHES} lehtiötä`);
    raw.sketches.forEach((entry: unknown, i: number) => {
      if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id.trim())
        throw new ParseError(`$.sketches[${i}].id: lehtiön tunniste puuttuu`);
      const id = entry.id;
      if (typeof entry.name !== 'string')
        throw new ParseError(`$.sketches[${i}].name: nimen on oltava tekstiä`);
      if (sketches.some((known) => known.id === id))
        throw new ParseError(`$.sketches[${i}].id: sama tunniste kahdella lehtiöllä (${id})`);
      const sketch = validSketch(entry.sketch, `$.sketches[${i}].sketch`);
      // An untouched sketchpad in a file is dropped, not kept as an empty one.
      if (sketchHasDrawing(sketch)) sketches.push({ id, name: cleanSketchName(entry.name), sketch });
    });
  }
  return { id: raw.id, title: cleanTitle(raw.title), documents, sketches };
}

const cleanSketchName = (name: string): string => name.trim().slice(0, SKETCH_NAME_MAX);

/** A new sketchpad after the present ones. */
export function addSketch(workbook: Workbook, id: string, name: string, sketch: Sketch): Workbook {
  if (workbook.sketches.length >= WORKBOOK_MAX_SKETCHES)
    throw new Error(`Projektissa voi olla enintään ${WORKBOOK_MAX_SKETCHES} lehtiötä`);
  if (workbook.sketches.some((s) => s.id === id)) throw new Error('Lehtiön tunniste on jo käytössä');
  return { ...workbook, sketches: [...workbook.sketches, { id, name: cleanSketchName(name), sketch }] };
}
/** The sketchpad `id` as it was just drawn; the same project when there is no such sketchpad. */
export function drawSketch(workbook: Workbook, id: string, sketch: Sketch): Workbook {
  if (!workbook.sketches.some((s) => s.id === id && s.sketch !== sketch)) return workbook;
  return { ...workbook, sketches: workbook.sketches.map((s) => (s.id === id ? { ...s, sketch } : s)) };
}
/** A whole sketchpad as given (a session's host sends it so): in place of the one with its id, name and all,
 * else after the present ones. */
export function putSketch(workbook: Workbook, entry: ProjectSketch): Workbook {
  if (!workbook.sketches.some((s) => s.id === entry.id))
    return addSketch(workbook, entry.id, entry.name, entry.sketch);
  const name = cleanSketchName(entry.name);
  return {
    ...workbook,
    sketches: workbook.sketches.map((s) =>
      s.id === entry.id ? { ...s, name: name || s.name, sketch: entry.sketch } : s
    ),
  };
}
/** The sketchpads in the order `order` names them; of those in `among`, one that is not named leaves. Others
 * (not in `among`, not named) stay after the named ones. */
export function keepSketches(
  workbook: Workbook,
  order: readonly string[],
  among: ReadonlySet<string>
): Workbook {
  const place = new Map(order.map((id, i) => [id, i]));
  const kept = workbook.sketches.filter((s) => place.has(s.id) || !among.has(s.id));
  const sorted = [...kept].sort(
    (a, b) => (place.get(a.id) ?? order.length) - (place.get(b.id) ?? order.length)
  );
  return sorted.length === workbook.sketches.length && sorted.every((s, i) => s === workbook.sketches[i])
    ? workbook
    : { ...workbook, sketches: sorted };
}
export function renameSketch(workbook: Workbook, id: string, name: string): Workbook {
  const clean = cleanSketchName(name);
  if (!clean || !workbook.sketches.some((s) => s.id === id && s.name !== clean)) return workbook;
  return { ...workbook, sketches: workbook.sketches.map((s) => (s.id === id ? { ...s, name: clean } : s)) };
}
export function removeSketch(workbook: Workbook, id: string): Workbook {
  if (!workbook.sketches.some((s) => s.id === id)) return workbook;
  return { ...workbook, sketches: workbook.sketches.filter((s) => s.id !== id) };
}

/** A sketchpad through its own boundary, so what is written is exactly what would be read. */
function validSketch(sketch: unknown, path: string): Sketch {
  const parsed = parseSketch(JSON.stringify(sketch ?? null));
  if (!parsed.ok) throw new ParseError(`${path}: luonnoslehtiö ei kelpaa (${parsed.reason})`);
  return parsed.sketch;
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
  // Only sketchpads with something drawn are written; the key is left out when there is none.
  ...(workbook.sketches.some((s) => sketchHasDrawing(s.sketch))
    ? {
        sketches: workbook.sketches
          .filter((s) => sketchHasDrawing(s.sketch))
          .map((s, i) => ({
            id: s.id,
            name: s.name,
            sketch: validSketch(s.sketch, `$.sketches[${i}].sketch`),
          })),
      }
    : {}),
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
  newId: () => string,
  incomingSketches: readonly ProjectSketch[] = []
): { workbook: Workbook; renamed: ReadonlyMap<string, string> } {
  if (workbook.documents.length + incoming.length > WORKBOOK_MAX_DOCUMENTS)
    throw new Error(`Projektissa voi olla enintään ${WORKBOOK_MAX_DOCUMENTS} kaaviota`);
  if (workbook.sketches.length + incomingSketches.length > WORKBOOK_MAX_SKETCHES)
    throw new Error(`Projektissa voi olla enintään ${WORKBOOK_MAX_SKETCHES} lehtiötä`);
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
  // A whole project attached brings its sketchpads too; one whose id is taken comes in under a new id.
  const takenSketches = new Set(workbook.sketches.map((s) => s.id));
  const addedSketches = incomingSketches.map((entry) => {
    const id = takenSketches.has(entry.id) ? newId() : entry.id;
    if (takenSketches.has(id)) throw new Error('Uusi tunniste on jo käytössä');
    takenSketches.add(id);
    return id === entry.id ? entry : { ...entry, id };
  });
  return {
    workbook: {
      ...workbook,
      documents: [...workbook.documents, ...added],
      sketches: [...workbook.sketches, ...addedSketches],
    },
    renamed,
  };
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

/**
 * A step back or forward in the project's structure: the tabs, names and sketchpads of `target`, with the content
 * each diagram and sketchpad has now. Only a diagram or a sketchpad that is not in `current` (a removed one coming
 * back) takes the content `target` kept for it, so undoing a removed tab never takes back work done elsewhere.
 */
export function restructure(target: Workbook, current: Workbook): Workbook {
  const diagrams = new Map(current.documents.map((d) => [d.id, d]));
  const sketches = new Map(current.sketches.map((s) => [s.id, s.sketch]));
  return {
    ...target,
    documents: target.documents.map((d) => diagrams.get(d.id) ?? d),
    sketches: target.sketches.map((s) => ({ ...s, sketch: sketches.get(s.id) ?? s.sketch })),
  };
}

// ---- People across the project's diagrams (WG-059, owner 2026-11-23) ----------------------------------------
// People stay in each diagram's own document, so a diagram saved alone is whole. What the project adds is that
// one person is one stable id wherever they are: a person added by a name the project knows gets the id they
// have elsewhere, a person of another diagram can be added as they are, and a new name reaches every diagram.

/** Every person of the project once, by id, in the order first met (the diagrams in tab order). */
export function projectPeople(workbook: Workbook): User[] {
  const seen = new Map<string, User>();
  for (const diagram of workbook.documents)
    for (const user of diagram.users) if (!seen.has(user.id)) seen.set(user.id, user);
  return [...seen.values()];
}

/** The people of the project's other diagrams who are not in `diagram`, neither by id nor by name. */
export function peopleElsewhere(workbook: Workbook, diagram: Project): User[] {
  return projectPeople(workbook).filter(
    (person) => !diagram.users.some((u) => u.id === person.id || sameName(u.name, person.name))
  );
}

/**
 * The id for a human person about to be added to `diagram` under `name`: the id that name has in another diagram
 * of the project, so the person is the same person there and here, else `fresh`. An id already in this diagram
 * (the same person under another name) and an AI viewpoint's id are never reused.
 */
export function personIdFor(workbook: Workbook, diagram: Project, name: string, fresh: string): string {
  const known = projectPeople(workbook).find(
    (person) => person.profileKind !== 'ai' && sameName(person.name, name)
  );
  return known && !diagram.users.some((u) => u.id === known.id) ? known.id : fresh;
}

/**
 * A person's new name in every diagram that has them, the diagram at `except` aside (it was renamed by the
 * command itself). A diagram where the name belongs to someone else keeps the old one. The same project when no diagram changed.
 */
export function renamePersonElsewhere(
  workbook: Workbook,
  except: number,
  id: string,
  name: string,
  ctx: CommandContext
): Workbook {
  let changed = false;
  const documents = workbook.documents.map((diagram, index) => {
    if (index === except || !diagram.users.some((u) => u.id === id && u.name !== name)) return diagram;
    // The command itself does not look for a namesake (the dialog does): two people must not share a name.
    if (diagram.users.some((u) => u.id !== id && sameName(u.name, name))) return diagram;
    try {
      const next = applyCommand(diagram, { type: 'user.rename', id, name }, ctx);
      changed ||= next !== diagram;
      return next;
    } catch {
      return diagram;
    }
  });
  return changed ? { ...workbook, documents } : workbook;
}
