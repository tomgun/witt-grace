// Browser-side view preferences in the prototype's exact shape (docs/spec/UI_INVENTORY.md S-12).
// They describe presentation only and never enter the document; the document's own layout stays in `project.layout`.
import type { KeyValueStore } from '../lib/storage.ts';
import { readPreference, writePreference } from '../lib/storage.ts';
import type { ExportLayers } from '../lib/export/snapshot.ts';

export const VIEW_KEY = 'witt-view-v1';
export const ZONES_KEY = 'witt-zones-v1';

export type Presentation = 'tree' | 'table';
export type Orientation = 'horizontal' | 'vertical' | 'four-way';
export const ORIENTATIONS: Orientation[] = ['horizontal', 'vertical', 'four-way'];
export type Workflow = 'explore' | 'evaluate';
export type IndexMode = 'shared' | 'personal';
export type FocusMode = 'all' | 'support' | 'oppose';
export type Zone = 'left' | 'top' | 'right' | 'bottom';
export const ZONES: Zone[] = ['left', 'top', 'right', 'bottom'];

export const LAYER_NAMES = [
  'labels',
  'details',
  'index',
  'assessments',
  'comments',
  'counts',
  'links',
] as const;
export type LayerName = (typeof LAYER_NAMES)[number];
export type Layers = Record<LayerName, boolean>;
// The prototype's separate credence and impact layers repeated the compact pair; the owner removed them (2026-11-09,
// UI_INVENTORY S-15). A saved view that had either one on gets the compact pair instead.
export type LayerPreset = 'text' | 'analysis' | 'all';
export const LAYER_PRESETS: Record<LayerPreset, Layers> = {
  text: {
    labels: false,
    details: false,
    index: false,
    assessments: false,
    comments: false,
    counts: false,
    links: false,
  },
  analysis: {
    labels: true,
    details: true,
    index: true,
    assessments: true,
    comments: true,
    counts: true,
    links: false,
  },
  all: {
    labels: true,
    details: true,
    index: true,
    assessments: true,
    comments: true,
    counts: true,
    links: true,
  },
};

export interface ViewState {
  presentation: Presentation;
  orientation: Orientation;
  workflow: Workflow;
  layers: Layers;
  focus: { mode: FocusMode; anchorId: string | null };
  dockCollapsed: boolean;
  dockHidden: boolean;
  dockScreenPosition: { x: number; y: number } | null;
  indexMode: IndexMode;
  viewAssessorId: string | null;
  /** Owner request 2026-11-10: the person whose created, edited and commented nodes the tree highlights. */
  highlightUserId: string | null;
  /** Owner request 2026-11-10: the reading view shows every card's whole text and lays the tree out by card size. */
  readingMode: boolean;
  /** Owner request 2026-11-10: edges and reasons look as heavy as the weight they actually carry. */
  weightByRatings: boolean;
  readingWidth: number;
  readingLines: number;
  highlightOptions: boolean;
  showImportance: boolean;
  showSharedReasons: boolean;
  showRecurringInTree: boolean;
  compactVisible: boolean;
  depthLimit: number | null;
  depthCompact: boolean;
}
export type Zones = Record<Zone, boolean>;

/** Reading view card widths and title line limits (per browser, owner request 2026-11-10). */
export const READING_WIDTHS = [252, 320, 400] as const as readonly number[];
export const READING_LINES = [4, 6, 10, 16] as const as readonly number[];

