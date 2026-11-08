'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../src/core.js');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const approx=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

function twoOptions(){
  const p=C.createBlankProject('decision'),u=p.users[0].id,root=C.rootNode(p);
  const a=C.addChild(p,root.id,'option',u);a.title='Retki perheen kanssa';
  const b=C.addChild(p,root.id,'option',u);b.title='Retki yksin';
  const reason=C.addChild(p,a.id,'support',u);reason.title='Saamme perheen yhteistä aikaa';
  return {p,u,a,b,reason};
}

test('dev29: original claim can be linked to another target as ONE concept with independent p/w for each use',()=>{
  const {p,u,a,b,reason}=twoOptions();
  C.applyPersonalAssessment(p,reason.id,u,75,4);
  const use=C.reuseClaimAt(p,reason.id,b.id,u);
  assert.notEqual(use.id,reason.id);
  assert.equal(use.reasonConceptId,reason.reasonConceptId);
  assert.equal(use.title,reason.title);
  assert.equal(p.links.length,0,'no old secondary scoring edge is created');
  assert.equal(C.personalCredence(p,use.id,u),null,'a new context has no borrowed credence');
  assert.equal(C.personalInfluence(p,'primary',use.id,u).current,false,'nor borrowed influence');
  assert.equal(C.personalCredence(p,reason.id,u).confidence,75);
  assert.equal(C.personalInfluence(p,'primary',reason.id,u).record.influence,4);
  let values=C.evaluateAssessor(p,u);
  approx(values.get(a.id).score,65);
  approx(values.get(b.id).score,50);
  assert.equal(values.get(b.id).incomplete,true);
  C.applyPersonalAssessment(p,use.id,u,90,-3);
  values=C.evaluateAssessor(p,u);
  approx(values.get(a.id).score,65);
  approx(values.get(b.id).score,36.5);
  assert.equal(C.personalCredence(p,use.id,u).confidence,90);
  assert.equal(C.personalCredence(p,reason.id,u).confidence,75);
  assert.equal(C.personalInfluence(p,'primary',use.id,u).record.influence,-3);
  assert.ok(C.validateProject(JSON.parse(JSON.stringify(p))));
});

test('dev29: repeated use cannot attach twice, to itself, or over an existing old cross-link',()=>{
  const {p,u,a,b,reason}=twoOptions();
  const concept=C.promoteReasonConcept(p,reason.id);
  assert.equal(C.canAttachReasonConcept(p,concept.id,b.id),true);
  const use=C.attachReasonConcept(p,concept.id,b.id,u);
  assert.equal(C.canAttachReasonConcept(p,concept.id,b.id),false);
  assert.throws(()=>C.attachReasonConcept(p,concept.id,b.id,u),/jo tässä kohteessa/);
  assert.equal(C.canAttachReasonConcept(p,concept.id,reason.id),false);
  assert.equal(C.canAttachReasonConcept(p,concept.id,use.id),false);
  const child=C.addChild(p,reason.id,'support',u);
  assert.equal(C.canAttachReasonConcept(p,concept.id,child.id),false);
  const third=C.addChild(p,C.rootNode(p).id,'option',u);
  assert.equal(C.canAttachReasonConcept(p,concept.id,third.id),true);
  C.addSignedLink(p,reason.id,third.id,3);
  assert.equal(C.canAttachReasonConcept(p,concept.id,third.id),false,'old link cannot be counted a second time');
});

test('dev29: multiple people can disagree independently in different repeated contexts',()=>{
  const {p,u,a,b,reason}=twoOptions();
  const v={id:'reviewer',name:'Arvioija B',role:'editor',shares:1};p.users.push(v);
  const use=C.reuseClaimAt(p,reason.id,b.id,u);
  C.applyPersonalAssessment(p,reason.id,u,75,5);
  C.applyPersonalAssessment(p,use.id,u,95,3);
  C.applyPersonalAssessment(p,reason.id,v.id,40,2);
  C.applyPersonalAssessment(p,use.id,v.id,80,-2);
  approx(C.evaluateAssessor(p,u).get(a.id).score,68.75);
  approx(C.evaluateAssessor(p,u).get(b.id).score,64.25);
  approx(C.evaluateAssessor(p,v.id).get(a.id).score,54);
  approx(C.evaluateAssessor(p,v.id).get(b.id).score,42);
  assert.equal(C.personalCredence(p,reason.id,v.id).confidence,40);
  assert.equal(C.personalCredence(p,use.id,v.id).confidence,80);
});

test('dev29: tree visibility defaults on; new attachments reveal and center the new node; node inspector offers direct reuse',()=>{
  assert.match(app,/showRecurringInTree:saved\.showRecurringInTree!==false/);
  assert.match(app,/function reuseFromTreeNode\(nodeId\)/);
  assert.match(app,/function centerTreeNode\(nodeId\)/);
  assert.match(app,/view\.showRecurringInTree=true;[\s\S]{0,190}view\.presentation='tree'/);
  assert.match(app,/for\(let node=byId\.get\(targetId\)/);
  assert.match(app,/requestAnimationFrame\(\(\)=>centerTreeNode\(useId\)\)/);
  assert.match(app,/repeatLinkOtherTargets/);
  assert.match(app,/\$\('linkForm'\)\.hidden = true/);
});
