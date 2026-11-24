/**
 * must: the home screen's backdrop is an argument tree in space (owner 2026-11-23, WG-062, S-15): the same tree on
 *       every visit (seeded), one main claim on top with five reasons, three under each and two under those (51
 *       points), every reason below its parent and joined to it alone (owner 2026-11-24: no lines between
 *       siblings, so it reads as an argument tree and not as a net), each either supporting or opposing; a point is turned about the vertical axis and projected with perspective, nearer being larger,
 *       and a screen point is taken back into the model at a given depth; the tree is a body of masses and rods
 *       (owner, same day): at rest it stays at rest, a held point goes with the hand and pulls its children most,
 *       its parent a little and a far branch hardly at all, the main claim never moves, the hand has a reach, and
 *       let go the tree swings back and settles; the tree is not there at first (owner 2026-11-24): the main claim
 *       appears after 30 s, then one reason at a time 5–15 s apart, always under a claim that is already there,
 *       the same on every visit; a reason that appears starts at its claim and is drawn out to its place; the box
 *       the turning tree stays in is known, so the page can fit the whole of it
 * test: tests/unit/home-mesh.test.ts
 * red-against: Math.random in the layout (another tree on every render), a reason drawn above its claim, a line
 *              between siblings (a net, not a tree), perspective inverted (far points drawn larger), the whole tree
 *              moving as one stiff piece when a point is pulled, a release that never settles or explodes, a point
 *              dragged off to infinity, the tree torn off the claim it hangs from, a reason appearing before its
 *              claim (a point hanging in the air), the whole tree shown at once, a gap of a fraction of a second
 *              (flicker), a new point popping up at its final place, a box that leaves a far point outside
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GROW_GAP_MS,
  GROW_START_MS,
  HOLD_REACH,
  bodyWithSprout,
  growthTimes,
  meshExtent,
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

test('a tree and nothing else: one line per point, to its own claim, and none between siblings', () => {
  const mesh = buildMesh();
  assert.deepEqual(Object.keys(mesh), ['nodes']);
  // Fifty lines for fifty-one points: every point but the main claim has exactly one, upwards.
  assert.equal(mesh.nodes.filter((n) => n.parent >= 0).length, 50);
  assert.equal(mesh.nodes.filter((n) => n.parent === -1).length, 1);
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

test('growing: the main claim after 30 s, then a reason at a time 5–15 s apart, each after its own claim', () => {
  const mesh = buildMesh();
  const at = growthTimes(mesh);
  assert.deepEqual(at, growthTimes(mesh));
  assert.equal(GROW_START_MS, 30_000);
  assert.deepEqual([...GROW_GAP_MS], [5_000, 15_000]);
  assert.equal(at.length, 51);
  assert.equal(at[0], 30_000);
  mesh.nodes.forEach((node, i) => {
    if (node.parent >= 0) assert.ok(at[i]! > at[node.parent]!, `point ${i} appears before its claim`);
  });
  const order = [...at].sort((a, b) => a - b);
  for (let i = 1; i < order.length; i++) {
    const gap = order[i]! - order[i - 1]!;
    assert.ok(gap >= 5_000 && gap <= 15_000, `gap ${gap}`);
  }
  // Not level by level: some reason of a reason appears before the last reason of the main claim.
  const lastFirstLevel = Math.max(...at.filter((_, i) => mesh.nodes[i]!.depth === 1));
  assert.ok(at.some((t, i) => mesh.nodes[i]!.depth > 1 && t < lastFirstLevel));
});

test('a reason that appears starts at its claim, at rest, and is drawn out to its own place', () => {
  const mesh = buildMesh();
  const index = 7;
  const parent = mesh.nodes[index]!.parent;
  const far = (body: Body, a: number, b: number) =>
    Math.hypot(...[0, 1, 2].map((k) => body.now[a * 3 + k]! - body.now[b * 3 + k]!));
  let body = bodyWithSprout(mesh, bodyAtRest(mesh), index);
  const rod = Math.hypot(
    mesh.nodes[index]!.x - mesh.nodes[parent]!.x,
    mesh.nodes[index]!.y - mesh.nodes[parent]!.y,
    mesh.nodes[index]!.z - mesh.nodes[parent]!.z
  );
  assert.ok(far(body, index, parent) < rod * 0.05);
  assert.deepEqual(body.now.slice(index * 3, index * 3 + 3), body.before.slice(index * 3, index * 3 + 3));
  for (let i = 0; i < 400; i++) body = bodyStep(mesh, body, 16);
  assert.ok(bodyUnrest(mesh, body) < 0.02, `unrest ${bodyUnrest(mesh, body)}`);
  // The main claim has no claim to grow out of.
  const rest = bodyAtRest(mesh);
  assert.equal(bodyWithSprout(mesh, rest, 0), rest);
});

test('the box the turning tree stays in holds every point at every angle', () => {
  const mesh = buildMesh();
  const box = meshExtent(mesh);
  for (let angle = 0; angle < Math.PI * 2; angle += 0.05)
    for (const node of mesh.nodes) {
      const p = project(node, angle, 0, 0, 1);
      assert.ok(p.x >= box.left - 0.02 && p.x <= box.right + 0.02);
      assert.ok(p.y >= box.top - 0.02 && p.y <= box.bottom + 0.02);
    }
  assert.ok(box.right - box.left < 4 && box.bottom - box.top < 3);
});
