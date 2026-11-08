const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/view-layout.js');
const Core = require('../src/core.js');
function isOverlapping(a,b,w,h) { return a.x < b.x+w+10 && a.x+w+10>b.x && a.y<b.y+h+10 && a.y+h+10>b.y; }
test('horizontal/vertical view transforms are reversible',()=>{
  for (const point of [{x:64,y:90},{x:2000,y:1300},{x:-500,y:800}]) {
    const shown = L.viewPosition(point,'vertical');
    const roundtrip = L.documentPosition(shown,'vertical');
    assert.ok(Math.abs(roundtrip.x-point.x)<1e-9);
    assert.ok(Math.abs(roundtrip.y-point.y)<1e-9);
  }
});
test('four-way has one center, all four sectors and never mutates source',()=>{
  const p=Core.createBlankProject('argument');
  const root=p.nodes[0];
  for(let i=0;i<12;i++){
    const child=Core.addChild(p,root.id,i%2?'oppose':'support',p.users[0].id);
    for(let j=0;j<i%4+1;j++) Core.addChild(p,child.id,j%2?'oppose':'support',p.users[0].id);
  }
  const before=JSON.stringify(p);
  const a=L.fourWayProjection(p.nodes,root.id,252,154);
  const b=L.fourWayProjection(p.nodes,root.id,252,154);
  assert.equal(a.positions.size,p.nodes.length);
  assert.deepEqual([...a.positions],[...b.positions]);
  assert.equal(JSON.stringify(p),before);
  assert.deepEqual(new Set([...a.groups.values()]),new Set(['root','right','left','down','up']));
  for(let i=0;i<p.nodes.length;i++) for(let j=i+1;j<p.nodes.length;j++) {
    assert.ok(!isOverlapping(a.positions.get(p.nodes[i].id),a.positions.get(p.nodes[j].id),252,154),`overlap ${p.nodes[i].id} ${p.nodes[j].id}`);
  }
});
test('four-way layout handles one branch, deep branches, collapsed nodes and focus without data mutation',()=>{
  const p=Core.createBlankProject('argument'); const root=p.nodes[0];
  let last=root;
  for(let i=0;i<16;i++) last=Core.addChild(p,last.id,'oppose',p.users[0].id);
  p.nodes[1].collapsed=true;
  const before=JSON.stringify(p);
  const a=L.fourWayProjection(p.nodes,root.id,252,94);
  Core.focusProjection(p,root.id,'support');
  const b=L.fourWayProjection(p.nodes,root.id,252,94);
  assert.deepEqual([...a.positions],[...b.positions]);
  assert.equal(JSON.stringify(p),before);
  for(const n of p.nodes) assert.match(L.edgeGeometry(root,n,'four-way',252,94,a.positions),/^M /);
});
