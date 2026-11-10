// Display projections of the tree, ported line for line from the prototype's `src/view-layout.js` (UI_INVENTORY S-07,
// inv-canvas §5). Horizontal/vertical positions are reversible transforms of the document's positions; four-way and
// compact positions are derived from the tree and never written back. Pure: no DOM, no clock, no random.
import type { Position, Size } from './model.ts';

export interface LayoutNode {
  id: string;
  parentId: string | null;
  position: Position;
}
export type Orientation = 'horizontal' | 'vertical' | 'four-way';
export const ORIENTATIONS: Orientation[] = ['horizontal', 'vertical', 'four-way'];
export type Cardinal = 'right' | 'left' | 'down' | 'up';
export type Direction = Cardinal | 'root';
export const CARD_W = 252;

const BASE_X = 64;
const BASE_Y = 90;
const HORIZONTAL_DEPTH = 340;
const HORIZONTAL_LEAF = 182;
const VERTICAL_DEPTH = 242;
const VERTICAL_LEAF = 310;
const CARDINALS: Cardinal[] = ['right', 'left', 'down', 'up'];

export function viewPosition(position: Position, orientation: Orientation = 'horizontal'): Position {
  if (orientation !== 'vertical') return { x: position.x, y: position.y };
  return {
    x: BASE_X + ((position.y - BASE_Y) * VERTICAL_LEAF) / HORIZONTAL_LEAF,
    y: BASE_Y + ((position.x - BASE_X) * VERTICAL_DEPTH) / HORIZONTAL_DEPTH,
  };
}
export function documentPosition(position: Position, orientation: Orientation = 'horizontal'): Position {
  if (orientation !== 'vertical') return { x: position.x, y: position.y };
  return {
    x: BASE_X + ((position.y - BASE_Y) * HORIZONTAL_DEPTH) / VERTICAL_DEPTH,
    y: BASE_Y + ((position.x - BASE_X) * HORIZONTAL_LEAF) / VERTICAL_LEAF,
  };
}

export interface Projection {
  positions: Map<string, Position>;
  groups: Map<string, Direction>;
}
export interface FourWayProjection extends Projection {
  buckets: Record<Cardinal, { roots: { node: LayoutNode; index: number; weight: number }[]; weight: number }>;
}

function childrenMap(nodes: LayoutNode[]): Map<string, LayoutNode[]> {
  const children = new Map<string, LayoutNode[]>(nodes.map((n) => [n.id, []]));
  for (const node of nodes)
    if (node.parentId !== null && children.has(node.parentId)) children.get(node.parentId)!.push(node);
  return children;
}

