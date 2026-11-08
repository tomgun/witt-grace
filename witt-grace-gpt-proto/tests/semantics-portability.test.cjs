'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const C=require('../src/core.js'),AI=require('../src/ai-roundtrip.js');
const root=path.resolve(__dirname,'..');
function decision(){
 const p=C.createBlankProject('decision'),owner=p.users[0].id;
 const opt=C.addChild(p,p.nodes[0].id,'option',owner);
 opt.title='A decision alternative';
 return {p,owner,opt};
}
test('v6 document preserves explicit semantic tags, sources, author choice and portable manual four-way offsets',()=>{
 const {p,owner,opt}=decision();
 const n=C.addChild(p,opt.id,'support',owner);
 n.semanticType='fact';n.sources=[{url:'https://example.net/study',note:'Evidence requires review'}];n.authorVisibility='anonymous';
 p.layout.fourWayOffsets[n.id]={x:120,y:-25};
 const canonical=C.validateProject(p),json=JSON.stringify(canonical),back=C.validateProject(JSON.parse(json));
 assert.equal(back.schemaVersion,8);assert.deepEqual(back,canonical);
 assert.deepEqual(back.layout.fourWayOffsets[n.id],{x:120,y:-25});
 assert.equal(back.nodes.find(x=>x.id===n.id).authorVisibility,'anonymous');
 assert.equal(back.nodes.find(x=>x.id===n.id).sources[0].url,'https://example.net/study');
 const schema=JSON.parse(fs.readFileSync(path.join(root,'schemas/project.v8.schema.json')));
 assert.equal(schema.properties.schemaVersion.const,8);
 assert.ok(schema.required.includes('layout'));
 assert.ok(schema.$defs.node.properties.semanticType.enum.includes('constraint'));
 assert.ok(schema.$defs.user.properties.profileKind.enum.includes('ai'));
});
test('current v6 is portable; older schema input is rejected without changing source data',()=>{
 const current=C.createBlankProject('decision');const original=JSON.stringify(current);
 assert.deepEqual(C.validateProject(JSON.parse(original)),current);
 const old={...structuredClone(current),schemaVersion:4};
 assert.throws(()=>C.validateProject(old),/vain nykyinen versio/);
 assert.equal(JSON.stringify(current),original);
});
test('constraints and prerequisites can VETO an option separately from its heuristic score',()=>{
 const {p,owner,opt}=decision();
 const other=C.addChild(p,p.nodes[0].id,'option',owner);
 const requirement=C.addChild(p,opt.id,'oppose',owner);
 requirement.semanticType='prerequisite';requirement.constraintStatus='unmet';requirement.title='Regulatory permit required';
 assert.equal(C.optionFeasibility(p,opt.id).status,'blocked');
 assert.equal(C.optionFeasibility(p,other.id).status,'feasible');
 const scoreWithBlock=C.evaluate(p).get(opt.id).score;
 requirement.constraintStatus='unknown';
 assert.equal(C.optionFeasibility(p,opt.id).status,'unresolved');
 assert.equal(C.evaluate(p).get(opt.id).score,scoreWithBlock);
 requirement.constraintStatus='met';
 assert.equal(C.optionFeasibility(p,opt.id).status,'feasible');
 assert.equal(C.evaluate(p).get(opt.id).score,scoreWithBlock);
});
test('value claims have no truth-credence ballot and do not get averaged as facts',()=>{
 const {p,owner,opt}=decision();
 const fact=C.addChild(p,opt.id,'support',owner);fact.title='Evidence';fact.confidence=92;fact.impact=4;
 const value=C.addChild(p,opt.id,'oppose',owner);value.title='I value freedom';value.semanticType='value';value.confidence=100;value.impact=5;
 assert.throws(()=>C.upsertVote(p,value.id,owner,80),/totuususkottavuud/);
 assert.throws(()=>C.applyPersonalAssessment(p,value.id,owner,80,-2),/totuususkottavuud/);
 const withValue=C.evaluate(p).get(opt.id).score;
 p.nodes=p.nodes.filter(n=>n.id!==value.id);
 assert.equal(C.evaluate(p).get(opt.id).score,withValue,'value is not smuggled into a numeric truth index');
});
test('invalid semantic annotations, unsafe links and orphaned manual positions are rejected',()=>{
 const {p,owner,opt}=decision(),child=C.addChild(p,opt.id,'support',owner);
 let invalid=structuredClone(p);invalid.nodes[2].sources=[{url:'javascript:alert(1)',note:''}];
 assert.throws(()=>C.validateProject(invalid),/http\(s\)/);
 invalid=structuredClone(p);invalid.nodes[2].semanticType='dogma';assert.throws(()=>C.validateProject(invalid),/luokitus/);
 invalid=structuredClone(p);invalid.layout.fourWayOffsets['nonexistent']={x:1,y:2};assert.throws(()=>C.validateProject(invalid),/Nelisuuntaisen/);
 invalid=structuredClone(p);invalid.nodes[2].semanticType='value';invalid.nodes[2].constraintStatus='unmet';assert.throws(()=>C.validateProject(invalid),/reunaehdon/);
});
test('AI identity is durable after renaming and AI credence never replaces a human opinion',()=>{
 const p=C.createBlankProject('argument'),rootNode=p.nodes[0],u=p.users[0].id;
 C.upsertVote(p,rootNode.id,u,40);
 const request=AI.makeRequest(p,C);
 const response={format:AI.RESPONSE_FORMAT,projectId:request.projectId,baseFingerprint:request.baseFingerprint,
 assessor:'A model',assessments:[{nodeId:rootNode.id,credence:96}]};
 const next=AI.prepareMerge(p,response,C).project;
 const ai=next.users.find(C.isAIProfile);
 assert.equal(ai.profileKind,'ai');
 assert.equal(C.getBaseConfidence(next,rootNode).base,40);
 ai.name='A name with no AI prefix';
 assert.equal(C.isAIProfile(ai),true);
 const copied=C.validateProject(next);
 assert.equal(C.getBaseConfidence(copied,rootNode).base,40);
 assert.equal(C.isAIProfile(copied.users.find(u=>u.id===ai.id)),true);
});
test('four-way layout offsets are deleted along with their subtree',()=>{
 const {p,owner,opt}=decision(),child=C.addChild(p,opt.id,'support',owner);
 p.layout.fourWayOffsets[opt.id]={x:40,y:0};p.layout.fourWayOffsets[child.id]={x:-1,y:14};
 C.removeSubtree(p,opt.id);
 assert.deepEqual(C.validateProject(p).layout.fourWayOffsets,{});
});
test('guided review asks for value relationship impact but skips its truth and hard conditions',()=>{
 const {p,owner,opt}=decision();
 const value=C.addChild(p,opt.id,'support',owner);value.semanticType='value';
 const fact=C.addChild(p,value.id,'support',owner);fact.semanticType='fact';
 const gate=C.addChild(p,opt.id,'oppose',owner);gate.semanticType='constraint';gate.constraintStatus='unknown';
 const order=C.assessmentOrder(p);
 assert.ok(order.includes(fact.id));
 assert.ok(order.includes(value.id));assert.ok(!order.includes(gate.id));
 assert.ok(!order.includes(opt.id));
 assert.deepEqual(C.assessmentFields(value),{credence:false,impact:true});
 C.applyPersonalAssessment(p,value.id,owner,null,4.5);
 assert.equal(p.votes.length,0);
 assert.equal(C.personalInfluence(p,'primary',value.id,owner).record.influence,4.5);
});
test('v5 rejects imported credibility reviews on a value or hard requirement',()=>{
 const {p,owner,opt}=decision(),value=C.addChild(p,opt.id,'support',owner);
 C.upsertVote(p,value.id,owner,80);value.semanticType='value';
 assert.throws(()=>C.validateProject(p),/ei voi lisätä totuusarviota/);
});

