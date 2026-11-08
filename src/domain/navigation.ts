// Tree keyboard navigation, ported from the prototype's `src/keyboard-nav.js` (inv-canvas §9.1). Follows the logical
// tree for horizontal and vertical layouts and the visible geometry for four-way. Pure: callers apply the action.
import type { Position } from './model.ts';
import type { Orientation } from './layout.ts';

export interface NavNode {
  id: string;
  parentId: string | null;
  collapsed?: boolean;
}
export const NAV_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', ' ', 'Spacebar'];
export type NavAction = { action: 'none' } | { action: 'select' | 'expand' | 'collapse'; id: string };

/** Pre-order visible ids from the root, children in array order. */
export function visibleOrder(nodes: NavNode[], rootId: string, visibleIds: Set<string>): string[] {
  const byParent = new Map<string | null, NavNode[]>();
  for (const node of nodes) {
    if (!byParent.has(node.parentId)) byParent.set(node.parentId, []);
    byParent.get(node.parentId)!.push(node);
  }
  const output: string[] = [];
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id) || !visibleIds.has(id)) return;
    visited.add(id);
    output.push(id);
    for (const child of byParent.get(id) ?? []) visit(child.id);
  };
  visit(rootId);
  return output;
}

export function spatialNeighbor(
  order: string[],
  selectedId: string,
  key: string,
  positions?: Map<string, Position>
): string | null {
  if (!positions || !positions.has(selectedId)) return null;
  const from = positions.get(selectedId)!;
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const sign = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
  let bestId: string | null = null;
  let bestScore = Infinity;
  for (const candidateId of order) {
    if (candidateId === selectedId || !positions.has(candidateId)) continue;
    const candidate = positions.get(candidateId)!;
    const forward = sign * (horizontal ? candidate.x - from.x : candidate.y - from.y);
    if (forward <= 1) continue;
    const perpendicular = Math.abs(horizontal ? candidate.y - from.y : candidate.x - from.x);
    // A card in the chosen direction beats a nearby but strongly diagonal one; ties go to visible order.
    const score = forward + (1.4 * perpendicular * perpendicular) / (forward + 80);
    if (score < bestScore) {
      bestScore = score;
      bestId = candidateId;
    }
  }
  return bestId;
}

export function navigate(
  nodes: NavNode[],
  rootId: string,
  visibleIds: Set<string>,
  selectedId: string,
  key: string,
  orientation: Orientation = 'horizontal',
  positions?: Map<string, Position>
): NavAction {
  if (!NAV_KEYS.includes(key)) return { action: 'none' };
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const order = visibleOrder(nodes, rootId, visibleIds);
  if (!order.length) return { action: 'none' };
  const id = visibleIds.has(selectedId) ? selectedId : order[0]!;
  const node = byId.get(id);
  if (!node) return { action: 'select', id: order[0]! };
  if (key === 'Home') return { action: 'select', id: order[0]! };
  if (key === 'End') return { action: 'select', id: order[order.length - 1]! };
  const children = nodes.filter((n) => n.parentId === id);
  if (key === ' ' || key === 'Spacebar')
    return children.length ? { action: node.collapsed ? 'expand' : 'collapse', id } : { action: 'none' };
  if (orientation === 'four-way') {
    const target = spatialNeighbor(order, id, key, positions);
    return target ? { action: 'select', id: target } : { action: 'none' };
  }
  const vertical = orientation === 'vertical';
  const intoChildren = vertical ? 'ArrowDown' : 'ArrowRight';
  const towardParent = vertical ? 'ArrowUp' : 'ArrowLeft';
  const beforeSibling = vertical ? 'ArrowLeft' : 'ArrowUp';
  const afterSibling = vertical ? 'ArrowRight' : 'ArrowDown';
  if (key === intoChildren) {
    if (children.length && node.collapsed) return { action: 'expand', id };
    const first = children.find((child) => visibleIds.has(child.id));
    return first ? { action: 'select', id: first.id } : { action: 'none' };
  }
  if (key === towardParent) {
    if (children.length && !node.collapsed) return { action: 'collapse', id };
    return node.parentId && visibleIds.has(node.parentId)
      ? { action: 'select', id: node.parentId }
      : { action: 'none' };
  }
  if (key === beforeSibling || key === afterSibling) {
    const siblings = nodes.filter((other) => other.parentId === node.parentId && visibleIds.has(other.id));
    const index = siblings.findIndex((other) => other.id === id);
    const next = index + (key === afterSibling ? 1 : -1);
    return index !== -1 && next >= 0 && next < siblings.length
      ? { action: 'select', id: siblings[next]!.id }
      : { action: 'none' };
  }
  return { action: 'none' };
}
