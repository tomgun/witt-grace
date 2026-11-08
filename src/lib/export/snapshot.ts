// The export snapshot: which nodes and edges the visual export draws, where, with which texts and emphasis. A port
// of the prototype's `buildVisualSnapshot`, with the app state it read from closures taken as explicit inputs:
// the view's layers, the current tree projection, the shown scores and the app's label/chip formatting. Pure.
import {
  CARD_W,
  compactVisibleProjection,
  edgeGeometry,
  fourWayProjection,
  fourWayVisualDirections,
  marginalIndexEffects,
  marginalTargetEffects,
  rootNode,
  secondaryLinkPath,
  viewPosition,
} from '../../domain/index.ts';
import type { Direction, Node, Orientation, Position, Project, Scores, Stance } from '../../domain/index.ts';
import type { ExportPalette, ExportSnapshot, SnapshotEdge, SnapshotNode } from './svg.ts';
import type { PdfLayout } from './pdf.ts';
import type { PngMode, PngScale } from './png.ts';

export type ExportFormat = 'png' | 'svg' | 'pdf';
export const EXPORT_FORMATS: ExportFormat[] = ['png', 'svg', 'pdf'];
export type ExportScope = 'visible' | 'all';
export const EXPORT_SCOPES: ExportScope[] = ['visible', 'all'];
export type ExportDetail = 'current' | 'text' | 'analysis' | 'all';
export const EXPORT_DETAILS: ExportDetail[] = ['current', 'text', 'analysis', 'all'];

/** The nine view layers, in the view's shape (src/app/view.ts `Layers`), without importing the app. */
export interface ExportLayers {
  labels: boolean;
  details: boolean;
  index: boolean;
  assessments: boolean;
  confidence: boolean;
  impact: boolean;
  comments: boolean;
  counts: boolean;
  links: boolean;
}
export const RATING_LAYERS = [
  'index',
  'assessments',
  'confidence',
  'impact',
  'comments',
  'counts',
  'links',
] as const;

/** The visual-export dialog's choices. */
export interface VisualExportOptions {
  format: ExportFormat;
  scope: ExportScope;
  detail: ExportDetail;
  palette: ExportPalette;
  /** "Korosta painavimmat". */
  highlights: boolean;
  /** "Lisäyhteydet (katkoviivat)". */
  links: boolean;
  /** "Näytä toistuvat perustelut myös puussa". */
  shared: boolean;
  /** "Tiivistä näkyvät solmut kuvassa". */
  compact: boolean;
  resolution: PngScale;
  pngMode: PngMode;
  pdfLayout: PdfLayout;
}

/** The export's layers: the view's own for `current`, else the preset the detail names. */
export function resolveExportLayers(
  detail: ExportDetail,
  viewLayers: ExportLayers,
  presets: Record<'text' | 'analysis' | 'all', ExportLayers>
): ExportLayers {
  return detail === 'current' ? { ...viewLayers } : { ...presets[detail] };
}
/** Card height the export lays the tree out with: 176 with details or any rating layer, else 148. */
export const exportLayoutHeight = (layers: ExportLayers): number =>
  layers.details || RATING_LAYERS.some((key) => layers[key]) ? 176 : 148;

/** The per-target top 20 % of marginal effects by magnitude (ties by child id): the "painavimmat" children. */
export function highlightedChildren(project: Project, evaluated: Scores): Set<string> {
  const highlighted = new Set<string>();
  const targetEffects = marginalTargetEffects(project, evaluated, marginalIndexEffects(project, evaluated));
  const byTarget = new Map<string, { childId: string; targetId: string; magnitude: number }[]>();
  for (const effect of targetEffects.values()) {
    if (effect.magnitude <= 1e-9) continue;
    const bucket = byTarget.get(effect.targetId) ?? [];
    bucket.push(effect);
    byTarget.set(effect.targetId, bucket);
  }
  for (const arr of byTarget.values()) {
    arr.sort((a, b) => b.magnitude - a.magnitude || a.childId.localeCompare(b.childId));
    for (const effect of arr.slice(0, Math.ceil(arr.length * 0.2))) highlighted.add(effect.childId);
  }
  return highlighted;
}

export interface SnapshotInput {
  project: Project;
  options: Pick<VisualExportOptions, 'scope' | 'palette' | 'highlights' | 'links' | 'shared' | 'compact'>;
  /** Already resolved for the chosen detail (`resolveExportLayers`). */
  layers: ExportLayers;
  /** The current tree projection: its nodes (focus, depth and collapse applied) and the focus sets. */
  projection: { nodes: Node[]; matchIds: Set<string>; anchorId: string | null; contextIds: Set<string> };
  /** `view.focus.mode !== 'all'`: nodes outside the focus are dimmed in a visible-scope export. */
  focusActive: boolean;
  orientation: Orientation;
  fourWayOffsets: Record<string, Position>;
  /** Personal index mode: edges take the assessor's own signed influence. */
  personal: boolean;
  /** A review lens filters the shared view: highlights are off then (the shared scores are partial). */
  lensFiltered: boolean;
  /** The shown scores (personal or shared) for the highlight computation. */
  evaluated: Scores;
  /** Leading options of the shown assessor, highlighted with the heaviest children. */
  leadingOptionIds: Set<string>;
  /** The app's displayed stance for a node. */
  relation: (node: Node) => Stance;
  /** The app's localised type label (used only when `layers.labels`). */
  typeLabel: (node: Node) => string;
  /** The app's footer chips for a node under these layers, in order. */
  chips: (node: Node, layers: ExportLayers) => string[];
  /** The app's shown influence for a child (personal mode); null when unreviewed. */
  shownInfluence: (node: Node) => number | null;
  title: string;
  subtitle: string;
}

