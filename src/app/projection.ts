// The prototype's render() pipeline (inv-canvas §0.3, §5.1): which nodes are visible, where they are drawn, and the
// derived scores, lens and importance for the current view. Memoised per document/view/session change.
import { useMemo } from 'react';
import {
  CARD_W,
  compactVisibleProjection,
  depthProjection,
  evaluate,
  evaluateAssessor,
  focusProjection,
  fourWayProjection,
  fourWayVisualDirections,
  maxTreeDepth,
  projectLens,
  assessorSummary,
  respectExplicitCollapse,
  rootNode,
  viewPosition,
} from '../domain/index.ts';
import type { Direction, FocusProjection, Lens, Node, Position, Project, Scores } from '../domain/index.ts';
import { recalculateImportance, viewedAssessorId } from './derive.ts';
import type { DeriveContext, Importance } from './derive.ts';
import { cardHeight } from './view.ts';
import type { ViewState } from './view.ts';
import type { AppState } from './store.ts';

export interface Frame extends DeriveContext {
  projection: FocusProjection;
  positions: Map<string, Position>;
  directions: Map<string, Direction>;
  cardH: number;
  maxDepth: number;
  importance: Importance;
  /** Options an assessor's perspective ranks first, when highlighting is on (inv-canvas §1.10). */
  leadingOptionIds: Set<string>;
  /** The actor's own personal scores (the inspector compares them with the shared result). */
  actorScores: Scores;
  rootId: string;
  /** View position of a node: the projected one, else the document position in the current orientation. */
  visualPosition: (node: Node) => Position;
  /** A node counts as collapsed when its flag is set, or, under a depth limit, when a child is hidden. */
  isNodeCollapsed: (node: Node) => boolean;
}

export function buildFrame(
  project: Project,
  view: ViewState,
  session: Pick<
    AppState,
    'actorId' | 'selectedId' | 'depthOverrides' | 'explicitlyClosedIds' | 'tableRevealId' | 'reviewIds'
  >
): Frame {
  const root = rootNode(project) as Node;
  const anchor = project.nodes.some((n) => n.id === view.focus.anchorId) ? view.focus.anchorId : root.id;
  let projection = focusProjection(project, anchor, view.focus.mode);
  if (session.tableRevealId && view.presentation === 'tree') {
    const visibleIds = new Set(projection.visibleIds);
    const contextIds = new Set(projection.contextIds);
    const byId = new Map(project.nodes.map((n) => [n.id, n]));
    for (
      let node = byId.get(session.tableRevealId);
      node;
      node = node.parentId ? byId.get(node.parentId) : undefined
    ) {
      visibleIds.add(node.id);
      contextIds.add(node.id);
    }
    projection = {
      ...projection,
      visibleIds,
      contextIds,
      nodes: project.nodes.filter((n) => visibleIds.has(n.id)),
      peekIds: new Set([...visibleIds].filter((id) => !projection.visibleIds.has(id))),
    };
  }
  const maxDepth = maxTreeDepth(project.nodes);
  if (view.depthLimit !== null) {
    const depth = depthProjection(
      project.nodes,
      Math.min(view.depthLimit, maxDepth),
      new Map(session.depthOverrides)
    );
    projection = {
      ...projection,
      nodes: depth.nodes,
      visibleIds: depth.visibleIds,
      matchIds: new Set([...projection.matchIds].filter((id) => depth.visibleIds.has(id))),
      contextIds: new Set([...projection.contextIds].filter((id) => depth.visibleIds.has(id))),
      peekIds: new Set(),
    };
  } else projection = respectExplicitCollapse(project, projection, session.explicitlyClosedIds);
  if (!view.showRecurringInTree) {
    const hidden = new Set<string>();
    const byParent = new Map<string | null, Node[]>();
    for (const n of project.nodes) {
      if (!byParent.has(n.parentId)) byParent.set(n.parentId, []);
      byParent.get(n.parentId)!.push(n);
    }
    const hide = (id: string) => {
      hidden.add(id);
      for (const child of byParent.get(id) ?? []) hide(child.id);
    };
    for (const n of project.nodes) if (n.sharedReasonId || n.reasonConceptId) hide(n.id);
    if (hidden.size) {
      const visibleIds = new Set([...projection.visibleIds].filter((id) => !hidden.has(id)));
      projection = { ...projection, visibleIds, nodes: projection.nodes.filter((n) => visibleIds.has(n.id)) };
    }
  }
  const scores = evaluate(project);
  const personalScores: Scores =
    view.indexMode === 'personal'
      ? evaluateAssessor(project, viewedAssessorId(project, view, session.actorId))
      : new Map();
  const lens: Lens = projectLens(project, session.reviewIds);
  const actorScores: Scores = evaluateAssessor(project, session.actorId);
  const ctx: DeriveContext = { project, view, actorId: session.actorId, scores, personalScores, lens };
  const importance = recalculateImportance(ctx);
  const leadingOptionIds =
    view.highlightOptions && project.mode === 'decision' && view.indexMode === 'personal'
      ? new Set(assessorSummary(project, viewedAssessorId(project, view, session.actorId)).leadingIds)
      : new Set<string>();
  const cardH = cardHeight(view.layers);
  let positions = new Map<string, Position>();
  let directions = new Map<string, Direction>();
  const compact = view.depthLimit !== null ? view.depthCompact : view.compactVisible;
  if (compact) {
    const result = compactVisibleProjection(
      project.nodes,
      projection.visibleIds,
      view.orientation,
      CARD_W,
      cardH
    );
    positions = result.positions;
    directions = result.groups;
  } else if (view.orientation === 'four-way') {
    const base = fourWayProjection(project.nodes, root.id, CARD_W, cardH);
    const offsets = project.layout.fourWayOffsets;
    for (const [id, pos] of base.positions) {
      const offset = offsets[id];
      positions.set(id, offset ? { x: pos.x + Number(offset.x), y: pos.y + Number(offset.y) } : pos);
    }
    directions = fourWayVisualDirections(project.nodes, root.id, positions);
  } else for (const n of project.nodes) positions.set(n.id, viewPosition(n.position, view.orientation));
  const visualPosition = (node: Node) =>
    positions.get(node.id) ?? viewPosition(node.position, view.orientation);
  const isNodeCollapsed = (node: Node) =>
    view.depthLimit === null
      ? !!node.collapsed
      : project.nodes.some((n) => n.parentId === node.id && !projection.visibleIds.has(n.id));
  return {
    ...ctx,
    projection,
    positions,
    directions,
    cardH,
    maxDepth,
    importance,
    leadingOptionIds,
    actorScores,
    rootId: root.id,
    visualPosition,
    isNodeCollapsed,
  };
}

export function useFrame(state: AppState): Frame {
  const {
    project,
    view,
    actorId,
    selectedId,
    depthOverrides,
    explicitlyClosedIds,
    tableRevealId,
    reviewIds,
  } = state;
  return useMemo(
    () =>
      buildFrame(project, view, {
        actorId,
        selectedId,
        depthOverrides,
        explicitlyClosedIds,
        tableRevealId,
        reviewIds,
      }),
    [project, view, actorId, selectedId, depthOverrides, explicitlyClosedIds, tableRevealId, reviewIds]
  );
}
