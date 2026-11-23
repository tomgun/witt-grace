// The change history (owner 2026-11-23): what Kumoa and Tee uudelleen walk, and what the history list shows.
// Every diagram has its own steps, and the project's structure (tabs added, removed, moved, names, sketchpads, an
// opened project) has its own. Kumoa stays with the shown diagram; a structure step is taken back from the history
// list, or by the Kumoa offered right after it. Pure: the store hands in the states and applies what comes out.
import type { Command, Project, Workbook } from '../domain/index.ts';
import type { MessageKey } from '../lib/i18n/i18n.ts';

export const HISTORY_LIMIT = 60;

/** What a step is called in the list: a text key, and the claim or name it concerned when there is one. */
export interface HistoryLabel {
  key: MessageKey;
  detail?: string;
}
/** The project with the diagram that was shown, by id (tab numbers move when the structure does). */
export interface ProjectView {
  workbook: Workbook;
  shownId: string;
}
interface StepBase {
  /** Order of making, across every diagram and the structure. */
  seq: number;
  at: string;
  label: HistoryLabel;
}
export type HistoryStep =
  | (StepBase & { scope: 'diagram'; docId: string; before: Project; after: Project })
  | (StepBase & { scope: 'project'; before: ProjectView; after: ProjectView; whole?: boolean });
export type NewStep =
  | { scope: 'diagram'; docId: string; before: Project; after: Project }
  /** `whole`: the step replaced the project as a whole (a project file opened, a document opened over one
   * unnamed diagram): it is taken back and made again as the states it holds, not merged with the present. */
  | { scope: 'project'; before: ProjectView; after: ProjectView; whole?: boolean };

interface Stack {
  past: HistoryStep[];
  future: HistoryStep[];
}
const last = <T>(items: readonly T[]): T | undefined => items[items.length - 1];

export interface History {
  /** A change was made: it becomes the newest step, and what had been undone before it can no longer be redone. */
  record(step: NewStep, label: HistoryLabel, at: string): void;
  /**
   * The step to take back while the diagram `shownId` is shown, moved to the redo side; null when none.
   * Kumoa (`listed` false) stays with the shown diagram: its own newest step, or the structure step that brought
   * this diagram into the project (opened, added) once the diagram has no step of its own after it. The history
   * list (`listed` true) walks every step it shows: the shown diagram's and the structure's, newest first.
   */
  takeUndo(shownId: string, listed?: boolean): HistoryStep | null;
  /** The step to make again, moved back to the undo side; null when none. Tee uudelleen (`listed` false) takes
   * the shown diagram's own, or a structure step that was made while this diagram was shown. */
  takeRedo(shownId: string, listed?: boolean): HistoryStep | null;
  /** The newest structure step, taken back whatever is shown (a removed tab's Kumoa); null when `seq` is not it. */
  takeStructureUndo(seq: number): HistoryStep | null;
  /** The shown diagram's and the structure's steps, oldest first; `done` is false for a step that was undone. */
  list(shownId: string): { step: HistoryStep; done: boolean }[];
  /** Whether Kumoa and Tee uudelleen have a step to take. */
  can(shownId: string): { undo: boolean; redo: boolean };
  /** The newest structure step that is not undone, if any. */
  newestStructure(): number | null;
  clear(): void;
}