export function fourWayProjection(
  nodes: LayoutNode[],
  rootId: string,
  cardWidth = 252,
  cardHeight = 154
): FourWayProjection {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rootNode = byId.get(rootId);
  if (!rootNode) throw new Error('Four-way layout needs a root node');
  const children = childrenMap(nodes);
  const leafCounts = new Map<string, number>();
  function leaves(node: LayoutNode, visiting = new Set<string>()): number {
    const known = leafCounts.get(node.id);
    if (known !== undefined) return known;
    if (visiting.has(node.id)) throw new Error('Cycle detected in argument tree');
    visiting.add(node.id);
    const kids = children.get(node.id) ?? [];
    const count = kids.length ? kids.reduce((sum, child) => sum + leaves(child, visiting), 0) : 1;
    visiting.delete(node.id);
    leafCounts.set(node.id, count);
    return count;
  }
  leaves(rootNode);
  const buckets: FourWayProjection['buckets'] = {
    right: { roots: [], weight: 0 },
    left: { roots: [], weight: 0 },
    down: { roots: [], weight: 0 },
    up: { roots: [], weight: 0 },
  };
  const first = [...(children.get(rootId) ?? [])];
  const indexed = first.map((node, index) => ({ node, index, weight: leaves(node) }));
  indexed.sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const entry of indexed) {
    const direction = [...CARDINALS].sort(
      (a, b) => buckets[a].weight - buckets[b].weight || CARDINALS.indexOf(a) - CARDINALS.indexOf(b)
    )[0]!;
    buckets[direction].roots.push(entry);
    buckets[direction].weight += entry.weight;
  }
  for (const direction of CARDINALS) buckets[direction].roots.sort((a, b) => a.index - b.index);
  const center = { x: 4000 + cardWidth / 2, y: 4000 + cardHeight / 2 };
  const positions = new Map<string, Position>([[rootId, { x: 4000, y: 4000 }]]);
  const groups = new Map<string, Direction>([[rootId, 'root']]);
  const depthStepX = cardWidth + 132;
  const depthStepY = cardHeight + 152;
  const leafStepX = cardWidth + 82;
  const leafStepY = cardHeight + 94;
  for (const direction of CARDINALS) {
    const group = buckets[direction];
    if (!group.roots.length) continue;
    const totalSlots = group.weight;
    let slot = 0;
    const radial = direction === 'right' || direction === 'left';
    const place = (node: LayoutNode, depth: number): number => {
      const kids = children.get(node.id) ?? [];
      let lane: number;
      if (!kids.length) lane = slot++;
      else {
        const lanes = kids.map((child) => place(child, depth + 1));
        lane = (lanes[0]! + lanes[lanes.length - 1]!) / 2;
      }
      const across = (lane - (totalSlots - 1) / 2) * (radial ? leafStepY : leafStepX);
      const x = radial
        ? center.x + (direction === 'right' ? 1 : -1) * depth * depthStepX - cardWidth / 2
        : center.x + across - cardWidth / 2;
      const y = radial
        ? center.y + across - cardHeight / 2
        : center.y + (direction === 'down' ? 1 : -1) * depth * depthStepY - cardHeight / 2;
      positions.set(node.id, { x, y });
      groups.set(node.id, direction);
      return lane;
    };
    for (const entry of group.roots) place(entry.node, 1);
  }
  // A large tree can spread across adjacent cardinal sectors. Push whole sectors outward until rectangles no longer
  // collide; ancestry is preserved.
  const rectsOverlap = (a: Position, b: Position, padding = 12) =>
    a.x < b.x + cardWidth + padding &&
    a.x + cardWidth + padding > b.x &&
    a.y < b.y + cardHeight + padding &&
    a.y + cardHeight + padding > b.y;
  const directionsPresent = CARDINALS.filter((d) => buckets[d].roots.length);
  for (let k = 1; k < directionsPresent.length; k++) {
    const dir = directionsPresent[k]!;
    const ids = [...groups].filter(([, d]) => d === dir).map(([id]) => id);
    const other = [...groups]
      .filter(([, d]) => d !== dir && (d === 'root' || directionsPresent.indexOf(d as Cardinal) < k))
      .map(([id]) => id);
    for (let attempts = 0; attempts < 80; attempts++) {
      const collision = ids.some((id) =>
        other.some((otherId) => rectsOverlap(positions.get(id)!, positions.get(otherId)!))
      );
      if (!collision) break;
      const dx = dir === 'right' ? 130 : dir === 'left' ? -130 : 0;
      const dy = dir === 'down' ? 110 : dir === 'up' ? -110 : 0;
      for (const id of ids) {
        const p = positions.get(id)!;
        positions.set(id, { x: p.x + dx, y: p.y + dy });
      }
    }
  }
  return { positions, groups, buckets };
}

