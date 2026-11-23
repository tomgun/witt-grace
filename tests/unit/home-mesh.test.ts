/**
 * must: the home screen's backdrop is an argument tree in space (owner 2026-11-23, WG-062, S-15): the same tree on
 *       every visit (seeded), one main claim on top with five reasons, three under each and two under those (51
 *       points), every reason below its parent and tied to it, each either supporting or opposing, siblings tied
 *       in a ring; a point is turned about the vertical axis and projected with perspective, nearer being larger,
 *       and a screen point is taken back into the model at a given depth; the tree is a body of masses and rods
 *       (owner, same day): at rest it stays at rest, a held point goes with the hand and pulls its children most,
 *       its parent a little and a far branch hardly at all, the main claim never moves, the hand has a reach, and
 *       let go the tree swings back and settles
 * test: tests/unit/home-mesh.test.ts
 * red-against: Math.random in the layout (another tree on every render), a reason drawn above its claim, a ring
 *              tie reaching into another family, perspective inverted (far points drawn larger), the whole tree
 *              moving as one stiff piece when a point is pulled, a release that never settles or explodes, a point
 *              dragged off to infinity, the tree torn off the claim it hangs from
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HOLD_REACH,
  bodyAtRest,
  bodyStep,
  bodyUnrest,
  buildMesh,
  nearestPoint,
  project,
  seeded,
  unproject,
} from '../../src/app/homeMesh.ts';
import type { Body, Mesh } from '../../src/app/homeMesh.ts';

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

const pointOf = (body: Body, i: number) => ({
  x: body.now[i * 3]!,
  y: body.now[i * 3 + 1]!,
  z: body.now[i * 3 + 2]!,
});
const moved = (mesh: Mesh, body: Body, i: number): number => {
  const home = mesh.nodes[i]!;
  const p = pointOf(body, i);
  return Math.hypot(p.x - home.x, p.y - home.y, p.z - home.z);
};

test('taking a screen point back into the model undoes the projection', () => {
  const mesh = buildMesh();
  for (const i of [0, 3, 17, 50]) {
    const node = mesh.nodes[i]!;
    const screen = project(node, 1.1, 900, 400, 520);
    const back = unproject(screen.x, screen.y, screen.z, 1.1, 900, 400, 520);
    assert.ok(Math.hypot(back.x - node.x, back.y - node.y, back.z - node.z) < 1e-9, `node ${i}`);
  }
});

test('the nearest point within reach, or none', () => {
  const points = [
    { x: 100, y: 100, scale: 1, near: 1, z: 0 },
    { x: 130, y: 100, scale: 1, near: 1, z: 0 },
  ];
  assert.equal(nearestPoint(points, 104, 100, 22), 0);
  assert.equal(nearestPoint(points, 126, 104, 22), 1);
  assert.equal(nearestPoint(points, 100, 123, 22), -1);
  assert.equal(nearestPoint(points, 100, 122, 22), 0);
});

test('the body at rest stays at rest', () => {
  const mesh = buildMesh();
  let body = bodyAtRest(mesh);
  for (let i = 0; i < 50; i++) body = bodyStep(mesh, body, 33);
  assert.ok(bodyUnrest(mesh, body) < 1e-9);
});

test('a held point goes with the hand and pulls its neighbours, not the whole tree', () => {
  const mesh = buildMesh();
  // A reason of the second level: it has a parent, two siblings and children.
  const held = mesh.nodes.findIndex((n) => n.depth === 2);
  const home = mesh.nodes[held]!;
  const hand = { index: held, x: home.x + 0.5, y: home.y - 0.2, z: home.z };
  let body = bodyAtRest(mesh);
  for (let i = 0; i < 40; i++) body = bodyStep(mesh, body, 33, hand);
  // The held point is where the hand is.
  const at = pointOf(body, held);
  assert.ok(Math.hypot(at.x - hand.x, at.y - hand.y, at.z - hand.z) < 1e-9);
  // The main claim does not move; the tree hangs from it.
  assert.equal(moved(mesh, body, 0), 0);
  // Its own children follow it most, its parent gives a little, a branch on another side hardly notices.
  const child = mesh.nodes.findIndex((n) => n.parent === held);
  const parent = home.parent;
  const elsewhere = mesh.nodes.findIndex((n) => n.depth === 1 && n !== mesh.nodes[parent]);
  const farBranchLeaf = mesh.nodes.findIndex(
    (n) => n.depth === 3 && mesh.nodes[mesh.nodes[n.parent]!.parent] === mesh.nodes[elsewhere]
  );
  assert.ok(moved(mesh, body, child) > 0.2, `child moved ${moved(mesh, body, child)}`);
  assert.ok(moved(mesh, body, parent) > 0.01 && moved(mesh, body, parent) < moved(mesh, body, child));
  // The pull is 0.54 model units: a leaf on another side of the tree gets a fifth of it at most.
  assert.ok(moved(mesh, body, farBranchLeaf) < 0.15, `far leaf moved ${moved(mesh, body, farBranchLeaf)}`);
  assert.ok(moved(mesh, body, farBranchLeaf) < moved(mesh, body, child) / 2);
  assert.ok(moved(mesh, body, farBranchLeaf) < moved(mesh, body, parent));
});

test('let go, the tree swings back to its shape and settles', () => {
  const mesh = buildMesh();
  const held = mesh.nodes.findIndex((n) => n.depth === 2);
  const home = mesh.nodes[held]!;
  let body = bodyAtRest(mesh);
  for (let i = 0; i < 30; i++)
    body = bodyStep(mesh, body, 33, { index: held, x: home.x + 0.6, y: home.y, z: home.z + 0.3 });
  const pulled = bodyUnrest(mesh, body);
  assert.ok(pulled > 0.5);
  // A second after the release it is still moving back; after twenty it has settled.
  for (let i = 0; i < 30; i++) body = bodyStep(mesh, body, 33);
  const soon = bodyUnrest(mesh, body);
  assert.ok(soon < pulled && soon > 1e-4, `after one second ${soon}`);
  for (let i = 0; i < 600; i++) body = bodyStep(mesh, body, 33);
  assert.ok(bodyUnrest(mesh, body) < 1e-3, `settled to ${bodyUnrest(mesh, body)}`);
});

test('the hand cannot take a point farther than its reach, and the main claim is not taken at all', () => {
  const mesh = buildMesh();
  const held = mesh.nodes.findIndex((n) => n.depth === 3);
  const home = mesh.nodes[held]!;
  let body = bodyAtRest(mesh);
  for (let i = 0; i < 20; i++)
    body = bodyStep(mesh, body, 33, { index: held, x: home.x + 50, y: home.y, z: home.z });
  assert.equal(moved(mesh, body, held).toFixed(6), HOLD_REACH.toFixed(6));
  body = bodyAtRest(mesh);
  for (let i = 0; i < 20; i++) body = bodyStep(mesh, body, 33, { index: 0, x: 5, y: 5, z: 5 });
  assert.equal(bodyUnrest(mesh, body), 0);
});
