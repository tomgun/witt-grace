const {test} = require('node:test');
const assert=require('node:assert/strict');
const Core=require('../src/core.js');

function setup(){
  const p=Core.createBlankProject('decision');
  const root=Core.rootNode(p);
  const a=Core.addChild(p,root.id,'option',p.users[0].id);
  const b=Core.addChild(p,root.id,'option',p.users[0].id);
  return {p,a,b};
}
test('shared premise can be attached to two options, values stored once and locked in uses',()=>{
  const {p,a,b}=setup();
  const master=Core.addSharedReason(p,'Saamme yhteistä aikaa',80,5);
  const x=Core.attachSharedReason(p,master.id,a.id),y=Core.attachSharedReason(p,master.id,b.id);
  assert.notEqual(x.id,y.id);
  assert.equal(x.sharedReasonId,master.id);assert.equal(y.sharedReasonId,master.id);
  assert.equal(Core.evaluate(p).get(a.id).score,Core.evaluate(p).get(b.id).score);
  assert.throws(()=>Core.attachSharedReason(p,master.id,a.id),/jo liitetty/);
  assert.throws(()=>Core.addChild(p,x.id,'support'),/alisolmuja/);
  assert.throws(()=>Core.upsertVote(p,x.id,p.users[0].id,20),/lukittu/);
  assert.throws(()=>Core.upsertEdgeAssessment(p,'primary',x.id,p.users[0].id,1),/lukittu/);
  const personal=Core.evaluateAssessor(p,p.users[0].id);
  assert.equal(personal.get(a.id).incomplete,false);
  assert.equal(personal.get(b.id).incomplete,false);
  assert.equal(personal.get(a.id).contributions[0].shared,true);
  assert.ok(personal.get(a.id).score>50);
  Core.updateSharedReason(p,master.id,'Yhteinen aika',65,-2.5);
  for(const node of [x,y]){
    assert.equal(node.title,'Yhteinen aika');
    assert.equal(node.confidence,65);
    assert.equal(node.impact,2.5);
    assert.equal(node.relation,'oppose');
  }
  assert.ok(Core.evaluate(p).get(a.id).score<50);
  assert.throws(()=>Core.removeSharedReason(p,master.id),/Irrota/);
});
test('detach makes ordinary independent node and leaves other uses locked',()=>{
  const {p,a,b}=setup();
  const m=Core.addSharedReason(p,'Matkakulu',100,-3);
  const x=Core.attachSharedReason(p,m.id,a.id),y=Core.attachSharedReason(p,m.id,b.id);
  Core.detachSharedReason(p,x.id);
  assert.equal(x.sharedReasonId,undefined);
  assert.equal(x.confidence,100);
  Core.upsertVote(p,x.id,p.users[0].id,75);
  Core.upsertEdgeAssessment(p,'primary',x.id,p.users[0].id,-1);
  Core.updateSharedReason(p,m.id,'Matkakulut kasvavat',85,-5);
  assert.equal(x.title,'Matkakulu');assert.equal(y.title,'Matkakulut kasvavat');
  assert.equal(y.confidence,85);assert.equal(x.confidence,100);
  Core.detachSharedReason(p,y.id);Core.removeSharedReason(p,m.id);
  assert.deepEqual(p.sharedReasons,[]);
});
test('shared uses validate and roundtrip while rejecting tampered library and duplicate target',()=>{
  const {p,a,b}=setup();const m=Core.addSharedReason(p,'Yleinen kriteeri');
  Core.attachSharedReason(p,m.id,a.id);Core.attachSharedReason(p,m.id,b.id);
  const json=JSON.parse(JSON.stringify(p));
  assert.deepEqual(Core.validateProject(json),json);
  const tampered=structuredClone(json);tampered.nodes.find(n=>n.sharedReasonId).impact=0;
  assert.throws(()=>Core.validateProject(tampered),/lukitut arvot/);
  const duplicate=structuredClone(json);duplicate.nodes.find(n=>n.parentId===b.id).parentId=a.id;
  assert.throws(()=>Core.validateProject(duplicate),/kahdesti/);
  const missing=structuredClone(json);missing.sharedReasons=[];
  assert.throws(()=>Core.validateProject(missing),/liitos/);
  assert.throws(()=>Core.addSharedReason(p,'bad',110,1),/0–100/);
  assert.throws(()=>Core.addSharedReason(p,'bad',100,5.1),/0,5/);
});
test('shared use appears once per explicit parent and remains scored even when rendering hides it',()=>{
  const {p,a,b}=setup();const m=Core.addSharedReason(p,'Peruste');
  const s=Core.attachSharedReason(p,m.id,a.id);
  assert.equal(Core.evaluate(p).get(a.id).contributions.length,1);
  assert.equal(Core.evaluate(p).get(b.id).contributions.length,0);
  assert.equal(p.sharedReasons.length,1);
  Core.removeSubtree(p,s.id);
  assert.equal(Core.evaluate(p).get(a.id).contributions.length,0);
  assert.equal(p.sharedReasons.length,1);
});
test('reparenting cannot bypass unique shared use or move into decision root',()=>{
  const {p,a,b}=setup();const m=Core.addSharedReason(p,'Kuntoilu',90,4);
  const x=Core.attachSharedReason(p,m.id,a.id);
  assert.equal(Core.canReparent(p,x.id,Core.rootNode(p).id),false);
  const y=Core.attachSharedReason(p,m.id,b.id);
  assert.equal(Core.canReparent(p,x.id,b.id),false);
  assert.throws(()=>Core.moveNode(p,x.id,b.id),/virheellinen/);
  assert.equal(Core.canAddLink(p,x.id,b.id),false);
  assert.equal(Core.validateProject(JSON.parse(JSON.stringify(p))).nodes.length,5);
});
test('golden shared v1 scoring: explicit locked template is ONE primary contribution, not extra criterion points',()=>{
  const {p,a,b}=setup();
  const m=Core.addSharedReason(p,'Yleinen kriteeri',100,4);
  Core.attachSharedReason(p,m.id,a.id);
  const result=Core.evaluate(p).get(a.id);
  assert.ok(Math.abs(result.score-(50+5*4))<1e-9);
  assert.equal(result.contributions.length,1);
  assert.equal(Core.evaluate(p).get(b.id).score,50);
  assert.equal(Core.evaluateAssessor(p,p.users[0].id).get(a.id).score,result.score);
  Core.updateSharedReason(p,m.id,'Yleinen kriteeri',80,5);
  const next=Core.evaluate(p).get(a.id);
  assert.ok(Math.abs(next.score-70)<1e-9);
  assert.equal(next.contributions.length,1);
  assert.equal(p.votes.length,0);
});
