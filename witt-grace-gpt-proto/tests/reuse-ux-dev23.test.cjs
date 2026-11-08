const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'src/styles.css'),'utf8');
const I18n=require('../src/i18n.js');
const C=require('../src/core.js');

test('dev23: workspace has one readable argument/decision switch and no floating mode hint',()=>{
 assert.match(html,/id="modeArgument"[^>]*>Argumentointi<\/button>/);
 assert.match(html,/id="modeDecision"[^>]*>Päätös<\/button>/);
 assert.doesNotMatch(html,/class="canvas-hint"|id="canvasModeLabel"|data-i18n="purposeLabel"/);
 assert.doesNotMatch(app,/\$\('canvasModeLabel'\)/);
});
test('dev23: one visible reuse entry point, two clearly explained assessment strategies',()=>{
 for(const id of ['btnSharedMenu','btnSharedReasons']){
   assert.match(html,new RegExp('id="'+id+'"[^>]*hidden'));
 }
 for(const id of ['btnContextMenu','btnContextReasons']){
   const tag=html.match(new RegExp('<button[^>]*id="'+id+'"[^>]*>'))?.[0];
   assert.ok(tag?.includes('data-i18n="contextOpen"'),id);
 }
 for(const id of ['contextReasonsDialog','sharedReasonsDialog','btnReuseLockedFromContext','btnReuseContextFromShared','contextCreateButton']){
   assert.ok(html.includes(`id="${id}"`),id);
 }
 assert.match(app,/btnReuseLockedFromContext/);
 assert.match(app,/openSharedReasons\(target\)/);
 assert.match(app,/btnReuseContextFromShared/);
 assert.match(app,/openContextReasons\(target\)/);
 assert.match(app,/t\(valid\?'reuseAddHere':'contextCreate'\)/);
 assert.match(css,/\.reuse-mode-nav/);
 assert.match(html,/reuseIndependentExample/);
 assert.match(html,/reuseLockedExample/);
});
test('dev23: visible reuse terminology is comprehensible in every supported language',()=>{
 for(const lang of I18n.languages){
  I18n.setLocale(lang);
  for(const key of ['contextOpen','contextTitle','contextIntro','sharedIntro','reuseIndependent','reuseLocked','reuseNewHeading','reuseExistingHeading','reuseAddHere','reuseIndependentExample','reuseLockedExample']){
   assert.ok(I18n.t(key).length>4,`${lang}:${key}`);
  }
 }
 I18n.setLocale('fi');
 assert.equal(I18n.t('contextOpen'),'Toistuvat perustelut');
 assert.ok(I18n.t('contextIntro').includes('erikseen'));
 assert.ok(I18n.t('sharedIntro').includes('lukitaan'));
});
test('dev23: reused reason keeps independent per-use reviews; locked reasons remain separate',()=>{
 const p=C.createBlankProject('decision'),rootNode=C.rootNode(p),id=p.users[0].id;
 const a=C.addChild(p,rootNode.id,'option',id),b=C.addChild(p,rootNode.id,'option',id);
 const concept=C.addReasonConcept(p,'Säästää aikaa','fact');
 const useA=C.attachReasonConcept(p,concept.id,a.id,id);
 const useB=C.attachReasonConcept(p,concept.id,b.id,id);
 C.upsertVote(p,useA.id,id,90); C.upsertEdgeAssessment(p,'primary',useA.id,id,4);
 C.upsertVote(p,useB.id,id,60); C.upsertEdgeAssessment(p,'primary',useB.id,id,2);
 assert.equal(p.votes.find(x=>x.nodeId===useA.id)?.confidence,90);
 assert.equal(p.votes.find(x=>x.nodeId===useB.id)?.confidence,60);
 assert.notEqual(p.votes.find(x=>x.nodeId===useA.id)?.confidence,p.votes.find(x=>x.nodeId===useB.id)?.confidence);
 assert.equal(p.reasonConcepts.length,1);
});
