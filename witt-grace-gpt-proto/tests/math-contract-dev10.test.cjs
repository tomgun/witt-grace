'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../src/core.js');
const approx=(actual,expected,msg)=>assert.ok(Math.abs(actual-expected)<1e-9,`${msg||'value'}: ${actual} vs ${expected}`);

function onePremise(mode='argument') {
 const p=C.createBlankProject(mode), owner=p.users[0].id;p.settings.assessmentWeighting='structural';
 const root=p.nodes[0];root.confidence=mode==='argument'?60:50;
 let parent=root,option=null;
 if(mode==='decision') {
   option=C.addChild(p,root.id,'option',owner);option.title='Uimahalliin lasten kanssa';parent=option;
 }
 const claim=C.addChild(p,parent.id,'support',owner);
 claim.title='Saamme perheen yhteistä aikaa';claim.semanticType='fact';claim.confidence=90;claim.impact=4;
 return {p,owner,root,parent,claim,option};
}

test('mathematical contract: evidence-v2 uses 0..100% of computed child result',()=>{
 const {p,claim,parent}=onePremise('decision');
 claim.confidence=70;
 const scores=C.evaluate(p);
 approx(scores.get(claim.id).score,70);
 approx(scores.get(parent.id).base,50);
 approx(scores.get(parent.id).positive,2.8);
 approx(scores.get(parent.id).score,50+5*2.8);
 assert.equal(scores.get(parent.id).score,64);
 claim.confidence=50;
 approx(C.evaluate(p).get(parent.id).score,60,'50% credence means half the 100% effect');
 claim.confidence=30;
 approx(C.evaluate(p).get(parent.id).score,56,'30% credence means 30% effect, not zero');
 claim.confidence=0;
 approx(C.evaluate(p).get(parent.id).score,50,'0% contributes no support');
});

test('mathematical contract: factual pro/con shift clamps, independent of structural node base',()=>{
 const {p,claim,root}=onePremise();
 approx(C.evaluate(p).get(root.id).score,60+5*3.6);
 claim.relation='oppose';
 approx(C.evaluate(p).get(root.id).score,60-5*3.6);
 claim.relation='neutral';
 approx(C.evaluate(p).get(root.id).score,60);
 claim.relation='support';claim.confidence=100;claim.impact=5;root.confidence=100;
 approx(C.evaluate(p).get(root.id).score,100,'clamping at 100');
});

test('mathematical contract: personal sign can contradict structural direction and missing is incomplete',()=>{
 const {p,claim,root,owner}=onePremise();
 let score=C.evaluateAssessor(p,owner).get(root.id);
 assert.equal(score.score,50,'root can compute from child evidence without a root vote');assert.equal(score.incomplete,true);
 C.upsertVote(p,root.id,owner,60);
 C.upsertVote(p,claim.id,owner,90);
 C.upsertEdgeAssessment(p,'primary',claim.id,owner,-4);
 score=C.evaluateAssessor(p,owner).get(root.id);
 approx(score.score,60-5*3.6);
 assert.equal(score.incomplete,false);
 approx(C.evaluate(p).get(root.id).score,60+5*3.6,'structural unchanged by personal relationship sign');
});

test('mathematical contract: values and gates do not enter numeric index, unmet gate blocks decision option',()=>{
 const {p,owner,parent}=onePremise('decision');
 const before=C.evaluate(p).get(parent.id).score;
 const value=C.addChild(p,parent.id,'support',owner);value.title='Yhdessäolo on minulle tärkeää';value.semanticType='value';value.impact=5;
 C.upsertEdgeAssessment(p,'primary',value.id,owner,5);
 approx(C.evaluate(p).get(parent.id).score,before,'value contribution excluded in v1');
 const gate=C.addChild(p,parent.id,'support',owner);gate.semanticType='prerequisite';gate.constraintStatus='unmet';gate.impact=5;
 approx(C.evaluate(p).get(parent.id).score,before,'gates do not enter score');
 assert.equal(C.optionFeasibility(p,parent.id).status,'blocked');
 gate.constraintStatus='unknown';assert.equal(C.optionFeasibility(p,parent.id).status,'unresolved');
 gate.constraintStatus='met';assert.equal(C.optionFeasibility(p,parent.id).status,'feasible');
});

test('mathematical contract: weighted ballot is per-option, frozen and separate from factual assessments',()=>{
 const {p,root,parent,owner}=onePremise('decision');
 const alt=C.addChild(p,root.id,'option',owner);alt.title='Siivous';
 const other={id:'test-assessor-2',name:'Bertta',role:'editor',shares:4};p.users.push(other);
 p.settings.voteWeighting='shares';p.users[0].shares=1;
 const r=C.startVotingRound(p,{hideResults:true,anonymous:true});
 assert.equal(r.status,'open');assert.equal(r.weightByUser[other.id],4);
 C.upsertBallot(p,parent.id,owner,80);
 C.upsertBallot(p,parent.id,other.id,20);
 const result=C.optionPreference(p,parent.id);
 approx(result.preferenceScore,32);approx(result.weightedSum,160);
 approx(result.preferenceTotalPower,5);
 p.users[1].shares=100;
 approx(C.optionPreference(p,parent.id).preferenceScore,32,'weights frozen');
 assert.equal(C.optionPreference(p,alt.id).preferenceScore,null,'missing is not zero');
 C.closeVotingRound(p,owner);
 assert.equal(r.status,'closed');
 assert.throws(()=>C.upsertBallot(p,parent.id,owner,90),/closed/);
 assert.equal(C.evaluate(p).get(parent.id).base,50,'ballots cannot change index');
});

test('mathematical contract: explicit evidence-v3 version with no silent foreign-format import',()=>{
 const p=C.createBlankProject('decision');
 assert.equal(p.settings.scoring,'evidence-v3-links');
 assert.equal(p.schemaVersion,8);
 p.settings.scoring='heuristic-v1';
 assert.throws(()=>C.validateProject(p),/laskenta|asetukset/);
 const contract=fs.readFileSync(path.resolve(__dirname,'../docs/specifications/CURRENT_GRACE_AND_DATA.md'),'utf8');
 for(const pattern of [/context/i,/historical/i,/evidence-v3-links/,/50/i,/strength/i,/value/i,/voting/i,/option/i]) assert.match(contract,pattern);
});
