const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'src/styles.css'),'utf8');
const I18n=require('../src/i18n.js');
const Core=require('../src/core.js');

test('dev25: creation form has first-class visible input and explicit validation instead of silent HTML block',()=>{
 assert.match(html,/<form id="repeatCreateForm"[^>]*novalidate/);
 assert.match(html,/<button type="button"[^>]*id="btnRepeatCreate"/);
 assert.match(html,/id="repeatLibraryStatus"[^>]*role="status" aria-live="polite"/);
 assert.ok(html.indexOf('id="repeatCreateForm"')<html.indexOf('id="repeatCards"'),'new cards appear beneath form');
 assert.doesNotMatch(html,/class="repeat-create-disclosure"/,'creation is not hidden behind an accordion');
 assert.match(app,/repeatNewTitle'\)\.oninput=/);
 assert.match(app,/repeatDefaultTitle/);
 assert.match(app,/selectedLibraryReason=\{type:mode==='locked'\?'locked':'concept',id:created\.id\}/);
 assert.match(app,/card\.scrollIntoView\(\{block:'nearest'/);
});

test('dev25: creation adds a library entry without inventing a tree node or any personal assessments',()=>{
 const doc=Core.createBlankProject('argument');
 const nodes=doc.nodes.length, votes=doc.votes.length, edges=doc.edgeAssessments.length;
 const idea=Core.addReasonConcept(doc,'Nopeuttaa läpimenoaikaa','fact');
 assert.equal(Core.validateProject(doc).reasonConcepts.find(r=>r.id===idea.id).title,'Nopeuttaa läpimenoaikaa');
 assert.equal(doc.nodes.length,nodes);
 assert.equal(doc.votes.length,votes);
 assert.equal(doc.edgeAssessments.length,edges);
});

test('dev25: new Bitberg appearance is a local-only visual skin in both selectors',()=>{
 for(const id of ['themeSelect','homeThemeSelect']){
  const selector=html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`));
  assert.ok(selector,id);
  assert.match(selector[1],/value="bitberg"/);
 }
 assert.match(app,/APPEARANCE_STORAGE = 'witt-appearance-v1'/);
 assert.match(app,/\['cosmos','hologram','manuscript-book','manuscript-pen','bitberg'\]\.includes/);
 assert.match(app,/specialAppearance \|\| project\.theme/);
 assert.match(app,/\['dark','cosmos','hologram','bitberg'\]\.includes\(effectiveAppearance\(\)\)/);
 assert.match(css,/body\[data-theme="bitberg"\]/);
 assert.match(css,/body\[data-theme="bitberg"\] \.node\.selected/);
 assert.match(css,/body\[data-theme="bitberg"\] #viewport/);
 const doc=Core.createBlankProject('argument');
 assert.equal(doc.theme,'light','a visual skin is not the project theme');
});

test('dev25: new UI feedback and DAW label are translated into nine languages',()=>{
 for(const lang of I18n.languages){
  for(const key of ['bitbergTheme','repeatMissingTitle','repeatCreateFailed']){
   assert.ok(I18n.messages[lang][key]?.trim(),`${lang}/${key}`);
  }
 }
});