/** SVG path of a primary edge between a parent and a child card. */
export function edgeGeometry(
  parent: LayoutNode,
  child: LayoutNode,
  orientation: Orientation,
  cardWidth: number,
  cardHeight: number,
  positions?: Map<string, Position>,
  groups?: Map<string, Direction>,
  /** Owner request 2026-11-10: cards of their own size (dragged, or in the reading view). */
  sizes?: { from: Size; to: Size }
): string {
  const from = positions?.get(parent.id) ?? viewPosition(parent.position, orientation);
  const to = positions?.get(child.id) ?? viewPosition(child.position, orientation);
  const fw = sizes?.from.w ?? cardWidth;
  const fh = sizes?.from.h ?? cardHeight;
  const tw = sizes?.to.w ?? cardWidth;
  const th = sizes?.to.h ?? cardHeight;
  let direction: string = orientation;
  if (orientation === 'four-way') {
    const dx = to.x + tw / 2 - (from.x + fw / 2);
    const dy = to.y + th / 2 - (from.y + fh / 2);
    // All edges within one branch follow its cardinal direction; a visual offset must not flip the anchors.
    direction =
      groups?.get(child.id) ??
      (Math.abs(dx) > Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'down' : 'up');
  }
  if (direction === 'vertical' || direction === 'down') {
    const sx = from.x + fw / 2;
    const sy = from.y + fh - 1;
    const ex = to.x + tw / 2;
    const ey = to.y + 1;
    const bend = Math.max(34, Math.abs(ey - sy) * 0.46);
    return `M ${sx} ${sy} C ${sx} ${sy + bend}, ${ex} ${ey - bend}, ${ex} ${ey}`;
  }
  if (direction === 'up') {
    const sx = from.x + fw / 2;
    const sy = from.y + 1;
    const ex = to.x + tw / 2;
    const ey = to.y + th - 1;
    const bend = Math.max(34, Math.abs(sy - ey) * 0.46);
    return `M ${sx} ${sy} C ${sx} ${sy - bend}, ${ex} ${ey + bend}, ${ex} ${ey}`;
  }
  if (direction === 'left') {
    const sx = from.x + 1;
    const sy = from.y + fh / 2;
    const ex = to.x + tw - 1;
    const ey = to.y + th / 2;
    const bend = Math.max(50, Math.abs(sx - ex) * 0.46);
    return `M ${sx} ${sy} C ${sx - bend} ${sy}, ${ex + bend} ${ey}, ${ex} ${ey}`;
  }
  const sx = from.x + fw - 1;
  const sy = from.y + fh / 2;
  const ex = to.x + 1;
  const ey = to.y + th / 2;
  const bend = Math.max(50, Math.abs(ex - sx) * 0.46);
  return `M ${sx} ${sy} C ${sx + bend} ${sy}, ${ex - bend} ${ey}, ${ex} ${ey}`;
}

/** Directed, dashed cross-connection between two already laid-out claims; ports chosen by relative position. */
export function secondaryLinkPath(
  from: Position,
  to: Position,
  width = 252,
  height = 154,
  sizes?: { from: Size; to: Size }
): string {
  const fw = sizes?.from.w ?? width;
  const fh = sizes?.from.h ?? height;
  const tw = sizes?.to.w ?? width;
  const th = sizes?.to.h ?? height;
  const dx = to.x + tw / 2 - (from.x + fw / 2);
  const dy = to.y + th / 2 - (from.y + fh / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    const direction = dx >= 0 ? 1 : -1;
    const sx = from.x + (direction > 0 ? fw : 0);
    const ex = to.x + (direction > 0 ? 0 : tw);
    const sy = from.y + fh / 2;
    const ey = to.y + th / 2;
    const bend = Math.max(44, Math.abs(ex - sx) * 0.35);
    // A relation that skips a claim on a nearly straight row arches below the row instead of crossing the card.
    const detour = Math.abs(dx) > width * 1.8 && Math.abs(dy) < height * 0.6;
    const arc = detour ? height * 2.35 : 0;
    return `M ${sx} ${sy} C ${sx + direction * bend} ${sy + arc}, ${ex - direction * bend} ${ey + arc}, ${ex} ${ey}`;
  }
  const direction = dy >= 0 ? 1 : -1;
  const sx = from.x + fw / 2;
  const ex = to.x + tw / 2;
  const sy = from.y + (direction > 0 ? fh : 0);
  const ey = to.y + (direction > 0 ? 0 : th);
  const bend = Math.max(35, Math.abs(ey - sy) * 0.35);
  const detour = Math.abs(dy) > height * 2.2 && Math.abs(dx) < width * 0.65;
  const arc = detour ? width * 1.6 : 0;
  return `M ${sx} ${sy} C ${sx + arc} ${sy + direction * bend}, ${ex + arc} ${ey - direction * bend}, ${ex} ${ey}`;
}

