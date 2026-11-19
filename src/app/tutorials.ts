// The three walkthroughs as data and one pure step function (owner request 2026-11-19, UI_INVENTORY S-15):
// `basics` goes from an empty tree to a read result, `people` adds a second local assessor, `collab` shows where
// working together online starts. Tutorial.tsx draws the callout and carries out the side effects; nothing here
// touches the DOM, a clock or storage.
//
// How they are built, so that a later step is written the same way:
// - one thing to do per step, said in at most three short sentences, with the control's own label in the text;
// - a step that asks for an action completes by itself when the document shows it was done (never by a timer);
//   a step that only explains waits for the person (`manual`) and its button reads Seuraava;
// - the phases name the method's own order (Kartoita, Punnitse, Tulos), so the walkthrough leaves behind the
//   process and not only the buttons;
// - the last step says what was learned and offers the next walkthrough, never starts it unasked.
import { isAiProfile, personalCredence, personalInfluence } from '../domain/index.ts';
import type { Project } from '../domain/index.ts';
import type { MessageKey } from '../lib/i18n/i18n.ts';

export const TUTORIAL_IDS = ['basics', 'people', 'collab'] as const;
export type TutorialId = (typeof TUTORIAL_IDS)[number];

export interface TutorialStep {
  /** Index into the tutorial's `phases`. */
  phase: number;
  text: MessageKey;
  /** Explains without asking for an action: only the person moves on. */
  manual?: true;
}
export interface TutorialDef {
  title: MessageKey;
  phases: readonly MessageKey[];
  /** The last step is the closing one: it is not counted in "Vaihe n/m". */
  steps: readonly TutorialStep[];
  /** The walkthrough offered when this one is finished. */
  next?: { id: TutorialId; label: MessageKey };
}

export const TUTORIALS: Record<TutorialId, TutorialDef> = {
  basics: {
    title: 'tutorialHeading',
    phases: ['tutPhaseTour', 'explore', 'evaluate', 'tutPhaseResult', 'tutPhaseViews'],
    steps: [
      { phase: 0, text: 'tutTourTree', manual: true },
      { phase: 0, text: 'tutTourLeft', manual: true },
      { phase: 0, text: 'tutTourInspector', manual: true },
      { phase: 0, text: 'tutTourZones', manual: true },
      { phase: 1, text: 'tutorialStep0' },
      { phase: 1, text: 'tutorialStep1' },
      { phase: 1, text: 'tutorialStep2' },
      { phase: 1, text: 'tutorialStep3' },
      { phase: 2, text: 'tutorialStep4' },
      { phase: 2, text: 'tutorialStep5' },
      { phase: 3, text: 'tutorialStep6', manual: true },
      { phase: 4, text: 'tutorialStep7' },
      { phase: 4, text: 'tutorialStep8' },
      { phase: 4, text: 'tutorialStep9', manual: true },
    ],
    next: { id: 'people', label: 'tutNextPeople' },
  },
  people: {
    title: 'tutMenuPeople',
    phases: ['tutPhasePeople', 'evaluate', 'tutPhaseCompare'],
    steps: [
      { phase: 0, text: 'tutPeople0', manual: true },
      { phase: 0, text: 'tutPeople1' },
      { phase: 1, text: 'tutPeople2' },
      { phase: 2, text: 'tutPeople3', manual: true },
      { phase: 2, text: 'tutPeople4', manual: true },
      { phase: 2, text: 'tutPeople5', manual: true },
    ],
    next: { id: 'collab', label: 'tutNextCollab' },
  },
  collab: {
    title: 'tutMenuCollab',
    phases: ['tutPhaseCollab'],
    steps: [
      { phase: 0, text: 'tutCollab0', manual: true },
      { phase: 0, text: 'tutCollab1' },
      { phase: 0, text: 'tutCollab2', manual: true },
      { phase: 0, text: 'tutCollab3', manual: true },
      { phase: 0, text: 'tutCollab4', manual: true },
    ],
  },
};

/** Named steps of `basics`, so the panel and the tests do not count by hand. */
export const BASICS = {
  tourTree: 0,
  tourLeft: 1,
  tourInspector: 2,
  tourZones: 3,
  addSupport: 4,
  nameSupport: 5,
  addOppose: 6,
  nameOppose: 7,
  rateSupport: 8,
  rateOppose: 9,
  readResult: 10,
  table: 11,
  arrange: 12,
  done: 13,
} as const;
export const PEOPLE = { intro: 0, addAssessor: 1, rateAsSecond: 2, compare: 3, lens: 4, done: 5 } as const;
export const COLLAB = { intro: 0, openDialog: 1, joining: 2, ending: 3, done: 4 } as const;

/** The closing step's index: the number of steps counted in the progress. */
export const lastStep = (id: TutorialId): number => TUTORIALS[id].steps.length - 1;

export interface TutorialRun {
  id: TutorialId;
  step: number;
  rootId: string;
  supportId: string | null;
  opposeId: string | null;
  /** `people`: who was rating when it began, and the assessor added during it. */
  firstUserId: string;
  secondUserId: string | null;
  /** `basics`: the arrange step's deliberately untidy tree has been made. */
  messShown: boolean;
  /** `collab`: the collaboration dialog has been opened during the step that asks for it. */
  collabOpened: boolean;
}
/** What a step's completion is read from: the document and three facts of the view. */
export interface TutorialFacts {
  project: Project;
  actorId: string;
  presentation: 'tree' | 'table';
  dialog: string | null;
}

