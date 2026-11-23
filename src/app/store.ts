// The one document store. State changes only through dispatch(command) → applyCommand; the UI subscribes with
// useSyncExternalStore. Undo/redo is a stack of past documents; view preferences live beside, never inside, the document.
import { useSyncExternalStore } from 'react';
import {
  applyCommand,
  addSketch,
  attachDocuments,
  createBlankProject,
  drawSketch,
  isPlainDocument,
  moveDocument,
  parseProject,
  parseWorkbook,
  removeDocument,
  removeSketch,
  renameSketch,
  renamePersonElsewhere,
  renameWorkbook,
  replaceDocument,
  restructure,
  rootNode,
  SCORING_VERSION,
  withOfferedScoring,
  workbookFileObject,
  workbookOf,
} from '../domain/index.ts';
import type {
  Command,
  ImportReport,
  Mode,
  Project,
  ProjectSketch,
  RejectReason,
  Workbook,
} from '../domain/index.ts';
import { blankSketch } from '../domain/sketch.ts';
import type { Sketch } from '../domain/sketch.ts';
import { commandLabel, createHistory, stepKind } from './history.ts';
import type { HistoryLabel, HistoryStep } from './history.ts';
import { DEFAULT_LANGUAGE, FI, isLanguage, loadMessages, translator } from '../lib/i18n/i18n.ts';
import { languageFromSearch } from '../lib/pageHead.ts';
import type { Language, MessageKey, Messages } from '../lib/i18n/i18n.ts';
import { newId, nowIso } from '../lib/providers.ts';
import {
  APPEARANCE_KEY as SPECIAL_KEY,
  LOCALE_KEY,
  browserStore,
  loadProject,
  readPreference,
  saveProject,
  writePreference,
} from '../lib/storage.ts';
import type { KeyValueStore, SaveResult } from '../lib/storage.ts';
import { loadWorkbook, saveWorkbook } from '../lib/workbookStorage.ts';
import type { CollabStatus, DocumentPort, HostSession, ParticipantSession } from '../lib/p2p/session.ts';
import { persist as recordActive } from '../lib/workspaceMeta.ts';
import { assessorKey, readView, readZones, reviewViewKey, writeView, writeZones } from './view.ts';
import type { ViewState, Zone, Zones } from './view.ts';

export type { ViewState, Zone, Zones } from './view.ts';

/** The prototype's eight themes in its menu order (UI_INVENTORY S-00), then the owner's additions of 2026-11-09, Lehto (2026-11-12) and Obsidiaani (2026-11-21). */
export const APPEARANCES = [
  'light',
  'dark',
  'paper',
  'cosmos',
  'hologram',
  'manuscript-book',
  'manuscript-pen',
  'bitberg',
  'terminal',
  'ascii',
  'comic',
  'grove',
  'obsidian',
] as const;
export type Appearance = (typeof APPEARANCES)[number];
/** Skins kept per browser; the base theme (light/dark/paper) is document data (`project.theme`). */
export const SPECIAL_APPEARANCES = [
  'cosmos',
  'hologram',
  'manuscript-book',
  'manuscript-pen',
  'bitberg',
  'terminal',
  'ascii',
  'comic',
  'grove',
  'obsidian',
] as const;
export type SpecialAppearance = (typeof SPECIAL_APPEARANCES)[number];
export type LeftTab = 'tree' | 'repeat';
export type LibrarySelection = { type: 'concept' | 'locked' | 'linked-node'; id: string };
export type DialogName =
  | 'people'
  | 'vote'
  | 'assessment'
  | 'reviewLens'
  | 'help'
  | 'examples'
  | 'about'
  | 'newWork'
  | 'aiDraft'
  | 'aiReview'
  | 'aiResults'
  | 'library'
  | 'visualExport'
  | 'contextReasons'
  | 'sharedReasons'
  | 'collab'
  | 'history';
export type ModalRequest =
  | { kind: 'confirm'; text: string; resolve: (ok: boolean) => void }
  | {
      kind: 'text';
      heading: string;
      prompt: string;
      action: string;
      initial: string;
      resolve: (value: string | null) => void;
    }
  | { kind: 'notice'; text: string; warning?: string }
  | { kind: 'move'; nodeId: string }
  | { kind: 'links'; nodeId: string; linkId?: string }
  | { kind: 'replace'; description: string; resolve: (choice: ReplaceChoice) => void }
  | { kind: 'importReport'; report: ImportReport; filename: string };
/** The replacement dialog's outcome: proceed and forget, proceed after a library save, or stay (null). */
export type ReplaceChoice = 'forget' | 'keep' | null;

