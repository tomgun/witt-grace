// The reading view (owner request 2026-11-10): every card shows its whole text, up to a line limit, and the visible
// tree is laid out by each card's own height so nothing overlaps. Heights are estimated from the text, so layout and
// rendering agree without measuring the DOM.
import { fourWayProjection, tidyTree } from '../domain/index.ts';
import type { Direction, Node, Position, Size } from '../domain/index.ts';
import type { Layers, Orientation } from './view.ts';

const TITLE_LINE = 19;
const DETAIL_LINE = 17;
/** Average glyph widths of the card fonts (13 px bold title, 12 px details), a little generous. */
const TITLE_CHAR = 7.5;
const DETAIL_CHAR = 6.8;
const GAP_ACROSS = 24;
const GAP_ALONG = 110;

/** Lines a text needs at a given width when wrapped at spaces; a word longer than a line breaks. */
export function wrappedLines(text: string, width: number, charWidth: number): number {
  const perLine = Math.max(8, Math.floor(width / charWidth));
  let lines = 0;
  for (const paragraph of text.split('\n')) {
    let used = 0;
    let count = 1;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const length = word.length;
      if (used === 0) {
        count += Math.floor((length - 1) / perLine);
        used = ((length - 1) % perLine) + 1;
      } else if (used + 1 + length <= perLine) used += 1 + length;
      else {
        count += 1 + Math.floor((length - 1) / perLine);
        used = ((length - 1) % perLine) + 1;
      }
    }
    lines += count;
  }
  return Math.max(1, lines);
}

/** The card's height in the reading view and how many title lines it shows. */
export function readingCard(
  node: Node,
  width: number,
  maxLines: number,
  layers: Layers,
  hasMarks: boolean
): { h: number; titleLines: number } {
  const inner = width - 24;
  const titleLines = Math.min(maxLines, wrappedLines(node.title, inner, TITLE_CHAR));
  let h = 31 + (hasMarks ? 15 : 0) + 4 + titleLines * TITLE_LINE + 8;
  if (layers.details && node.details)
    h += 8 + Math.min(maxLines, wrappedLines(node.details, inner, DETAIL_CHAR)) * DETAIL_LINE;
  const chips = (['index', 'assessments', 'comments', 'counts', 'links'] as const).some((key) => layers[key]);
  h += chips ? 40 : 6;
  return { h: Math.ceil(h), titleLines };
}

/** A tidy tree of the visible nodes by the cards' real sizes: parents centred on their children, or in the
 * left-aligned tree (`top-left`) above their first child. */
export function readingLayout(
  nodes: Node[],
  visibleIds: Set<string>,
  rootId: string,
  orientation: Orientation,
  sizeOf: (id: string) => Size
): Map<string, Position> {
  const vertical = orientation === 'vertical' || orientation === 'top-left';
  return tidyTree(
    nodes,
    visibleIds,
    rootId,
    {
      vertical,
      align: orientation === 'top-left' ? 'start' : 'centre',
      gapAcross: GAP_ACROSS,
      gapAlong: vertical ? GAP_ALONG / 2 : GAP_ALONG,
    },
    sizeOf
  );
}

/**
 * The reading view in four directions (owner 2026-11-19: "voisi hyvin toimia"): the main claim's reasons are dealt to
 * right, left, down and up exactly as the ordinary four-way layout deals them, and each direction is laid out as a
 * tidy tree of its own by the cards' real sizes, mirrored for left and up. A sideways sector that would run into
 * the one above or below is moved outward until it does not.
 */
export function readingFourWay(
  nodes: Node[],
  visibleIds: Set<string>,
  rootId: string,
  sizeOf: (id: string) => Size
): { positions: Map<string, Position>; groups: Map<string, Direction> } {
  const visible = nodes.filter((n) => visibleIds.has(n.id));
  const groups = fourWayProjection(visible, rootId).groups;
  const root = sizeOf(rootId);
  const positions = new Map<string, Position>([[rootId, { x: 0, y: 0 }]]);
  const sectors = new Map<Direction, string[]>();
  for (const direction of ['right', 'left', 'down', 'up'] as const) {
    const ids = visible.filter((n) => groups.get(n.id) === direction).map((n) => n.id);
    if (!ids.length) continue;
    sectors.set(direction, ids);
    const sideways = direction === 'right' || direction === 'left';
    const laid = readingLayout(
      nodes,
      new Set([rootId, ...ids]),
      rootId,
      sideways ? 'horizontal' : 'vertical',
      sizeOf
    );
    const origin = laid.get(rootId) ?? { x: 0, y: 0 };
    for (const id of ids) {
      const at = laid.get(id);
      if (!at) continue;
      const size = sizeOf(id);
      const x = at.x - origin.x;
      const y = at.y - origin.y;
      positions.set(id, {
        x: direction === 'left' ? root.w - x - size.w : x,
        y: direction === 'up' ? root.h - y - size.h : y,
      });
    }
  }
  const box = (ids: string[]) => {
    const rects = ids.map((id) => ({ ...positions.get(id)!, ...sizeOf(id) }));
    return {
      left: Math.min(...rects.map((r) => r.x)),
      right: Math.max(...rects.map((r) => r.x + r.w)),
      top: Math.min(...rects.map((r) => r.y)),
      bottom: Math.max(...rects.map((r) => r.y + r.h)),
    };
  };
  for (const side of ['right', 'left'] as const) {
    const ids = sectors.get(side);
    if (!ids) continue;
    for (const pole of ['down', 'up'] as const) {
      const other = sectors.get(pole);
      if (!other) continue;
      const a = box(ids);
      const b = box(other);
      const overlapY = a.top < b.bottom + GAP_ACROSS && a.bottom + GAP_ACROSS > b.top;
      const overlapX = a.left < b.right + GAP_ACROSS && a.right + GAP_ACROSS > b.left;
      if (!overlapX || !overlapY) continue;
      const push = side === 'right' ? b.right + GAP_ALONG - a.left : b.left - GAP_ALONG - a.right;
      for (const id of ids) {
        const at = positions.get(id)!;
        positions.set(id, { x: at.x + push, y: at.y });
      }
    }
  }
  return { positions, groups };
}
