// Value claims use the SAME signed parent/link influence as other claims.
// A separate importance or priority axis would reintroduce a rejected requirement.
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const C=require('../src/core.js'),AI=require('../src/ai-roundtrip.js');
const root=path.resolve(__dirname,'..');
function fixture(){
 const p=C.createBlankProject('decision'),alice=p.users[0];
 const bob={id:C.uid(),name:'Bob',shares:1,role:'editor'};p.users.push(bob);
 const a=C.addChild(p,p.nodes[0].id,'option',alice.id);
 const b=C.addChild(p,p.nodes[0].id,'option',alice.id);
 const value=C.addChild(p,a.id,'support',alice.id);value.semanticType='value';value.title='Local ownership matters';
 return {p,alice,bob,a,b,value};
}
test('values have no separate rating axis: only relation impact',()=>{
 const {p,alice,value}=fixture();
 assert.equal(C.upsertValuePriority,undefined);
 assert.equal('valueAssessments' in p,false);
 assert.throws(()=>C.upsertVote(p,value.id,alice.id,85),/totuususkottavuud/);
 C.upsertEdgeAssessment(p,'primary',value.id,alice.id,4.5);
 assert.equal(C.optionValueProfile(p,value.parentId,alice.id).items[0].impact,4.5);
 assert.equal('valueAssessments' in C.validateProject(p),false);
});
test('same value can influence two options differently, even opposite signs',()=>{
 const {p,alice,bob,a,b,value}=fixture();
 const link=C.addLink(p,value.id,b.id,'oppose',3);
 C.upsertEdgeAssessment(p,'primary',value.id,alice.id,5);
 C.upsertEdgeAssessment(p,'secondary',link.id,alice.id,-3);
 C.upsertEdgeAssessment(p,'primary',value.id,bob.id,-1);
 const left=C.optionValueProfile(p,a.id,alice.id),right=C.optionValueProfile(p,b.id,alice.id);
 assert.equal(left.items.length,1);assert.equal(right.items.length,1);
 assert.equal(left.items[0].impact,5);assert.equal(right.items[0].impact,-3);
 assert.equal(right.items[0].source,'secondary');assert.equal(right.items[0].relationId,link.id);
 assert.equal(left.items[0].summary.positive,1);assert.equal(left.items[0].summary.negative,1);
 assert.equal(C.optionValueProfile(p,b.id,bob.id).missing,1);
});
test('value differences never change factual credence or decision ballot weights',()=>{
 const {p,alice,a,value}=fixture();const base=C.evaluate(p).get(a.id).score;
 C.upsertEdgeAssessment(p,'primary',value.id,alice.id,-5);
 assert.equal(p.votes.length,0);assert.equal(p.ballots.length,0);
 assert.equal(C.evaluate(p).get(a.id).score,base,'human assessment does not mutate shared structural index');
 assert.equal(C.evaluateAssessor(p,alice.id).get(a.id).score,base,'subjective value impact stays separate from the factual argument index');
});
test('current schema excludes value-priority definitions and serializes one model',()=>{
 const {p,alice,value}=fixture();C.upsertEdgeAssessment(p,'primary',value.id,alice.id,3.5);
 const current=C.validateProject(p);
 assert.deepEqual(C.validateProject(JSON.parse(JSON.stringify(current))),current);
 const schema=JSON.parse(fs.readFileSync(path.join(root,'schemas/project.v5.schema.json')));
 assert.ok(!Object.hasOwn(schema.properties,'valueAssessments'));
 assert.ok(!Object.hasOwn(schema.$defs,'valueAssessment'));
});
test('removing subtree or reviewer cleans relationship ratings, not phantom priorities',()=>{
 const {p,alice,bob,a,value}=fixture();
 C.upsertEdgeAssessment(p,'primary',value.id,alice.id,5);
 C.upsertEdgeAssessment(p,'primary',value.id,bob.id,2);
 C.removeLocalProfile(p,bob.id);assert.equal(p.edgeAssessments.length,1);
 C.removeSubtree(p,a.id);assert.equal(p.edgeAssessments.length,0);
 assert.ok(C.validateProject(p));
});
test('AI request and additive merge preserve personal relation meanings',()=>{
 const {p,alice,value}=fixture();C.upsertEdgeAssessment(p,'primary',value.id,alice.id,3.5);
 const original=C.validateProject(p),request=AI.makeRequest(original,C);
 assert.equal('valueAssessments' in request.document,false);
 const response={format:AI.RESPONSE_FORMAT,projectId:request.projectId,baseFingerprint:request.baseFingerprint,
  assessor:'Test model',comments:[{nodeId:value.id,body:'What supports this value?'}]};
 const result=AI.prepareMerge(original,response,C).project;
 assert.deepEqual(result.edgeAssessments,original.edgeAssessments);
 assert.equal('valueAssessments' in result,false);
 assert.equal(result.comments.length,original.comments.length+1);
 assert.deepEqual(C.validateProject(result),result);
});
test('UI exposes value influence profiles without an extra slider',()=>{
 const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
 assert.doesNotMatch(app,/Core\.upsertValuePriority/);
 assert.match(app,/renderOptionValues\(container,node\)/);
 assert.match(app,/valueImpactSummary/);
});