/** Branch directions derived from the actual visible positions, so dragged offsets never flip edge anchors. */
export function fourWayVisualDirections(
  nodes: LayoutNode[],
  rootId: string,
  positions: Map<string, Position>
): Map<string, Direction> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const result = new Map<string, Direction>([[rootId, 'root']]);
  const directionFor = (id: string): Direction => {
    const known = result.get(id);
    if (known) return known;
    const node = byId.get(id);
    if (!node || node.parentId === null) return 'root';
    if (node.parentId !== rootId) {
      const dir = directionFor(node.parentId);
      result.set(id, dir);
      return dir;
    }
    const from = positions.get(rootId);
    const to = positions.get(id);
    if (!from || !to) return 'right';
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dir: Cardinal =
      Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'down' : 'up';
    result.set(id, dir);
    return dir;
  };
  for (const n of nodes) directionFor(n.id);
  return result;
}

/** Adds one node to a four-way layout without moving any existing card; returns concrete positions for all. */
export function stableFourWayAddition(
  nodes: LayoutNode[],
  oldPositions: Map<string, Position>,
  oldDirections: Map<string, Direction>,
  newBaseline: Map<string, Position>,
  parentId: string,
  newId: string,
  width = 252,
  height = 154
): Map<string, Position> {
  const stable = new Map([...oldPositions].map(([id, pos]) => [id, { x: pos.x, y: pos.y }]));
  const parent = stable.get(parentId);
  if (!parent) throw new Error('Stable layout requires an existing parent');
  const root = nodes.find((n) => n.parentId === null);
  if (!root) throw new Error('Stable layout requires a root');
  let dir = oldDirections.get(parentId);
  if (parentId === root.id || !dir || !(CARDINALS as string[]).includes(dir)) {
    const counts = new Map<Cardinal, number>(CARDINALS.map((x) => [x, 0]));
    for (const node of nodes)
      if (node.parentId === root.id && node.id !== newId) {
        const d = oldDirections.get(node.id) as Cardinal | undefined;
        if (d && counts.has(d)) counts.set(d, counts.get(d)! + 1);
      }
    dir = [...CARDINALS].sort(
      (a, b) => counts.get(a)! - counts.get(b)! || CARDINALS.indexOf(a) - CARDINALS.indexOf(b)
    )[0]!;
  }
  const spacingX = width + 132;
  const spacingY = height + 138;
  const isHorizontal = dir === 'right' || dir === 'left';
  const initial = {
    x: parent.x + (dir === 'right' ? spacingX : dir === 'left' ? -spacingX : 0),
    y: parent.y + (dir === 'down' ? spacingY : dir === 'up' ? -spacingY : 0),
  };
  const overlaps = (p: Position) =>
    [...stable.values()].some(
      (q) =>
        p.x < q.x + width + 22 && p.x + width + 22 > q.x && p.y < q.y + height + 22 && p.y + height + 22 > q.y
    );
  const stride = isHorizontal ? height + 56 : width + 50;
  let choice: Position | null = null;
  for (let offset = 0; offset < 250; offset++) {
    const step = offset === 0 ? 0 : (offset % 2 ? 1 : -1) * Math.ceil(offset / 2);
    const position = {
      x: initial.x + (isHorizontal ? 0 : step * stride),
      y: initial.y + (isHorizontal ? step * stride : 0),
    };
    if (!overlaps(position)) {
      choice = position;
      break;
    }
  }
  // Defensive fallback: still never move old cards, even on dense maps.
  stable.set(newId, choice ?? { x: initial.x, y: initial.y + 30000 });
  if (stable.size !== newBaseline.size) throw new Error('Stable layout expected one new node');
  return stable;
}

