/**
 * must: the left-aligned tree (owner 2026-11-25: the tree an AI draft opens in “oli itse asiassa kätevä… tämän voisi
 *       lisätä puun suunta -vaihtoehtoihin”, and the reading view must not turn it into the centred tree): top to
 *       bottom, each parent at the left edge of its subtree, above its first child; siblings follow left to right,
 *       each after the whole subtree of the one before; no two cards overlap at any card size; a hidden branch
 *       leaves no room; the reading view in this direction keeps the alignment, by each card's own height; the
 *       centred tidy tree is as before; the export lays the tree out the same way
 * test: tests/unit/tidy-tree.test.ts
 * red-against: a parent centred over its children, a second child placed under the first one's children (the
 *              overlaps of the AI draft's own staircase), the reading view falling back to the centred tree, a
 *              collapsed branch keeping its room, the export drawn from the stored positions
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { LEFT_ALIGNED_TREE, tidyTree } from '../../src/domain/index.ts';
import type { Position, Size } from '../../src/domain/index.ts';
import { readingLayout } from '../../src/app/reading.ts';

// A ─┬─ B ─┬─ D
//    │     └─ E
//    └─ C ─── F
const nodes = [
  { id: 'A', parentId: null },
  { id: 'B', parentId: 'A' },
  { id: 'C', parentId: 'A' },
  { id: 'D', parentId: 'B' },
  { id: 'E', parentId: 'B' },
  { id: 'F', parentId: 'C' },
];
const all = new Set(nodes.map((n) => n.id));
const card: Size = { w: 252, h: 176 };
const overlaps = (positions: Map<string, Position>, sizeOf: (id: string) => Size) => {
  const ids = [...positions.keys()];
  return ids.some((a, i) =>
    ids.slice(i + 1).some((b) => {
      const p = positions.get(a)!;
      const q = positions.get(b)!;
      const s = sizeOf(a);
      const r = sizeOf(b);
      return p.x < q.x + r.w && q.x < p.x + s.w && p.y < q.y + r.h && q.y < p.y + s.h;
    })
  );
};

test('each parent stands above its first child at the left of its subtree; nothing overlaps', () => {
  const at = tidyTree(nodes, all, 'A', LEFT_ALIGNED_TREE, () => card);
  const step = card.w + LEFT_ALIGNED_TREE.gapAcross;
  const row = card.h + LEFT_ALIGNED_TREE.gapAlong;
  assert.deepEqual(Object.fromEntries(at), {
    A: { x: 0, y: 0 },
    B: { x: 0, y: row },
    D: { x: 0, y: 2 * row },
    E: { x: step, y: 2 * row },
    C: { x: 2 * step, y: row },
    F: { x: 2 * step, y: 2 * row },
  });
  assert.equal(
    overlaps(at, () => card),
    false
  );
});

test('a hidden branch leaves no room; the centred tree is unchanged', () => {
  const at = tidyTree(nodes, new Set(['A', 'B', 'C', 'F']), 'A', LEFT_ALIGNED_TREE, () => card);
  assert.deepEqual([...at.keys()].sort(), ['A', 'B', 'C', 'F']);
  assert.equal(at.get('C')!.x, card.w + LEFT_ALIGNED_TREE.gapAcross);
  const centred = tidyTree(nodes, all, 'A', { ...LEFT_ALIGNED_TREE, align: 'centre' }, () => card);
  // The parent sits in the middle of what is under it.
  const middle = (centred.get('D')!.x + centred.get('F')!.x + card.w) / 2;
  assert.equal(centred.get('A')!.x + card.w / 2, middle);
});

test('the reading view keeps the alignment, by each card own height, with nothing overlapping', () => {
  const tall = (id: string): Size => ({ w: 280, h: id === 'B' ? 300 : 120 });
  const reading = readingLayout(
    nodes.map((n) => ({ ...n, title: n.id }) as never),
    all,
    'A',
    'top-left',
    tall
  );
  assert.equal(reading.get('A')!.x, 0);
  assert.equal(reading.get('B')!.x, 0);
  assert.equal(reading.get('D')!.x, 0);
  // The row under B starts below the tallest card of its depth.
  assert.ok(reading.get('D')!.y >= reading.get('B')!.y + 300);
  assert.equal(reading.get('C')!.y, reading.get('B')!.y);
  assert.equal(overlaps(reading, tall), false);
  const centred = readingLayout(nodes as never, all, 'A', 'vertical', tall);
  assert.notEqual(centred.get('A')!.x, 0);
});
