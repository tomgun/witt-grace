const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const Core=require('../src/core.js');const Examples=require('../src/examples.js');const Lens=require('../src/review-lens.js');
const root=path.resolve(__dirname,'..');

test('five current-schema examples contain named assessors and valid ratings',()=>{
 const demos=Examples.list();assert.equal(demos.length,5);
 for(const entry of demos){
  const original=Examples.get(entry.id);assert.equal(original.schemaVersion,Core.VERSION);
  const validation=Core.validateProject(original);assert.equal(validation.users.length,3);
  assert.ok(validation.nodes.length>=10);
  assert.ok(validation.votes.length>0);
  assert.ok(validation.edgeAssessments.length>=10);
  assert.ok(validation.links.length>=1);
  assert.equal(Object.hasOwn(validation,'valueAssessments'),false,'no separate value-priority axis');
  assert.equal(validation.ballots.length,0,'demo personal assessments are not ballots');
  const file=JSON.parse(fs.readFileSync(path.join(root,'examples',entry.filename),'utf8'));
  assert.deepEqual(original,file,'standalone JS data and downloadable file must match');
  assert.equal(entry.nodeCount,file.nodes.length);
 }
});
test('example library returns defensive copies',()=>{
 const first=Examples.get('painonhallinta');first.nodes[0].title='TAMPER';first.users[0].name='TAMPER';
 const next=Examples.get('painonhallinta');assert.notEqual(next.nodes[0].title,'TAMPER');assert.notEqual(next.users[0].name,'TAMPER');
 assert.equal(Examples.get('nope'),null);
});
test('sample impact assessments match current relation fingerprint, including double rebuttal',()=>{
 for(const entry of Examples.list()){
  const p=Core.validateProject(Examples.get(entry.id));
  for(const item of p.edgeAssessments){
    assert.equal(Core.personalInfluence(p,item.subjectType,item.subjectId,item.userId).current,true);
  }
  assert.ok(p.nodes.some(n=>n.relation==='oppose'&&p.nodes.some(parent=>parent.id===n.parentId&&parent.relation==='oppose')));
 }
});
test('review lens is read-only and does not change scores, ballots, or shared tree',()=>{
 const p=Core.validateProject(Examples.get('painonhallinta'));const original=JSON.stringify(p);
 const before=JSON.stringify([...Core.evaluate(p)]);
 for(const ids of [null,[],[p.users[0].id],[p.users[1].id,p.users[2].id]]){
  const result=Lens.projectLens(p,ids);
  assert.equal(result.selectedCount,ids===null?3:ids.length);
  assert.equal(result.credence.size,p.nodes.length);
  assert.ok(result.disagreements.length>=0);
 }
 assert.equal(JSON.stringify(p),original);
 assert.equal(JSON.stringify([...Core.evaluate(p)]),before);
});
test('one selected person shows their actual ratings with no implicit baseline fallbacks',()=>{
 const p=Core.validateProject(Examples.get('etatyomalli'));
 const picked=p.users[1].id;
 const lens=Lens.projectLens(p,[picked]);
 assert.equal(lens.selectedCount,1);assert.equal(lens.filtered,true);
 for(const [nodeId,data] of lens.credence){
  assert.ok(data.count<=1);
  const vote=p.votes.find(v=>v.nodeId===nodeId&&v.userId===picked);
  assert.equal(data.mean,vote?vote.confidence:null);
 }
 assert.equal(lens.disagreements.length,0);
 assert.equal(lens.comparisons.length,0);
});
test('analysis sorts honest differences, contains only selected individuals and reveals split signs',()=>{
 const p=Core.validateProject(Examples.get('painonhallinta'));const ids=p.users.slice(0,2).map(u=>u.id);
 const lens=Lens.projectLens(p,ids);
 assert.equal(lens.disagreements.length>5,true);
 for(let i=1;i<lens.disagreements.length;i++)assert.ok(lens.disagreements[i-1].spread>=lens.disagreements[i].spread);
 for(const row of lens.disagreements){
  assert.equal(row.count,2);
  for(const detail of row.details)assert.ok(ids.some(id=>detail.startsWith(p.users.find(u=>u.id===id).name+':')));
 }
 assert.equal(lens.comparisons.length,1);
 assert.equal(lens.comparisons[0].shared>3,true);
});
test('missing or unknown selected assessors never accidentally expose everybody',()=>{
 const p=Core.validateProject(Examples.get('painonhallinta'));
 const none=Lens.projectLens(p,['unknown']);
 assert.equal(none.selectedCount,0);assert.equal(none.filtered,true);
 for(const st of none.credence.values())assert.equal(st.mean,null);
 assert.equal(none.disagreements.length,0);
});
test('shared views have no participant count threshold or ideological profiling',()=>{
 const p=Core.createBlankProject('argument');
 const lens=Lens.projectLens(p);
 assert.equal(lens.selectedCount,1);
 assert.equal(lens.comparisons.length,0);
 assert.equal(lens.disagreements.length,0);
});
test('tutorial, examples, and assessor lens are accessible from app and bundled in the standalone build',()=>{
 const h=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const a=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
 const build=fs.readFileSync(path.join(root,'tools/build.cjs'),'utf8');
 for(const id of ['btnHomeTutorial','btnTutorial','tutorialPanel','tutorialClose','tutorialNext','examplesDialog','exampleCards','reviewLensDialog','lensPeople','lensInsights','btnReviewLens','btnReviewLensQuick','btnReviewLensTable']){
  assert.ok(h.includes('id="'+id+'"'),id);
  assert.ok(a.includes("$('"+id+"')") || (id.startsWith('btnReviewLens') && a.includes("['btnReviewLens','btnReviewLensTable','btnReviewLensQuick']")),id);
 }
 assert.match(a,/function tutorialCheck\(/);
 assert.match(a,/function openReviewLens\(/);
 assert.ok(build.includes('examples.js'));
 assert.ok(build.includes('review-lens.js'));
});

test('argument examples retain their existing root secondary links on Decision-mode switch',()=>{
 for(const entry of Examples.list().filter(e=>e.id!=='pilvialusta')){
  const p=Core.validateProject(Examples.get(entry.id));
  const originalLinks=JSON.stringify(p.links);
  const originalVotes=JSON.stringify(p.votes);
  p.mode='decision'; Core.rootNode(p).kind='decision';
  const decision=Core.validateProject(p);
  assert.equal(JSON.stringify(decision.links),originalLinks,entry.id);
  assert.equal(JSON.stringify(decision.votes),originalVotes,entry.id);
  decision.mode='argument';Core.rootNode(decision).kind='claim';
  assert.deepEqual(Core.validateProject(decision).links,JSON.parse(originalLinks),entry.id);
 }
});
