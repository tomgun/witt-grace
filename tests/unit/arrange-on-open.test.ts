/**
 * must: `arranged` returns the same document with every card at its place in the tidy tree (a parent at the mean
 *       of its children, levels 340 apart, leaves 182 apart) and changes nothing else; `cardsOverlap` is true only
 *       when two cards lie within 200 × 100 of each other; a new view draws the tree from the top down and a
 *       stored direction still wins (S-15, owner 2026-11-19)
 * test: tests/unit/arrange-on-open.test.ts
 * red-against: the input mutated, a title or a rating touched by arranging, a staircase of places read as
 *              overlapping (so a hand-made arrangement would be thrown away), the default left at left to right,
 *              a stored "horizontal" overridden by the new default
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { arranged, cardsOverlap, createBlankProject, newNode } from '../../src/domain/index.ts';
import { defaultView, readView } from '../../src/app/view.ts';
import { memoryStore } from '../../src/lib/storage.ts';

function sample(places: Record<string, [number, number]>) {
  const base = createBlankProject({
    projectId: 'p',
    rootId: 'root',
    userId: 'u',
    now: '2026-11-19T10:00:00.000Z',
  });
  const node = (id: string, parentId: string) =>
    newNode({ id, parentId, relation: 'support', title: id, createdBy: 'u' });
  const nodes = [base.nodes[0]!, node('a', 'root'), node('b', 'root'), node('a1', 'a')];
  return {
    ...base,
    nodes: nodes.map((n) => ({ ...n, position: { x: places[n.id]![0], y: places[n.id]![1] } })),
  };
}

test('arranged: the tidy tree, nothing but positions changed, the input untouched', () => {
  const piled = sample({ root: [0, 0], a: [0, 0], b: [0, 0], a1: [0, 0] });
  const tidy = arranged(piled);
  assert.deepEqual(Object.fromEntries(tidy.nodes.map((n) => [n.id, n.position])), {
    root: { x: 64, y: 181 },
    a: { x: 404, y: 90 },
    b: { x: 404, y: 272 },
    a1: { x: 744, y: 90 },
  });
  assert.deepEqual(
    tidy.nodes.map((n) => ({ ...n, position: null })),
    piled.nodes.map((n) => ({ ...n, position: null }))
  );
  assert.deepEqual(piled.nodes[1]!.position, { x: 0, y: 0 });
  assert.equal(tidy.updatedAt, piled.updatedAt);
});

test('cardsOverlap: a pile is, a staircase and a tidy tree are not; the limits are 200 and 100', () => {
  assert.equal(cardsOverlap(sample({ root: [0, 0], a: [0, 0], b: [0, 0], a1: [0, 0] })), true);
  assert.equal(
    cardsOverlap(sample({ root: [60, 100], a: [340, 216], a1: [620, 332], b: [340, 448] })),
    false
  );
  assert.equal(cardsOverlap(sample({ root: [0, 0], a: [199, 99], b: [900, 0], a1: [900, 400] })), true);
  assert.equal(cardsOverlap(sample({ root: [0, 0], a: [200, 99], b: [900, 0], a1: [900, 400] })), false);
  assert.equal(cardsOverlap(sample({ root: [0, 0], a: [199, 100], b: [900, 0], a1: [900, 400] })), false);
});

test('a new view is top-down; a stored direction wins; an unknown one falls back to top-down', () => {
  assert.equal(defaultView().orientation, 'vertical');
  const stored = memoryStore();
  stored.setItem('witt-view-v1', JSON.stringify({ orientation: 'horizontal' }));
  assert.equal(readView(stored).orientation, 'horizontal');
  const odd = memoryStore();
  odd.setItem('witt-view-v1', JSON.stringify({ orientation: 'sideways' }));
  assert.equal(readView(odd).orientation, 'vertical');
});
