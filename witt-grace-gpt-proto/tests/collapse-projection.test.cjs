const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/core.js');
const History = require('../src/history.js');

function fixture() {
  const p = Core.createBlankProject('argument');
  const a = Core.rootNode(p);
  const b = Core.addChild(p, a.id, 'oppose');
  const c = Core.addChild(p, b.id, 'oppose');
  const d = Core.addChild(p, a.id, 'support');
  return {p, a, b, c, d};
}

test('explicit collapse masks temporary focus peek without altering saved document', () => {
  const {p,a,b,c,d} = fixture();
  b.collapsed = true;
  const before = JSON.stringify(p);
  const focus = Core.focusProjection(p,a.id,'support');
  assert.ok(focus.visibleIds.has(c.id), 'focus deliberately peeks into collapsed branch');
  const masked = Core.respectExplicitCollapse(p,focus,new Set([b.id]));
  assert.ok(masked.visibleIds.has(b.id));
  assert.ok(!masked.visibleIds.has(c.id));
  assert.ok(masked.visibleIds.has(d.id), 'unrelated branch remains visible');
  assert.ok(!masked.nodes.some(n=>n.id===c.id));
  assert.ok(!masked.matchIds.has(c.id));
  assert.ok(!masked.peekIds.has(c.id));
  assert.equal(masked.matches, masked.matchIds.size);
  assert.equal(JSON.stringify(p), before, 'mask is view-only, no JSON mutation');
  assert.ok(focus.visibleIds.has(c.id), 'original focus projection was not mutated');
});

test('only collapsed explicit roots mask descendants; expanding re-enables focus peek', () => {
  const {p,a,b,c} = fixture();
  const projection = Core.focusProjection(p,a.id,'support');
  const open = Core.respectExplicitCollapse(p,projection,new Set([b.id]));
  assert.deepEqual([...open.visibleIds],[...projection.visibleIds]);
  b.collapsed = true;
  const closed = Core.respectExplicitCollapse(p, Core.focusProjection(p,a.id,'support'),new Set([b.id]));
  assert.ok(!closed.visibleIds.has(c.id));
  b.collapsed = false;
  const reopened = Core.respectExplicitCollapse(p,Core.focusProjection(p,a.id,'support'),new Set([b.id]));
  assert.ok(reopened.visibleIds.has(c.id));
});

test('undo/redo snapshots retain explicit visual close state without exporting it', () => {
  const {p,a,b,c} = fixture();
  const history = History.createHistory();
  const before = History.snapshot(p, {}, new Set());
  b.collapsed = true;
  const closed = History.snapshot(p, {}, new Set([b.id]));
  history.record(before,closed);
  const undo = History.unpack(history.undo(closed));
  assert.equal(undo.project.nodes.find(n=>n.id===b.id).collapsed,false);
  assert.deepEqual(undo.explicitlyClosedIds,[]);
  const redo = History.unpack(history.redo(JSON.stringify(undo)));
  assert.equal(redo.project.nodes.find(n=>n.id===b.id).collapsed,true);
  assert.deepEqual(redo.explicitlyClosedIds,[b.id]);
  const visible = Core.respectExplicitCollapse(redo.project,Core.focusProjection(redo.project,a.id,'support'),new Set(redo.explicitlyClosedIds));
  assert.ok(!visible.visibleIds.has(c.id));
  assert.ok(!('explicitlyClosedIds' in p), 'transient preference never reaches document format');
});
