// The autosave metadata beside the active draft, in the prototype's exact shape (`witt-workspace-meta-v1`):
// which document was last autosaved and when, and the last JSON file opened or exported. A single draft lives in
// `witt-project-v3`; explicit library saves are IndexedDB (library.ts). No document history, no migration of old keys.
import type { Project } from '../domain/index.ts';
import type { Translator } from './i18n/i18n.ts';
import { PROJECT_KEY, saveProject } from './storage.ts';
import type { KeyValueStore } from './storage.ts';

export const WORKSPACE_META_KEY = 'witt-workspace-meta-v1';

export interface ActiveMeta {
  id: string;
  title: string;
  savedAt: string;
}
export interface WorkspaceEvent {
  filename: string;
  projectId: string;
  at: string;
}
export type WorkspaceEventKind = 'lastOpenedJson' | 'lastExportedJson';
export const WORKSPACE_EVENT_KINDS: WorkspaceEventKind[] = ['lastOpenedJson', 'lastExportedJson'];
export interface WorkspaceMeta {
  active?: ActiveMeta;
  lastOpenedJson?: WorkspaceEvent;
  lastExportedJson?: WorkspaceEvent;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const safeParse = (text: string | null): unknown => {
  try {
    return JSON.parse(text ?? '');
  } catch {
    return {};
  }
};

/** The stored metadata, or `{}` when absent or unreadable (never throws on bad JSON). */
export function readMeta(store: KeyValueStore): WorkspaceMeta {
  const meta = safeParse(store.getItem(WORKSPACE_META_KEY));
  return isRecord(meta) ? (meta as WorkspaceMeta) : {};
}
/** The raw autosaved draft, if any. */
export function rawActive(store: KeyValueStore): { key: string; raw: string } | null {
  const raw = store.getItem(PROJECT_KEY);
  return raw ? { key: PROJECT_KEY, raw } : null;
}
export const hasSavedWork = (store: KeyValueStore): boolean => !!rawActive(store);

/** Autosave the draft, then record it as the active document. The draft is written first so a metadata failure can
 * never fake a successful save; a failing draft write throws. */
export function persist(store: KeyValueStore, project: Project, at: string): ActiveMeta {
  const saved = saveProject(store, project, at);
  if (!saved.ok) throw new Error(saved.reason);
  const meta = readMeta(store);
  meta.active = { id: project.id, title: project.title, savedAt: at };
  try {
    store.setItem(WORKSPACE_META_KEY, JSON.stringify(meta));
  } catch {
    // The draft is safe even when the optional metadata is not.
  }
  return meta.active;
}

/** Note the last JSON file opened or exported (filename cut to 255 characters). */
export function recordEvent(
  store: KeyValueStore,
  kind: WorkspaceEventKind,
  filename: string,
  projectId: string,
  at: string
): WorkspaceEvent {
  if (!WORKSPACE_EVENT_KINDS.includes(kind)) throw new Error('Invalid workspace event');
  const meta = readMeta(store);
  const event = { filename: String(filename).slice(0, 255), projectId, at };
  meta[kind] = event;
  store.setItem(WORKSPACE_META_KEY, JSON.stringify(meta));
  return event;
}

export interface ActiveSummary {
  id: string | null;
  title: string | null;
  mode: 'decision' | 'argument' | null;
  nodeCount: number | null;
  /** The document's own content edit time. */
  editedAt: string | null;
  /** When the active copy was last autosaved; null in session-only mode. Neither implies a file or library save. */
  browserSavedAt: string | null;
  sessionOnly: boolean;
}
const validTime = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value)) ? value : null;
/** Read-only summary of the active work for every "replace the current document" entry point. */
export function activeSummary(store: KeyValueStore, project: unknown, temporary = false): ActiveSummary {
  const doc = isRecord(project) ? project : {};
  const metadata = readMeta(store);
  const active = isRecord(metadata.active) && metadata.active.id === doc.id ? metadata.active : null;
  return {
    id: typeof doc.id === 'string' ? doc.id : null,
    title: typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : null,
    mode: doc.mode === 'decision' ? 'decision' : doc.mode === 'argument' ? 'argument' : null,
    nodeCount: Array.isArray(doc.nodes) ? doc.nodes.length : null,
    editedAt: validTime(doc.updatedAt),
    browserSavedAt: temporary ? null : validTime(active?.savedAt),
    sessionOnly: !!temporary,
  };
}

