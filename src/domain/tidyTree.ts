// A tidy tree of the visible nodes by each card's own size (not from the prototype; the reading view of 2026-11-10,
// and the left-aligned tree of 2026-11-25). Each subtree takes the room its cards need, so nothing overlaps. A parent
// is centred over its children, or with `align: 'start'` stands at the start of them (in a top-down tree above its
// first child, at the left edge of its subtree; owner 2026-11-25: the tree an AI draft opens in “oli itse asiassa
// kätevä”). Pure: positions are derived from the tree and never written back.
import type { Position, Size } from './model.ts';

export interface TidyNode {
  id: string;
  parentId: string | null;
}
export interface TidyOptions {
  /** Depth grows downwards (true) or to the right (false). */
  vertical: boolean;
  align: 'centre' | 'start';
  /** The room between siblings, and between one depth and the next. */
  gapAcross: number;
  gapAlong: number;
}

/** The left-aligned tree at the ordinary card size: the top-down tree's spacing (owner 2026-11-25). */
export const LEFT_ALIGNED_TREE: TidyOptions = { vertical: true, align: 'start', gapAcross: 58, gapAlong: 66 };

export function tidyTree(
  nodes: readonly TidyNode[],
  visibleIds: ReadonlySet<string>,
  rootId: string,
  options: TidyOptions,
  sizeOf: (id: string) => Size
): Map<string, Position> {
  const { vertical, align, gapAcross, gapAlong } = options;
  const children = new Map<string, TidyNode[]>();
  for (const n of nodes)
    if (n.parentId && visibleIds.has(n.id)) {
      if (!children.has(n.parentId)) children.set(n.parentId, []);
      children.get(n.parentId)?.push(n);
    }
  // Across = the axis siblings stack on; along = the axis depth grows on.
  const across = (id: string) => (vertical ? sizeOf(id).w : sizeOf(id).h);
  const along = (id: string) => (vertical ? sizeOf(id).h : sizeOf(id).w);
  const depthExtent: number[] = [];
  const spans = new Map<string, number>();
  const seen = new Set<string>();
  const kidsOf = (id: string) => (children.get(id) ?? []).filter((k) => !seen.has(k.id));
  const measure = (id: string, depth: number): number => {
    seen.add(id);
    depthExtent[depth] = Math.max(depthExtent[depth] ?? 0, along(id));
    const kids = kidsOf(id);
    const block = kids.reduce((sum, k) => sum + measure(k.id, depth + 1), 0) + gapAcross * (kids.length - 1);
    const span = Math.max(across(id), kids.length ? block : 0);
    spans.set(id, span);
    return span;
  };
  measure(rootId, 0);
  const depthStart: number[] = [];
  depthExtent.reduce((start, extent, depth) => {
    depthStart[depth] = start;
    return start + extent + gapAlong;
  }, 0);
  const positions = new Map<string, Position>();
  const place = (id: string, start: number, depth: number) => {
    const span = spans.get(id) ?? across(id);
    const kids = (children.get(id) ?? []).filter((k) => spans.has(k.id) && !positions.has(k.id));
    const block = kids.reduce((sum, k) => sum + (spans.get(k.id) ?? 0), 0) + gapAcross * (kids.length - 1);
    let cursor = align === 'start' ? start : start + (span - block) / 2;
    for (const kid of kids) {
      place(kid.id, cursor, depth + 1);
      cursor += (spans.get(kid.id) ?? 0) + gapAcross;
    }
    const a = align === 'start' ? start : start + span / 2 - across(id) / 2;
    const b = depthStart[depth] ?? 0;
    positions.set(id, vertical ? { x: a, y: b } : { x: b, y: a });
  };
  place(rootId, 0, 0);
  return positions;
}
