/**
 * must: the home screen's backdrop is an argument tree in space (owner 2026-11-23, WG-062, S-15): the same tree on
 *       every visit (seeded), one main claim on top with five reasons, three under each and two under those (51
 *       points), every reason below its parent and tied to it, each either supporting or opposing, siblings tied
 *       in a ring; a point is turned about the vertical axis and projected with perspective, nearer being larger
 * test: tests/unit/home-mesh.test.ts
 * red-against: Math.random in the layout (another tree on every render), a reason drawn above its claim, a ring
 *              tie reaching into another family, perspective inverted (far points drawn larger)
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMesh, project, seeded } from '../../src/app/homeMesh.ts';

test('the seeded generator gives the same numbers for the same seed', () => {
  const a = seeded(7);
  const b = seeded(7);
  const first = [a(), a(), a()];
  assert.deepEqual(first, [b(), b(), b()]);
  assert.ok(first.every((n) => n >= 0 && n < 1));
  assert.notDeepEqual(first, [seeded(8)(), seeded(8)(), seeded(8)()]);
});

test('the tree: 1 + 5 + 15 + 30 points, the same every time, reasons below their claims', () => {
  const mesh = buildMesh();
  assert.deepEqual(mesh, buildMesh());
  assert.equal(mesh.nodes.length, 51);
  assert.deepEqual(
    [0, 1, 2, 3].map((depth) => mesh.nodes.filter((n) => n.depth === depth).length),
    [1, 5, 15, 30]
  );
  const root = mesh.nodes[0]!;
  assert.deepEqual([root.stance, root.parent, root.x, root.z], ['root', -1, 0, 0]);
  for (const [i, node] of mesh.nodes.entries()) {
    if (i === 0) continue;
    const parent = mesh.nodes[node.parent]!;
    assert.equal(node.depth, parent.depth + 1);
    assert.ok(node.y > parent.y, `node ${i} is below its parent`);
    assert.ok(node.stance === 'support' || node.stance === 'oppose');
  }
  const stances = mesh.nodes.slice(1).map((n) => n.stance);
  assert.ok(stances.includes('support') && stances.includes('oppose'));
  // The whole tree stays within reach of the screen box.
  for (const node of mesh.nodes) assert.ok(Math.hypot(node.x, node.z) < 1.4 && Math.abs(node.y) < 1.4);
});

test('ring ties join siblings only, one per sibling', () => {
  const mesh = buildMesh();
  assert.equal(mesh.ties.length, 50);
  for (const [a, b] of mesh.ties) {
    assert.notEqual(a, b);
    assert.equal(mesh.nodes[a]!.parent, mesh.nodes[b]!.parent);
  }
});

test('projection: the centre stays put, a turn moves x into depth, nearer is larger', () => {
  const centre = project({ x: 0, y: 0, z: 0 }, 1.3, 400, 300, 200);
  assert.deepEqual([centre.x, centre.y, centre.scale, centre.near], [400, 300, 1, 0.5]);
  const right = project({ x: 1, y: 0, z: 0 }, 0, 400, 300, 200);
  assert.equal(right.x.toFixed(1), '600.0');
  assert.equal(right.y.toFixed(1), '300.0');
  // A quarter turn puts the same point straight behind or in front of the centre.
  const turned = project({ x: 1, y: 0, z: 0 }, Math.PI / 2, 400, 300, 200);
  assert.equal(turned.x.toFixed(1), '400.0');
  const near = project({ x: 0, y: 0, z: -1 }, 0, 400, 300, 200);
  const far = project({ x: 0, y: 0, z: 1 }, 0, 400, 300, 200);
  assert.ok(near.scale > 1 && far.scale < 1);
  assert.ok(near.near > far.near);
});
