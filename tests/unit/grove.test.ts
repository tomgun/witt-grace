/**
 * must: the Lehto (grove) theme's decorations are derived from stable ids alone: the id hash is FNV-1a 32, about one
 *       branch in five carries an animal, at most `max` of them, an id's pick does not depend on the other ids, a
 *       tree above 150 cards is calm, the crown is the same every time; a stored `grove` skin is kept and an unknown
 *       one falls back to the document's base theme; the export dialog treats grove as a light skin since the theme was
 *       redrawn in daylight (S-15, owner request 2026-11-12, redrawn 2026-11-19)
 * test: tests/unit/grove.test.ts
 * red-against: Math.random in the pick (a tree changing on every render), an off-by-one at 150, an animal picked per
 *              position instead of per id, `grove` missing from the stored skins so it reloads as the light theme
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createStore } from '../../src/app/store.ts';
import { crownBlobs, foliageBlobs, groveCalm, hashId, pickCreatures } from '../../src/app/grove.ts';
import { memoryStore } from '../../src/lib/storage.ts';
import { DARK_APPEARANCES } from '../../src/lib/export/diagram.ts';

test('hashId is FNV-1a 32 (published values for "" and "a")', () => {
  assert.equal(hashId(''), 2166136261);
  assert.equal(hashId('a'), 3826002220);
});

test('pickCreatures picks by id: literal picks, a cap, empty and zero boundaries', () => {
  const ids = Array.from({ length: 20 }, (_, i) => `n${i + 1}`);
  assert.deepEqual(pickCreatures(ids), [
    { id: 'n3', kind: 'snail', dur: 23, delay: -7 },
    { id: 'n6', kind: 'snail', dur: 16, delay: -13 },
    { id: 'n12', kind: 'butterfly', dur: 18, delay: -5 },
    { id: 'n17', kind: 'butterfly', dur: 23, delay: -11 },
  ]);
  assert.deepEqual(
    pickCreatures(ids, 2).map((c) => c.id),
    ['n3', 'n6']
  );
  assert.deepEqual(pickCreatures(ids, 0), []);
  assert.deepEqual(pickCreatures([]), []);
  const many = Array.from({ length: 400 }, (_, i) => `card-${i}`);
  assert.equal(pickCreatures(many).length, 10);
});

test('an id keeps its animal when the other ids change or come in another order', () => {
  const ids = Array.from({ length: 20 }, (_, i) => `n${i + 1}`);
  const shuffled = [...ids].reverse();
  assert.deepEqual(pickCreatures(shuffled), pickCreatures(ids));
  const picked = pickCreatures(ids).find((c) => c.id === 'n12');
  assert.deepEqual(
    pickCreatures(['x1', 'n12', 'x2', 'x3']).find((c) => c.id === 'n12'),
    picked
  );
});

test('groveCalm turns on above 150 visible cards', () => {
  assert.equal(groveCalm(0), false);
  assert.equal(groveCalm(150), false);
  assert.equal(groveCalm(151), true);
});

test('the crown is deterministic: 34 clusters, the first two at literal places', () => {
  const blobs = crownBlobs(100, 200, 300);
  assert.equal(blobs.length, 34);
  assert.deepEqual(blobs.slice(0, 2), [
    { x: -478, y: 174, r: 112, tone: 2 },
    { x: -483, y: 148, r: 175, tone: 1 },
  ]);
  assert.deepEqual(crownBlobs(100, 200, 300), blobs);
});

test('a stored grove skin is kept per browser; an unknown value falls back to the document theme', () => {
  const kept = memoryStore();
  kept.setItem('witt-appearance-v1', 'grove');
  assert.equal(createStore({ store: kept, persistent: false }).get().appearance, 'grove');
  const unknown = memoryStore();
  unknown.setItem('witt-appearance-v1', 'no-such-skin');
  const state = createStore({ store: unknown, persistent: false }).get();
  assert.equal(state.appearance, state.project.theme);
  assert.notEqual(state.appearance, 'grove');
});

test('the export dialog treats grove as a light skin since it was redrawn in daylight (2026-11-19)', () => {
  assert.ok(!DARK_APPEARANCES.includes('grove'));
  assert.ok(DARK_APPEARANCES.includes('terminal'));
  assert.ok(!DARK_APPEARANCES.includes('paper'));
});

test('foliage: none behind the main claim, three clusters per card below it, smaller and fainter with depth', () => {
  const card = (id: string, depth: number) => ({ id, x: 0, y: 0, w: 240, h: 100, depth });
  assert.deepEqual(foliageBlobs([card('root', 0)]), []);
  const one = foliageBlobs([card('a', 1)]);
  const three = foliageBlobs([card('a', 3)]);
  const deep = foliageBlobs([card('a', 9)]);
  assert.equal(one.length, 3);
  assert.deepEqual(
    one.map((b) => b.r),
    [184, 194, 224]
  );
  assert.deepEqual(
    three.map((b) => b.r),
    [118, 124, 144]
  );
  assert.deepEqual([one[0]!.strength, three[0]!.strength, deep[0]!.strength], [0.95, 0.55, 0.4]);
  // The two upper clusters stand above the card's middle (y 50), left and right of its centre (x 120).
  assert.ok(one[0]!.x < 120 && one[1]!.x > 120);
  assert.ok(one[0]!.y < 50 && one[1]!.y < 50);
  assert.deepEqual(foliageBlobs([card('a', 1)]), one);
});