export interface Notice {
  kind: 'error' | 'info';
  text: string;
  /** The notice follows a change to the project's structure (a removed tab): its Kumoa takes back that step,
   * whatever diagram is shown, while it is still the newest structure step. */
  restore?: number;
  /** The notice follows a change that undo takes back: it offers Kumoa while undo is available. */
  undo?: boolean;
}
export interface AppState {
  /** The active tab's diagram: `workbook.documents[activeTab]`, kept here so every view reads one document. */
  project: Project;
  /** The project: every diagram open as a tab (WG-059). */
  workbook: Workbook;
  activeTab: number;
  selectedId: string;
  actorId: string;
  language: Language;
  /** The active language's messages; Finnish until another language has loaded. */
  messages: Messages;
  appearance: Appearance;
  /** Persisted presentation preferences (`witt-view-v1`). */
  view: ViewState;
  /** Persisted panel visibility (`witt-zones-v1`). */
  zones: Zones;
  /** Session-only: which left-panel tab is open (the prototype's `repeatPaneOpen`). */
  leftTab: LeftTab;
  /** The home screen is shown instead of the workspace (the prototype's `body.home-active`). */
  home: boolean;
  /** "Vain puu": only the canvas is visible (never persisted). */
  focusOnly: boolean;
  /** A library card selected in the repeat pane; the inspector then shows that reason instead of a node. */
  selectedLibraryReason: LibrarySelection | null;
  /** View-only subtree overrides while the depth slider is active (true = closed, false = fully open). */
  depthOverrides: ReadonlyMap<string, boolean>;
  /** Branches the person closed by hand; they win over focus peeks and table reveals. */
  explicitlyClosedIds: ReadonlySet<string>;
  /** Reasons muted for a what-if (owner 2026-11-18): out of the shown results with their branches; never saved,
   * never in the document, cleared when another document opens. */
  mutedIds: ReadonlySet<string>;
  /** A closed path revealed from the table until the next selection. */
  tableRevealId: string | null;
  /** The review lens: null = every human; an array = exactly these assessors (per document, per browser). */
  reviewIds: string[] | null;
  /** Monotonic counters that ask the canvas to fit or to centre a node; the canvas owns the camera. */
  fitRequest: number;
  centerRequest: { id: string; n: number } | null;
  /** A library card being dragged over the canvas (HTML5 drag data is unreadable during dragover). */
  draggingLibraryReason: LibrarySelection | null;
  /** The card whose title is being edited in place. */
  inlineEditId: string | null;
  /** The truncated title shown in the floating claim preview, anchored to a screen rectangle. */
  claimPreview: { nodeId: string; left: number; top: number; right: number } | null;
  /** One modal request at a time: confirmations, text prompts and notices resolve a promise. */
  modal: ModalRequest | null;
  /** The open workspace dialog, if any (people, vote, assessment, lens, help, …). */
  dialog: DialogName | null;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: MessageKey;
  storagePersistent: boolean;
  /** A draft existed in storage but could not be read; it was left untouched (home-screen warning). */
  hydrationFailed: boolean;
  notice: Notice | null;
  /** Live collaboration (WG-030): the session's status while one is open or just ended; null otherwise. */
  collab: CollabStatus | null;
}
const REJECT_TEXT: Record<RejectReason, MessageKey> = {
  rate: 'collabRejectRate',
  forbidden: 'collabRejectForbidden',
  refused: 'collabRejectRefused',
  'not-ready': 'collabRejectNotReady',
};
/** The open collaboration: the host orders changes, a participant proposes them. */
export type CollabLink =
  { role: 'host'; session: HostSession } | { role: 'participant'; session: ParticipantSession };

export function blankProject(mode: Mode = 'argument'): Project {
  return createBlankProject({
    mode,
    projectId: newId(),
    rootId: newId(),
    userId: newId(),
    now: nowIso(),
    scoring: SCORING_VERSION,
  });
}

