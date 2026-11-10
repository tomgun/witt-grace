/**
 * must: `node.resize` keeps a card's own size within 180–640 × 80–600, survives a save and reload, is dropped with
 *       the node and by `size: null`; the reading view wraps text by words (a long word breaks), grows a card with
 *       its title up to the line limit, and lays the visible tree out so no two cards overlap and parents sit
 *       centred on their children (owner request 2026-11-10)
 * test: tests/unit/cards.test.ts
 * red-against: a size outside the limits accepted, overlapping cards in the reading view, a clipped title estimate
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, createBlankProject, parseProject } from '../../src/domain/index.ts';
import type { Command, Project } from '../../src/domain/index.ts';
import { readingCard, readingLayout, wrappedLines } from '../../src/app/reading.ts';
import { LAYER_PRESETS } from '../../src/app/view.ts';

const ctx = { now: '2026-11-10T10:00:00.000Z', actorId: 'u1' };
const run = (p: Project, ...commands: Command[]) => commands.reduce((acc, c) => applyCommand(acc, c, ctx), p);
const blank = () => createBlankProject({ projectId: 'p', rootId: 'T', userId: 'u1', now: ctx.now });

test('a card keeps its own size within the limits, in the file too, until restored or removed', () => {
  let p = run(blank(), { type: 'node.add', id: 'A', parentId: 'T', relation: 'support' });
  p = run(p, { type: 'node.resize', id: 'A', size: { w: 360.4, h: 220 } });
  assert.deepEqual(p.layout.nodeSizes, { A: { w: 360, h: 220 } });
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(p))).layout.nodeSizes, { A: { w: 360, h: 220 } });
  assert.throws(() => applyCommand(p, { type: 'node.resize', id: 'A', size: { w: 100, h: 220 } }, ctx));
  assert.throws(() => applyCommand(p, { type: 'node.resize', id: 'A', size: { w: 300, h: 900 } }, ctx));
  assert.equal(run(p, { type: 'node.resize', id: 'A', size: null }).layout.nodeSizes, undefined);
  assert.equal(run(p, { type: 'node.remove', id: 'A' }).layout.nodeSizes, undefined);
});

test('text wraps by words and a long word breaks', () => {
  assert.equal(wrappedLines('lyhyt', 100, 10), 1);
  assert.equal(wrappedLines('aaaa bbbb cccc', 90, 10), 2);
  assert.equal(wrappedLines('x'.repeat(25), 100, 10), 3);
  assert.equal(wrappedLines('eka\ntoka', 300, 10), 2);
});

test('the reading view grows a card with its title up to the line limit', () => {
  const layers = { ...LAYER_PRESETS.text };
  const node = run(blank(), {
    type: 'node.add',
    id: 'A',
    parentId: 'T',
    relation: 'support',
    title: 'sana '.repeat(40).trim(),
  }).nodes[1]!;
  const short = readingCard({ ...node, title: 'Lyhyt' }, 320, 10, layers, false);
  const long = readingCard(node, 320, 10, layers, false);
  const capped = readingCard(node, 320, 4, layers, false);
  assert.equal(short.titleLines, 1);
  assert.ok(long.titleLines > 4);
  assert.equal(capped.titleLines, 4);
  assert.ok(long.h > capped.h && capped.h > short.h);
});

test('the reading layout never overlaps cards and centres parents on their children', () => {
  let p = blank();
  for (const [id, parent] of [
    ['A', 'T'],
    ['B', 'T'],
    ['A1', 'A'],
    ['A2', 'A'],
    ['A3', 'A'],
    ['B1', 'B'],
  ] as const)
    p = run(p, { type: 'node.add', id, parentId: parent, relation: 'support' });
  const heights: Record<string, number> = { T: 60, A: 200, B: 80, A1: 120, A2: 60, A3: 240, B1: 90 };
  const sizeOf = (id: string) => ({ w: 320, h: heights[id] ?? 60 });
  for (const orientation of ['horizontal', 'vertical'] as const) {
    const positions = readingLayout(p.nodes, new Set(p.nodes.map((n) => n.id)), 'T', orientation, sizeOf);
    const boxes = p.nodes.map((n) => ({ id: n.id, ...positions.get(n.id)!, ...sizeOf(n.id) }));
    for (const a of boxes)
      for (const b of boxes)
        if (a.id < b.id)
          assert.ok(
            a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y,
            `${orientation}: ${a.id} overlaps ${b.id}`
          );
    if (orientation === 'horizontal') {
      const a = positions.get('A')!;
      const first = positions.get('A1')!;
      const last = positions.get('A3')!;
      const centre = (first.y + last.y + heights.A3!) / 2;
      assert.ok(Math.abs(a.y + heights.A! / 2 - centre) < 1e-6);
    }
  }
});
