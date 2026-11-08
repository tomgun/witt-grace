// The one document store. State changes only through dispatch(command) → applyCommand; the UI subscribes with
// useSyncExternalStore. Undo/redo is a stack of past documents; view preferences live beside, never inside, the document.
import { useSyncExternalStore } from 'react';
import { applyCommand, createBlankProject, parseProject, rootNode } from '../domain/index.ts';
import type { Command, Mode, Project } from '../domain/index.ts';
import { DEFAULT_LANGUAGE, isLanguage, translator } from '../lib/i18n/i18n.ts';
import type { Language, MessageKey } from '../lib/i18n/i18n.ts';
import { newId, nowIso } from '../lib/providers.ts';
import {
  APPEARANCE_KEY,
  LOCALE_KEY,
  VIEW_KEY,
  browserStore,
  loadProject,
  readPreference,
  saveProject,
  writePreference,
} from '../lib/storage.ts';
import type { KeyValueStore } from '../lib/storage.ts';

export const APPEARANCES = ['light', 'dark', 'paper', 'bitberg'] as const;
export type Appearance = (typeof APPEARANCES)[number];
export type Zone = 'left' | 'top' | 'right' | 'bottom';
export type Viewpoint = 'shared' | 'personal';

export interface ViewState {
  zones: Record<Zone, boolean>;
  dockOpen: boolean;
  viewpoint: Viewpoint;
  showAuthors: boolean;
}
export interface Notice {
  kind: 'error' | 'info';
  text: string;
}
export interface AppState {
  project: Project;
  selectedId: string;
  actorId: string;
  language: Language;
  appearance: Appearance;
  view: ViewState;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: MessageKey;
  storagePersistent: boolean;
  notice: Notice | null;
}

const defaultView: ViewState = {
  zones: { left: true, top: true, right: true, bottom: false },
  dockOpen: false,
  viewpoint: 'shared',
  showAuthors: true,
};

export function blankProject(mode: Mode = 'argument'): Project {
  return createBlankProject({ mode, projectId: newId(), rootId: newId(), userId: newId(), now: nowIso() });
}

function readView(store: KeyValueStore): ViewState {
  try {
    const raw = readPreference(store, VIEW_KEY);
    if (!raw) return defaultView;
    const parsed = JSON.parse(raw) as Partial<ViewState>;
    return { ...defaultView, ...parsed, zones: { ...defaultView.zones, ...(parsed.zones ?? {}) } };
  } catch {
    return defaultView;
  }
}

export function createStore(options: { store?: KeyValueStore; persistent?: boolean } = {}) {
  const detected = options.store ? null : browserStore();
  const store = options.store ?? (detected as { store: KeyValueStore }).store;
  const persistent = options.persistent ?? detected?.persistent ?? false;
  const loaded = loadProject(store);
  const initialProject = loaded.ok ? loaded.project : blankProject('argument');
  const savedLanguage = readPreference(store, LOCALE_KEY);
  const savedAppearance = readPreference(store, APPEARANCE_KEY);
  let state: AppState = {
    project: initialProject,
    selectedId: (rootNode(initialProject) as { id: string }).id,
    actorId: (initialProject.users[0] as { id: string }).id,
    language: isLanguage(savedLanguage) ? savedLanguage : DEFAULT_LANGUAGE,
    appearance: APPEARANCES.includes(savedAppearance as Appearance)
      ? (savedAppearance as Appearance)
      : 'light',
    view: readView(store),
    canUndo: false,
    canRedo: false,
    saveStatus: loaded.ok ? 'savedBrowser' : 'noServer',
    storagePersistent: persistent,
    notice: !loaded.ok && 'reason' in loaded ? { kind: 'error', text: loaded.reason } : null,
  };
  const past: Project[] = [];
  const future: Project[] = [];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const set = (patch: Partial<AppState>) => {
    state = { ...state, ...patch };
    emit();
  };
  const persist = (project: Project) => {
    const result = saveProject(store, project, nowIso());
    set({ saveStatus: result.ok ? (persistent ? 'savedBrowser' : 'noServer') : 'saveFailed' });
    if (!result.ok) set({ notice: { kind: 'error', text: result.reason } });
  };
  const replace = (project: Project, { remember = true } = {}) => {
    if (remember) {
      past.push(state.project);
      if (past.length > 60) past.shift();
      future.length = 0;
    }
    const selected = project.nodes.some((n) => n.id === state.selectedId)
      ? state.selectedId
      : (rootNode(project) as { id: string }).id;
    const actor = project.users.some((u) => u.id === state.actorId)
      ? state.actorId
      : (project.users[0] as { id: string }).id;
    set({
      project,
      selectedId: selected,
      actorId: actor,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
    });
    persist(project);
  };

  const api = {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => state,
    /** Apply one command; a refusal becomes a notice and the document stays as it was. Returns success. */
    dispatch(command: Command): boolean {
      try {
        const next = applyCommand(state.project, command, { now: nowIso(), actorId: state.actorId });
        if (next === state.project) return false;
        replace(next);
        return true;
      } catch (error) {
        set({ notice: { kind: 'error', text: error instanceof Error ? error.message : String(error) } });
        return false;
      }
    },
    /** Replace the whole document (new, open, import). The person confirmed it already. */
    load(project: Project) {
      const validated = parseProject(project);
      replace(validated);
      set({
        selectedId: (rootNode(validated) as { id: string }).id,
        actorId: (validated.users[0] as { id: string }).id,
      });
    },
    undo() {
      const previous = past.pop();
      if (!previous) return;
      future.push(state.project);
      replace(previous, { remember: false });
      set({ canUndo: past.length > 0, canRedo: future.length > 0 });
    },
    redo() {
      const next = future.pop();
      if (!next) return;
      past.push(state.project);
      replace(next, { remember: false });
      set({ canUndo: past.length > 0, canRedo: future.length > 0 });
    },
    select(id: string) {
      if (state.project.nodes.some((n) => n.id === id)) set({ selectedId: id });
    },
    setActor(id: string) {
      if (state.project.users.some((u) => u.id === id)) set({ actorId: id });
    },
    setLanguage(language: Language) {
      writePreference(store, LOCALE_KEY, language);
      set({ language });
    },
    setAppearance(appearance: Appearance) {
      writePreference(store, APPEARANCE_KEY, appearance);
      set({ appearance });
    },
    setView(patch: Partial<ViewState>) {
      const view = { ...state.view, ...patch, zones: { ...state.view.zones, ...(patch.zones ?? {}) } };
      writePreference(store, VIEW_KEY, JSON.stringify(view));
      set({ view });
    },
    toggleZone(zone: Zone) {
      api.setView({ zones: { ...state.view.zones, [zone]: !state.view.zones[zone] } });
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
  const { language } = useAppState();
  return translator(language);
}