/** `witt-appearance-v1` holds a special skin (legacy `studio-daw` reads as Bitberg); else the document's base theme. */
function effectiveAppearance(store: KeyValueStore, project: Project): Appearance {
  const raw = readPreference(store, SPECIAL_KEY);
  const special = raw === 'studio-daw' ? 'bitberg' : raw;
  if (SPECIAL_APPEARANCES.includes(special as SpecialAppearance)) return special as Appearance;
  return project.theme;
}
function restoreActor(store: KeyValueStore, project: Project): string {
  const saved = readPreference(store, assessorKey(project.id));
  return project.users.some((u) => u.id === saved)
    ? (saved as string)
    : (project.users[0] as { id: string }).id;
}
function readReviewIds(store: KeyValueStore, projectId: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(readPreference(store, reviewViewKey(projectId)) ?? 'null');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

export function createStore(
  options: { store?: KeyValueStore; persistent?: boolean; windowWidth?: number } = {}
) {
  const detected = options.store ? null : browserStore();
  const store = options.store ?? (detected as { store: KeyValueStore }).store;
  const persistent = options.persistent ?? detected?.persistent ?? false;
  const width = options.windowWidth ?? (typeof window === 'undefined' ? 1440 : window.innerWidth);
  const loaded = loadProject(store);
  const tabs = loadWorkbook(store, loaded.ok ? withOfferedScoring(loaded.project) : null, newId);
  const initialWorkbook = tabs.ok ? tabs.workbook : workbookOf(blankProject('argument'), newId());
  const initialTab = tabs.ok ? tabs.active : 0;
  const initialProject = initialWorkbook.documents[initialTab] as Project;
  const storageTrouble =
    !loaded.ok && 'reason' in loaded
      ? loaded.reason
      : tabs.ok
        ? (tabs.warning ?? null)
        : 'reason' in tabs
          ? tabs.reason
          : null;
  const savedLanguage = readPreference(store, LOCALE_KEY);
  // An address may name its language (`?lang=en`, the form the sitemap lists): it wins for this visit and is not
  // stored, so the person's own choice comes back on the bare address.
  const askedLanguage = typeof window === 'undefined' ? null : languageFromSearch(window.location.search);
  let state: AppState = {
    project: initialProject,
    workbook: initialWorkbook,
    activeTab: initialTab,
    selectedId: (rootNode(initialProject) as { id: string }).id,
    actorId: restoreActor(store, initialProject),
    language: isLanguage(askedLanguage)
      ? askedLanguage
      : isLanguage(savedLanguage)
        ? savedLanguage
        : DEFAULT_LANGUAGE,
    messages: FI,
    appearance: effectiveAppearance(store, initialProject),
    view: readView(store, width),
    zones: readZones(store, width),
    leftTab: 'tree',
    home: true,
    focusOnly: false,
    selectedLibraryReason: null,
    depthOverrides: new Map(),
    explicitlyClosedIds: new Set(),
    mutedIds: new Set(),
    tableRevealId: null,
    reviewIds: readReviewIds(store, initialProject.id),
    fitRequest: 0,
    centerRequest: null,
    draggingLibraryReason: null,
    inlineEditId: null,
    claimPreview: null,
    modal: null,
    dialog: null,
    canUndo: false,
    canRedo: false,
    saveStatus: loaded.ok || tabs.ok ? 'savedBrowser' : 'noServer',
    storagePersistent: persistent,
    hydrationFailed: storageTrouble !== null,
    notice: storageTrouble !== null ? { kind: 'error', text: storageTrouble } : null,
    collab: null,
  };
  type Snapshot = { workbook: Workbook; activeTab: number };
  const snapshot = (): Snapshot => ({ workbook: state.workbook, activeTab: state.activeTab });
  /** Kumoa and Tee uudelleen: every diagram's own steps and the project structure's (history.ts). */
  const history = createHistory();
  const historyFlags = () => {
    const can = history.can(state.project.id);
    return { canUndo: !collab && can.undo, canRedo: !collab && can.redo };
  };
  /** What the project's own storage entry last held, to write it only when the tabs change. */
  let storedTabs: Snapshot | null =
    tabs.ok && tabs.stored ? { workbook: initialWorkbook, activeTab: initialTab } : null;
  /** A project entry that could not be read stays in storage until the person makes a project of their own. */
  let unreadableEntry = tabs.ok && tabs.warning !== undefined;
  const tabsChanged = (): boolean => {
    const { workbook, activeTab } = state;
    if (!storedTabs) return !isPlainDocument(workbook);
    const before = storedTabs.workbook;
    return (
      storedTabs.activeTab !== activeTab ||
      before.id !== workbook.id ||
      before.title !== workbook.title ||
      before.sketches !== workbook.sketches ||
      before.documents.length !== workbook.documents.length ||
      workbook.documents.some((d, i) =>
        i === activeTab ? d.id !== (before.documents[i] as Project).id : d !== before.documents[i]
      )
    );
  };
  let collab: CollabLink | null = null;
  let collabUnsubscribe: (() => void)[] = [];
  /** Follow-ups to a participant's proposal (select it, edit its title) that run when the host's commit brings it. */
  const awaitingNodes = new Map<string, (() => void)[]>();
  const tr = () => translator(state.messages);
  /** In a session a participant always acts as their own seat (once the host has added it). */
  const pinnedActor = (project: Project): string | null => {
    const self = collab?.role === 'participant' ? collab.session.status().selfUserId : null;
    return self && project.users.some((u) => u.id === self) ? self : null;
  };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const set = (patch: Partial<AppState>) => {
    state = { ...state, ...patch };
    emit();
  };
  const persist = (project: Project) => {
    // The project's entry first, then the shown diagram's own autosave: if the first write fails the autosave
    // still holds the diagram it held, so nothing that was stored is lost (the entry is the larger write).
    let result: SaveResult = { ok: true, at: nowIso() };
    if (tabsChanged() && !(unreadableEntry && isPlainDocument(state.workbook))) {
      result = saveWorkbook(store, state.workbook, state.activeTab, nowIso());
      if (result.ok) {
        storedTabs = snapshot();
        unreadableEntry = false;
      }
    }
    if (result.ok) {
      result = saveProject(store, project, nowIso());
      if (result.ok) recordActive(store, project, result.at);
    }
    set({ saveStatus: result.ok ? (persistent ? 'savedBrowser' : 'noServer') : 'saveFailed' });
    if (!result.ok) set({ notice: { kind: 'error', text: result.reason } });
  };
  /** The one way the project changes: `workbook` with `activeTab` shown. Unless `remember` is false it becomes
   * a history step when it changed the shown diagram or the project's structure, named by `label`; `fresh`
   * (default: when another tab is shown) starts the shown diagram's selection, profile and view focus over. */
  const commit = (
    workbook: Workbook,
    activeTab: number,
    opts: { remember?: boolean; fresh?: boolean; label?: HistoryLabel; whole?: boolean } = {}
  ) => {
    const project = workbook.documents[activeTab] as Project;
    const fresh = opts.fresh ?? activeTab !== state.activeTab;
    // Undo replaces whole documents, which a shared session cannot replay: no history while one is open.
    if ((opts.remember ?? true) && !collab) {
      const before = { workbook: state.workbook, shownId: state.project.id };
      const after = { workbook, shownId: project.id };
      // `whole`: the project is replaced, whatever ids the incoming diagrams share with the present ones.
      const kind = opts.whole ? 'project' : stepKind(before, after);
      const label: HistoryLabel = opts.label ?? {
        key: kind === 'project' ? 'historyProject' : 'historyChange',
      };
      if (kind === 'diagram')
        history.record(
          { scope: 'diagram', docId: project.id, before: state.project, after: project },
          label,
          nowIso()
        );
      else if (kind === 'project')
        history.record(
          { scope: 'project', before, after, ...(opts.whole ? { whole: true } : {}) },
          label,
          nowIso()
        );
    }
    const rootId = (rootNode(project) as { id: string }).id;
    const selected =
      !fresh && project.nodes.some((n) => n.id === state.selectedId) ? state.selectedId : rootId;
    const actor =
      pinnedActor(project) ??
      (fresh
        ? restoreActor(store, project)
        : project.users.some((u) => u.id === state.actorId)
          ? state.actorId
          : (project.users[0] as { id: string }).id);
    set({
      project,
      workbook,
      activeTab,
      selectedId: selected,
      actorId: actor,
      appearance: effectiveAppearance(store, project),
      ...(fresh
        ? {
            selectedLibraryReason: null,
            depthOverrides: new Map(),
            explicitlyClosedIds: new Set(),
            mutedIds: new Set(),
            tableRevealId: null,
            inlineEditId: null,
            claimPreview: null,
            reviewIds: readReviewIds(store, project.id),
            view: {
              ...state.view,
              focus: { mode: 'all', anchorId: rootId },
              compactVisible: false,
              depthLimit: null,
            },
          }
        : {}),
    });
    set(historyFlags());
    persist(project);
    if (fresh) {
      writeView(store, state.view);
      api.requestFit();
    }
    for (const [id, runs] of [...awaitingNodes])
      if (project.nodes.some((n) => n.id === id)) {
        awaitingNodes.delete(id);
        runs.forEach((run) => run());
      }
  };
  const replace = (
    incoming: Project,
    opts: { remember?: boolean; fresh?: boolean; label?: HistoryLabel; whole?: boolean } = {}
  ) =>
    // Every document enters here (open, import, example, library, join): an archived calculation method becomes
    // the default one (owner 2026-11-18).
    commit(
      replaceDocument(state.workbook, state.activeTab, withOfferedScoring(incoming)),
      state.activeTab,
      opts
    );
  const refused = (error: unknown): false => {
    set({ notice: { kind: 'error', text: error instanceof Error ? error.message : String(error) } });
    return false;
  };
  /** Show a different document with a fresh selection, profile and view focus (open, new, example, join). One
   * unnamed diagram is replaced by it, as a document always was. In a project it becomes a new tab, so opening
   * something never takes a diagram away; the shown diagram's own newer version replaces it in place. */
  const install = (validated: Project): boolean => {
    try {
      if (isPlainDocument(state.workbook) || validated.id === state.project.id)
        replace(validated, {
          fresh: true,
          label: { key: 'historyReplaced', detail: validated.title },
          // Another document over one unnamed diagram replaces the project as a whole.
          whole: validated.id !== state.project.id,
        });
      else {
        const { workbook } = attachDocuments(state.workbook, [withOfferedScoring(validated)], newId);
        commit(workbook, state.workbook.documents.length, {
          fresh: true,
          label: { key: 'historyTabAdd', detail: validated.title },
        });
        set({ notice: { kind: 'info', text: tr()('tabOpenedNotice', { title: validated.title }) } });
      }
    } catch (error) {
      return refused(error);
    }
    set({ home: false });
    return true;
  };
  /** Apply one side of a history step. A diagram's step puts that diagram's content back; a structure step puts
   * the tabs, names and sketchpads back and leaves every diagram's present content alone (`restructure`). */
  const applyStep = (step: HistoryStep, side: 'before' | 'after') => {
    if (step.scope === 'diagram') {
      const index = state.workbook.documents.findIndex((d) => d.id === step.docId);
      if (index !== -1)
        commit(replaceDocument(state.workbook, index, step[side]), index, { remember: false });
      return;
    }
    // The side that is being left keeps what it has become since: a sketchpad drawn on, a diagram edited after
    // it was attached come back as they are now when the step is walked the other way.
    const other = side === 'before' ? 'after' : 'before';
    step[other] = step.whole
      ? { workbook: state.workbook, shownId: state.project.id }
      : { ...step[other], workbook: restructure(step[other].workbook, state.workbook) };
    const view = step[side];
    // A step that replaced the project is the state it holds; any other puts the structure back and leaves the
    // content every diagram and sketchpad has now.
    const workbook = step.whole ? view.workbook : restructure(view.workbook, state.workbook);
    const shown = workbook.documents.findIndex((d) => d.id === view.shownId);
    commit(workbook, shown === -1 ? Math.min(state.activeTab, workbook.documents.length - 1) : shown, {
      remember: false,
    });
  };
  /** Tabs stay as they are while a session is open: it shares the diagram that was shown when it began. */
  const tabsLocked = (): boolean => {
    if (!collab) return false;
    set({ notice: { kind: 'error', text: tr()('tabsLockedInSession') } });
    return true;
  };
  const detachCollab = () => {
    collabUnsubscribe.forEach((u) => u());
    collabUnsubscribe = [];
    collab = null;
    awaitingNodes.clear();
    history.clear();
    set({ canUndo: false, canRedo: false });
  };

  if (state.language !== 'fi')
    void loadMessages(state.language).then((messages) => {
      if (state.messages === FI) set({ messages });
    });
  const api = {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => state,
    /** Apply one command; a refusal becomes a notice and the document stays as it was. Returns success. */
    dispatch(command: Command): boolean {
      if (collab?.role === 'participant') {
        // The host decides; the change appears when its commit arrives.
        if (collab.session.status().phase !== 'active') {
          set({ notice: { kind: 'error', text: tr()('collabNotConnected') } });
          return false;
        }
        collab.session.propose(command);
        return true;
      }
      try {
        const ctx = { now: nowIso(), actorId: state.actorId };
        const next = applyCommand(state.project, command, ctx);
        if (next === state.project) return false;
        replace(next, { label: commandLabel(command, state.project, next) });
        // A person is one person in every diagram of the project: a new name reaches the others too.
        if (command.type === 'user.rename' && !collab) {
          const everywhere = renamePersonElsewhere(
            state.workbook,
            state.activeTab,
            command.id,
            command.name,
            ctx
          );
          if (everywhere !== state.workbook)
            commit(everywhere, state.activeTab, { remember: false, fresh: false });
        }
        if (collab?.role === 'host') collab.session.localApplied(command, ctx, next);
        return true;
      } catch (error) {
        set({ notice: { kind: 'error', text: error instanceof Error ? error.message : String(error) } });
        return false;
      }
    },
    /** Replace the whole document (new, open, import). The person confirmed it already. */
    load(project: Project) {
      const validated = parseProject(project);
      if (state.workbook.documents.some((d, i) => i !== state.activeTab && d.id === validated.id)) {
        set({ notice: { kind: 'error', text: tr()('tabAlreadyOpen', { title: validated.title }) } });
        return;
      }
      if (collab?.role === 'participant') {
        set({ notice: { kind: 'error', text: tr()('collabLeaveFirst') } });
        return;
      }
      if (collab?.role === 'host') {
        // The same document changed as a whole (an AI merge, a library copy): everyone gets the new version.
        if (validated.id === state.project.id) {
          replace(validated);
          collab.session.replaced(state.project);
          return;
        }
        void collab.session.close();
        set({ notice: { kind: 'info', text: tr()('collabEndedByOpen') } });
      }
      install(validated);
    },
    /** Live collaboration: how the session reads and changes the document, bypassing the undo history. */
    collabPort(): DocumentPort {
      return {
        current: () => state.project,
        apply(command, ctx) {
          const next = applyCommand(state.project, command, ctx);
          if (next !== state.project) replace(next);
          return state.project;
        },
        adopt(project) {
          // A diagram the person already has in another tab is shown there, not copied into this one.
          const tab = state.workbook.documents.findIndex((d) => d.id === project.id);
          if (tab !== -1 && tab !== state.activeTab)
            commit(state.workbook, tab, { remember: false, fresh: true });
          if (project.id === state.project.id) replace(project);
          else if (!install(project)) replace(project, { fresh: true });
        },
      };
    },
    /** Hand the store an opened session; its status shows in `collab` until `clearCollab` after it ends. */
    attachCollab(link: CollabLink) {
      detachCollab();
      collab = link;
      const onStatus = (status: CollabStatus) => {
        set({ collab: status });
        if (status.phase === 'ended' && collab === link) detachCollab();
        else if (link.role === 'participant') {
          const actor = pinnedActor(state.project);
          if (actor && actor !== state.actorId) set({ actorId: actor });
        }
      };
      collabUnsubscribe = [
        link.session.subscribe(onStatus),
        link.session.onNotice((notice) => {
          const t = tr();
          if (notice.kind === 'rejected')
            set({
              notice: {
                kind: 'error',
                text: t('collabRejected', { reason: notice.detail ?? t(REJECT_TEXT[notice.reason]) }),
              },
            });
          else
            set({
              notice: {
                kind: 'info',
                text: t(notice.kind === 'joined' ? 'collabPersonJoined' : 'collabPersonLeft', {
                  name: notice.name,
                }),
              },
            });
        }),
      ];
      onStatus(link.session.status());
    },
    collabLink: (): CollabLink | null => collab,
    /** Run `run` now if the node exists, else once a commit brings it (a participant's own proposal). */
    afterNode(id: string, run: () => void) {
      if (state.project.nodes.some((n) => n.id === id)) run();
      else awaitingNodes.set(id, [...(awaitingNodes.get(id) ?? []), run]);
    },
    /** The active language's text, for flows outside React. */
    translate: (key: MessageKey, params?: Record<string, string | number>): string => tr()(key, params),
    /** Forget an ended session's status (the person closed its notice). */
    clearCollab() {
      if (!collab) set({ collab: null });
    },
    undo() {
      if (collab) return;
      const step = history.takeUndo(state.project.id);
      if (step) applyStep(step, 'before');
    },
    redo() {
      if (collab) return;
      const step = history.takeRedo(state.project.id);
      if (step) applyStep(step, 'after');
    },
    /** The history list: the shown diagram's steps and the project structure's, oldest first. */
    historyList: () => (collab ? [] : history.list(state.project.id)),
    /** Take back the structure step `seq` (a removed tab) if it is still the newest one; returns success. */
    undoStructure(seq: number | null = history.newestStructure()): boolean {
      if (collab || seq === null) return false;
      const step = history.takeStructureUndo(seq);
      if (step) applyStep(step, 'before');
      return step !== null;
    },
    /** Go to the state right after step `seq` (0: before the first step), undoing or redoing on the way. */
    jumpTo(seq: number) {
      if (collab) return;
      // The list is the shown diagram's: the jump walks that diagram's steps and the structure's, and never
      // another tab's, even when a structure step on the way shows another tab for a moment.
      const pinned = state.project.id;
      for (let guard = 0; guard < 1000; guard++) {
        const steps = history.list(pinned);
        const newestDone = steps.filter((s) => s.done).pop();
        const oldestUndone = steps.find((s) => !s.done);
        const back = !!newestDone && newestDone.step.seq > seq;
        const step = back
          ? history.takeUndo(pinned, true)
          : oldestUndone && oldestUndone.step.seq <= seq
            ? history.takeRedo(pinned, true)
            : null;
        if (!step) return;
        applyStep(step, back ? 'before' : 'after');
        const index = state.workbook.documents.findIndex((d) => d.id === pinned);
        // The diagram itself was taken away by the step (the one that brought it in): the jump ends there.
        if (index === -1) return;
        if (index !== state.activeTab) commit(state.workbook, index, { remember: false });
      }
    },
    /** Show another tab. Not an undo step: looking at a diagram changes nothing. */
    selectTab(index: number): boolean {
      if (index === state.activeTab || !state.workbook.documents[index]) return false;
      if (tabsLocked()) return false;
      commit(state.workbook, index, { remember: false });
      return true;
    },
    /** Add diagrams after the present tabs and show the first of them; returns how many were added. A diagram
     * whose id the project already holds comes in as a copy with a new id. */
    attachTabs(documents: readonly Project[], sketches: readonly ProjectSketch[] = []): number {
      if (documents.length === 0 || tabsLocked()) return 0;
      try {
        const incoming = documents.map((d) => withOfferedScoring(parseProject(d)));
        const { workbook } = attachDocuments(state.workbook, incoming, newId, sketches);
        commit(workbook, state.workbook.documents.length, {
          fresh: true,
          label: { key: 'historyTabAdd', detail: (incoming[0] as Project).title },
        });
        set({ home: false });
        return incoming.length;
      } catch (error) {
        refused(error);
        return 0;
      }
    },
    /** Remove a tab's diagram from the project (undo brings it back); the neighbour is shown. */
    removeTab(index: number): boolean {
      if (tabsLocked()) return false;
      try {
        const workbook = removeDocument(state.workbook, index);
        const removed = (state.workbook.documents[index] as Project).title;
        const active =
          index < state.activeTab
            ? state.activeTab - 1
            : Math.min(state.activeTab, workbook.documents.length - 1);
        commit(workbook, active, {
          fresh: index === state.activeTab,
          label: { key: 'historyTabRemove', detail: (state.workbook.documents[index] as Project).title },
        });
        // Kumoa stays with the shown diagram, so the removal offers its own way back.
        const restore = history.newestStructure();
        set({
          notice: {
            kind: 'info',
            text: tr()('tabRemovedNotice', { title: removed }),
            ...(restore ? { restore } : {}),
          },
        });
        return true;
      } catch (error) {
        return refused(error);
      }
    },
    /** Move a tab; the shown diagram stays shown. */
    moveTab(from: number, to: number): boolean {
      if (tabsLocked()) return false;
      const workbook = moveDocument(state.workbook, from, to);
      if (workbook === state.workbook) return false;
      const shown = state.project.id;
      commit(
        workbook,
        workbook.documents.findIndex((d) => d.id === shown),
        { fresh: false, label: { key: 'historyTabMove', detail: state.project.title } }
      );
      return true;
    },
    /** A new empty sketchpad in the project; returns its id, or null when refused. */
    addProjectSketch(name: string): string | null {
      try {
        const id = newId();
        commit(addSketch(state.workbook, id, name, blankSketch(newId())), state.activeTab, {
          fresh: false,
          label: { key: 'historySketchAdd', detail: name },
        });
        return id;
      } catch (error) {
        refused(error);
        return null;
      }
    },
    /** A project sketchpad as it was just drawn. Not a history step: the sketchpad has its own undo. */
    drawProjectSketch(id: string, sketch: Sketch) {
      const workbook = drawSketch(state.workbook, id, sketch);
      if (workbook !== state.workbook) commit(workbook, state.activeTab, { remember: false, fresh: false });
    },
    renameProjectSketch(id: string, name: string): boolean {
      const workbook = renameSketch(state.workbook, id, name);
      if (workbook === state.workbook) return false;
      commit(workbook, state.activeTab, {
        fresh: false,
        label: { key: 'historySketchRename', detail: name },
      });
      return true;
    },
    removeProjectSketch(id: string): boolean {
      const removed = state.workbook.sketches.find((s) => s.id === id);
      const workbook = removeSketch(state.workbook, id);
      if (!removed || workbook === state.workbook) return false;
      commit(workbook, state.activeTab, {
        fresh: false,
        label: { key: 'historySketchRemove', detail: removed.name },
      });
      return true;
    },
    renameProject(title: string): boolean {
      const workbook = renameWorkbook(state.workbook, title);
      if (workbook.title === state.workbook.title) return false;
      commit(workbook, state.activeTab, {
        fresh: false,
        label: { key: 'historyProjectRename', detail: workbook.title },
      });
      return true;
    },
    /** Replace the whole project with an opened one (undo brings the previous project back). */
    loadWorkbook(incoming: Workbook): boolean {
      if (collab?.role === 'participant') {
        set({ notice: { kind: 'error', text: tr()('collabLeaveFirst') } });
        return false;
      }
      if (collab?.role === 'host') {
        void collab.session.close();
        set({ notice: { kind: 'info', text: tr()('collabEndedByOpen') } });
      }
      try {
        // The store's own boundary: whoever calls, the project that enters has been through the file's checks.
        const opened = parseWorkbook(workbookFileObject(incoming));
        // Sketchpads with nothing drawn are not written, so they are not in `opened`; nothing is lost by that.
        commit(opened, 0, {
          fresh: true,
          whole: true,
          label: {
            key: 'historyProjectOpen',
            detail: opened.title || (opened.documents[0] as Project).title,
          },
        });
      } catch (error) {
        return refused(error);
      }
      set({ home: false });
      return true;
    },
    /** The prototype's `selectNode`: clears a library selection and a table reveal that is not this node. */
    select(id: string) {
      if (!state.project.nodes.some((n) => n.id === id)) return;
      set({
        selectedId: id,
        selectedLibraryReason: null,
        tableRevealId: state.tableRevealId === id ? state.tableRevealId : null,
      });
    },
    setActor(id: string) {
      if (!state.project.users.some((u) => u.id === id)) return;
      if (collab?.role === 'participant' && id !== pinnedActor(state.project)) return;
      writePreference(store, assessorKey(state.project.id), id);
      set({ actorId: id });
    },
    setHome(home: boolean) {
      set({ home, focusOnly: home ? false : state.focusOnly });
      if (!home) api.requestFit();
    },
    setFocusOnly(focusOnly: boolean) {
      const view =
        focusOnly && state.view.presentation === 'table'
          ? { ...state.view, presentation: 'tree' as const }
          : state.view;
      set({ focusOnly, view });
      api.requestFit();
    },
    selectLibraryReason(selection: LibrarySelection | null) {
      set({ selectedLibraryReason: selection, leftTab: selection ? 'repeat' : state.leftTab });
      if (selection) api.setZones({ left: true });
    },
    setDepthOverrides(depthOverrides: ReadonlyMap<string, boolean>) {
      set({ depthOverrides });
    },
    setExplicitlyClosed(explicitlyClosedIds: ReadonlySet<string>) {
      set({ explicitlyClosedIds });
    },
    /** Mutes a reason for a what-if, or brings it back; `null` brings every muted reason back. */
    toggleMuted(id: string | null) {
      const mutedIds = new Set(id === null ? [] : state.mutedIds);
      if (id !== null && !mutedIds.delete(id)) mutedIds.add(id);
      set({ mutedIds });
    },
    setTableReveal(tableRevealId: string | null) {
      set({ tableRevealId });
    },
    setReviewIds(reviewIds: string[] | null) {
      writePreference(store, reviewViewKey(state.project.id), JSON.stringify(reviewIds));
      set({ reviewIds });
    },
    requestFit() {
      set({ fitRequest: state.fitRequest + 1 });
    },
    requestCenter(id: string) {
      set({ centerRequest: { id, n: (state.centerRequest?.n ?? 0) + 1 } });
    },
    setLanguage(language: Language) {
      writePreference(store, LOCALE_KEY, language);
      // The person's own choice now stands: a language named in the address (`?lang=`) no longer applies, so it
      // is taken out of the address and a reload keeps the choice.
      if (typeof window !== 'undefined' && languageFromSearch(window.location.search) !== null) {
        const url = new URL(window.location.href);
        url.searchParams.delete('lang');
        window.history.replaceState(null, '', url);
      }
      set({ language });
      void loadMessages(language).then((messages) => {
        if (state.language === language) set({ messages });
      });
    },
    /** Base themes go into the document (undoable, exported); special skins stay in this browser. */
    setAppearance(appearance: Appearance) {
      if (SPECIAL_APPEARANCES.includes(appearance as SpecialAppearance)) {
        writePreference(store, SPECIAL_KEY, appearance);
        set({ appearance });
        return;
      }
      try {
        store.removeItem(SPECIAL_KEY);
      } catch {
        // optional
      }
      if (appearance !== state.project.theme)
        api.dispatch({ type: 'project.setTheme', theme: appearance as Project['theme'] });
      set({ appearance });
    },
    setView(patch: Partial<ViewState>) {
      const view: ViewState = {
        ...state.view,
        ...patch,
        layers: { ...state.view.layers, ...(patch.layers ?? {}) },
        focus: { ...state.view.focus, ...(patch.focus ?? {}) },
      };
      writeView(store, view);
      set({ view });
    },
    setZones(patch: Partial<Zones>) {
      const zones = { ...state.zones, ...patch };
      writeZones(store, zones);
      set({ zones });
    },
    toggleZone(zone: Zone) {
      api.setZones({ [zone]: !state.zones[zone] });
    },
    setLeftTab(leftTab: LeftTab) {
      set({ leftTab });
    },
    setDraggingLibraryReason(draggingLibraryReason: LibrarySelection | null) {
      set({ draggingLibraryReason });
    },
    setInlineEdit(inlineEditId: string | null) {
      set({ inlineEditId });
    },
    setClaimPreview(claimPreview: AppState['claimPreview']) {
      set({ claimPreview });
    },
    /** The prototype's `askConfirm`: resolves true on Jatka, false on Peruuta or Escape. */
    askConfirm(text: string): Promise<boolean> {
      return new Promise((resolve) => set({ modal: { kind: 'confirm', text, resolve } }));
    },
    /** The prototype's `prepareReplacement`: with nothing saved it resolves 'forget' at once; otherwise the replace
     * dialog asks whether to discard the current work, save it to the library first, or stay (null). */
    prepareReplacement(description: string, incomingId?: string): Promise<ReplaceChoice> {
      const hasWork = state.saveStatus !== 'noServer' || state.project.nodes.length > 1;
      if (!hasWork) return Promise.resolve('forget');
      // A diagram that is open in another tab cannot be opened over this one: say so before asking anything.
      const held = state.workbook.documents.find((d, i) => i !== state.activeTab && d.id === incomingId);
      if (held) {
        set({ notice: { kind: 'error', text: tr()('tabAlreadyOpen', { title: held.title }) } });
        return Promise.resolve(null);
      }
      // In a project a document that is not one of its diagrams opens in a new tab: nothing is replaced, so
      // there is nothing to ask (`incomingId` is the id it will be opened with).
      if (
        incomingId !== undefined &&
        !isPlainDocument(state.workbook) &&
        !state.workbook.documents.some((d) => d.id === incomingId)
      )
        return Promise.resolve('forget');
      return new Promise((resolve) => set({ modal: { kind: 'replace', description, resolve } }));
    },
    /** The prototype's `askText`: resolves the trimmed value, or null when cancelled. */
    askText(prompt: string, heading: string, action: string, initial = ''): Promise<string | null> {
      return new Promise((resolve) =>
        set({ modal: { kind: 'text', heading, prompt, action, initial, resolve } })
      );
    },
    /** A message to close; `warning` is shown apart from it, as a caution that must not be read past. */
    showMessage(text: string, warning?: string) {
      set({ modal: { kind: 'notice', text, ...(warning ? { warning } : {}) } });
    },
    openModal(modal: ModalRequest) {
      set({ modal });
    },
    openDialog(dialog: DialogName | null) {
      set({ dialog });
    },
    closeModal() {
      set({ modal: null });
    },
    notify(notice: Notice | null) {
      set({ notice });
    },
  };
  return api;
}
export type Store = ReturnType<typeof createStore>;

let singleton: Store | null = null;
export const getStore = (): Store => (singleton ??= createStore());
/** For tests and the e2e harness: a fresh store on a given key-value store. */
export const resetStore = (options?: Parameters<typeof createStore>[0]): Store =>
  (singleton = createStore(options));

export function useAppState(): AppState {
  const store = getStore();
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
export function useTranslator() {
  const { messages } = useAppState();
  return translator(messages);
}