export function createHistory(limit: number = HISTORY_LIMIT): History {
  const diagrams = new Map<string, Stack>();
  const structure: Stack = { past: [], future: [] };
  let seq = 0;
  const stackOf = (docId: string): Stack => {
    let stack = diagrams.get(docId);
    if (!stack) diagrams.set(docId, (stack = { past: [], future: [] }));
    return stack;
  };
  /** The structure step brought the diagram into the project: it was not there before the step, or the step
   * replaced the whole project with one that holds it. */
  const created = (step: HistoryStep | undefined, shownId: string): boolean =>
    step?.scope === 'project' &&
    (step.whole === true || !step.before.workbook.documents.some((d) => d.id === shownId)) &&
    step.after.workbook.documents.some((d) => d.id === shownId);
  const madeFrom = (step: HistoryStep | undefined, shownId: string): boolean =>
    step?.scope === 'project' && step.before.shownId === shownId;
  /** Which stack the next undo comes from: the one whose eligible top is newer. */
  const undoFrom = (shownId: string, listed: boolean): Stack | null => {
    const diagram = stackOf(shownId);
    const own = last(diagram.past)?.seq ?? 0;
    const top = last(structure.past);
    const project = top && (listed || created(top, shownId)) ? top.seq : 0;
    return own === 0 && project === 0 ? null : own > project ? diagram : structure;
  };
  /** Which stack the next redo comes from: the one whose eligible top was made earlier. */
  const redoFrom = (shownId: string, listed: boolean): Stack | null => {
    const diagram = stackOf(shownId);
    const own = last(diagram.future)?.seq ?? Infinity;
    const top = last(structure.future);
    const project = top && (listed || madeFrom(top, shownId)) ? top.seq : Infinity;
    return own === Infinity && project === Infinity ? null : own < project ? diagram : structure;
  };
  return {
    record(step, label, at) {
      const stack = step.scope === 'diagram' ? stackOf(step.docId) : structure;
      stack.past.push({ ...step, seq: ++seq, at, label });
      if (stack.past.length > limit) stack.past.shift();
      stack.future.length = 0;
      // A structure step that was undone was undone from the state before this change: it is not redone over it.
      structure.future.length = 0;
      // A diagram that comes into the project starts without steps: whatever an earlier diagram with the same
      // id did (an older copy of the same file) is not its history. A removed tab coming back by undo is not a
      // new step, so it keeps its own.
      if (step.scope === 'project') {
        const was = new Set(step.before.workbook.documents.map((d) => d.id));
        for (const d of step.after.workbook.documents)
          if (step.whole || !was.has(d.id)) diagrams.delete(d.id);
      }
    },
    takeUndo(shownId, listed = false) {
      const from = undoFrom(shownId, listed);
      const step = from?.past.pop();
      if (!from || !step) return null;
      from.future.push(step);
      return step;
    },
    takeRedo(shownId, listed = false) {
      const from = redoFrom(shownId, listed);
      const step = from?.future.pop();
      if (!from || !step) return null;
      from.past.push(step);
      return step;
    },
    takeStructureUndo(wanted) {
      if (last(structure.past)?.seq !== wanted) return null;
      const step = structure.past.pop() as HistoryStep;
      structure.future.push(step);
      return step;
    },
    list(shownId) {
      const diagram = stackOf(shownId);
      return [
        ...[...diagram.past, ...structure.past].map((step) => ({ step, done: true })),
        ...[...diagram.future, ...structure.future].map((step) => ({ step, done: false })),
      ].sort((x, y) => x.step.seq - y.step.seq);
    },
    can(shownId) {
      return { undo: undoFrom(shownId, false) !== null, redo: redoFrom(shownId, false) !== null };
    },
    newestStructure: () => last(structure.past)?.seq ?? null,
    clear() {
      diagrams.clear();
      structure.past.length = 0;
      structure.future.length = 0;
    },
  };
}

const sameList = <T>(a: readonly T[], b: readonly T[], same: (x: T, y: T) => boolean): boolean =>
  a.length === b.length && a.every((x, i) => same(x, b[i] as T));

/**
 * What kind of step a change is: `project` when the structure changed (which diagrams and sketchpads there are,
 * their order, a name), `diagram` when only the shown diagram's content did, `none` when nothing that the history
 * keeps changed (another tab shown, a drawing on a sketchpad, which has its own undo).
 */
export function stepKind(before: ProjectView, after: ProjectView): 'diagram' | 'project' | 'none' {
  const a = before.workbook;
  const b = after.workbook;
  const sameStructure =
    a.id === b.id &&
    a.title === b.title &&
    sameList(a.documents, b.documents, (x, y) => x.id === y.id) &&
    sameList(a.sketches, b.sketches, (x, y) => x.id === y.id && x.name === y.name);
  if (!sameStructure) return 'project';
  if (before.shownId !== after.shownId) return 'none';
  const shown = (workbook: Workbook) => workbook.documents.find((d) => d.id === after.shownId);
  return shown(a) !== shown(b) ? 'diagram' : 'none';
}

const cut = (text: string): string => (text.length > 60 ? `${text.slice(0, 59)}…` : text);

/** The list's name for a command: its family, and the claim it concerned when the command names one. */
export function commandLabel(command: Command, before: Project, after: Project): HistoryLabel {
  const type = command.type;
  const ids = (['id', 'nodeId'] as const)
    .map((field) => (command as unknown as Record<string, unknown>)[field])
    .filter((value): value is string => typeof value === 'string');
  const find = (project: Project) => project.nodes.find((n) => ids.includes(n.id));
  const node = find(after) ?? find(before);
  const detail = node ? { detail: cut(node.title) } : {};
  const key = ((): MessageKey => {
    if (type === 'project.setTitle') return 'historyTitle';
    if (type.startsWith('project.')) return 'historySettings';
    if (type === 'node.add') return 'historyNodeAdd';
    if (type === 'node.remove') return 'historyNodeRemove';
    if (type === 'node.move') return 'historyNodeMove';
    if (/^(node\.(position|resize|collapse)|layout\.)/.test(type)) return 'historyLayout';
    if (type.startsWith('node.')) return 'historyNodeEdit';
    if (type.startsWith('review.') || type.startsWith('edge.')) return 'historyReview';
    if (type.startsWith('link.')) return 'historyLink';
    if (type.startsWith('comment.')) return 'historyComment';
    if (type.startsWith('shared.') || type.startsWith('concept.')) return 'historyReason';
    if (type.startsWith('user.')) return 'historyPeople';
    if (type.startsWith('round.') || type.startsWith('ballot.')) return 'historyVote';
    return 'historyChange';
  })();
  return key === 'historyTitle' ? { key, detail: cut(after.title) } : { key, ...detail };
}
