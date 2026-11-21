/**
 * must: the sketchpad's model (owner 2026-11-20, S-15): an element is hit on its stroke, a filled shape and a text
 *       also inside, and the topmost one wins; moving moves every kind and a link follows its nodes; removing a
 *       node removes its links; a child node is placed right of its parent, below the parent's lowest child, and
 *       linked; a copied frame keeps its elements' ids, and between two frames an element with the same id glides
 *       from its place to the next while one without a partner stays; a node carries comments and a frame a name;
 *       a rectangle or an ellipse carries a text of its own, found by a point anywhere inside it, and emptying the
 *       text leaves the box (owner 2026-11-21);
 *       the last frame is emptied instead of removed; a file round-trips, and a file with an unknown type, a colour outside the palette, an odd point
 *       list, a duplicate id, a link to a missing node or too many frames is refused with the place named
 * test: tests/unit/sketch.test.ts
 * red-against: an empty rectangle swallowing presses meant for what is inside it, a link left pointing at a
 *              deleted node, a glide that moves a stroke whose point count differs (a scramble), an empty comment
 *              stored, an emptied box text deleting the box, a box text over the limit accepted from a file, a
 *              sibling
 *              placed on top of the first child, a hostile file with a million points accepted
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SKETCH_LIMITS,
  addChildNode,
  addComment,
  addElement,
  addFrame,
  blankSketch,
  boxAt,
  elementAt,
  linkEnds,
  moveElements,
  parentNodeId,
  parseSketch,
  removeComment,
  removeElements,
  removeFrame,
  restyle,
  serializeSketch,
  setFps,
  setFrameName,
  setText,
  setTween,
  textBounds,
  tweenElements,
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

test('frames: a copy keeps the ids, the last frame is emptied, the speed stays within 1–24', () => {
  let s = build(node('a', 0, 0, 'A'), node('b', 300, 0, 'B'), {
    ...style,
    type: 'link',
    id: 'l',
    from: 'a',
    to: 'b',
  });
  s = addFrame(s, 0, 'f2', true);
  assert.deepEqual(
    s.frames.map((f) => f.id),
    ['f1', 'f2']
  );
  // The copy keeps the elements' ids: the same thing is recognised in the next frame.
  assert.deepEqual(
    els(s, 1).map((e) => e.id),
    ['a', 'b', 'l']
  );
  // Moving it in one frame leaves the other as it was.
  s = moveElements(s, 1, ['a'], 50, 0);
  assert.deepEqual([(els(s, 0)[0] as { x: number }).x, (els(s, 1)[0] as { x: number }).x], [0, 50]);
  s = addFrame(s, 0, 'f3', false);
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
    false
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

test('gliding between frames: the same id moves part of the way; no partner, no move', () => {
  const from: SketchElement[] = [
    { ...style, type: 'rect', id: 'r', x: 0, y: 0, w: 100, h: 50, fill: null },
    { ...style, type: 'pen', id: 'p', points: [0, 0, 10, 10] },
    { ...style, type: 'pen', id: 'q', points: [0, 0, 10, 10] },
    node('n', 100, 100, 'A'),
    { ...style, type: 'line', id: 'gone', x1: 0, y1: 0, x2: 5, y2: 5 },
  ];
  const to: SketchElement[] = [
    { ...style, type: 'rect', id: 'r', x: 200, y: 100, w: 300, h: 50, fill: null },
    { ...style, type: 'pen', id: 'p', points: [100, 0, 110, 10] },
    { ...style, type: 'pen', id: 'q', points: [0, 0, 10, 10, 20, 20] },
    node('n', 100, 300, 'A'),
    { ...style, type: 'ellipse', id: 'new', x: 0, y: 0, w: 5, h: 5, fill: null },
  ];
  const mid = tweenElements(from, to, 0.25);
  assert.deepEqual(mid[0], { ...style, type: 'rect', id: 'r', x: 50, y: 25, w: 150, h: 50, fill: null });
  assert.deepEqual((mid[1] as { points: number[] }).points, [25, 0, 35, 10]);
  assert.equal(mid[2], from[2], 'a stroke with another number of points is not scrambled');
  assert.equal((mid[3] as { y: number }).y, 150);
  assert.equal(mid[4], from[4]);
  assert.equal(mid.length, 5, 'what is only in the next frame appears with it');
  assert.deepEqual(tweenElements(from, to, 0), [from[0], from[1], from[2], from[3], from[4]]);
});

test('comments on a node, a name for a frame, gliding kept in the file', () => {
  let s = build(node('n', 0, 0, 'Aihe'), { ...style, type: 'text', id: 't', x: 0, y: 100, text: 'x' });
  s = addComment(s, 0, 'n', { id: 'c1', body: '  Onko tämä varmaa?  ' });
  assert.equal(addComment(s, 0, 'n', { id: 'c2', body: '   ' }), s, 'an empty comment is not stored');
  assert.equal(addComment(s, 0, 't', { id: 'c2', body: 'x' }), s, 'only a node carries comments');
  s = addComment(s, 0, 'n', { id: 'c2', body: 'Lähde?' });
  assert.deepEqual((els(s)[0] as { comments: unknown }).comments, [
    { id: 'c1', body: 'Onko tämä varmaa?' },
    { id: 'c2', body: 'Lähde?' },
  ]);
  s = setTween(setFrameName(s, 0, '  Ideat   ja  riskit '), true);
  assert.equal(s.frames[0]!.name, 'Ideat ja riskit');
  assert.deepEqual(parseSketch(serializeSketch(s)), { ok: true, sketch: s });
  // Taking the last comment, the name and the gliding away leaves no empty fields behind.
  let bare = removeComment(removeComment(s, 0, 'n', 'c1'), 0, 'n', 'c2');
  bare = setTween(setFrameName(bare, 0, ''), false);
  assert.equal('comments' in els(bare)[0]!, false);
  assert.equal('name' in bare.frames[0]!, false);
  assert.equal('tween' in bare, false);

  const refuse = (
    change: (raw: {
      tween?: unknown;
      frames: { name?: unknown; elements: { comments?: unknown }[] }[];
    }) => void
  ) => {
    const raw = JSON.parse(serializeSketch(s));
    change(raw);
    const result = parseSketch(JSON.stringify(raw));
    return result.ok ? 'accepted' : result.reason;
  };
  assert.equal(
    refuse((r) => (r.frames[0]!.elements[0]!.comments = [{ id: 'c', body: '' }])),
    'frames[0].elements[0].comments[0]'
  );
  assert.equal(
    refuse((r) => (r.frames[0]!.elements[1]!.comments = [{ id: 'c', body: 'x' }])),
    'frames[0].elements[1].comments'
  );
  assert.equal(
    refuse((r) => (r.frames[0]!.name = 'x'.repeat(SKETCH_LIMITS.frameName + 1))),
    'frames[0].name'
  );
  assert.equal(
    refuse((r) => (r.tween = 'yes')),
    'tween'
  );
});

test('a text written into a box: found anywhere inside it, kept in the file, emptied without losing the box', () => {
  const rect: SketchElement = { ...style, type: 'rect', id: 'r', x: 100, y: 100, w: 200, h: 100, fill: null };
  const oval: SketchElement = {
    ...style,
    type: 'ellipse',
    id: 'o',
    x: 400,
    y: 100,
    w: 200,
    h: 100,
    fill: null,
  };
  const sketch = build(rect, oval, node('n', 700, 100, 'Solmu'));
  // The middle of an empty rectangle is not a hit for selecting, but it is where its text goes.
  assert.equal(elementAt(els(sketch), 200, 150), null);
  assert.equal(boxAt(els(sketch), 200, 150)?.id, 'r');
  assert.equal(boxAt(els(sketch), 500, 150)?.id, 'o');
  // The corner of an ellipse's bounds is outside the ellipse; a node is not a box.
  assert.equal(boxAt(els(sketch), 402, 102), null);
  assert.equal(boxAt(els(sketch), 710, 110), null);
  assert.equal(boxAt(els(sketch), 50, 50), null);

  const written = setText(sketch, 0, 'r', 'Asiakas\r\ntilaa');
  assert.deepEqual(els(written)[0], { ...rect, text: 'Asiakas\ntilaa' });
  const parsed = parseSketch(serializeSketch(written));
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.sketch, written);

  const emptied = setText(written, 0, 'r', '  ');
  assert.deepEqual(els(emptied)[0], rect);
  assert.equal('text' in els(emptied)[0]!, false);

  const hostile = JSON.parse(serializeSketch(written)) as { frames: { elements: { text?: unknown }[] }[] };
  hostile.frames[0]!.elements[0]!.text = 'x'.repeat(SKETCH_LIMITS.text + 1);
  assert.deepEqual(parseSketch(JSON.stringify(hostile)), { ok: false, reason: 'frames[0].elements[0].text' });
  hostile.frames[0]!.elements[0]!.text = 7;
  assert.deepEqual(parseSketch(JSON.stringify(hostile)), { ok: false, reason: 'frames[0].elements[0].text' });
});
