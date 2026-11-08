'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../src/core.js');
const near=(got,expected,label='')=>assert.ok(Math.abs(got-expected)<1e-9,`${label} actual ${got}, expected ${expected}`);
const factor=score=>Math.max(0,Math.min(1,score/100));
const result=(base,pro,con=0)=>Math.max(0,Math.min(100,base+5*(pro-con)));
function tree() {
  const p=C.createBlankProject('decision'),root=C.rootNode(p);
  root.title='Minne menemme?';
  const a=C.addChild(p,root.id,'option',p.users[0].id);a.title='Uimahalli';
  const b=C.addChild(p,root.id,'option',p.users[0].id);b.title='Kotona';
  const r=C.addChild(p,a.id,'support',p.users[0].id);r.title='Uiminen tekee hyvää';
  const leaf=C.addChild(p,r.id,'support',p.users[0].id);leaf.title='Liike helpottaa oloa';
  const n=C.addChild(p,a.id,'oppose',p.users[0].id);n.title='Voi väsyttää';
  p.users[0].shares=5;p.users[0].name='Omistaja';
  for(let i=0;i<3;i++)p.users.push({id:`employee${i+1}`,name:`Työntekijä ${i+1}`,role:'editor',shares:1});
  const ids=p.users.map(u=>u.id);
  for(let i=0;i<4;i++) {
    for(const [node,conf] of [[r,i===0?90:50],[leaf,i===0?90:70],[n,i===0?50:50]])C.upsertVote(p,node.id,ids[i],conf);
    C.upsertEdgeAssessment(p,'primary',r.id,ids[i],i===0?5:1);
    C.upsertEdgeAssessment(p,'primary',leaf.id,ids[i],i===0?4:2);
    C.upsertEdgeAssessment(p,'primary',n.id,ids[i],i===0?-1:-1);
  }
  return {p,root,a,b,r,leaf,n,ids};
}
test('dev20: structural, equal-person, and weighted-person score modes are independent with equal consensus as default',()=>{
 const {p,a,leaf,ids}=tree();
 assert.equal(C.assessmentWeighting(p),'equal');
 p.settings.assessmentWeighting='structural';const original=C.evaluate(p).get(a.id).score;
 p.settings.assessmentWeighting='equal';
 const equal=C.evaluate(p).get(a.id).score;
 p.settings.assessmentWeighting='shares';
 const shares=C.evaluate(p).get(a.id).score;
 assert.ok(shares>equal,`owner positive opinions should count 5/8 instead of 1/4: ${shares} / ${equal}`);
 assert.notEqual(shares,original);
 const personal=C.evaluateAssessor(p,ids[0]).get(a.id).score;
 p.settings.voteWeighting='shares';
 near(C.evaluate(p).get(a.id).score,shares,'voting mode does not control assessment weighting');
 near(C.evaluateAssessor(p,ids[0]).get(a.id).score,personal,'personal score is not collective mode');
 assert.deepEqual(C.validateProject(structuredClone(p)),p,'new optional mode round trips');
});
test('dev20: exact leaf -> middle reason -> option propagation in both human modes',()=>{
 const {p,a,r,leaf,n}=tree();
 for(const mode of ['equal','shares']) {
   p.settings.assessmentWeighting=mode;
   const w=mode==='shares'?8:4;
   const ownerWeight=mode==='shares'?5:1;
   const otherWeight=w-ownerWeight;
   const leafBase=(ownerWeight*90+otherWeight*70)/w;
   const middleBase=(ownerWeight*90+otherWeight*50)/w;
   const leafInfluence=(ownerWeight*4+otherWeight*2)/w;
   const middleInfluence=(ownerWeight*5+otherWeight*1)/w;
   const negativeInfluence=-1;
   const middleScore=result(middleBase,leafInfluence*factor(leafBase));
   const positive=middleInfluence*factor(middleScore);
   const negative=-negativeInfluence*factor(50);
   const optionScore=result(50,positive,negative);
   const calculated=C.evaluate(p);
   near(calculated.get(leaf.id).score,leafBase,`${mode}: leaf credibility`);
   near(calculated.get(r.id).score,middleScore,`${mode}: propagated middle`);
   near(calculated.get(a.id).score,optionScore,`${mode}: propagated option`);
   near(calculated.get(a.id).positive,positive,`${mode}: parent contribution uses middle result`);
   assert.equal(calculated.get(a.id).incomplete,false);
   near(calculated.get(r.id).totalPower,w);
   near(C.getBaseConfidence(p,r).base,middleBase);
 }
});
test('dev20: altering a grandchild rating changes both ancestors but not sibling options',()=>{
 const {p,a,b,r,leaf,ids}=tree();p.settings.assessmentWeighting='shares';
 const before=C.evaluate(p);
 const oldMid=before.get(r.id).score,oldTop=before.get(a.id).score;
 const sibling=before.get(b.id).score;
 C.upsertVote(p,leaf.id,ids[0],0);
 const after=C.evaluate(p);
 assert.ok(after.get(leaf.id).score<before.get(leaf.id).score);
 assert.ok(after.get(r.id).score<oldMid);
 assert.ok(after.get(a.id).score<oldTop);
 near(after.get(b.id).score,sibling);
});
test('dev20: signed influence ratings propagate, structural direction is not an override',()=>{
 const {p,a,r,ids}=tree();p.settings.assessmentWeighting='shares';
 const before=C.evaluate(p).get(a.id).score;
 for(const id of ids)C.upsertEdgeAssessment(p,'primary',r.id,id,-5);
 const after=C.evaluate(p).get(a.id);
 assert.ok(after.score<before);
 assert.ok(after.negative>after.positive);
 assert.equal(after.contributions.find(v=>v.id===r.id).impact,-5);
 assert.equal(r.relation,'support',"an assessor can disagree with author's structural sign");
});
test('dev20: weighted opposite signs do not cancel if shares differ',()=>{
 const {p,a,r,ids}=tree();p.settings.assessmentWeighting='shares';
 C.upsertEdgeAssessment(p,'primary',r.id,ids[0],5);
 for(const id of ids.slice(1))C.upsertEdgeAssessment(p,'primary',r.id,id,-5);
 const result=C.evaluate(p).get(a.id);
 near(result.contributions.find(c=>c.id===r.id).impact,(25-15)/8);
 assert.equal(C.influenceSummary(p,'primary',r.id).status,'contradictory');
});
test('dev20: missing individual or stale reviews produce provisional results, not zeros',()=>{
 const {p,a,r,ids}=tree();p.settings.assessmentWeighting='shares';
 p.votes=p.votes.filter(v=>!(v.userId===ids[1]&&v.nodeId===r.id));
 const partial=C.evaluate(p).get(a.id);
 assert.equal(partial.incomplete,true);
 assert.ok(Number.isFinite(partial.score));
 C.upsertVote(p,r.id,ids[1],50);
 assert.equal(C.evaluate(p).get(a.id).incomplete,false);
 // Modify the premise text after rating: the relationship review becomes stale.
 r.title+=' (tarkennettu)';
 const stale=C.evaluate(p).get(a.id);
 assert.equal(stale.incomplete,true);
 assert.equal(stale.contributions.find(v=>v.id===r.id).missing,true);
 assert.equal(stale.contributions.find(v=>v.id===r.id).magnitude,null);
 assert.equal(stale.positive,0,'stale influence is not replaced by authored magnitude');
});
test('dev20: no human assessments yields null claim result and provisional option without a synthetic score',()=>{
 const p=C.createBlankProject('decision'),o=C.addChild(p,p.nodes[0].id,'option',p.users[0].id),c=C.addChild(p,o.id,'support',p.users[0].id);
 p.settings.assessmentWeighting='equal';
 const computed=C.evaluate(p);
 assert.equal(computed.get(c.id).score,null);
 assert.equal(computed.get(o.id).score,50);
 assert.equal(computed.get(o.id).incomplete,true);
 assert.equal(computed.get(o.id).contributions[0].missing,true);
 assert.equal(C.getBaseConfidence(p,c).base,null);
});
test('dev20: zero-share reviewers excluded from weighted inputs but included in equal mode; AI excluded from both',()=>{
 const {p,r,ids}=tree();p.users[1].shares=0;
 p.users.push({id:'ai',name:'AI',role:'editor',profileKind:'ai',shares:1e9});
 C.upsertVote(p,r.id,'ai',0);
 C.upsertEdgeAssessment(p,'primary',r.id,'ai',-5);
 p.settings.assessmentWeighting='shares';
 const weighted=C.getBaseConfidence(p,r);
 near(weighted.base,(5*90+2*50)/7);
 assert.equal(weighted.votesCount,3);
 assert.equal(C.evaluate(p).get(r.id).incomplete,false);
 p.settings.assessmentWeighting='equal';
 near(C.getBaseConfidence(p,r).base,60);
 assert.equal(C.getBaseConfidence(p,r).votesCount,4);
});
test('dev20: changing voting ballots cannot change collective evaluation; voting weights remain frozen',()=>{
 const {p,a,b,ids}=tree();p.settings.assessmentWeighting='shares';p.settings.voteWeighting='shares';
 const before=C.evaluate(p).get(a.id).score;
 const round=C.startVotingRound(p);
 near(round.weightByUser[ids[0]],5);
 C.upsertBallot(p,a.id,ids[0],10);
 C.upsertBallot(p,a.id,ids[1],90);
 near(C.optionPreference(p,a.id).preferenceScore,(5*10+90)/6);
 near(C.evaluate(p).get(a.id).score,before);
 near(C.optionPreference(p,b.id).preferenceScore??-1,-1);
 p.users[0].shares=2;
 near(C.optionPreference(p,a.id).preferenceScore,(5*10+90)/6,'snapshot frozen');
 assert.notEqual(C.evaluate(p).get(a.id).score,before,'live document review weighting changes when assessor shares change');
});
test('dev20: both assessment modes retain one option per group and do not invent a group index',()=>{
 const {p,root,a}=tree();p.settings.assessmentWeighting='shares';
 const group=C.addChild(p,root.id,'group',p.users[0].id);
 C.moveNode(p,a.id,group.id);
 const scores=C.evaluate(p);
 assert.equal(scores.get(group.id).score,null);
 assert.ok(Number.isFinite(scores.get(a.id).score));
 assert.equal(C.decisionRanking(p).length,2);
});
test('dev20: v6 requires explicit collective mode and rejects v5 rather than silently changing its meaning',()=>{
 const p=C.createBlankProject('argument');
 assert.equal(p.schemaVersion,8);
 assert.equal(C.assessmentWeighting(p),'equal');
 const old=structuredClone(p);old.schemaVersion=6;
 assert.throws(()=>C.validateProject(old),/formaattiversio/);
 const invalid=structuredClone(p);delete invalid.settings.assessmentWeighting;
 assert.throws(()=>C.validateProject(invalid),/laskenta-asetukset/);
 assert.deepEqual(C.validateProject(structuredClone(p)),p);
});
test('dev20: UI exposes per-document collective mode, distinguish result from leaf credence, and shows option review before ballot',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
 const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 const locales=fs.readFileSync(path.resolve(__dirname,'../locales/messages.psv'),'utf8');
 assert.match(html,/id="assessmentWeighting"/);
 assert.match(html,/value="structural"/);
 assert.match(html,/value="equal"/);
 assert.match(html,/value="shares"/);
 assert.match(app,/function derivedResult\(/);
 assert.match(app,/vote-argument-result/);
 assert.match(locales,/tableColIndex\|Perustelutulos/);
 assert.match(locales,/resultNotDerived\|/);
});

test('dev20: new projects calculate from human ratings by default, with no authored fallback',()=>{
 const p=C.createBlankProject('decision'),o=C.addChild(p,p.nodes[0].id,'option',p.users[0].id);
 const n=C.addChild(p,o.id,'support',p.users[0].id);n.confidence=100;n.impact=5;
 assert.equal(p.settings.assessmentWeighting,'equal');
 assert.equal(C.getBaseConfidence(p,n).base,null);
 assert.equal(C.evaluate(p).get(n.id).score,null);
 assert.equal(C.evaluate(p).get(o.id).contributions[0].missing,true);
 assert.equal(C.evaluate(p).get(o.id).incomplete,true);
});
