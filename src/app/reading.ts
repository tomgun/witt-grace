// The reading view (owner request 2026-11-10): every card shows its whole text, up to a line limit, and the visible
// tree is laid out by each card's own height so nothing overlaps. Heights are estimated from the text, so layout and
// rendering agree without measuring the DOM.
import type { Node, Position, Size } from '../domain/index.ts';
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

/** A tidy tree of the visible nodes: each subtree takes the room its cards need, parents centred on their children. */
export function readingLayout(
  nodes: Node[],
  visibleIds: Set<string>,
  rootId: string,
  orientation: Orientation,
  sizeOf: (id: string) => Size
): Map<string, Position> {
  const children = new Map<string, Node[]>();
  for (const n of nodes)
    if (n.parentId && visibleIds.has(n.id)) {
      if (!children.has(n.parentId)) children.set(n.parentId, []);
      children.get(n.parentId)?.push(n);
    }
  const vertical = orientation === 'vertical';
  // Across = the axis siblings stack on; along = the axis depth grows on.
  const across = (id: string) => (vertical ? sizeOf(id).w : sizeOf(id).h);
  const along = (id: string) => (vertical ? sizeOf(id).h : sizeOf(id).w);
  const depthExtent: number[] = [];
  const spans = new Map<string, number>();
  const measure = (id: string, depth: number): number => {
    depthExtent[depth] = Math.max(depthExtent[depth] ?? 0, along(id));
    const kids = children.get(id) ?? [];
    const block = kids.reduce((sum, k) => sum + measure(k.id, depth + 1), 0) + GAP_ACROSS * (kids.length - 1);
    const span = Math.max(across(id), kids.length ? block : 0);
    spans.set(id, span);
    return span;
  };
  measure(rootId, 0);
  const depthStart: number[] = [];
  depthExtent.reduce((start, extent, depth) => {
    depthStart[depth] = start;
    return start + extent + (vertical ? GAP_ALONG / 2 : GAP_ALONG);
  }, 0);
  const positions = new Map<string, Position>();
  const place = (id: string, start: number, depth: number) => {
    const span = spans.get(id) ?? across(id);
    const kids = children.get(id) ?? [];
    const block = kids.reduce((sum, k) => sum + (spans.get(k.id) ?? 0), 0) + GAP_ACROSS * (kids.length - 1);
    let cursor = start + (span - block) / 2;
    for (const kid of kids) {
      place(kid.id, cursor, depth + 1);
      cursor += (spans.get(kid.id) ?? 0) + GAP_ACROSS;
    }
    const a = start + span / 2 - across(id) / 2;
    const b = depthStart[depth] ?? 0;
    positions.set(id, vertical ? { x: a, y: b } : { x: b, y: a });
  };
  place(rootId, 0, 0);
  return positions;
}
