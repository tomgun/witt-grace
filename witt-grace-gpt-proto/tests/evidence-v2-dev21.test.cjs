'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../src/core.js');
const eq=(actual,expected,label='')=>assert.ok(Math.abs(actual-expected)<1e-8,`${label}: ${actual} !== ${expected}`);
const A=(p,n,confidence,influence=null,id=p.users[0].id)=>{
 C.upsertVote(p,n.id,id,confidence);
 if(influence!==null)C.upsertEdgeAssessment(p,'primary',n.id,id,influence);
};
const fixture=(mode='structural')=>{
 const p=C.createBlankProject('decision');p.settings.assessmentWeighting=mode;
 const root=p.nodes[0];const o=C.addChild(p,root.id,'option',p.users[0].id);
 o.title='Tutkittava vaihtoehto';return {p,o,root};
};
const add=(p, parent, relation='support', belief=100, influence=5)=>{
 const n=C.addChild(p,parent.id,relation,p.users[0].id);
 n.title='Puolto tai vastaväite '+p.nodes.length;
 n.confidence=belief;n.impact=Math.abs(influence);
 n.relation=influence>0?'support':influence<0?'oppose':'neutral';
 if(p.settings.assessmentWeighting!=='structural')A(p,n,belief,influence);
 return n;
};

test('v2: option uses 50 reference; one perfect +5 support yields 75, two yield 100, and extra supports cannot overflow',()=>{
 const {p,o}=fixture();
 eq(C.evaluate(p).get(o.id).score,50);
 add(p,o,'support',100,5);eq(C.evaluate(p).get(o.id).score,75);
 add(p,o,'support',100,5);eq(C.evaluate(p).get(o.id).score,100);
 add(p,o,'support',100,5);eq(C.evaluate(p).get(o.id).score,100);
 assert.equal(C.evaluate(p).get(o.id).positive,15);
});
test('v2: 50%, 20%, 0% claim credibility means respectively half, fifth, zero of the rated impact',()=>{
 for(const [pcent,expected] of [[100,75],[50,62.5],[20,55],[0,50]]){
  const {p,o}=fixture();add(p,o,'support',pcent,5);
  eq(C.evaluate(p).get(o.id).score,expected,`${pcent}%`);
 }
});
test('v2: exact option grandchild effect is propagated through the child, not separately added to the option',()=>{
 const {p,o}=fixture();const child=add(p,o,'support',50,5);
 const leaf=add(p,child,'support',100,5);
 const get=()=>C.evaluate(p);
 eq(get().get(leaf.id).score,100);
 eq(get().get(child.id).base,50);
 eq(get().get(child.id).score,75);
 eq(get().get(o.id).score,68.75); // 50 + 5 * (5 * 0.75)
 assert.equal(get().get(o.id).contributions.length,1,'the grandchild must not be added again to the option');
 const before=get();leaf.confidence=0;
 eq(get().get(child.id).score,50);
 eq(get().get(o.id).score,62.5);
 assert.ok(before.get(o.id).score>get().get(o.id).score);
});
test('v2: grandchild influence rating affects child and option, and negative rebuttals flip the upstream direction',()=>{
 const {p,o}=fixture('equal');const parent=add(p,o,'oppose',50,-5),leaf=add(p,parent,'support',100,5);
 const get=()=>C.evaluate(p);
 eq(get().get(parent.id).score,75);
 eq(get().get(o.id).score,31.25);
 C.upsertEdgeAssessment(p,'primary',leaf.id,p.users[0].id,-5);
 eq(get().get(parent.id).score,25);
 eq(get().get(o.id).score,43.75);
 C.upsertVote(p,leaf.id,p.users[0].id,0);
 eq(get().get(parent.id).score,50);
 eq(get().get(o.id).score,37.5);
});
test('v2: equal and share-weighted review use both credence and impact, not structural values or ballot shares',()=>{
 const {p,o}=fixture('equal');const reason=add(p,o,'support',80,5);
 p.users[0].shares=5;
 for(let i=1;i<=3;i++){
  const id='u'+i;p.users.push({id,name:'Other '+i,role:'editor',shares:1});
  A(p,reason,20,1,id);
 }
 p.settings.voteWeighting='shares';
 eq(C.evaluate(p).get(reason.id).score,35);
 eq(C.evaluate(p).get(o.id).score,50+5*(2*.35));
 p.settings.assessmentWeighting='shares';
 const base=(5*80+3*20)/8,impact=(5*5+3*1)/8;
 eq(C.evaluate(p).get(reason.id).score,base);
 eq(C.evaluate(p).get(o.id).score,50+5*(impact*base/100));
 eq(C.evaluate(p).get(o.id).contributions[0].impact,impact);
 C.addChild(p,p.nodes[0].id,'option',p.users[0].id);
 C.startVotingRound(p);C.upsertBallot(p,o.id,p.users[0].id,0);
 eq(C.evaluate(p).get(o.id).score,50+5*(impact*base/100));
});
test('v2: strong support and opposition cancel exactly, subject to final bounds',()=>{
 const {p,o}=fixture();add(p,o,'support',100,5);add(p,o,'oppose',100,-5);
 eq(C.evaluate(p).get(o.id).score,50);
 for(let i=0;i<3;i++)add(p,o,'oppose',100,-5);
 eq(C.evaluate(p).get(o.id).score,0);
});
test('v2: exact target-level leave-one-out effect through nested ancestors equals brute-force re-evaluation',()=>{
 const {p,o}=fixture();const a=add(p,o,'support',50,5),b=add(p,a,'support',50,4),leaf=add(p,b,'support',100,5);
 const initial=C.evaluate(p),local=C.marginalIndexEffects(p,initial),global=C.marginalTargetEffects(p,initial,local);
 const eff=global.get(leaf.id);
 assert.ok(eff,'deep leaf must have a target effect');
 assert.equal(eff.targetId,o.id);
 const clone=structuredClone(p);clone.nodes.find(n=>n.id===leaf.id).impact=0;
 const without=C.evaluate(clone).get(o.id).score;
 eq(eff.targetWithoutScore,without);
 eq(eff.delta,initial.get(o.id).score-without);
 assert.ok(eff.magnitude>0);
});
test('v2: missing/stale ratings remain incomplete rather than 0%-credible evidence',()=>{
 const {p,o}=fixture('equal');const n=add(p,o,'support',100,5);
 p.votes=[];
 const after=C.evaluate(p);
 assert.equal(after.get(n.id).score,null);
 assert.equal(after.get(o.id).contributions[0].missing,true);
 assert.equal(after.get(o.id).incomplete,true);
 p.votes.push({id:'r1',nodeId:n.id,userId:p.users[0].id,confidence:100,updatedAt:new Date().toISOString()});
 n.title+=' (muuttunut)';
 const stale=C.evaluate(p).get(o.id);
 assert.equal(stale.contributions[0].missing,true);
 assert.equal(stale.incomplete,true);
});
test('v2: collective UI display derives effective signed impact from the scored parent contribution',()=>{
 const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 assert.match(app,/scores\.get\(node\.parentId\)\?\.contributions\?\.find/);
 assert.match(app,/shownInfluence\(node\)/);
 assert.doesNotMatch(app,/\$\{node\.impact\}\/5`, '', view\.indexMode/);
});
test('v2: single supported input already matches schema v7 and does not accept v6 silently',()=>{
 const {p}=fixture();assert.equal(p.schemaVersion,8);assert.equal(p.settings.scoring,'evidence-v3-links');
 const copy=structuredClone(p);copy.schemaVersion=6;
 assert.throws(()=>C.validateProject(copy),/formaattiversio/);
});
