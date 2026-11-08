'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../src/core.js');

function saturday() {
  const p=C.createBlankProject('decision');
  const root=p.nodes[0];root.title='Mitä teen lauantaina?';
  const owner=p.users[0].id;
  const alone=C.addChild(p,root.id,'option',owner);alone.title='Uimahalliin yksin';
  const swim=C.addChild(p,alone.id,'support',owner);swim.title='Kuntoilua ja omaa aikaa';swim.semanticType='fact';
  const withKids=C.addChild(p,root.id,'option',owner);withKids.title='Uimahalliin lasten kanssa';
  const family=C.addChild(p,withKids.id,'support',owner);family.title='Perheen yhteistä aikaa';family.semanticType='value';
  const exercise=C.addChild(p,withKids.id,'support',owner);exercise.title='Lapset liikkuvat';exercise.semanticType='fact';
  const clean=C.addChild(p,root.id,'option',owner);clean.title='Siivous';
  const home=C.addChild(p,clean.id,'support',owner);home.title='Koti tuntuu viihtyisämmältä';home.semanticType='fact';
  return {p,owner,alone,withKids,clean,family,exercise};
}

test('Saturday decision has independently assessed concrete alternatives, not option truth estimates',()=>{
  const {p,alone,withKids,clean,family,exercise}=saturday();
  const order=C.assessmentOrder(p);
  assert.deepEqual(order,p.nodes.filter(n=>n.kind==='claim').map(n=>n.id));
  for (const option of [alone,withKids,clean]) {
    assert.equal(C.truthAssessable(option),false);
    assert.equal(C.indexAssessable(option),true);
    assert.deepEqual(C.assessmentFields(option),{credence:false,impact:false});
    assert.ok(!order.includes(option.id));
    assert.throws(()=>C.upsertVote(p,option.id,p.users[0].id,90),/totuususkottavuud/);
  }
  assert.deepEqual(C.assessmentFields(family),{credence:false,impact:true});
  assert.deepEqual(C.assessmentFields(exercise),{credence:true,impact:true});
  const scores=C.evaluate(p);
  for (const option of [alone,withKids,clean]) assert.equal(scores.get(option.id).base,50);
  alone.confidence=100;withKids.confidence=10;
  assert.equal(C.evaluate(p).get(alone.id).base,50,'option author default does not silently influence its score');
  assert.equal(C.evaluate(p).get(withKids.id).base,50);
  assert.ok(C.validateProject(p));
});

test('A value can have an individual signed effect without a third slider or a factual truth ballot',()=>{
  const {p,owner,family,withKids}=saturday();
  const before=C.evaluate(p).get(withKids.id).score;
  C.applyPersonalAssessment(p,family.id,owner,null,+4.5);
  assert.equal(C.personalCredence(p,family.id,owner),null);
  assert.equal(C.personalInfluence(p,'primary',family.id,owner).record.influence,4.5);
  assert.equal(C.evaluate(p).get(withKids.id).score,before,'value impact is recorded for decision criteria, not smuggled into factual index');
  assert.throws(()=>C.applyPersonalAssessment(p,family.id,owner,75,4.5),/Arvostukselle/);
  assert.equal(p.edgeAssessments.length,1,'invalid follow-up did not modify assessment');
  assert.deepEqual(C.validateProject(JSON.parse(JSON.stringify(p))),C.validateProject(p));
});

test('A personal decision-option index uses neutral reference and rated reasons, never invented option truth',()=>{
  const {p,owner,withKids,exercise}=saturday();
  const before=C.evaluateAssessor(p,owner).get(withKids.id);
  assert.equal(before.base,50);
  assert.equal(before.incomplete,true);
  C.applyPersonalAssessment(p,exercise.id,owner,95,5);
  const after=C.evaluateAssessor(p,owner).get(withKids.id);
  assert.ok(after.score>50,after);
  assert.equal(after.base,50);
  assert.equal(after.incomplete,false,'unrated subjective value does not create a fictitious truth gap');
});

test('Guided review has two fixed impact questions selected by parent type, no extra credibility prompts',()=>{
  const root=path.resolve(__dirname,'..');
  const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for (const id of ['assessmentCredenceField','assessmentImpactField','assessmentImpactReflection','assessmentCredenceNumber','assessmentInfluenceLabel'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.doesNotMatch(html,/id="assessmentCredenceReflection"/);
  assert.equal((html.match(/data-i18n="assessmentImpactReflectSimple"/g)||[]).length,1);
  assert.equal((html.match(/id="assessmentImpactReflection"/g)||[]).length,1);
  assert.match(app,/parent\?\.kind === 'option'/,'question chosen by immediate parent node type');
  assert.match(app,/assessmentInfluenceOption/);
  assert.match(app,/assessmentInfluenceClaim/);
  assert.doesNotMatch(app,/assessmentPrompt(?:Claim|Value)|assessmentAlt(?:Option|Conclusion)|assessmentImpactAlternative/,
    'No automatic interpolation of free-text content');
  const rows=fs.readFileSync(path.join(root,'locales/messages.psv'),'utf8').trim().split('\n');
  for (const key of ['assessmentCredenceAxis','assessmentCredence','assessmentImpactAxis','assessmentInfluenceOption','assessmentInfluenceClaim','assessmentImpactReflectSimple']) {
    const row=rows.find(x=>x.startsWith(key+'|'));assert.ok(row,key);
    assert.equal(row.split('|').length,10,key+' is localized in nine languages');
    for (const phrase of row.split('|').slice(1)) assert.doesNotMatch(phrase,/\{reason\}|\{target\}/,key+' not content-generated');
  }
  const first=(key)=>rows.find(x=>x.startsWith(key+'|')).split('|')[1];
  assert.match(first('assessmentCredenceAxis'),/Uskottavuus \/ todennäköisyys/);
  assert.match(first('assessmentCredence'),/toteutuu/);
  assert.match(first('assessmentInfluenceOption'),/valitsemista/);
  assert.match(first('assessmentInfluenceClaim'),/paikkansapitävyyttä/);
});

test('Saturday example treats possible family time as a probable outcome, not an absolute value',()=>{
  const root=path.resolve(__dirname,'..');
  const demo=JSON.parse(fs.readFileSync(path.join(root,'examples/lauantai-vaihtoehdot-dev8.witt.json'),'utf8'));
  const p=C.validateProject(demo);
  const family=p.nodes.find(n=>n.title==='Saamme perheen yhteistä aikaa');
  assert.ok(family,'future outcome example included');
  assert.deepEqual(C.assessmentFields(family),{credence:true,impact:true});
  assert.equal(family.confidence,70,'example uncertainty is explicit, not 100%');
  const own=p.users[0].id;
  C.applyPersonalAssessment(p,family.id,own,65,4);
  assert.equal(C.personalCredence(p,family.id,own).confidence,65);
  assert.equal(C.personalInfluence(p,'primary',family.id,own).record.influence,4);
});
