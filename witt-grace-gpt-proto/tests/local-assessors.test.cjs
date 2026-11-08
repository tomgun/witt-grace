const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../src/core.js');
const Table = require('../src/table-model.js');
const History = require('../src/history.js');
const projectRoot = path.resolve(__dirname,'..');

function setup() {
  const doc = C.createBlankProject('argument');
  const root = C.rootNode(doc);
  root.title = 'Hankinta kannattaa';
  const b = C.addChild(doc, root.id, 'oppose'); b.title = 'Liian kallis';
  const c = C.addChild(doc, b.id, 'oppose'); c.title = 'Säästöt ylittävät kulut';
  const link = C.addLink(doc,c.id,root.id,'support',3);
  const alice = doc.users[0]; alice.name = 'Aino';
  const bob = { id: C.uid(), name:'Bertta', role:'editor', shares:9999 };
  doc.users.push(bob);
  return {doc, root, b, c, link, alice, bob};
}
const clone = doc => structuredClone(doc);

test('two local profiles assess the same claim and relation without overwriting each other', () => {
  const {doc,b,alice,bob} = setup();
  const original = {title:b.title, parentId:b.parentId, relation:b.relation, impact:b.impact, confidence:b.confidence};
  C.applyPersonalAssessment(doc,b.id,alice.id,92,-4);
  C.applyPersonalAssessment(doc,b.id,bob.id,18,+2);
  assert.equal(C.personalCredence(doc,b.id,alice.id).confidence,92);
  assert.equal(C.personalCredence(doc,b.id,bob.id).confidence,18);
  assert.equal(C.personalInfluence(doc,'primary',b.id,alice.id).record.influence,-4);
  assert.equal(C.personalInfluence(doc,'primary',b.id,bob.id).record.influence,2);
  assert.equal(doc.votes.length,2);
  assert.equal(doc.edgeAssessments.length,2);
  assert.deepEqual({title:b.title,parentId:b.parentId,relation:b.relation,impact:b.impact,confidence:b.confidence},original);
});

test('equal-weight credence aggregate ignores decision-ballot shares and relation ratings do not alter score', () => {
  const {doc,root,b,alice,bob} = setup();
  const prior = C.evaluate(doc).get(root.id).score;
  C.upsertEdgeAssessment(doc,'primary',b.id,alice.id,-5);
  C.upsertEdgeAssessment(doc,'primary',b.id,bob.id,5);
  assert.equal(C.evaluate(doc).get(root.id).score,prior);
  assert.equal(C.influenceSummary(doc,'primary',b.id).mean,0);
  C.upsertVote(doc,b.id,alice.id,10);
  C.upsertVote(doc,b.id,bob.id,90);
  assert.equal(C.getBaseConfidence(doc,b).base,50);
  assert.equal(C.getBaseConfidence(doc,b).votesCount,2);
  assert.equal(C.optionPreference(doc,'not-an-option').preferenceVoters,0);
});

test('primary and secondary relation assessments coexist for the same claim', () => {
  const {doc,root,b,c,link,alice,bob} = setup();
  C.applyPersonalAssessment(doc,c.id,alice.id,95,-3.5);
  C.upsertEdgeAssessment(doc,'secondary',link.id,alice.id,4);
  C.upsertEdgeAssessment(doc,'secondary',link.id,bob.id,1.5);
  assert.equal(C.personalInfluence(doc,'primary',c.id,alice.id).record.influence,-3.5);
  assert.equal(C.personalInfluence(doc,'secondary',link.id,alice.id).record.influence,4);
  assert.deepEqual(doc.links.map(l=>l.impact),[3]);
  const details=Table.assessmentDetails(doc,c.id);
  assert.equal(details.impactReviews.length,1);
  assert.equal(details.links[0].impactReviews.length,2);
  assert.equal(details.links[0].impactReviews.find(a=>a.name==='Aino').influence,4);
});

test('claim edits and reparenting mark prior impact as stale without retargeting it', () => {
  const {doc,root,b,c,alice} = setup();
  C.applyPersonalAssessment(doc,c.id,alice.id,75,-4);
  assert.ok(C.personalInfluence(doc,'primary',c.id,alice.id).current);
  b.title='Ei niin kallis';
  assert.equal(C.personalInfluence(doc,'primary',c.id,alice.id).current,false);
  assert.equal(C.influenceSummary(doc,'primary',c.id).count,0);
  assert.equal(Table.assessmentDetails(doc,c.id).impactReviews[0].stale,true);
  C.upsertEdgeAssessment(doc,'primary',c.id,alice.id,-2);
  assert.ok(C.personalInfluence(doc,'primary',c.id,alice.id).current);
  C.moveNode(doc,c.id,root.id);
  assert.equal(C.personalInfluence(doc,'primary',c.id,alice.id).current,false);
  assert.equal(doc.edgeAssessments.length,1);
});

test('secondary relation edits mark per-user impacts stale, not structurally changed', () => {
  const {doc,link,alice} = setup();
  C.upsertEdgeAssessment(doc,'secondary',link.id,alice.id,+5);
  C.updateLink(doc,link.id,'oppose',2);
  assert.equal(C.personalInfluence(doc,'secondary',link.id,alice.id).current,false);
  assert.equal(C.influenceSummary(doc,'secondary',link.id).count,0);
  C.upsertEdgeAssessment(doc,'secondary',link.id,alice.id,-3);
  assert.equal(C.influenceSummary(doc,'secondary',link.id).mean,-3);
});

