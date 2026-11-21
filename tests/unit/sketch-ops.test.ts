/**
 * must: sketching together (owner 2026-11-21, WG-056): one person's change is a list of small operations on frames
 *       named by id; applied to the sketch it was made on they give exactly the changed sketch, and applied to a
 *       sketch someone else changed meanwhile they leave the other's work standing; two people's operations applied
 *       in the same order give the same sketch whoever made them first; an operation that cannot be applied returns
 *       the same sketch; the result always reads back as a sketch file; a long change is cut to messages of a given
 *       size; what a peer sends is refused whole when anything in it is odd
 * test: tests/unit/sketch-ops.test.ts
 * red-against: a change sent as the whole sketch (the other person's stroke wiped), a link kept after its node was
 *              removed by someone else, a frame addressed by its index (the wrong frame after an insert), a put past
 *              the element limit accepted, a hostile operation with a colour outside the palette applied
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SKETCH_LIMITS,
  addChildNode,
  addElement,
  addFrame,
  blankSketch,
  moveElements,
  parseSketch,
  removeElements,
  removeFrame,
  serializeSketch,
  setFps,
  setFrameName,
  setText,
  setTween,
} from '../../src/domain/sketch.ts';
import type { Sketch, SketchElement } from '../../src/domain/sketch.ts';
import {
  MAX_SKETCH_OPS,
  applySketchOps,
  diffSketch,
  packSketchOps,
  parseSketchOps,
} from '../../src/domain/sketchOps.ts';
import type { SketchOp } from '../../src/domain/sketchOps.ts';

const pen = (id: string, x: number): SketchElement => ({
  id,
  color: 1,
  size: 4,
  type: 'pen',
  points: [x, 10, x + 5, 20],
});
const node = (id: string, x: number, text: string): SketchElement => ({
  id,
  color: 0,
  size: 4,
  type: 'node',
  x,
  y: 100,
  text,
});
const wire = (ops: SketchOp[]): SketchOp[] => {
  const parsed = parseSketchOps(JSON.parse(JSON.stringify(ops)));
  assert.ok(parsed, 'the operations pass the boundary');
  return parsed;
};
const valid = (sketch: Sketch) => assert.equal(parseSketch(serializeSketch(sketch)).ok, true);

test('a change is the operations that make it: every kind of change, through the wire and back', () => {
  let before = addElement(addElement(blankSketch('f1'), 0, node('a', 100, 'Aihe')), 0, pen('p', 300));
  const steps: ((s: Sketch) => Sketch)[] = [
    (s) => addElement(s, 0, pen('q', 500)),
    (s) => moveElements(s, 0, ['p'], 10, 20),
    (s) => setText(s, 0, 'a', 'Uusi aihe'),
    (s) => addChildNode(s, 0, 'a', { node: 'b', link: 'l' }, 'Lapsi'),
    (s) => addFrame(s, 0, 'f2', true),
    (s) => addFrame(s, 1, 'f3', false),
    (s) => setFrameName(s, 1, 'Toinen'),
    (s) => removeElements(s, 0, ['a']),
    (s) => setTween(setFps(s, 12), true),
    (s) => removeFrame(s, 2),
    (s) => setFrameName(s, 1, ''),
  ];
  for (const step of steps) {
    const after = step(before);
    const ops = diffSketch(before, after);
    assert.ok(ops.length > 0);
    assert.deepEqual(applySketchOps(before, wire(ops)), after);
    valid(after);
    before = after;
  }
  assert.deepEqual(diffSketch(before, before), []);
  // The steps as operations, literally: a copied frame travels as a new frame and its content.
  const base = addElement(blankSketch('f1'), 0, pen('p', 300));
  assert.deepEqual(diffSketch(base, addFrame(base, 0, 'f2', true)), [
    { op: 'frameAdd', id: 'f2', after: 'f1' },
    {
      op: 'put',
      frame: 'f2',
      elements: [{ id: 'p', color: 1, size: 4, type: 'pen', points: [300, 10, 305, 20] }],
    },
  ]);
  assert.deepEqual(diffSketch(base, moveElements(base, 0, ['p'], 1, 1)), [
    {
      op: 'put',
      frame: 'f1',
      elements: [{ id: 'p', color: 1, size: 4, type: 'pen', points: [301, 11, 306, 21] }],
    },
  ]);
  assert.deepEqual(diffSketch(base, removeElements(base, 0, ['p'])), [
    { op: 'drop', frame: 'f1', ids: ['p'] },
  ]);
});

test('two people at once: each change keeps the other’s, and the host’s order decides the same element', () => {
  const base = addElement(addElement(blankSketch('f1'), 0, node('a', 100, 'Aihe')), 0, pen('p', 300));
  // Aino draws a stroke; Ben, on the same base, moves the old one and adds a frame in front of everything.
  const aino = diffSketch(base, addElement(base, 0, pen('q', 500)));
  const ben = diffSketch(base, moveElements(base, 0, ['p'], 50, 0));
  const both = applySketchOps(applySketchOps(base, aino), ben);
  assert.deepEqual(
    both.frames[0]!.elements.map((e) => e.id),
    ['a', 'p', 'q']
  );
  assert.deepEqual((both.frames[0]!.elements[1] as { points: number[] }).points, [350, 10, 355, 20]);

  // The same element changed by both: whoever is later in the one order stands, on every machine.
  const rename1 = diffSketch(base, setText(base, 0, 'a', 'Ainon nimi'));
  const rename2 = diffSketch(base, setText(base, 0, 'a', 'Benin nimi'));
  const final = applySketchOps(applySketchOps(base, rename1), rename2);
  assert.equal((final.frames[0]!.elements[0] as { text: string }).text, 'Benin nimi');

  // Ben removes the node while Aino adds a child to it: the child stays as a node, the link has no end and goes.
  const child = diffSketch(base, addChildNode(base, 0, 'a', { node: 'b', link: 'l' }, 'Lapsi'));
  const removal = diffSketch(base, removeElements(base, 0, ['a']));
  const after = applySketchOps(applySketchOps(base, removal), child);
  assert.deepEqual(
    after.frames[0]!.elements.map((e) => e.id),
    ['p', 'b']
  );
  valid(after);

  // A frame put in front by one person does not send the other's stroke to the wrong frame.
  const inFront: SketchOp[] = [{ op: 'frameAdd', id: 'f0', after: null }];
  const shifted = applySketchOps(applySketchOps(base, inFront), aino);
  assert.deepEqual(
    shifted.frames.map((f) => [f.id, f.elements.length]),
    [
      ['f0', 0],
      ['f1', 3],
    ]
  );
});

test('what cannot be applied changes nothing; limits hold', () => {
  const base = addElement(blankSketch('f1'), 0, pen('p', 300));
  const same = (ops: SketchOp[]) => assert.equal(applySketchOps(base, ops), base);
  same([{ op: 'put', frame: 'gone', elements: [pen('q', 1)] }]);
  same([{ op: 'drop', frame: 'f1', ids: ['nobody'] }]);
  same([{ op: 'frameAdd', id: 'f1', after: null }]);
  same([{ op: 'frameDrop', id: 'gone' }]);
  same([{ op: 'frameName', id: 'gone', name: 'x' }]);
  same([{ op: 'settings', fps: 6 }]);
  // The only frame is emptied, not removed.
  assert.deepEqual(applySketchOps(base, [{ op: 'frameDrop', id: 'f1' }]).frames, [
    { id: 'f1', elements: [] },
  ]);
  // A link to a node that is not there is not kept.
  const dangling = applySketchOps(base, [
    { op: 'put', frame: 'f1', elements: [{ id: 'l', color: 0, size: 2, type: 'link', from: 'x', to: 'y' }] },
  ]);
  assert.deepEqual(
    dangling.frames[0]!.elements.map((e) => e.id),
    ['p']
  );
  const many = Array.from({ length: SKETCH_LIMITS.elements }, (_, i) => pen(`n${i}`, i));
  same([{ op: 'put', frame: 'f1', elements: many }]);
});

test('a long change is cut to messages that fit; a peer’s odd operation refuses the lot', () => {
  const elements = Array.from({ length: 40 }, (_, i) => pen(`s${i}`, i));
  const ops: SketchOp[] = [
    { op: 'drop', frame: 'f1', ids: ['old'] },
    { op: 'put', frame: 'f1', elements },
  ];
  const groups = packSketchOps(ops, 600);
  assert.ok(groups.length > 1);
  for (const group of groups) assert.ok(JSON.stringify(group).length <= 600 + 2);
  assert.deepEqual(
    groups.flat().flatMap((op) => (op.op === 'put' ? op.elements.map((e) => e.id) : [])),
    elements.map((e) => e.id)
  );
  assert.deepEqual(groups[0]![0], ops[0]);
  assert.deepEqual(packSketchOps(ops, 1_000_000), [ops]);

  const good = { op: 'put', frame: 'f1', elements: [pen('q', 1)] };
  assert.deepEqual(parseSketchOps([good]), [good]);
  const refused: unknown[] = [
    'put',
    [],
    [good, { op: 'erase-all' }],
    [{ op: 'put', frame: 'f1', elements: [{ ...pen('q', 1), color: 99 }] }],
    [{ op: 'put', frame: 'f1', elements: [pen('q', 1), pen('q', 2)] }],
    [{ op: 'put', frame: 'f1', elements: [] }],
    [{ op: 'put', frame: '', elements: [pen('q', 1)] }],
    [{ op: 'drop', frame: 'f1', ids: [7] }],
    [{ op: 'frameAdd', id: 'f2' }],
    [{ op: 'frameName', id: 'f1', name: 'x'.repeat(SKETCH_LIMITS.frameName + 1) }],
    [{ op: 'settings', fps: 99 }],
    [{ op: 'settings' }],
    Array.from({ length: MAX_SKETCH_OPS + 1 }, () => good),
  ];
  for (const raw of refused) assert.equal(parseSketchOps(raw), null, JSON.stringify(raw).slice(0, 80));
});
