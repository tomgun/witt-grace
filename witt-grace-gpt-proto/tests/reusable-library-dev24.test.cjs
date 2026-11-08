const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../src/core.js');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const I18n=require('../src/i18n.js');

test('dev24: existing evaluated claim becomes reusable without changing id or ratings',()=>{
 const p=C.createBlankProject('argument'),id=p.users[0].id,root=C.rootNode(p);
 const claim=C.addChild(p,root.id,'support',id);claim.title='Säästää aikaa';
 const leaf=C.addChild(p,claim.id,'oppose',id);
 C.upsertVote(p,claim.id,id,75);
 C.upsertEdgeAssessment(p,'primary',claim.id,id,4);
 const old=JSON.stringify({node:claim,child:leaf,votes:p.votes,edges:p.edgeAssessments});
 const concept=C.promoteReasonConcept(p,claim.id);
 assert.equal(concept.title,'Säästää aikaa');
 assert.equal(claim.reasonConceptId,concept.id);
 assert.equal(p.nodes.length,3);
 assert.equal(leaf.parentId,claim.id);
 assert.equal(p.votes.find(x=>x.nodeId===claim.id).confidence,75);
 assert.equal(C.personalInfluence(p,'primary',claim.id,id).record.influence,4);
 assert.equal(C.validateProject(p).reasonConcepts.length,1);
 assert.throws(()=>C.promoteReasonConcept(p,root.id));
 const second=C.promoteReasonConcept(p,claim.id);
 assert.equal(second.id,concept.id,'re-promotion is idempotent');
});

test('dev24: reusing a concept in two targets keeps per-target reviews completely independent',()=>{
 const p=C.createBlankProject('decision'),id=p.users[0].id,root=C.rootNode(p);
 const a=C.addChild(p,root.id,'option',id),b=C.addChild(p,root.id,'option',id);
 const first=C.addChild(p,a.id,'support',id);first.title='Vähentää kustannuksia';
 const concept=C.promoteReasonConcept(p,first.id);
 const second=C.attachReasonConcept(p,concept.id,b.id,id);
 C.upsertVote(p,first.id,id,90);C.upsertEdgeAssessment(p,'primary',first.id,id,5);
 C.upsertVote(p,second.id,id,60);C.upsertEdgeAssessment(p,'primary',second.id,id,2);
 assert.equal(C.personalCredence(p,first.id,id).confidence,90);
 assert.equal(C.personalCredence(p,second.id,id).confidence,60);
 assert.equal(C.personalInfluence(p,'primary',first.id,id).record.influence,5);
 assert.equal(C.personalInfluence(p,'primary',second.id,id).record.influence,2);
 assert.throws(()=>C.attachReasonConcept(p,concept.id,b.id,id),/jo tässä kohteessa/);
 C.validateProject(p);
});

test('dev24: tree visibility and library selection are UI-only; all recurring reasons still affect scores',()=>{
 assert.match(html,/id="repeatLibraryPane"/);
 assert.match(html,/id="repeatCards"/);
 assert.match(html,/id="repeatCreateForm"/);
 assert.match(html,/id="btnRepeatPromote"/);
 assert.match(html,/id="repeatNewSemantic"/);
 assert.match(app,/if\(!view\.showRecurringInTree\)/);
 assert.match(app,/function hiddenUnderRecurring\(node\)/,'full export hides entire recurring subtrees');
 assert.match(app,/renderLibraryInspector/);
 assert.match(app,/nodeEl\.addEventListener\('drop'/);
 assert.match(app,/Core\.attachReasonConcept\(project,selection\.id,targetId,actorId\)/);
 assert.match(app,/view\.workflow='evaluate'/);
 assert.doesNotMatch(html,/<label[^>]*>Millainen perustelu\?/);
});

test('dev24: library UI terminology is translated for all supported languages',()=>{
 for(const lang of I18n.languages){
  I18n.setLocale(lang);
  for(const k of ['repeatTab','repeatIntro','repeatCreate','repeatPromote','repeatAttach','repeatConnections','repeatIndependentHelp','repeatLockedHelp'])
   assert.ok(I18n.t(k).length>1,lang+':'+k);
 }
 I18n.setLocale('fi');
 assert.equal(I18n.t('repeatTab'),'Yhteydet ja perustelut');
});