test('duplicate per-user answers update existing record, preserving two profiles', () => {
  const {doc,b,alice,bob} = setup();
  C.applyPersonalAssessment(doc,b.id,alice.id,50,-4);
  C.applyPersonalAssessment(doc,b.id,bob.id,50,-1);
  C.applyPersonalAssessment(doc,b.id,alice.id,70,-5);
  assert.equal(doc.votes.length,2);
  assert.equal(doc.edgeAssessments.length,2);
  assert.equal(C.personalInfluence(doc,'primary',b.id,bob.id).record.influence,-1);
  assert.equal(C.personalCredence(doc,b.id,alice.id).confidence,70);
});

test('v4 export/import roundtrip preserves all participant IDs, ratings and links', () => {
  const {doc,c,link,alice,bob} = setup();
  C.applyPersonalAssessment(doc,c.id,alice.id,99,-4);
  C.applyPersonalAssessment(doc,c.id,bob.id,27,1);
  C.upsertEdgeAssessment(doc,'secondary',link.id,bob.id,4);
  const restored = C.validateProject(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(restored,doc);
  assert.equal(restored.schemaVersion,C.VERSION);
  assert.equal(restored.edgeAssessments.length,3);
});

test('v3 import upgrades to v4 without injecting fake individual assessments', () => {
  const source=JSON.parse(fs.readFileSync(path.join(projectRoot,'examples/product-launch-with-links.witt.json'),'utf8'));
  const before=JSON.stringify(source);
  const doc=C.validateProject(source);
  assert.equal(doc.schemaVersion,C.VERSION);
  assert.deepEqual(doc.edgeAssessments,[]);
  assert.equal(JSON.stringify(source),before);
});

test('invalid references, unbounded values, and duplicate ratings rejected by validator', () => {
  const {doc,b,alice,bob,link} = setup();
  C.applyPersonalAssessment(doc,b.id,alice.id,70,-4);
  const invalids=[];
  const d1=clone(doc);d1.edgeAssessments[0].userId='unknown';invalids.push(d1);
  const d2=clone(doc);d2.edgeAssessments[0].subjectId='unknown';invalids.push(d2);
  const d3=clone(doc);d3.edgeAssessments[0].influence=-8;invalids.push(d3);
  const d4=clone(doc);d4.edgeAssessments.push({...d4.edgeAssessments[0],id:'different-id'});invalids.push(d4);
  const d5=clone(doc);d5.edgeAssessments[0].fingerprint='<'.repeat(900);invalids.push(d5);
  const d6=clone(doc);d6.edgeAssessments[0].influence=0.33;invalids.push(d6);
  for(const bad of invalids) assert.throws(()=>C.validateProject(bad));
  const before=JSON.stringify(doc);
  assert.throws(()=>C.upsertEdgeAssessment(doc,'secondary','missing',alice.id,1));
  assert.throws(()=>C.upsertEdgeAssessment(doc,'primary',b.id,'stranger',-1));
  assert.throws(()=>C.upsertEdgeAssessment(doc,'primary',b.id,bob.id,Infinity));
  assert.equal(JSON.stringify(doc),before);
});

test('deleting a subtree or secondary link removes orphaned profile reviews', () => {
  const {doc,b,c,link,alice} = setup();
  C.applyPersonalAssessment(doc,c.id,alice.id,70,-3);
  C.upsertEdgeAssessment(doc,'secondary',link.id,alice.id,4);
  C.removeLink(doc,link.id);
  assert.equal(doc.edgeAssessments.length,1);
  C.removeSubtree(doc,b.id);
  assert.equal(doc.edgeAssessments.length,0);
  assert.equal(doc.votes.length,0);
  assert.deepEqual(doc.links,[]);
  assert.doesNotThrow(()=>C.validateProject(doc));
});

test('profile removal retains attribution integrity, removes own answers only and is undoable', () => {
  const {doc,b,alice,bob} = setup();
  C.applyPersonalAssessment(doc,b.id,alice.id,70,-4);
  C.applyPersonalAssessment(doc,b.id,bob.id,90,1);
  const history=History.createHistory();
  const before=History.snapshot(doc,{});
  C.removeLocalProfile(doc,bob.id);
  history.record(before,History.snapshot(doc,{}));
  assert.equal(doc.users.length,1);
  assert.equal(doc.votes.length,1);
  assert.equal(doc.edgeAssessments.length,1);
  assert.throws(()=>C.removeLocalProfile(doc,alice.id),/Omistaja/);
  const saved=history.undo(History.snapshot(doc,{}));
  assert.deepEqual(C.validateProject(History.unpack(saved).project).users.length,2);
  const ownerNode=C.addChild(doc,b.id,'support',alice.id);
  assert.ok(ownerNode.createdBy===alice.id);
});

test('do not allow deleting the author of a surviving claim or silently reassign authorship', () => {
  const {doc,root,bob} = setup();
  const n=C.addChild(doc,root.id,'support',bob.id);
  assert.throws(()=>C.removeLocalProfile(doc,bob.id),/laatijaprofiilia/);
  assert.equal(n.createdBy,bob.id);
});

test('local profile controls, two role-independent review inputs and privacy notice are in the UI', () => {
  const html=fs.readFileSync(path.join(projectRoot,'index.html'),'utf8');
  const css=fs.readFileSync(path.join(projectRoot,'src/styles.css'),'utf8');
  const app=fs.readFileSync(path.join(projectRoot,'src/app.js'),'utf8');
  assert.match(html,/id="actorSelect"/);
  assert.match(html,/id="actorQuickSelect"/);
  assert.match(html,/data-i18n="profilePrivacy"/);
  assert.doesNotMatch(css,/\.legacy-only\s*\{\s*display:\s*none/);
  assert.match(app,/Core\.applyPersonalAssessment/);
  assert.match(app,/Core\.upsertEdgeAssessment/);
  assert.match(app,/Core\.upsertVote/);
});