/** A timestamp as the home screen shows it: locale medium date + short time, "Tarkka aika ei tiedossa" when absent
 * or unparsable, the raw value when the locale cannot format. */
export function formatWorkspaceTime(t: Translator, locale: string, value: string | null | undefined): string {
  if (!value || Number.isNaN(Date.parse(value))) return t('homeTimeUnknown');
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}
/** "<filename> · <time>" for a recorded JSON event, "Ei vielä tietoa" when none was recorded. */
export function formatWorkspaceEvent(
  t: Translator,
  locale: string,
  event: WorkspaceEvent | undefined | null
): string {
  return event?.filename
    ? `${event.filename} · ${formatWorkspaceTime(t, locale, event.at)}`
    : t('homeNotYet');
}

export interface HomeCardInput {
  store: KeyValueStore;
  /** The loaded document (the autosaved draft, or the fallback when hydration failed). */
  project: Pick<Project, 'id' | 'title'>;
  /** A draft exists in storage but could not be parsed or validated. */
  hydrationFailed: boolean;
  /** Storage is the in-memory fallback: the work lives only in this session. */
  temporary: boolean;
  locale: string;
  t: Translator;
}
export interface HomeCard {
  /** A raw draft exists in storage: the current-work card is shown. */
  saved: boolean;
  /** The draft exists and hydrated: "Jatka edellistä työtä" is shown and is the primary action. */
  canContinue: boolean;
  title: string;
  browserSaveLabel: string;
  browserSave: string;
  latestOpen: string;
  latestExport: string;
  showUnreadableWarning: boolean;
  showSessionWarning: boolean;
}
/** Everything the home screen's current-work card shows, exactly as the prototype's `renderHomeWorkspace`. */
export function homeCard(input: HomeCardInput): HomeCard {
  const { store, project, hydrationFailed, temporary, locale, t } = input;
  let saved = false;
  try {
    saved = hasSavedWork(store);
  } catch {
    saved = false;
  }
  let meta: WorkspaceMeta = {};
  try {
    meta = readMeta(store);
  } catch {
    meta = {};
  }
  const ownActive = meta.active?.id === project.id;
  return {
    saved,
    canContinue: saved && !hydrationFailed,
    title: !saved
      ? ''
      : ownActive && meta.active
        ? meta.active.title
        : hydrationFailed
          ? t('homeUnreadable')
          : project.title,
    browserSaveLabel: t(temporary ? 'homeSessionSaveLabel' : 'homeBrowserSaveLabel'),
    browserSave: saved ? formatWorkspaceTime(t, locale, ownActive ? meta.active?.savedAt : null) : '',
    latestOpen: formatWorkspaceEvent(t, locale, meta.lastOpenedJson),
    latestExport: formatWorkspaceEvent(t, locale, meta.lastExportedJson),
    showUnreadableWarning: hydrationFailed,
    showSessionWarning: temporary,
  };
}

export interface ReplaceDialogTexts {
  currentName: string;
  currentInfo: string;
  editedAt: string;
  autosavedAt: string;
}
/** The "Nykyinen työ" block of the replace dialog, formatted as the prototype's `prepareReplacement`. */
export function replaceDialogTexts(t: Translator, locale: string, active: ActiveSummary): ReplaceDialogTexts {
  return {
    currentName: active.title || t('homeTimeUnknown'),
    currentInfo: [
      active.mode ? t(active.mode === 'decision' ? 'modeDecision' : 'modeArgument') : null,
      active.nodeCount === null ? null : t('replaceNodeCount', { count: active.nodeCount }),
    ]
      .filter(Boolean)
      .join(' · '),
    editedAt: formatWorkspaceTime(t, locale, active.editedAt),
    autosavedAt: active.sessionOnly
      ? t('replaceSessionOnly')
      : formatWorkspaceTime(t, locale, active.browserSavedAt),
  };
}
