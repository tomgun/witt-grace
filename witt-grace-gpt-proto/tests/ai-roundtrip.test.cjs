'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
const AI=require('../src/ai-roundtrip.js');
const fs=require('node:fs');
const path=require('node:path');
function sample() {
  const doc=C.createBlankProject();
  const root=doc.nodes[0];root.title='Is the system a good purchase?';root.confidence=50;
  const costly=C.addChild(doc,root.id,'oppose',doc.users[0].id);costly.title='Acquisition is too expensive';
  const useful=C.addChild(doc,root.id,'support',doc.users[0].id);useful.title='It solves the task';
  C.upsertVote(doc,costly.id,doc.users[0].id,90);
  C.upsertVote(doc,root.id,doc.users[0].id,50);
  C.upsertEdgeAssessment(doc,'primary',costly.id,doc.users[0].id,-4);
  C.addComment(doc,costly.id,'Original human note','Human');
  return C.validateProject(doc);
}
function response(doc) {
  const req=AI.makeRequest(doc,C,'fi');
  return {format:AI.RESPONSE_FORMAT,projectId:req.projectId,baseFingerprint:req.baseFingerprint,
    assessor:'Claude 42',
    claims:[
      {tempId:'savings',parentId:doc.nodes[1].id,relation:'oppose',title:'Three-year savings exceed cost'},
      {tempId:'details',parentId:'savings',relation:'support',title:'Support cost is lower'}
    ],
    links:[{sourceId:'savings',targetId:doc.nodes[2].id,relation:'support',influence:3.5}],
    assessments:[
      {nodeId:'savings',credence:71,primaryInfluence:-4},
      {nodeId:'details',credence:65,primaryInfluence:2},
      {nodeId:doc.nodes[1].id,credence:90,primaryInfluence:2},
      {nodeId:doc.nodes[2].id,credence:55,primaryInfluence:0}
    ],
    comments:[{nodeId:'savings',body:'AI caveat: verify actual savings.'},{nodeId:doc.nodes[1].id,body:'<img onerror=alert(1)> untrusted text'}]
  };
}
test('full existing WITT document and instructions are in explicit AI export, including humans and comments',()=>{
  const doc=sample();const req=AI.makeRequest(doc,C);
  assert.equal(req.format,AI.REQUEST_FORMAT);
  assert.deepEqual(req.document,doc);
  assert.equal(req.baseFingerprint,AI.fingerprint(doc));
  const prompt=AI.makePrompt(req);
  for(const part of ['Original human note',doc.nodes[1].id,req.baseFingerprint,'witt-ai-review-v1'])assert.ok(prompt.includes(part));
  assert.deepEqual(C.validateProject(doc),doc);
});
test('review patch adds nested claims, extra link, AI assessments and comments; originals never replaced',()=>{
  const doc=sample(), before=JSON.stringify(doc);
  const proposed=AI.prepareMerge(doc,response(doc),C);
  assert.equal(JSON.stringify(doc),before);
  assert.equal(proposed.project.nodes.length,doc.nodes.length+2);
  assert.equal(proposed.project.links.length,1);
  assert.equal(proposed.project.votes.length,doc.votes.length+4);
  assert.equal(proposed.project.edgeAssessments.length,doc.edgeAssessments.length+5);
  assert.equal(proposed.project.comments.length,doc.comments.length+2);
  assert.equal(proposed.assessor,'AI · Claude 42');
  assert.deepEqual(proposed.project.votes.filter(r=>r.userId===doc.users[0].id),doc.votes);
  assert.deepEqual(proposed.project.comments.filter(r=>r.authorName==='Human'),doc.comments);
  assert.deepEqual(C.validateProject(JSON.parse(JSON.stringify(proposed.project))),proposed.project);
  const author=proposed.project.users.find(u=>u.name===proposed.assessor);
  assert.ok(proposed.project.nodes.some(n=>n.createdBy===author.id));
  const link=proposed.project.links[0];
  assert.equal(C.personalInfluence(proposed.project,'secondary',link.id,author.id).record.influence,3.5);
  assert.equal(C.personalInfluence(proposed.project,'primary',proposed.claims[0].nodeId,author.id).record.influence,-4);
});
test('AI reviewer is NEVER silently included in the human aggregate heuristic',()=>{
  const doc=sample();const before=C.evaluate(doc).get(doc.nodes[1].id).base;
  const proposed=AI.prepareMerge(doc,response(doc),C).project;
  assert.equal(C.evaluate(proposed).get(doc.nodes[1].id).base,before);
  assert.equal(C.getBaseConfidence(proposed,doc.nodes[1]).votesCount,1);
  const ai=proposed.users.find(u=>C.isAIProfile(u));
  assert.equal(C.personalCredence(proposed,doc.nodes[1].id,ai.id).confidence,90);
  assert.notEqual(C.personalCredence(proposed,doc.nodes[1].id,doc.users[0].id).confidence,undefined);
});
test('per-assessor index uses personally reversed or neutral influence and never falls back to unreviewed structural values',()=>{
  const doc=sample(),root=doc.nodes[0],child=doc.nodes[1];
  const second={id:C.uid(),name:'Second',shares:2,role:'editor'};doc.users.push(second);
  C.upsertVote(doc,root.id,second.id,50);
  C.upsertVote(doc,child.id,second.id,90);
  C.upsertEdgeAssessment(doc,'primary',child.id,second.id,5);
  const score1=C.evaluateAssessor(doc,doc.users[0].id).get(root.id);
  const score2=C.evaluateAssessor(doc,second.id).get(root.id);
  assert.ok(score1.score<50 && score2.score>50,'personal influence direction must matter');
  assert.ok(score2.incomplete,'missing review on another child must be visible');
  C.upsertEdgeAssessment(doc,'primary',child.id,second.id,0);
  assert.equal(C.evaluateAssessor(doc,second.id).get(root.id).score,50);
  const third={id:C.uid(),name:'No reviews',shares:1,role:'editor'};doc.users.push(third);
  const unrated=C.evaluateAssessor(doc,third.id).get(root.id);
  assert.equal(unrated.score,50,'an unreviewed argument root retains a neutral internal prior');
  assert.equal(unrated.incomplete,true,'missing child reviews are not fabricated');
});
test('import rejects wrong document, stale context and invalid references atomically',()=>{
  const doc=sample(), before=JSON.stringify(doc);
  const wrong=response(doc);wrong.projectId='someone-else';assert.throws(()=>AI.prepareMerge(doc,wrong,C),/different document/);
  const stale=response(doc);stale.baseFingerprint='abcdef1234567890';assert.throws(()=>AI.prepareMerge(doc,stale,C),/changed after export/);
  const dangling=response(doc);dangling.claims[0].parentId='missing';assert.throws(()=>AI.prepareMerge(doc,dangling,C),/missing\/cyclic/);
  const cyclic=response(doc);cyclic.claims[0].parentId='details';assert.throws(()=>AI.prepareMerge(doc,cyclic,C),/missing\/cyclic/);
  assert.equal(JSON.stringify(doc),before);
});
test('input rejects impersonation fields, duplicate assessments, invalid scales, malformed JSON and zero-change replies',()=>{
  const doc=sample(),bad=response(doc);
  bad.humanUserId=doc.users[0].id;assert.throws(()=>AI.validatePatch(bad),/unexpected/);delete bad.humanUserId;
  bad.assessments.push(bad.assessments[0]);assert.throws(()=>AI.validatePatch(bad),/duplicate/);bad.assessments.pop();
  bad.assessments[0].primaryInfluence=-4.25;assert.throws(()=>AI.validatePatch(bad),/Influence/);
  bad.assessments[0].primaryInfluence=-4;
  bad.assessments[0].credence=101;assert.throws(()=>AI.validatePatch(bad),/Credence/);
  assert.throws(()=>AI.validatePatch('{not-json'));assert.throws(()=>AI.validatePatch({format:AI.RESPONSE_FORMAT}),/missing/);
  bad.assessments=[];bad.claims=[];bad.links=[];bad.comments=[];assert.throws(()=>AI.validatePatch(bad),/Empty/);
});
test('review patch cannot overwrite structural node data or change shared votes/ballots',()=>{
  const doc=sample(), reply=response(doc);
  reply.claims[0].confidence=99;
  assert.throws(()=>AI.prepareMerge(doc,reply,C),/unexpected/);
  delete reply.claims[0].confidence;
  reply.ballots=[];assert.throws(()=>AI.prepareMerge(doc,reply,C),/unexpected/);
  assert.equal(C.validateProject(doc).nodes[1].title,'Acquisition is too expensive');
});
test('editor exposes clear export/preview/import actions, isolated file picker and standalone build wiring',()=>{
  const page=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
  for(const id of ['btnAIReview','btnHomeAIReview','aiReviewInput','aiReviewDialog','btnAIReviewExport','btnAIReviewImport','aiReviewPreviewDialog','btnAIReviewApply','btnAIReviewReject'])assert.ok(page.includes(`id="${id}"`),id);
  // v2 generalizes the UI to AI and human/WITT change proposals. The v1 module
  // remains independently tested but the editor uses the reviewed v2 merge.
  assert.match(app,/Contributions\.merge/);
  assert.match(page,/src\/contributions\.js/);
  assert.match(page,/id="proposalSourceKind"/);
  assert.ok(!app.includes('fetch('),'app must not upload document itself');
});
