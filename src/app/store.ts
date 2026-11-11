// The one document store. State changes only through dispatch(command) → applyCommand; the UI subscribes with
// useSyncExternalStore. Undo/redo is a stack of past documents; view preferences live beside, never inside, the document.
import { useSyncExternalStore } from 'react';
import {
  applyCommand,
  createBlankProject,
  parseProject,
  rootNode,
  SCORING_VERSION,
} from '../domain/index.ts';
import type { Command, ImportReport, Mode, Project, RejectReason } from '../domain/index.ts';
import { DEFAULT_LANGUAGE, FI, isLanguage, loadMessages, translator } from '../lib/i18n/i18n.ts';
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
import type { KeyValueStore } from '../lib/storage.ts';
import type { CollabStatus, DocumentPort, HostSession, ParticipantSession } from '../lib/p2p/session.ts';
import { persist as recordActive } from '../lib/workspaceMeta.ts';
import { assessorKey, readView, readZones, reviewViewKey, writeView, writeZones } from './view.ts';
import type { ViewState, Zone, Zones } from './view.ts';

export type { ViewState, Zone, Zones } from './view.ts';

/** The prototype's eight themes in its menu order (UI_INVENTORY S-00), then the owner's additions of 2026-11-09. */
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
  | 'collab';
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
  | { kind: 'notice'; text: string }
  | { kind: 'move'; nodeId: string }
  | { kind: 'links'; nodeId: string; linkId?: string }
  | { kind: 'replace'; description: string; resolve: (choice: ReplaceChoice) => void }
  | { kind: 'importReport'; report: ImportReport; filename: string };
/** The replacement dialog's outcome: proceed and forget, proceed after a library save, or stay (null). */
export type ReplaceChoice = 'forget' | 'keep' | null;

export interface Notice {
  kind: 'error' | 'info';
  text: string;
}
export interface AppState {
  project: Project;
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
  const initialProject = loaded.ok ? loaded.project : blankProject('argument');
  const savedLanguage = readPreference(store, LOCALE_KEY);
  let state: AppState = {
    project: initialProject,
    selectedId: (rootNode(initialProject) as { id: string }).id,
    actorId: restoreActor(store, initialProject),
    language: isLanguage(savedLanguage) ? savedLanguage : DEFAULT_LANGUAGE,
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
    saveStatus: loaded.ok ? 'savedBrowser' : 'noServer',
    storagePersistent: persistent,
    hydrationFailed: !loaded.ok && 'reason' in loaded,
    notice: !loaded.ok && 'reason' in loaded ? { kind: 'error', text: loaded.reason } : null,
    collab: null,
  };
  const past: Project[] = [];
  const future: Project[] = [];
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
    const result = saveProject(store, project, nowIso());
    if (result.ok) recordActive(store, project, result.at);
    set({ saveStatus: result.ok ? (persistent ? 'savedBrowser' : 'noServer') : 'saveFailed' });
    if (!result.ok) set({ notice: { kind: 'error', text: result.reason } });
  };
  const replace = (project: Project, { remember = true } = {}) => {
    // Undo replaces whole documents, which a shared session cannot replay: no history while one is open.
    if (remember && !collab) {
      past.push(state.project);
      if (past.length > 60) past.shift();
      future.length = 0;
    }
    const selected = project.nodes.some((n) => n.id === state.selectedId)
      ? state.selectedId
      : (rootNode(project) as { id: string }).id;
    const actor =
      pinnedActor(project) ??
      (project.users.some((u) => u.id === state.actorId)
        ? state.actorId
        : (project.users[0] as { id: string }).id);
    set({
      project,
      selectedId: selected,
      actorId: actor,
      appearance: effectiveAppearance(store, project),
      canUndo: !collab && past.length > 0,
      canRedo: !collab && future.length > 0,
    });
    persist(project);
    for (const [id, runs] of [...awaitingNodes])
      if (project.nodes.some((n) => n.id === id)) {
        awaitingNodes.delete(id);
        runs.forEach((run) => run());
      }
  };
  /** Show a different document: fresh selection, profile and view focus (open, new, join). */
  const install = (validated: Project) => {
    const rootId = (rootNode(validated) as { id: string }).id;
    replace(validated);
    set({
      selectedId: rootId,
      actorId: pinnedActor(validated) ?? restoreActor(store, validated),
      selectedLibraryReason: null,
      depthOverrides: new Map(),
      explicitlyClosedIds: new Set(),
      tableRevealId: null,
      reviewIds: readReviewIds(store, validated.id),
      view: {
        ...state.view,
        focus: { mode: 'all', anchorId: rootId },
        compactVisible: false,
        depthLimit: null,
      },
      home: false,
    });
    writeView(store, state.view);
    api.requestFit();
  };
  const detachCollab = () => {
    collabUnsubscribe.forEach((u) => u());
    collabUnsubscribe = [];
    collab = null;
    awaitingNodes.clear();
    past.length = 0;
    future.length = 0;
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
        replace(next);
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
          if (project.id === state.project.id) replace(project);
          else install(project);
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
      const previous = past.pop();
      if (!previous) return;
      future.push(state.project);
      replace(previous, { remember: false });
      set({ canUndo: past.length > 0, canRedo: future.length > 0 });
    },
    redo() {
      if (collab) return;
      const next = future.pop();
      if (!next) return;
      past.push(state.project);
      replace(next, { remember: false });
      set({ canUndo: past.length > 0, canRedo: future.length > 0 });
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
    prepareReplacement(description: string): Promise<ReplaceChoice> {
      const hasWork = state.saveStatus !== 'noServer' || state.project.nodes.length > 1;
      if (!hasWork) return Promise.resolve('forget');
      return new Promise((resolve) => set({ modal: { kind: 'replace', description, resolve } }));
    },
    /** The prototype's `askText`: resolves the trimmed value, or null when cancelled. */
    askText(prompt: string, heading: string, action: string, initial = ''): Promise<string | null> {
      return new Promise((resolve) =>
        set({ modal: { kind: 'text', heading, prompt, action, initial, resolve } })
      );
    },
    showMessage(text: string) {
      set({ modal: { kind: 'notice', text } });
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
