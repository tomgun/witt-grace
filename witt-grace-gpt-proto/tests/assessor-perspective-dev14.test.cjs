'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../src/core.js'),Perspective=require('../src/assessor-view.js'),Draft=require('../src/ai-draft-v2.js');
function sample(){
 const p=Core.createBlankProject('decision');const root=p.nodes[0];const human=p.users[0];
 const ai={id:Core.uid(),name:'AI · ChatGPT',role:'editor',shares:1,profileKind:'ai'};p.users.push(ai);
 function option(text,credence,impact){
  const o=Core.addChild(p,root.id,'option',human.id);o.title=text;
  const c=Core.addChild(p,o.id,'support',ai.id);c.title='Outcome for '+text;
  if(credence!==null){Core.upsertVote(p,c.id,ai.id,credence);Core.upsertEdgeAssessment(p,'primary',c.id,ai.id,impact);}
  return {o,c};
 }
 return {p,root,human,ai,first:option('Swimming',90,5),second:option('Cleaning',65,3),third:option('Unassessed',null,null)};
}
test('AI-only assessed option ranking is separate from humans and never a ballot',()=>{
 const {p,ai,human,first,second,third}=sample();
 const result=Perspective.summary(p,Core,ai.id);
 assert.equal(result.credenceReviews,2);
 assert.equal(result.primaryReviews,2);
 assert.equal(result.secondaryReviews,0);
 assert.deepEqual(result.leadingIds,[first.o.id]);
 assert.ok(result.rows.find(r=>r.node.id===first.o.id).score>result.rows.find(r=>r.node.id===second.o.id).score);
 assert.equal(result.rows.find(r=>r.node.id===third.o.id).eligible,false,'unreviewed base 50 must not be a winner');
 assert.equal(Perspective.summary(p,Core,human.id).leadingIds.length,0,'no AI borrowing into human view');
 assert.equal(p.ballots.length,0,'AI ranking does not cast votes');
 assert.equal(Core.validateProject(p).users.filter(Core.isAIProfile).length,1);
});
test('hard-blocked option is not highlighted even with the strongest AI support',()=>{
 const {p,ai,first,second}=sample();
 const gate=Core.addChild(p,first.o.id,'oppose',p.users[0].id);gate.semanticType='constraint';gate.constraintStatus='unmet';
 const result=Perspective.summary(p,Core,ai.id);
 assert.deepEqual(result.leadingIds,[second.o.id]);
 assert.equal(result.rows.find(r=>r.node.id===first.o.id).feasibility.status,'blocked');
});
test('missing AI rating import yields explicit zero assessment counts and no highlighted option',()=>{
 const p=Draft.toProject(Draft.EXAMPLE,Core,{assessments:false});
 const ai=p.users.find(Core.isAIProfile);
 const r=Perspective.summary(p,Core,ai.id);
 assert.equal(r.credenceReviews,0);assert.equal(r.primaryReviews,0);assert.deepEqual(r.leadingIds,[]);
 assert.ok(r.rows.some(row=>!row.complete));
});
test('AI draft with rated child reveals its personal scores without changing shared/human index',()=>{
 const p=Draft.toProject(Draft.EXAMPLE,Core);const ai=p.users.find(Core.isAIProfile);
 const family=p.nodes.find(n=>n.title==='We may get quality family time');
 assert.equal(Core.personalCredence(p,family.id,ai.id).confidence,70);
 assert.equal(Core.personalInfluence(p,'primary',family.id,ai.id).record.influence,4);
 const r=Perspective.summary(p,Core,ai.id);
 assert.equal(r.credenceReviews,1);assert.equal(r.primaryReviews,1);assert.equal(r.leadingIds.length,1);
 assert.equal(Core.getBaseConfidence(p,family).votesCount,0,'human shared index excludes AI estimate');
});
