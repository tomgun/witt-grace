// must: the domain's layout and keyboard-navigation ports produce exactly what the frozen prototype's
//       `src/view-layout.js` and `src/keyboard-nav.js` produce, for every prototype example, every orientation,
//       both card heights, the compact and depth projections, edge paths, secondary-link paths and every nav key
// test: tests/unit/layout-parity.test.ts (requires the prototype modules directly; they are CommonJS/UMD)
// red-against: a constant changed in the port (step sizes, bends, lane maths), a sort tie-break reversed,
//              a cardinal bucket order changed, a nav key mapped to the wrong tree direction
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as Layout from '../../src/domain/layout.ts';
import * as Nav from '../../src/domain/navigation.ts';
import { depthProjection } from '../../src/domain/layout.ts';

const require = createRequire(import.meta.url);
const protoDir = path.join(process.cwd(), 'witt-grace-gpt-proto');
const ProtoLayout = require(path.join(protoDir, 'src', 'view-layout.js'));
const ProtoNav = require(path.join(protoDir, 'src', 'keyboard-nav.js'));

interface RawNode {
  id: string;
  parentId: string | null;
  position: { x: number; y: number };
  collapsed?: boolean;
}
const examples = readdirSync(path.join(protoDir, 'examples'))
  .filter((f) => f.endsWith('.witt.json') && !f.startsWith('ai-draft'))
  .map((f) => {
    const doc = JSON.parse(readFileSync(path.join(protoDir, 'examples', f), 'utf8')) as { nodes: RawNode[] };
    return { name: f, nodes: doc.nodes.map((n) => ({ ...n })) };
  });
const rootOf = (nodes: RawNode[]) => nodes.find((n) => n.parentId === null)!.id;
const mapEntries = (m: Map<string, unknown>) => [...m.entries()];

test('viewPosition and documentPosition match the prototype and invert each other', () => {
  for (const { nodes } of examples)
    for (const node of nodes)
      for (const orientation of Layout.ORIENTATIONS) {
        const ours = Layout.viewPosition(node.position, orientation);
        assert.deepEqual(ours, ProtoLayout.viewPosition(node.position, orientation));
        assert.deepEqual(
          Layout.documentPosition(ours, orientation),
          ProtoLayout.documentPosition(ours, orientation)
        );
      }
});

test('fourWayProjection matches the prototype for every example and both card heights', () => {
  for (const { name, nodes } of examples)
    for (const h of [94, 154, 176]) {
      const ours = Layout.fourWayProjection(nodes, rootOf(nodes), 252, h);
      const theirs = ProtoLayout.fourWayProjection(nodes, rootOf(nodes), 252, h);
      assert.deepEqual(mapEntries(ours.positions), mapEntries(theirs.positions), `${name} h=${h} positions`);
      assert.deepEqual(mapEntries(ours.groups), mapEntries(theirs.groups), `${name} h=${h} groups`);
      const dirs = Layout.fourWayVisualDirections(nodes, rootOf(nodes), ours.positions);
      assert.deepEqual(
        mapEntries(dirs),
        mapEntries(ProtoLayout.fourWayVisualDirections(nodes, rootOf(nodes), theirs.positions))
      );
    }
});

test('compactVisibleProjection and depthProjection match the prototype', () => {
  for (const { name, nodes } of examples) {
    const all = new Set(nodes.map((n) => n.id));
    const half = new Set(nodes.filter((_, i) => i % 2 === 0 || nodes[i]!.parentId === null).map((n) => n.id));
    for (const visible of [all, half])
      for (const orientation of Layout.ORIENTATIONS)
        for (const h of [94, 154, 176]) {
          const ours = Layout.compactVisibleProjection(nodes, visible, orientation, 252, h);
          const theirs = ProtoLayout.compactVisibleProjection(nodes, visible, orientation, 252, h);
          assert.deepEqual(
            mapEntries(ours.positions),
            mapEntries(theirs.positions),
            `${name} ${orientation} ${h}`
          );
        }
    const maxDepth = Layout.maxTreeDepth(nodes);
    assert.equal(maxDepth, ProtoLayout.maxTreeDepth(nodes));
    for (let limit = 0; limit <= maxDepth; limit++) {
      const overrides = new Map<string, boolean>([[nodes[1]?.id ?? '', limit % 2 === 0]]);
      const ours = depthProjection(nodes, limit, overrides);
      const theirs = ProtoLayout.depthProjection(nodes, limit, overrides);
      assert.deepEqual([...ours.visibleIds], [...theirs.visibleIds], `${name} depth ${limit}`);
      assert.deepEqual([...ours.collapsedIds], [...theirs.collapsedIds]);
      assert.equal(ours.maxDepth, theirs.maxDepth);
    }
  }
});

test('edgeGeometry and secondaryLinkPath match the prototype for every parent/child pair', () => {
  for (const { nodes } of examples) {
    const root = rootOf(nodes);
    const four = Layout.fourWayProjection(nodes, root);
    for (const child of nodes) {
      const parent = nodes.find((n) => n.id === child.parentId);
      if (!parent) continue;
      for (const orientation of Layout.ORIENTATIONS)
        for (const h of [94, 154, 176]) {
          const positions = orientation === 'four-way' ? four.positions : undefined;
          const groups = orientation === 'four-way' ? four.groups : undefined;
          assert.equal(
            Layout.edgeGeometry(parent, child, orientation, 252, h, positions, groups),
            ProtoLayout.edgeGeometry(parent, child, orientation, 252, h, positions, groups)
          );
        }
      assert.equal(
        Layout.secondaryLinkPath(parent.position, child.position),
        ProtoLayout.secondaryLinkPath(parent.position, child.position)
      );
      assert.equal(
        Layout.secondaryLinkPath(child.position, parent.position, 252, 176),
        ProtoLayout.secondaryLinkPath(child.position, parent.position, 252, 176)
      );
    }
  }
});

test('stableFourWayAddition matches the prototype', () => {
  for (const { nodes } of examples) {
    const root = rootOf(nodes);
    const base = Layout.fourWayProjection(nodes, root);
    const dirs = Layout.fourWayVisualDirections(nodes, root, base.positions);
    for (const parent of nodes.slice(0, 4)) {
      const added = [...nodes, { id: 'new-node', parentId: parent.id, position: { x: 0, y: 0 } }];
      const baseline = Layout.fourWayProjection(added, root).positions;
      const ours = Layout.stableFourWayAddition(added, base.positions, dirs, baseline, parent.id, 'new-node');
      const theirs = ProtoLayout.stableFourWayAddition(
        added,
        base.positions,
        dirs,
        baseline,
        parent.id,
        'new-node'
      );
      assert.deepEqual(mapEntries(ours), mapEntries(theirs));
    }
  }
});

test('navigate matches the prototype for every node, key and orientation', () => {
  for (const { nodes } of examples) {
    const root = rootOf(nodes);
    const visible = new Set(nodes.map((n) => n.id));
    const positions = Layout.fourWayProjection(nodes, root).positions;
    for (const node of nodes)
      for (const key of [...Nav.NAV_KEYS, 'Tab'])
        for (const orientation of Layout.ORIENTATIONS) {
          assert.deepEqual(
            Nav.navigate(nodes, root, visible, node.id, key, orientation, positions),
            ProtoNav.navigate(nodes, root, visible, node.id, key, orientation, positions),
            `${node.id} ${key} ${orientation}`
          );
        }
    assert.deepEqual(Nav.visibleOrder(nodes, root, visible), ProtoNav.visibleOrder(nodes, root, visible));
  }
});