/** Tidy layout of only the visible projection; never touches saved positions. */
export function compactVisibleProjection(
  allNodes: LayoutNode[],
  visibleIds: Iterable<string>,
  orientation: Orientation = 'horizontal',
  width = 252,
  height = 154
): Projection {
  const visible = new Set(visibleIds);
  const nodes = allNodes.filter((n) => visible.has(n.id));
  const root = nodes.find((n) => n.parentId === null);
  if (!root) throw Error('Compact layout requires a visible root');
  if (orientation === 'four-way') return fourWayProjection(nodes, root.id, width, height);
  const children = childrenMap(nodes);
  const positions = new Map<string, Position>();
  let slot = 0;
  const sideways = orientation !== 'vertical';
  const depthStep = sideways ? width + 88 : height + 96;
  const leafStep = sideways ? height + 42 : width + 46;
  const walk = (node: LayoutNode, depth: number): number => {
    const kids = children.get(node.id) ?? [];
    let lane: number;
    if (kids.length) {
      const lanes = kids.map((kid) => walk(kid, depth + 1));
      lane = (lanes[0]! + lanes[lanes.length - 1]!) / 2;
    } else lane = slot++;
    positions.set(
      node.id,
      sideways
        ? { x: 64 + depth * depthStep, y: 90 + lane * leafStep }
        : { x: 64 + lane * leafStep, y: 90 + depth * depthStep }
    );
    return lane;
  };
  walk(root, 0);
  return { positions, groups: new Map() };
}

export interface DepthProjection<N extends LayoutNode> {
  nodes: N[];
  visibleIds: Set<string>;
  depths: Map<string, number>;
  maxDepth: number;
  collapsedIds: Set<string>;
}
/** View-only narrative depth: depth 0 shows only the root; an override opens (false) or closes (true) one subtree. */
export function depthProjection<N extends LayoutNode>(
  allNodes: N[],
  limit: number,
  overrides: Map<string, boolean> = new Map()
): DepthProjection<N> {
  const children = new Map<string, N[]>(allNodes.map((node) => [node.id, []]));
  const root = allNodes.find((node) => node.parentId === null);
  if (!root) throw Error('Depth view requires a root');
  for (const node of allNodes)
    if (node.parentId !== null && children.has(node.parentId)) children.get(node.parentId)!.push(node);
  const depths = new Map<string, number>();
  const visibleIds = new Set<string>();
  const visited = new Set<string>();
  function traverse(node: N, depth: number, visible: boolean, forceOpen: boolean) {
    if (visited.has(node.id)) throw Error('Cycle or duplicate tree node in depth projection');
    visited.add(node.id);
    depths.set(node.id, depth);
    if (visible) visibleIds.add(node.id);
    const override = overrides.get(node.id);
    const expand = visible && override !== true && (override === false || forceOpen || depth < limit);
    for (const child of children.get(node.id) ?? [])
      traverse(child, depth + 1, expand, override === false || (forceOpen && override !== true));
  }
  traverse(root, 0, true, false);
  return {
    nodes: allNodes.filter((node) => visibleIds.has(node.id)),
    visibleIds,
    depths,
    maxDepth: Math.max(...depths.values()),
    collapsedIds: new Set(
      allNodes
        .filter(
          (node) =>
            visibleIds.has(node.id) &&
            (children.get(node.id) ?? []).some((child) => !visibleIds.has(child.id))
        )
        .map((node) => node.id)
    ),
  };
}
export function maxTreeDepth(nodes: LayoutNode[]): number {
  if (!nodes.length) return 0;
  return depthProjection(nodes, Number.MAX_SAFE_INTEGER).maxDepth;
}
