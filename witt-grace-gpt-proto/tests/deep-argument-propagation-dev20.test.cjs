'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
const near=(actual,expected,description)=>assert.ok(Math.abs(actual-expected)<1e-9,`${description}: ${actual} vs ${expected}`);
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const factor=x=>clamp(x/100,0,1);
const score=(base,positive,negative=0)=>clamp(base+5*(positive-negative),0,100);
function fourDeep() {
 const p=C.createBlankProject('decision'),id=p.users[0].id,root=p.nodes[0];
 p.users[0].shares=5;
 for(let i=1;i<=3;i++)p.users.push({id:`staff-${i}`,name:`Staff ${i}`,shares:1,role:'editor'});
 const option=C.addChild(p,root.id,'option',id);option.title='Option requiring scrutiny';
 const other=C.addChild(p,root.id,'option',id);other.title='Unrelated option';
 const ancestors=[];
 let parent=option;
 for(let depth=0;depth<4;depth++){
   const claim=C.addChild(p,parent.id,'support',id);
   claim.title=`Level ${depth+1} factual premise`;
   ancestors.push(claim);parent=claim;
 }
 for(const [index,claim] of ancestors.entries())for(const user of p.users){
   C.upsertVote(p,claim.id,user.id,index===3?(user.id===id?90:70):[65,70,80,90][index]);
   C.upsertEdgeAssessment(p,'primary',claim.id,user.id,[3,4,4,5][index]);
 }
 return {p,option,other,ancestors};
}
test('dev20: a fourth-generation claim affects all three intervening claims and its option via full recursive scores',()=>{
 const {p,option,other,ancestors}=fourDeep();
 for(const weighting of ['equal','shares']){
  p.settings.assessmentWeighting=weighting;
  const computed=C.evaluate(p);
  let expected=weighting==='shares'?(5*90+3*70)/8:(90+3*70)/4;
  near(computed.get(ancestors[3].id).score,expected,'weighted deepest credibility');
  for(let i=2;i>=0;i--){
   expected=score([65,70,80,90][i], [3,4,4,5][i+1]*factor(expected));
   near(computed.get(ancestors[i].id).score,expected,`propagated claim ${i}`);
  }
  near(computed.get(option.id).score,score(50,3*factor(expected)),'parent option includes whole chain');
  const previous=ancestors.map(n=>computed.get(n.id).score);
  const previousOption=computed.get(option.id).score;
  const previousOther=computed.get(other.id).score;
  for(const user of p.users)C.upsertVote(p,ancestors[3].id,user.id,50);
  const changed=C.evaluate(p);
  for(let i=0;i<4;i++) assert.ok(changed.get(ancestors[i].id).score<previous[i],`score changed at depth ${i}`);
  assert.ok(changed.get(option.id).score<previousOption,'deep leaf influences option');
  near(changed.get(other.id).score,previousOther,'no sibling contamination');
  for(const user of p.users)C.upsertVote(p,ancestors[3].id,user.id,user.shares===5?90:70);
 }
});
test('dev20: a deeply nested unmet hard condition blocks its option regardless of numeric result or depth',()=>{
 const {p,option,other,ancestors}=fourDeep();
 const without=C.evaluate(p).get(option.id).score;
 const gate=C.addChild(p,ancestors[3].id,'oppose',p.users[0].id);
 gate.title='Mandatory legal license obtained';
 gate.semanticType='prerequisite';
 gate.constraintStatus='unmet';
 near(C.evaluate(p).get(option.id).score,without,'gate is separate from numeric support');
 assert.equal(C.optionFeasibility(p,option.id).status,'blocked');
 assert.equal(C.optionFeasibility(p,option.id).unmet,1);
 assert.equal(C.optionFeasibility(p,other.id).status,'feasible');
 assert.equal(C.decisionRanking(p).at(-1).node.id,option.id,'unmet condition overrides high numerical score');
 gate.constraintStatus='unknown';
 assert.equal(C.optionFeasibility(p,option.id).status,'unresolved');
 gate.constraintStatus='met';
 assert.equal(C.optionFeasibility(p,option.id).status,'feasible');
});
test('dev20: deeply supported counterargument becomes stronger opposition at the option, not a second independent top-level input',()=>{
 const {p,option,ancestors}=fourDeep();
 for(const user of p.users)C.upsertEdgeAssessment(p,'primary',ancestors[0].id,user.id,-4);
 const before=C.evaluate(p);
 for(const user of p.users)C.upsertVote(p,ancestors[3].id,user.id,50);
 const after=C.evaluate(p);
 assert.ok(before.get(ancestors[0].id).score>after.get(ancestors[0].id).score);
 assert.ok(before.get(option.id).score<after.get(option.id).score,'better supported negative reason lowers the option');
 assert.equal(before.get(option.id).contributions.length,1,'only direct child is counted at top');
 assert.equal(before.get(ancestors[0].id).contributions.length,1,'grandchildren are included recursively, not double-counted directly');
});
