const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Core=require('../src/core.js');

function claimGraph(){
  const p=Core.createBlankProject('argument');
  const root=Core.rootNode(p);
  const child=Core.addChild(p,root.id,'support',p.users[0].id);
  child.title='Päätöstä koskeva peruste';
  Core.upsertVote(p,child.id,p.users[0].id,100);
  return {p,root,child,owner:p.users[0]};
}

test('dev27: a negative personal effect changes displayed direction without changing authored +/- template',()=>{
  const {p,root,child,owner}=claimGraph();
  Core.upsertEdgeAssessment(p,'primary',child.id,owner.id,-3.5);
  const personal=Core.personalInfluence(p,'primary',child.id,owner.id);
  assert.ok(personal.current);
  assert.equal(personal.record.influence,-3.5);
  assert.equal(child.relation,'support');
  assert.equal(Core.directionFromInfluence(personal.record.influence,child.relation),'oppose');
  assert.equal(Core.argumentBalance(Core.evaluate(p).get(root.id).score),-35);
  Core.upsertEdgeAssessment(p,'primary',child.id,owner.id,0);
  assert.equal(Core.directionFromInfluence(Core.personalInfluence(p,'primary',child.id,owner.id).record.influence,child.relation),'neutral');
  assert.equal(Core.argumentBalance(Core.evaluate(p).get(root.id).score),0);
  Core.upsertEdgeAssessment(p,'primary',child.id,owner.id,4);
  assert.equal(Core.directionFromInfluence(Core.personalInfluence(p,'primary',child.id,owner.id).record.influence,child.relation),'support');
  assert.equal(Core.argumentBalance(Core.evaluate(p).get(root.id).score),40);
  assert.equal(child.relation,'support','template remains untouched in every case');
});

test('dev27: two users may give opposite signs to same primary edge, shared average neutral is not a changed graph',()=>{
  const {p,child,owner}=claimGraph();
  const other={id:Core.uid(),name:'Toinen',role:'editor',shares:1};p.users.push(other);
  Core.upsertVote(p,child.id,other.id,100);
  Core.upsertEdgeAssessment(p,'primary',child.id,owner.id,-5);
  Core.upsertEdgeAssessment(p,'primary',child.id,other.id,5);
  const summary=Core.influenceSummary(p,'primary',child.id);
  assert.equal(summary.mean,0);assert.equal(summary.signConflict,true);
  assert.equal(Core.directionFromInfluence(summary.mean,child.relation),'neutral');
  assert.equal(Core.personalInfluence(p,'primary',child.id,owner.id).record.influence,-5);
  assert.equal(Core.personalInfluence(p,'primary',child.id,other.id).record.influence,5);
  assert.equal(child.relation,'support');
  assert.deepEqual(Core.validateProject(p).edgeAssessments,p.edgeAssessments);
});

test('dev27: direction classifier falls back only for absent assessments, never for zero',()=>{
  assert.equal(Core.directionFromInfluence(null,'support'),'support');
  assert.equal(Core.directionFromInfluence(undefined,'oppose'),'oppose');
  assert.equal(Core.directionFromInfluence(0,'support'),'neutral');
  assert.equal(Core.directionFromInfluence(-0.5,'support'),'oppose');
  assert.equal(Core.directionFromInfluence(5,'oppose'),'support');
});

test('dev27: new menus, hidden/movable dock, signed primary labels and user naming are connected',()=>{
  const root=path.resolve(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'src/styles.css'),'utf8');
  assert.match(html,/id="helpMenu"[\s\S]*?id="btnDemo"[\s\S]*?id="btnTutorial"/);
  assert.match(html,/id="newWorkDialog"/);
  assert.match(html,/id="btnAIFlowPrompt"/);
  assert.match(html,/id="btnAIFlowImport"/);
  assert.match(html,/id="btnDockClose"/);
  assert.match(html,/id="currentUserName"/);
  assert.match(html,/id="repeatMultiCards"/);
  assert.match(app,/const direction=displayedPrimaryRelation\(node\)/);
  assert.match(app,/const effective=shownInfluence\(node\)/);
  assert.match(app,/t\('relationEffective'/);
  assert.match(app,/camera\.scale\*\(\(event\.key==='\+'/);
  assert.match(css,/#viewDock\[hidden\]/);
  assert.doesNotMatch(css,/\.view-dock\.is-collapsed #btnDockClose\{display:none/);
});
