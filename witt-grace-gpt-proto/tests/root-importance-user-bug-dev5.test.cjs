'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
const fs=require('node:fs');
const path=require('node:path');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const example=()=>{const p=structuredClone(require('../examples/debate-painonhallinta.witt.json'));p.settings.assessmentWeighting='structural';return p;};
function brute(p,nodeId,targetId,personalId=null){
  const base=personalId?C.evaluateAssessor(p,personalId).get(targetId).score:C.evaluate(p).get(targetId).score;
  const copy=structuredClone(p),node=copy.nodes.find(n=>n.id===nodeId);
  if(personalId){const rating=copy.edgeAssessments.find(a=>a.subjectType==='primary'&&a.subjectId===node.id&&a.userId===personalId);rating.influence=0;}
  else if(node)node.impact=0;
  else {const link=copy.links.find(l=>l.id===nodeId);if(!link)throw Error('unknown relationship');link.impact=0;}
  const without=personalId?C.evaluateAssessor(copy,personalId).get(targetId).score:C.evaluate(copy).get(targetId).score;
  return {base,without,delta:base-without};
}
test('painonhallinta: deep Mieluisa-liikunta claim must not be highlighted as a top-20 root reason at high credibility',()=>{
  const p=example(), target=C.rootNode(p);
  const child=p.nodes.find(n=>n.title==='Mieluisa liikunta voi jatkua vuosia');
  assert.ok(child);
  for(const vote of p.votes.filter(v=>v.nodeId===child.id))vote.confidence=100;
  const local=C.marginalIndexEffects(p,C.evaluate(p)).get(child.id);
  const effects=C.marginalTargetEffects(p,C.evaluate(p));
  const effect=effects.get(child.id);
  assert.equal(effect.targetId,target.id);
  assert.ok(local.magnitude>10,'strong local counterclaim');
  assert.ok(effect.magnitude<4,'small root effect despite large local effect');
  near(effect.localDelta,local.delta);
  const exact=brute(p,child.id,target.id);
  near(effect.delta,exact.delta);
  near(effect.targetWithoutScore,exact.without);
  const candidates=[...effects.values()].filter(e=>e.magnitude>1e-9).sort((a,b)=>b.magnitude-a.magnitude||a.childId.localeCompare(b.childId));
  const highlighted=candidates.slice(0,Math.ceil(candidates.length*.2));
  assert.equal(highlighted.some(e=>e.childId===child.id),false,'no misleading top-20 global highlight');
  assert.ok(highlighted.some(e=>p.nodes.find(n=>n.id===e.childId)?.parentId===target.id),'direct top-level reasons dominate at the saturated decision');
});
test('root effect matches full reevaluation for every nested reason in the weight-loss example',()=>{
 const p=example(),target=C.rootNode(p),original=JSON.stringify(p);
 const effects=C.marginalTargetEffects(p,C.evaluate(p));
 for(const [id,e] of effects){
  assert.equal(e.targetId,target.id);
  const exact=brute(p,id,target.id);
  near(e.delta,exact.delta);near(e.targetWithoutScore,exact.without);
 }
 assert.equal(JSON.stringify(p),original,'analysis must not mutate project');
});
test('personal influence reversed, missing score and neutral ratings cannot be silently substituted',()=>{
 const p=C.createBlankProject('argument'),root=C.rootNode(p),u=p.users[0];
 const n=C.addChild(p,root.id,'support',u.id);n.confidence=90;
 const grandchild=C.addChild(p,n.id,'oppose',u.id);grandchild.confidence=100;
 for(const node of p.nodes)C.upsertVote(p,node.id,u.id,80);
 C.upsertEdgeAssessment(p,'primary',n.id,u.id,-4);
 C.upsertEdgeAssessment(p,'primary',grandchild.id,u.id,-5);
 const effects=C.marginalTargetEffects(p,C.evaluateAssessor(p,u.id));
 const effect=effects.get(grandchild.id);
 assert.equal(effect.targetId,root.id);
 near(effect.delta,brute(p,grandchild.id,root.id,u.id).delta);
 assert.ok(effect.delta>0,'opposing an opposing claim supports the root');
 // All missing: an incomplete private index cannot become a collective score.
 p.votes=p.votes.filter(v=>v.nodeId!==root.id);
 assert.equal(C.marginalTargetEffects(p,C.evaluateAssessor(p,u.id)).has(grandchild.id),true,'the root still derives from reviewed reasons');
 p.votes=p.votes.filter(v=>v.nodeId!==n.id);
 assert.equal(C.marginalTargetEffects(p,C.evaluateAssessor(p,u.id)).has(grandchild.id),false,'a missing intermediate premise blocks propagation');
});
test('decision alternatives do not affect decision-root index; values and gates never become global arguments',()=>{
 const p=C.createDemoProject(),e=C.marginalTargetEffects(p,C.evaluate(p));
 const optionIds=new Set(p.nodes.filter(n=>n.kind==='option').map(n=>n.id));
 for(const item of e.values()) assert.ok(optionIds.has(item.targetId),'target is its decision option');
 const root=C.rootNode(p),gate=C.addChild(p,p.nodes.find(n=>n.kind==='option').id,'support');gate.semanticType='constraint';
 const underGate=C.addChild(p,gate.id,'support');underGate.confidence=100;underGate.impact=5;
 const value=C.addChild(p,root.id,'support');value.semanticType='value';
 const underValue=C.addChild(p,value.id,'support');underValue.confidence=100;
 const after=C.marginalTargetEffects(p,C.evaluate(p));
 assert.equal(after.has(gate.id),false);assert.equal(after.has(underGate.id),false);
 assert.equal(after.has(value.id),false);assert.equal(after.has(underValue.id),false);
});
test('the UI uses root/option contribution and distinguishes local explanation',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 assert.match(src,/Core\.marginalTargetEffects\(project, evaluated, localEffects\)/);
 assert.match(src,/localDelta/);
 assert.match(src,/importanceTargetWhatIf/);
 const i18n=require('../src/i18n.js');
 for(const lang of i18n.languages)for(const key of ['importanceTargetChange','importanceTargetWhatIf','importanceTargetExplanation'])assert.ok(i18n.messages[lang][key]);
});
