/**
 * must: the sketchpad's model (owner 2026-11-20, S-15): an element is hit on its stroke, a filled shape and a text
 *       also inside, and the topmost one wins; moving moves every kind and a link follows its nodes; removing a
 *       node removes its links; a child node is placed right of its parent, below the parent's lowest child, and
 *       linked; a copied frame gets new ids and its links point at the copies; the last frame is emptied instead of
 *       removed; a file round-trips, and a file with an unknown type, a colour outside the palette, an odd point
 *       list, a duplicate id, a link to a missing node or too many frames is refused with the place named
 * test: tests/unit/sketch.test.ts
 * red-against: an empty rectangle swallowing presses meant for what is inside it, a link left pointing at a
 *              deleted node, a copied frame's link still pointing into the frame it was copied from, a sibling
 *              placed on top of the first child, a hostile file with a million points accepted
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SKETCH_LIMITS,
  addChildNode,
  addElement,
  addFrame,
  blankSketch,
  elementAt,
  linkEnds,
  moveElements,
  parentNodeId,
  parseSketch,
  removeElements,
  removeFrame,
  restyle,
  serializeSketch,
  setFps,
  setText,
  textBounds,
} from '../../src/domain/sketch.ts';
import type { Sketch, SketchElement } from '../../src/domain/sketch.ts';

const style = { color: 0, size: 4 };
const node = (id: string, x: number, y: number, text: string): SketchElement => ({
  ...style,
  type: 'node',
  id,
  x,
  y,
  text,
});
const build = (...elements: SketchElement[]): Sketch =>
  elements.reduce((s, e) => addElement(s, 0, e), blankSketch('f1'));
const els = (s: Sketch, frame = 0) => s.frames[frame]!.elements;

test('hit testing: strokes, outlines, filled shapes, text; the topmost wins', () => {
  const s = build(
    { ...style, type: 'rect', id: 'box', x: 100, y: 100, w: 200, h: 100, fill: null },
    { ...style, type: 'pen', id: 'pen', points: [150, 150, 250, 150] },
    { ...style, type: 'ellipse', id: 'disc', x: 400, y: 100, w: 100, h: 100, fill: 2 },
    { ...style, type: 'arrow', id: 'arrow', x1: 0, y1: 300, x2: 200, y2: 300 },
    { ...style, type: 'text', id: 'text', x: 600, y: 100, text: 'abc' }
  );
  // The middle of an empty rectangle reaches the stroke drawn inside it; its edge is the rectangle.
  assert.equal(elementAt(els(s), 200, 150)?.id, 'pen');
  assert.equal(elementAt(els(s), 200, 180), null);
  assert.equal(elementAt(els(s), 100, 150)?.id, 'box');
  assert.equal(elementAt(els(s), 450, 150)?.id, 'disc');
  assert.equal(elementAt(els(s), 402, 102), null, 'the corner of an ellipse’s box is outside it');
  assert.equal(elementAt(els(s), 100, 304)?.id, 'arrow');
  assert.equal(elementAt(els(s), 100, 320), null);
  // Monospace text: three characters are 36 wide and one line 26 high.
  assert.deepEqual(textBounds({ ...style, type: 'text', id: 't', x: 0, y: 0, text: 'abc' }), {
    x: 0,
    y: 0,
    w: 36,
    h: 26,
  });
  assert.equal(elementAt(els(s), 620, 110)?.id, 'text');
  // Later elements are on top.
  const over = addElement(s, 0, {
    ...style,
    type: 'rect',
    id: 'cover',
    x: 420,
    y: 120,
    w: 60,
    h: 60,
    fill: 1,
  });
  assert.equal(elementAt(els(over), 450, 150)?.id, 'cover');
});

test('moving, restyling and writing; a link follows its nodes and goes with them', () => {
  let s = build(node('a', 100, 100, 'Aihe'), node('b', 400, 100, 'Ajatus'), {
    ...style,
    type: 'link',
    id: 'l',
    from: 'a',
    to: 'b',
  });
  const before = linkEnds(els(s)[2] as never, els(s))!;
  s = moveElements(s, 0, ['b', 'l'], 0, 50);
  const after = linkEnds(els(s)[2] as never, els(s))!;
  assert.deepEqual([after.x1, after.y1], [before.x1, before.y1]);
  assert.equal(after.y2, before.y2 + 50);
  s = moveElements(build({ ...style, type: 'pen', id: 'p', points: [1, 2, 3, 4] }), 0, ['p'], 10, 20);
  assert.deepEqual((els(s)[0] as { points: number[] }).points, [11, 22, 13, 24]);

  s = build(node('a', 100, 100, 'Aihe'), {
    ...style,
    type: 'rect',
    id: 'r',
    x: 0,
    y: 0,
    w: 5,
    h: 5,
    fill: null,
  });
  s = restyle(s, 0, ['a', 'r'], { color: 3, size: 8, fill: 3 });
  assert.deepEqual(
    els(s).map((e) => [e.color, e.size]),
    [
      [3, 8],
      [3, 8],
    ]
  );
  assert.equal((els(s)[1] as { fill: number | null }).fill, 3);
  assert.equal('fill' in els(s)[0]!, false, 'a node has no fill');
  s = setText(s, 0, 'a', 'x'.repeat(SKETCH_LIMITS.text + 50));
  assert.equal((els(s)[0] as { text: string }).text.length, SKETCH_LIMITS.text);

  // Removing a node removes the links that ended at it.
  s = build(node('a', 0, 0, 'A'), node('b', 300, 0, 'B'), {
    ...style,
    type: 'link',
    id: 'l',
    from: 'a',
    to: 'b',
  });
  assert.deepEqual(
    els(removeElements(s, 0, ['b'])).map((e) => e.id),
    ['a']
  );
});

test('a mind map grows to the right: children below one another, each linked to its parent', () => {
  let s = build(node('root', 100, 300, 'Loma'));
  s = addChildNode(s, 0, 'root', { node: 'c1', link: 'l1' }, 'Mökki');
  s = addChildNode(s, 0, 'root', { node: 'c2', link: 'l2' }, 'Kaupunki');
  const byId = (id: string) => els(s).find((e) => e.id === id) as { x: number; y: number };
  // "Loma" is four characters: 48 wide plus the node's padding of 28, and the child stands 70 further.
  assert.equal(byId('c1').x, 100 + 76 + 70);
  assert.equal(byId('c1').y, 300);
  // The second child is below the first one's 44 px frame with a gap of 16.
  assert.equal(byId('c2').y, 300 + 44 + 16);
  assert.equal(parentNodeId(els(s), 'c2'), 'root');
  assert.equal(parentNodeId(els(s), 'root'), null);
  // The links are under the nodes.
  assert.deepEqual(
    els(s).map((e) => e.type),
    ['link', 'link', 'node', 'node', 'node']
  );
  // Only a node can be a parent.
  const plain = build({ ...style, type: 'text', id: 't', x: 0, y: 0, text: 'x' });
  assert.equal(addChildNode(plain, 0, 't', { node: 'n', link: 'l' }, ''), plain);
});

test('frames: a copy has ids of its own, the last frame is emptied, the speed stays within 1–24', () => {
  let s = build(node('a', 0, 0, 'A'), node('b', 300, 0, 'B'), {
    ...style,
    type: 'link',
    id: 'l',
    from: 'a',
    to: 'b',
  });
  let n = 0;
  s = addFrame(s, 0, 'f2', { newId: () => `n${++n}` });
  assert.deepEqual(
    s.frames.map((f) => f.id),
    ['f1', 'f2']
  );
  assert.deepEqual(
    els(s, 1).map((e) => e.id),
    ['n1', 'n2', 'n3']
  );
  const link = els(s, 1)[2] as { from: string; to: string };
  assert.deepEqual([link.from, link.to], ['n1', 'n2']);
  s = addFrame(s, 0, 'f3', null);
  assert.deepEqual(
    s.frames.map((f) => [f.id, f.elements.length]),
    [
      ['f1', 3],
      ['f3', 0],
      ['f2', 3],
    ]
  );
  s = removeFrame(removeFrame(s, 1), 1);
  assert.equal(s.frames.length, 1);
  s = removeFrame(s, 0);
  assert.deepEqual(
    s.frames.map((f) => [f.id, f.elements.length]),
    [['f1', 0]]
  );
  assert.deepEqual([setFps(s, 0).fps, setFps(s, 99).fps, setFps(s, 7.6).fps], [1, 24, 8]);
});

test('a file round-trips; a file that is not a sketch is refused and the place is named', () => {
  const s = addFrame(
    build(
      node('a', 10, 10, 'A'),
      node('b', 300, 10, 'B'),
      { ...style, type: 'link', id: 'l', from: 'a', to: 'b' },
      { ...style, type: 'pen', id: 'p', points: [1, 2, 3, 4] },
      { ...style, type: 'ellipse', id: 'e', x: 5, y: 5, w: 20, h: 10, fill: 2 }
    ),
    0,
    'f2',
    null
  );
  const parsed = parseSketch(serializeSketch(s));
  assert.deepEqual(parsed, { ok: true, sketch: s });

  const reason = (change: (raw: Record<string, unknown>) => void, text?: string) => {
    const raw = JSON.parse(serializeSketch(s)) as Record<string, unknown>;
    change(raw);
    const result = parseSketch(text ?? JSON.stringify(raw));
    return result.ok ? 'accepted' : result.reason;
  };
  const el = (raw: Record<string, unknown>, i: number) =>
    (raw.frames as { elements: Record<string, unknown>[] }[])[0]!.elements[i]!;
  assert.equal(
    reason(() => {}, '{'),
    'json'
  );
  assert.equal(
    reason((r) => (r.format = 'witt-project')),
    'format'
  );
  assert.equal(
    reason((r) => (r.version = 2)),
    'version'
  );
  assert.equal(
    reason((r) => (el(r, 3).type = 'script')),
    'frames[0].elements[3].type'
  );
  assert.equal(
    reason((r) => (el(r, 3).color = 8)),
    'frames[0].elements[3].color'
  );
  assert.equal(
    reason((r) => (el(r, 3).points = [1, 2, 3])),
    'frames[0].elements[3].points'
  );
  assert.equal(
    reason((r) => (el(r, 3).points = new Array(SKETCH_LIMITS.points * 2 + 2).fill(1))),
    'frames[0].elements[3].points'
  );
  assert.equal(
    reason((r) => (el(r, 1).id = 'a')),
    'frames[0].elements[1].id'
  );
  assert.equal(
    reason((r) => (el(r, 2).to = 'gone')),
    'frames[0].elements[2]: ends'
  );
  assert.equal(
    reason((r) => (el(r, 2).to = 'p')),
    'frames[0].elements[2]: ends',
    'a link ends at a node'
  );
  assert.equal(
    reason((r) => (el(r, 4).x = '5')),
    'frames[0].elements[4]: coordinates'
  );
  assert.equal(
    reason(
      (r) =>
        (r.frames = new Array(SKETCH_LIMITS.frames + 1).fill({
          id: 'x',
          elements: [],
        }))
    ),
    'frames'
  );
  assert.equal(
    reason(() => {}, ' '.repeat(SKETCH_LIMITS.bytes + 1)),
    'size'
  );
});
