'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const Table = require('../src/table-model.js');
const clone = x => JSON.parse(JSON.stringify(x));
const approx = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);
function setup() {
  const p=C.createBlankProject('decision'), root=C.rootNode(p), owner=p.users[0].id;
  const group=C.addChild(p,root.id,'group',owner);group.title='Uimahalliin';
  const nested=C.addChild(p,group.id,'group',owner);nested.title='Lasten kanssa';
  const pool=C.addChild(p,nested.id,'option',owner);pool.title='Uimahalliin lasten kanssa';
  const alone=C.addChild(p,group.id,'option',owner);alone.title='Uimahalliin yksin';
  const cleanup=C.addChild(p,root.id,'option',owner);cleanup.title='Siivoamaan';
  return {p,root,group,nested,pool,alone,cleanup,owner};
}
test('dev19: nested structural groups roundtrip, show in outline/table and have NO scores, votes or reviews',()=>{
  const {p,group,nested,pool,alone,cleanup,owner}=setup();
  const validated=C.validateProject(clone(p));
  assert.deepEqual(validated,p);
  assert.equal(C.evaluate(p).get(group.id).score,null);
  assert.equal(C.evaluateAssessor(p,owner).get(nested.id).score,null);
  assert.equal(C.getBaseConfidence(p,group).base,null);
  assert.deepEqual(C.optionGroupPath(p,pool.id).map(n=>n.title),['Uimahalliin','Lasten kanssa']);
  assert.deepEqual(new Set(C.decisionRanking(p).map(x=>x.node.id)),new Set([pool.id,alone.id,cleanup.id]));
  assert.deepEqual(C.assessmentOrder(p).filter(id=>[group.id,nested.id].includes(id)),[]);
  assert.throws(()=>C.upsertVote(p,group.id,owner,80),/ei voi/);
  assert.throws(()=>C.upsertBallot(p,group.id,owner,75),/vaihtoehto/);
  assert.throws(()=>C.upsertEdgeAssessment(p,'primary',group.id,owner,4),/ei ole arvioitavaa suhdetta/);
  assert.equal(Table.projectRows(p).filter(r=>r.relation==='group').length,2);
  group.collapsed=true;
  assert.equal(C.visibleNodes(p).some(n=>n.id===pool.id),false);
  assert.equal(C.decisionRanking(p).length,3);
});
test('dev19: group creation, moves and deletions preserve option/ballot and group gates do not inherit',()=>{
  const {p,root,group,nested,pool,alone,cleanup,owner}=setup();
  const good=C.addChild(p,pool.id,'support',owner);good.confidence=100;good.impact=4;
  const before=C.evaluate(p).get(pool.id).score;
  C.upsertBallot(p,pool.id,owner,88);
  C.moveNode(p,pool.id,group.id);
  approx(C.evaluate(p).get(pool.id).score,before);
  assert.equal(p.ballots.find(b=>b.optionId===pool.id).preference,88);
  assert.equal(C.optionFeasibility(p,pool.id).status,'feasible');
  assert.ok(C.validateProject(clone(p)));
  assert.equal(C.canReparent(p,group.id,group.id),false);
  assert.equal(C.canReparent(p,group.id,nested.id),false);
  assert.equal(C.canReparent(p,alone.id,good.id),false);
  assert.throws(()=>C.addChild(p,group.id,'support'),/ryhmä voi sisältää vain/);
  assert.throws(()=>C.addChild(p,cleanup.id,'group'),/Vaihtoehto tai vaihtoehtoryhmä/);
  const blocked=clone(p);blocked.nodes.find(n=>n.id===group.id).confidence=70;
  assert.throws(()=>C.validateProject(blocked),/neutraaliarvot/);
  const wrongParent=clone(p);wrongParent.nodes.find(n=>n.id===cleanup.id).parentId=good.id;
  assert.throws(()=>C.validateProject(wrongParent),/virheellisellä tasolla/);
  const round=C.startVotingRound(p);
  assert.equal(round.optionIds.length,3);
  assert.ok(!round.optionIds.includes(group.id));
  assert.throws(()=>C.addChild(p,root.id,'group'),/äänestyksen aikana/);
  assert.equal(C.canReparent(p,pool.id,nested.id),false);
  assert.throws(()=>C.removeSubtree(p,group.id),/Aanestysvaihtoehtoa/);
});
test('dev19: contextual reason uses retain one semantic identity, distinct nodes and independent individual p/w',()=>{
  const {p,pool,cleanup,owner}=setup();p.settings.assessmentWeighting='structural';
  const other={id:'other',name:'Bertta',role:'editor',shares:10};p.users.push(other);
  const concept=C.addReasonConcept(p,'Saamme perheen yhteistä aikaa','fact');
  const a=C.attachReasonConcept(p,concept.id,pool.id,owner);
  const b=C.attachReasonConcept(p,concept.id,cleanup.id,owner);
  assert.notEqual(a.id,b.id);
  assert.equal(a.title,b.title);
  // dev24 uses the same 100% proposed draft baseline as new ordinary reasons.
  // These are not fabricated personal assessments.
  assert.equal(a.confidence,100);assert.equal(b.confidence,100);
  assert.equal(a.relation,'neutral');assert.equal(b.relation,'neutral');
  assert.equal(p.votes.length,0);assert.equal(p.edgeAssessments.length,0);
  C.applyPersonalAssessment(p,a.id,owner,70,4);
  C.applyPersonalAssessment(p,b.id,owner,90,5);
  C.applyPersonalAssessment(p,a.id,other.id,55,2);
  const aa=C.evaluateAssessor(p,owner),bb=C.evaluateAssessor(p,other.id);
  approx(aa.get(pool.id).score,50+5*4*.7);
  approx(aa.get(cleanup.id).score,50+5*5*.9);
  approx(bb.get(pool.id).score,50+5*2*.55);
  assert.equal(bb.get(cleanup.id).incomplete,true);
  assert.equal(bb.get(cleanup.id).score,50); // no fabricated review despite neutral reference baseline
  assert.equal(C.evaluate(p).get(pool.id).score,50); // structural defaults remain neutral
  assert.equal(C.evaluate(p).get(cleanup.id).score,50);
  assert.equal(C.personalCredence(p,b.id,owner).confidence,90);
  assert.equal(C.personalCredence(p,a.id,owner).confidence,70);
  assert.equal(C.personalCredence(p,b.id,other.id),null);
  assert.equal(p.ballots.length,0);
  assert.ok(C.validateProject(clone(p)));
  assert.throws(()=>C.attachReasonConcept(p,concept.id,pool.id),/jo tässä kohteessa/);
  assert.equal(C.canReparent(p,a.id,cleanup.id),false);
});
test('dev19: rename stales relation assessments without losing historical values; detach preserves work',()=>{
  const {p,pool,cleanup,owner}=setup();
  const concept=C.addReasonConcept(p,'Yhteinen aika');
  const a=C.attachReasonConcept(p,concept.id,pool.id,owner);
  const b=C.attachReasonConcept(p,concept.id,cleanup.id,owner);
  C.applyPersonalAssessment(p,a.id,owner,65,2.5);
  assert.equal(C.personalInfluence(p,'primary',a.id,owner).current,true);
  C.updateReasonConcept(p,concept.id,'Perheen yhteinen aika');
  assert.equal(a.title,'Perheen yhteinen aika');assert.equal(b.title,'Perheen yhteinen aika');
  assert.equal(C.personalInfluence(p,'primary',a.id,owner).current,false);
  assert.equal(C.personalCredence(p,a.id,owner).confidence,65);
  assert.throws(()=>C.removeReasonConcept(p,concept.id),/Irrota/);
  C.detachReasonConcept(p,a.id);
  assert.equal(a.reasonConceptId,undefined);
  assert.equal(C.personalCredence(p,a.id,owner).confidence,65);
  C.detachReasonConcept(p,b.id);C.removeReasonConcept(p,concept.id);
  assert.deepEqual(p.reasonConcepts,[]);
  assert.equal(p.nodes.find(n=>n.id===a.id).title,'Perheen yhteinen aika');
  assert.ok(C.validateProject(clone(p)));
});
test('dev19: invalid concept references, duplicates, wrong semantic types, raw mismatch and group ratings are rejected',()=>{
  const {p,pool,cleanup,group,owner}=setup();
  const c=C.addReasonConcept(p,'Yhteistä aikaa','fact');
  const a=C.attachReasonConcept(p,c.id,pool.id,owner);
  assert.throws(()=>C.attachReasonConcept(p,c.id,group.id),/konkreettisen vaihtoehdon/);
  assert.throws(()=>C.addReasonConcept(p,'Uusi','prerequisite'),/semanttinen tyyppi/);
  const unknown=clone(p);unknown.nodes.find(n=>n.id===a.id).reasonConceptId='unknown';
  assert.throws(()=>C.validateProject(unknown),/kontekstisidonnainen/);
  const title=clone(p);title.nodes.find(n=>n.id===a.id).title='Muu teksti';
  assert.throws(()=>C.validateProject(title),/kontekstisidonnainen/);
  const duplicate=clone(p);const b=C.attachReasonConcept(duplicate,c.id,cleanup.id,owner);b.parentId=pool.id;
  assert.throws(()=>C.validateProject(duplicate),/kahdesti/);
  const groupVote=clone(p);groupVote.votes.push({id:'group-review',nodeId:group.id,userId:owner,confidence:99,updatedAt:'2026-11-07'});
  assert.throws(()=>C.validateProject(groupVote),/Arvokäsitteelle/);
  const groupEdge=clone(p);groupEdge.edgeAssessments.push({id:'group-edge',userId:owner,subjectType:'primary',subjectId:group.id,influence:4,fingerprint:'f',updatedAt:'2026-11-07'});
  assert.throws(()=>C.validateProject(groupEdge),/Suhdearvio/);
});
test('dev19: value concepts are identity-only, no truth rating or heuristic bonus',()=>{
  const {p,pool,owner}=setup();
  const concept=C.addReasonConcept(p,'Perheen yhteinen aika','value');
  const use=C.attachReasonConcept(p,concept.id,pool.id,owner);
  assert.deepEqual(C.assessmentFields(use),{credence:false,impact:true});
  assert.throws(()=>C.upsertVote(p,use.id,owner,70),/ei voi/);
  C.upsertEdgeAssessment(p,'primary',use.id,owner,5);
  assert.equal(C.evaluate(p).get(pool.id).score,50);
  assert.equal(C.optionValueProfile(p,pool.id,owner).items.find(i=>i.nodeId===use.id).impact,5);
});
test('dev19: unchanged baseline projects validate without concepts or group nodes (additive schema v5)',()=>{
  const doc=C.createDemoProject();delete doc.reasonConcepts;
  const old=C.validateProject(clone(doc));
  assert.equal(old.reasonConcepts,undefined);
  assert.deepEqual(old,doc);
  assert.equal(C.VERSION,8);
  assert.equal(doc.settings.scoring,'evidence-v3-links');
});
test('dev19: moving a context-rated concrete option between groups preserves separate human reviews and ballots',()=>{
  const {p,group,nested,pool,cleanup,owner}=setup();
  const concept=C.addReasonConcept(p,'Onnistuu perheen yhteinen aika');
  const first=C.attachReasonConcept(p,concept.id,pool.id,owner);
  const second=C.attachReasonConcept(p,concept.id,cleanup.id,owner);
  C.applyPersonalAssessment(p,first.id,owner,70,4);
  C.applyPersonalAssessment(p,second.id,owner,90,5);
  C.upsertBallot(p,pool.id,owner,77);
  const before=C.evaluateAssessor(p,owner).get(pool.id).score;
  C.moveNode(p,pool.id,group.id);
  approx(C.evaluateAssessor(p,owner).get(pool.id).score,before);
  assert.equal(C.personalCredence(p,first.id,owner).confidence,70);
  assert.equal(C.personalCredence(p,second.id,owner).confidence,90);
  assert.equal(p.ballots.find(b=>b.optionId===pool.id).preference,77);
  assert.equal(C.optionGroupPath(p,pool.id).length,1);
  assert.deepEqual(C.validateProject(clone(p)),p);
});
test('dev19: newly inserted groups avoid already placed card rectangles without rearranging user nodes',()=>{
  const {p,group,owner}=setup();
  C.autoLayout(p);
  const before=new Map(p.nodes.map(n=>[n.id,clone(n.position)]));
  const inserted=C.addChild(p,group.id,'group',owner);
  for(const [id,pos] of before) {
    assert.deepEqual(p.nodes.find(n=>n.id===id).position,pos);
    if(Math.abs(pos.x-inserted.position.x)<276)
      assert.ok(Math.abs(pos.y-inserted.position.y)>=198,`Group overlaps ${id}`);
  }
  assert.equal(C.evaluate(p).get(inserted.id).score,null);
  assert.deepEqual(C.validateProject(clone(p)),p);
});
