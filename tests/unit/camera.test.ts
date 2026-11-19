/**
 * must: an automatic fit never shrinks the tree below 75 % and, when the tree is then larger than the view, keeps
 *       the main claim in view; "Sovita näkymään" still shows the whole tree down to 30 %; a small tree is centred
 *       and never enlarged past 115 %; scrolling moves the view, Ctrl/⌘ + wheel (a trackpad pinch) zooms by the size
 *       of the movement with at most a quarter per event, Shift turns the wheel sideways; two fingers move and scale
 *       the view around their midpoint within 25–200 %; a card whose title editor opens is brought wholly into
 *       view by the smallest move, and a card already in view moves nothing (WG-038, owner 2026-11-19, UI_INVENTORY
 *       S-15)
 * test: tests/unit/camera.test.ts
 * red-against: the floor left at 0.3 for an opened document (13 cards at 43 %, unreadable), the oversized tree
 *              centred so the main claim is off screen, a wheel that always zooms 7 % per event whatever its size,
 *              an inverted pan sign, a pinch that zooms around the viewport corner, a missing clamp at 25 % or 200 %,
 *              a card added at the right edge left half outside the view, the view jumping for a visible card
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIT_LEGIBLE,
  FIT_WHOLE,
  fitCamera,
  pinchCamera,
  revealRect,
  wheelAction,
  zoomAt,
} from '../../src/app/camera.ts';

const VIEW = { w: 1000, h: 700 };
const round = (c: { x: number; y: number; scale: number }) => ({
  x: Math.round(c.x * 100) / 100,
  y: Math.round(c.y * 100) / 100,
  scale: Math.round(c.scale * 1000) / 1000,
});
const wheel = (over: Partial<Parameters<typeof wheelAction>[0]>) =>
  wheelAction({
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...over,
  });

test('a tree that fits is centred at the scale that fits, capped at 115 %', () => {
  const root = { x: 100, y: 200, w: 300, h: 100 };
  // 1800 × 600 → min(900/1800, 600/600) = 0.5 … above the whole-tree floor, below the legible one.
  assert.deepEqual(round(fitCamera({ x: 100, y: 200, w: 1800, h: 600 }, VIEW, FIT_WHOLE, root)), {
    scale: 0.5,
    x: 0,
    y: 100,
  });
  // One card: 900/300 = 3 → capped.
  assert.deepEqual(round(fitCamera(root, VIEW, FIT_LEGIBLE, root)), { scale: 1.15, x: 212.5, y: 62.5 });
});

test('an automatic fit stops at 75 % and keeps the main claim in view', () => {
  const bounds = { x: 0, y: 0, w: 3000, h: 2400 };
  // Horizontal layout: the main claim sits at the left edge, half way down.
  const root = { x: 0, y: 1150, w: 300, h: 100 };
  const camera = round(fitCamera(bounds, VIEW, FIT_LEGIBLE, root));
  assert.equal(camera.scale, 0.75);
  // Centred, the claim would be at x = −625 and y = 312.5: off screen to the left. It is moved to the margin.
  assert.equal(camera.x, 40);
  assert.equal(camera.y, -550);
  assert.equal(camera.y + root.y * camera.scale, 312.5);
  // Top-down layout: the claim at the top centre of a tall tree comes down from above the view to the margin.
  const top = round(fitCamera(bounds, VIEW, FIT_LEGIBLE, { x: 1350, y: 0, w: 300, h: 100 }));
  assert.deepEqual(top, { scale: 0.75, x: -625, y: 40 });
  // The whole-tree fit of the same tree shrinks instead: min(900/3000, 600/2400) = 0.25 → floor 0.3.
  assert.equal(fitCamera(bounds, VIEW, FIT_WHOLE, root).scale, 0.3);
});

test('a claim at the far edge is brought in from the right and from below', () => {
  const bounds = { x: 0, y: 0, w: 3000, h: 2400 };
  const camera = round(fitCamera(bounds, VIEW, FIT_LEGIBLE, { x: 2700, y: 2300, w: 300, h: 100 }));
  // Right edge of the claim at 1000 − 40, bottom edge at 700 − 40.
  assert.equal(camera.x + 3000 * 0.75, 960);
  assert.equal(camera.y + 2400 * 0.75, 660);
});

test('scrolling pans; Ctrl or ⌘ zooms by the size of the movement', () => {
  assert.deepEqual(wheel({ deltaX: 12, deltaY: 30 }), { kind: 'pan', dx: -12, dy: -30 });
  assert.deepEqual(wheel({ deltaY: 3, deltaMode: 1 }), { kind: 'pan', dx: -0, dy: -48 });
  assert.deepEqual(wheel({ deltaY: 40, shiftKey: true }), { kind: 'pan', dx: -40, dy: 0 });
  const small = wheel({ deltaY: -2, ctrlKey: true });
  const large = wheel({ deltaY: -10, ctrlKey: true });
  assert.equal(small.kind === 'zoom' && small.factor.toFixed(4), '1.0202');
  assert.equal(large.kind === 'zoom' && large.factor.toFixed(4), '1.1052');
  assert.deepEqual(wheel({ deltaY: 10, metaKey: true }), { kind: 'zoom', factor: Math.exp(-0.1) });
  // A mouse wheel notch (±100 px) is clamped to a quarter in, a fifth out.
  assert.deepEqual(wheel({ deltaY: -100, ctrlKey: true }), { kind: 'zoom', factor: 1.25 });
  assert.deepEqual(wheel({ deltaY: 100, ctrlKey: true }), { kind: 'zoom', factor: 0.8 });
});

test('zoomAt keeps the point under the pointer and clamps to 25–200 %', () => {
  const camera = { x: 100, y: 50, scale: 1 };
  assert.deepEqual(zoomAt(camera, 2, 300, 250), { scale: 2, x: -100, y: -150 });
  assert.equal(zoomAt(camera, 9, 0, 0).scale, 2);
  assert.equal(zoomAt(camera, 0.01, 0, 0).scale, 0.25);
});

test('two fingers scale around their midpoint and carry the view with it', () => {
  const start = { x: 0, y: 0, scale: 1 };
  // Fingers 100 px apart around (200, 200) spread to 200 px: twice the scale, the midpoint stays put.
  assert.deepEqual(
    pinchCamera(
      start,
      [
        { x: 150, y: 200 },
        { x: 250, y: 200 },
      ],
      [
        { x: 100, y: 200 },
        { x: 300, y: 200 },
      ]
    ),
    { scale: 2, x: -200, y: -200 }
  );
  // Same distance, both fingers moved 30 right and 10 down: a pan only.
  assert.deepEqual(
    pinchCamera(
      start,
      [
        { x: 150, y: 200 },
        { x: 250, y: 200 },
      ],
      [
        { x: 180, y: 210 },
        { x: 280, y: 210 },
      ]
    ),
    { scale: 1, x: 30, y: 10 }
  );
  // Squeezed to a tenth: clamped at 25 %.
  assert.equal(
    pinchCamera(
      start,
      [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
      ],
      [
        { x: 180, y: 0 },
        { x: 220, y: 0 },
      ]
    ).scale,
    0.25
  );
});

test('a card is revealed by the smallest move; a visible card moves nothing', () => {
  const camera = { x: 0, y: 0, scale: 1 };
  const inside = { x: 300, y: 200, w: 280, h: 110 };
  assert.equal(revealRect(camera, inside, VIEW), camera);
  // Half outside on the right: 900 + 280 = 1180 > 1000 − 40 → move left by 220.
  assert.deepEqual(revealRect(camera, { x: 900, y: 200, w: 280, h: 110 }, VIEW), { scale: 1, x: -220, y: 0 });
  // Above and to the left at 50 %: the card's corner comes to the margin.
  assert.deepEqual(revealRect({ x: 0, y: 0, scale: 0.5 }, { x: -400, y: -300, w: 280, h: 110 }, VIEW), {
    scale: 0.5,
    x: 240,
    y: 190,
  });
  // Below: 650 + 110 = 760 > 700 − 40 → up by 100.
  assert.deepEqual(revealRect(camera, { x: 300, y: 650, w: 280, h: 110 }, VIEW), { scale: 1, x: 0, y: -100 });
});