/** The prototype's `loadView` defaults: a narrow window (≤ 600 px) starts in the table presentation. */
export function defaultView(windowWidth = 1440): ViewState {
  return {
    presentation: windowWidth <= 600 ? 'table' : 'tree',
    orientation: 'horizontal',
    workflow: 'explore',
    layers: { ...LAYER_PRESETS.text },
    focus: { mode: 'all', anchorId: null },
    dockCollapsed: true,
    dockHidden: true,
    dockScreenPosition: null,
    indexMode: 'shared',
    viewAssessorId: null,
    highlightUserId: null,
    readingMode: false,
    weightByRatings: true,
    readingWidth: 320,
    readingLines: 10,
    highlightOptions: false,
    showImportance: false,
    showSharedReasons: true,
    showRecurringInTree: true,
    compactVisible: false,
    depthLimit: null,
    depthCompact: true,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Reads `witt-view-v1` with the prototype's per-field validation; anything unreadable falls back field by field. */
export function readView(store: KeyValueStore, windowWidth = 1440): ViewState {
  const base = defaultView(windowWidth);
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(readPreference(store, VIEW_KEY) ?? 'null');
    if (isRecord(parsed)) saved = parsed;
  } catch {
    // optional UI preferences
  }
  const layers = { ...base.layers };
  const savedLayers = isRecord(saved.layers) ? saved.layers : {};
  for (const key of LAYER_NAMES) if (typeof savedLayers[key] === 'boolean') layers[key] = savedLayers[key];
  if (savedLayers.confidence === true || savedLayers.impact === true) layers.assessments = true;
  const focus = isRecord(saved.focus) ? saved.focus : {};
  const pos = isRecord(saved.dockScreenPosition) ? saved.dockScreenPosition : null;
  const depth = saved.depthLimit;
  return {
    presentation:
      saved.presentation === 'table' ? 'table' : saved.presentation === 'tree' ? 'tree' : base.presentation,
    orientation: ORIENTATIONS.includes(saved.orientation as Orientation)
      ? (saved.orientation as Orientation)
      : 'horizontal',
    workflow: saved.workflow === 'evaluate' ? 'evaluate' : 'explore',
    layers,
    focus: {
      mode: (['all', 'support', 'oppose'] as FocusMode[]).includes(focus.mode as FocusMode)
        ? (focus.mode as FocusMode)
        : 'all',
      anchorId: typeof focus.anchorId === 'string' ? focus.anchorId : null,
    },
    dockCollapsed: typeof saved.dockCollapsed === 'boolean' ? saved.dockCollapsed : true,
    dockHidden: saved.dockHidden === undefined ? true : saved.dockHidden === true,
    dockScreenPosition:
      pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)
        ? { x: pos.x as number, y: pos.y as number }
        : null,
    indexMode: saved.indexMode === 'personal' ? 'personal' : 'shared',
    viewAssessorId: typeof saved.viewAssessorId === 'string' ? saved.viewAssessorId : null,
    highlightUserId: typeof saved.highlightUserId === 'string' ? saved.highlightUserId : null,
    readingMode: saved.readingMode === true,
    weightByRatings: saved.weightByRatings !== false,
    readingWidth: READING_WIDTHS.includes(saved.readingWidth as number)
      ? (saved.readingWidth as number)
      : 320,
    readingLines: READING_LINES.includes(saved.readingLines as number) ? (saved.readingLines as number) : 10,
    highlightOptions: !!saved.highlightOptions,
    showImportance: !!saved.showImportance,
    showSharedReasons: saved.showSharedReasons !== false,
    showRecurringInTree: saved.showRecurringInTree !== false,
    compactVisible: !!saved.compactVisible,
    depthLimit: Number.isInteger(depth) && (depth as number) >= 0 ? (depth as number) : null,
    depthCompact: saved.depthCompact !== false,
  };
}
export function writeView(store: KeyValueStore, view: ViewState): void {
  writePreference(store, VIEW_KEY, JSON.stringify(view));
}

/** `witt-zones-v1`: the four panel toggles; the left panel starts hidden on narrow windows (≤ 1000 px). */
export function readZones(store: KeyValueStore, windowWidth = 1440): Zones {
  const mobile = windowWidth <= 1000;
  const fallback: Zones = { left: !mobile, top: true, right: true, bottom: false };
  try {
    const parsed: unknown = JSON.parse(readPreference(store, ZONES_KEY) ?? 'null');
    if (isRecord(parsed))
      return Object.fromEntries(
        ZONES.map((k) => [k, typeof parsed[k] === 'boolean' ? parsed[k] : fallback[k]])
      ) as Zones;
  } catch {
    // optional
  }
  return fallback;
}
export function writeZones(store: KeyValueStore, zones: Zones): void {
  writePreference(store, ZONES_KEY, JSON.stringify(zones));
}

/** The export keeps the prototype's nine-layer shape; the removed credence and impact layers are always off there. */
export const exportLayers = (l: Layers): ExportLayers => ({ ...l, confidence: false, impact: false });

/** Which preset the current layers equal, or `custom`. */
export function currentPreset(layers: Layers): LayerPreset | 'custom' {
  return (
    (Object.keys(LAYER_PRESETS) as LayerPreset[]).find((name) =>
      LAYER_NAMES.every((key) => LAYER_PRESETS[name][key] === layers[key])
    ) ?? 'custom'
  );
}

/** The prototype's card height for a layer set (view-layout spacing depends on it). */
export function cardHeight(l: Layers): number {
  const density = (['index', 'assessments', 'comments', 'counts', 'links'] as const).filter(
    (key) => l[key]
  ).length;
  if (!l.labels && !l.details && density === 0) return 94;
  if (density <= 2 && !l.assessments && !l.comments) return 154;
  return 176;
}

/** Per-project keys the prototype keeps beside the view. */
export const assessorKey = (projectId: string) => `witt-assessor-v1:${projectId}`;
export const reviewViewKey = (projectId: string) => `witt-review-view-v1:${projectId}`;
export const assessmentPassKey = (projectId: string, actorId: string) =>
  `witt-assessment-pass-v2:${projectId}:${actorId}`;
export const WORKSPACE_META_KEY = 'witt-workspace-meta-v1';
export const KEYBINDINGS_KEY = 'witt-keybindings-v1';