/** The titles a new reason carries until it is written (commands.ts); a step asks for the person's own words. */
const UNNAMED = ['Puoltava argumentti', 'Vastustava argumentti'];

const rated = (project: Project, nodeId: string | null, userId: string): boolean =>
  !!nodeId &&
  project.nodes.some((n) => n.id === nodeId) &&
  !!personalCredence(project, nodeId, userId) &&
  personalInfluence(project, 'primary', nodeId, userId).current;

/**
 * The run after looking at the document: every step whose condition already holds is passed, so doing two things
 * at once never leaves the panel a step behind. Manual steps and the closing step are never passed here.
 */
export function advance(run: TutorialRun, facts: TutorialFacts): TutorialRun {
  const { project } = facts;
  let next = run;
  if (run.id === 'basics') {
    const children = project.nodes.filter((n) => n.parentId === next.rootId);
    if (next.step === BASICS.addSupport) {
      const child = children.find((n) => n.relation === 'support');
      if (child) next = { ...next, supportId: child.id, step: BASICS.nameSupport };
    }
    if (next.step === BASICS.nameSupport && next.supportId) {
      const node = project.nodes.find((n) => n.id === next.supportId);
      if (node && !UNNAMED.includes(node.title)) next = { ...next, step: BASICS.addOppose };
    }
    if (next.step === BASICS.addOppose) {
      const child = children.find((n) => n.relation === 'oppose');
      if (child) next = { ...next, opposeId: child.id, step: BASICS.nameOppose };
    }
    if (next.step === BASICS.nameOppose && next.opposeId) {
      const node = project.nodes.find((n) => n.id === next.opposeId);
      if (node && !UNNAMED.includes(node.title)) next = { ...next, step: BASICS.rateSupport };
    }
    if (next.step === BASICS.rateSupport && rated(project, next.supportId, facts.actorId))
      next = { ...next, step: BASICS.rateOppose };
    if (next.step === BASICS.rateOppose && rated(project, next.opposeId, facts.actorId))
      next = { ...next, step: BASICS.readResult };
    if (next.step === BASICS.table && facts.presentation === 'table')
      next = { ...next, step: BASICS.arrange };
  } else if (run.id === 'people') {
    if (next.step === PEOPLE.addAssessor) {
      const added = project.users.filter((u) => !isAiProfile(u) && u.id !== next.firstUserId).at(-1);
      if (added) next = { ...next, secondUserId: added.id, step: PEOPLE.rateAsSecond };
    }
    if (
      next.step === PEOPLE.rateAsSecond &&
      next.secondUserId &&
      rated(project, next.supportId, next.secondUserId)
    )
      next = { ...next, step: PEOPLE.compare };
  } else if (next.step === COLLAB.openDialog) {
    if (facts.dialog === 'collab') {
      if (!next.collabOpened) next = { ...next, collabOpened: true };
    } else if (next.collabOpened) next = { ...next, step: COLLAB.joining };
  }
  return next;
}

// ---- where the callout sits ------------------------------------------------------------------------------------
type Side = 'right' | 'left' | 'below' | 'above';
interface Placement {
  x: number;
  y: number;
  side: Side;
  /** Where along the panel's edge the arrow sits, in px from its top or left. */
  arrow: number;
}
const GAP = 16;
/** Targets that end above this line are in the top bar or the toolbar. */
const HEADER_ZONE = 150;
/** Beside the target, on the first side with room; null when it fits nowhere (the panel keeps its corner). */
export function placeBeside(
  target: { left: number; top: number; right: number; bottom: number },
  panel: { w: number; h: number },
  /** `top`: the callout stays below this line (the header rows), so it never covers the menus it talks about. */
  view: { w: number; h: number; top?: number }
): Placement | null {
  const floor = (view.top ?? 0) + 8;
  // A tall target (a side panel) is pointed at near its top, where its heading is.
  const cy = Math.max(target.top, 0) + Math.min(target.bottom - Math.max(target.top, 0), 160) / 2;
  const cx = (target.left + target.right) / 2;
  const fitY = (y: number) => Math.max(floor, Math.min(y, view.h - panel.h - 8));
  const fitX = (x: number) => Math.max(8, Math.min(x, view.w - panel.w - 8));
  const beside: Placement[] = [
    { side: 'right', x: target.right + GAP, y: fitY(cy - panel.h / 2), arrow: 0 },
    { side: 'left', x: target.left - GAP - panel.w, y: fitY(cy - panel.h / 2), arrow: 0 },
  ];
  const below: Placement = { side: 'below', x: fitX(cx - panel.w / 2), y: target.bottom + GAP, arrow: 0 };
  const above: Placement = {
    side: 'above',
    x: fitX(cx - panel.w / 2),
    y: target.top - GAP - panel.h,
    arrow: 0,
  };
  // A control in the header rows is pointed at from below: beside it the callout would cover the rows themselves.
  const options = target.bottom < HEADER_ZONE ? [below, ...beside, above] : [...beside, below, above];
  const fits = (p: Placement) =>
    p.x >= 8 && p.y >= floor && p.x + panel.w <= view.w - 8 && p.y + panel.h <= view.h - 8;
  const chosen = options.find(fits);
  if (!chosen) return null;
  const along = chosen.side === 'right' || chosen.side === 'left' ? cy - chosen.y : cx - chosen.x;
  const extent = chosen.side === 'right' || chosen.side === 'left' ? panel.h : panel.w;
  return { ...chosen, arrow: Math.max(18, Math.min(along, extent - 18)) };
}