/** Build the snapshot the SVG renderer draws. Throws 'No nodes in the selected export' when nothing remains. */
export function buildVisualSnapshot(input: SnapshotInput): ExportSnapshot {
  const { project, options, layers, projection, orientation } = input;
  const includeShared = options.shared;
  const includeLinks = options.links;
  const isWhole = options.scope === 'all';
  const all = isWhole ? project.nodes : projection.nodes;
  const byNodeId = new Map(project.nodes.map((n) => [n.id, n]));
  const recurringHidden = new Map<string, boolean>();
  const hiddenUnderRecurring = (node: Node): boolean => {
    const known = recurringHidden.get(node.id);
    if (known !== undefined) return known;
    if (node.sharedReasonId || node.reasonConceptId) {
      recurringHidden.set(node.id, true);
      return true;
    }
    const parent = node.parentId ? byNodeId.get(node.parentId) : undefined;
    const result = !!parent && hiddenUnderRecurring(parent);
    recurringHidden.set(node.id, result);
    return result;
  };
  // A full-tree export must not leave children orphaned when their recurring parent is hidden.
  const nodes = all.filter((n) => includeShared || !hiddenUnderRecurring(n));
  const visible = new Set(nodes.map((n) => n.id));
  if (!nodes.length) throw new Error('No nodes in the selected export');
  const exportH = exportLayoutHeight(layers);
  const coords = new Map<string, Position>();
  let directions: Map<string, Direction> | undefined;
  if (!isWhole && options.compact) {
    const compact = compactVisibleProjection(project.nodes, visible, orientation, CARD_W, exportH);
    for (const [id, pos] of compact.positions) coords.set(id, pos);
    directions = compact.groups;
  } else if (orientation === 'four-way') {
    const root = rootNode(project)?.id;
    if (!root) throw new Error('No nodes in the selected export');
    const fourWay = fourWayProjection(project.nodes, root, CARD_W, exportH);
    for (const [id, pos] of fourWay.positions) {
      const o = input.fourWayOffsets[id] || { x: 0, y: 0 };
      coords.set(id, { x: pos.x + (Number(o.x) || 0), y: pos.y + (Number(o.y) || 0) });
    }
    directions = fourWayVisualDirections(project.nodes, root, coords);
  } else {
    for (const n of project.nodes) coords.set(n.id, viewPosition(n.position, orientation));
  }
  const personal = input.personal;
  const highlight = options.highlights && !(input.lensFiltered && !personal);
  const highlighted = highlight ? highlightedChildren(project, input.evaluated) : new Set<string>();
  const dimNode = (n: Node) =>
    !isWhole &&
    input.focusActive &&
    !projection.matchIds.has(n.id) &&
    n.id !== projection.anchorId &&
    !projection.contextIds.has(n.id);
  const data: SnapshotNode[] = nodes.map((n) => {
    const pos = coords.get(n.id) || { x: 0, y: 0 };
    return {
      id: n.id,
      x: pos.x,
      y: pos.y,
      title: n.title,
      details: n.details,
      relation: input.relation(n),
      shared: !!n.sharedReasonId,
      typeLabel: layers.labels ? input.typeLabel(n) : '',
      chips: input.chips(n, layers),
      important: highlighted.has(n.id) || (highlight && input.leadingOptionIds.has(n.id)),
      dim: dimNode(n),
    };
  });
  const edges: SnapshotEdge[] = [];
  for (const n of nodes) {
    if (!n.parentId || !visible.has(n.parentId)) continue;
    const parent = project.nodes.find((item) => item.id === n.parentId);
    if (!parent) continue;
    const direction = personal ? input.shownInfluence(n) : undefined;
    edges.push({
      d: edgeGeometry(parent, n, orientation, CARD_W, exportH, coords, directions),
      relation: input.relation(n),
      important: highlighted.has(n.id),
      personalDirection: direction,
      unassessed: personal && direction === null && n.relation !== 'option',
      dim: !isWhole && input.focusActive && !projection.matchIds.has(n.id),
    });
  }
  if (includeLinks) {
    for (const link of project.links || []) {
      if (!visible.has(link.sourceId) || !visible.has(link.targetId)) continue;
      const source = coords.get(link.sourceId);
      const target = coords.get(link.targetId);
      if (source && target)
        edges.push({
          d: secondaryLinkPath(source, target, CARD_W, exportH),
          relation: link.relation,
          secondary: true,
          dim: !isWhole && input.focusActive,
        });
    }
  }
  return {
    nodes: data,
    edges,
    layers: { details: layers.details, ratings: RATING_LAYERS.some((key) => layers[key]) },
    highlight,
    palette: options.palette,
    title: input.title,
    subtitle: input.subtitle,
  };
}