test('potential duplicated evidence is exposed without altering the index or collapsing different claims',()=>{
 const {p,owner,opt}=decision();
 const a=C.addChild(p,opt.id,'support',owner),b=C.addChild(p,opt.id,'support',owner);
 a.title='Our savings exceed purchase costs';b.title='Our SAVINGS exceed purchase costs!';
 a.sources=[{url:'https://example.org/report#appendix',note:'One study'}];
 b.sources=[{url:'https://example.org/report',note:'Same study'}];
 const before=C.evaluate(p).get(opt.id).score;
 const warning=C.potentialEvidenceOverlap(p,a.id);
 assert.equal(warning.length,1);
 assert.equal(warning[0].nodeId,b.id);
 assert.deepEqual(warning[0].reasons,['same-text','shared-source']);
 assert.equal(C.evaluate(p).get(opt.id).score,before,'diagnostic does not silently modify scoring');
 b.title='Independent line of reasoning';b.sources=[];
 assert.deepEqual(C.potentialEvidenceOverlap(p,a.id),[]);
});

test('decision ranking never presents a mandatory-condition failure ahead of a feasible option',()=>{
 const {p,owner,opt}=decision();
 opt.confidence=100;
 const other=C.addChild(p,p.nodes[0].id,'option',owner);other.confidence=20;
 const blocked=C.addChild(p,opt.id,'oppose',owner);
 blocked.semanticType='constraint';blocked.constraintStatus='unmet';
 const ranking=C.decisionRanking(p);
 assert.equal(ranking[0].node.id,other.id);
 assert.equal(ranking[1].node.id,opt.id);
 assert.equal(ranking[1].feasibility.status,'blocked');
 blocked.constraintStatus='unknown';
 assert.equal(C.decisionRanking(p)[0].node.id,other.id,'unknown requirement must not outrank known feasibility');
 blocked.constraintStatus='met';
 assert.equal(C.decisionRanking(p)[0].node.id,opt.id,'with gate met, higher heuristic may appear first');
});
