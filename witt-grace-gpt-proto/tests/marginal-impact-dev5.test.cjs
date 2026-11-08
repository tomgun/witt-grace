'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
const fs=require('node:fs');
const path=require('node:path');
const near=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
function make() {
 const project=C.createBlankProject('argument');project.settings.assessmentWeighting='structural';
 const root=C.rootNode(project);root.confidence=55;
 const a=C.addChild(project,root.id,'support');a.title='Support';a.confidence=85;a.impact=4;
 const b=C.addChild(project,root.id,'oppose');b.title='Oppose';b.confidence=70;b.impact=3;
 return {project,root,a,b};
}
function without(project,excludeId) {
 const clone=structuredClone(project);
 clone.nodes=clone.nodes.filter(n=>n.id!==excludeId);
 return C.evaluate(clone);
}
test('one-relationship-out effect matches an independently evaluated parent and preserves the document',()=>{
 const {project,root,a,b}=make();const before=JSON.stringify(project);
 const evals=C.evaluate(project), effects=C.marginalIndexEffects(project,evals);
 const current=evals.get(root.id).score;
 for(const child of [a,b]) {
  const effect=effects.get(child.id);
  assert.equal(effect.parentId,root.id);
  near(effect.currentScore,current);
  near(effect.withoutScore,without(project,child.id).get(root.id).score);
  near(effect.delta,current-effect.withoutScore);
  assert.equal(effect.provisional,false);
 }
 assert.ok(effects.get(a.id).delta>0);
 assert.ok(effects.get(b.id).delta<0);
 assert.equal(JSON.stringify(project),before);
});
test('actual index effect differs from raw edge weight when the parent is clamped to 100',()=>{
 const {project,root,a,b}=make();
 root.confidence=100;b.impact=0;a.confidence=100;a.impact=5;
 const effect=C.marginalIndexEffects(project,C.evaluate(project));
 assert.equal(C.evaluate(project).get(root.id).score,100);
 near(effect.get(a.id).delta,0);
 assert.equal(effect.has(b.id),false,'zero-impact edges never become significant');
 root.confidence=50;
 assert.ok(C.marginalIndexEffects(project,C.evaluate(project)).get(a.id).delta>0);
});
test('unclipped additive evidence is additive; clamping makes effects nonadditive',()=>{
 const {project,root,a,b}=make();b.relation='support';b.confidence=85;
 const result=C.evaluate(project).get(root.id);
 const effects=C.marginalIndexEffects(project,C.evaluate(project));
 assert.ok(effects.get(a.id).delta>0);
 assert.ok(effects.get(b.id).delta>0);
 assert.equal(Number((effects.get(a.id).delta+effects.get(b.id).delta).toFixed(6)), Number(result.delta.toFixed(6)));
 root.confidence=95;
 const capped=C.evaluate(project).get(root.id);
 const clippedEffects=C.marginalIndexEffects(project,C.evaluate(project));
 assert.equal(capped.score,100);
 assert.notEqual(Number(([...clippedEffects.values()].reduce((sum,e)=>sum+e.delta,0)).toFixed(6)), Number(capped.delta.toFixed(6)));
});
test('personal signed effects use only the chosen assessor and never fill missing ratings',()=>{
 const {project,root,a,b}=make(); const owner=project.users[0];
 const other={id:C.uid(),name:'Another',role:'editor',shares:1};project.users.push(other);
 for(const u of [owner,other])for(const n of [root,a,b])C.upsertVote(project,n.id,u.id, n.id===root.id?55:100);
 C.upsertEdgeAssessment(project,'primary',a.id,owner.id,-4);
 C.upsertEdgeAssessment(project,'primary',b.id,owner.id,0);
 C.upsertEdgeAssessment(project,'primary',a.id,other.id,5);
 C.upsertEdgeAssessment(project,'primary',b.id,other.id,4);
 const own=C.marginalIndexEffects(project,C.evaluateAssessor(project,owner.id));
 const otherEffects=C.marginalIndexEffects(project,C.evaluateAssessor(project,other.id));
 assert.ok(own.get(a.id).delta<0,'structural support becomes opposing for owner');
 assert.equal(own.has(b.id),false,'neutral relationship has no marginal effect');
 assert.ok(otherEffects.get(a.id).delta>0);
 assert.ok(otherEffects.get(b.id).delta>0);
 C.upsertVote(project,a.id,owner.id,51);
 const oldEdge=project.edgeAssessments.find(e=>e.userId===owner.id&&e.subjectId===a.id);
 oldEdge.fingerprint='outdated';
 assert.equal(C.marginalIndexEffects(project,C.evaluateAssessor(project,owner.id)).has(a.id),false);
 const missing=C.evaluateAssessor(project,owner.id).get(root.id);
 assert.equal(missing.incomplete,true);
 assert.equal(missing.score,55);
});
test('provisional effects can be shown but remain marked partial; missing base yields no effects',()=>{
 const {project,root,a,b}=make();const user=project.users[0];
 for(const node of [root,a,b])C.upsertVote(project,node.id,user.id,node.id===root.id?50:100);
 C.upsertEdgeAssessment(project,'primary',a.id,user.id,4);
 const partial=C.marginalIndexEffects(project,C.evaluateAssessor(project,user.id));
 assert.equal(partial.get(a.id).provisional,true);
 assert.equal(partial.has(b.id),false);
 project.votes=project.votes.filter(v=>v.nodeId!==root.id);
 assert.equal(C.marginalIndexEffects(project,C.evaluateAssessor(project,user.id)).has(a.id),true,'argument root has a neutral prior without its own assessment');
 project.votes=project.votes.filter(v=>v.nodeId!==a.id);
 assert.equal(C.marginalIndexEffects(project,C.evaluateAssessor(project,user.id)).size,0,'missing child credence disables its contribution');
});
test('AI-only reviews, constraints and values do not score but assessed secondary paths do',()=>{
 const {project,root,a,b}=make();
 const ai={id:C.uid(),name:'AI',role:'editor',shares:1,profileKind:'ai'};project.users.push(ai);
 const original=C.marginalIndexEffects(project,C.evaluate(project));
 C.upsertVote(project,a.id,ai.id,0);
 C.upsertEdgeAssessment(project,'primary',a.id,ai.id,-5);
 const secondary=C.addLink(project,a.id,b.id,'support',5);
 const value=C.addChild(project,root.id,'support');value.semanticType='value';value.impact=5;
 const gate=C.addChild(project,root.id,'oppose');gate.semanticType='constraint';gate.constraintStatus='unmet';gate.impact=5;
 const now=C.marginalIndexEffects(project,C.evaluate(project));
 near(now.get(a.id).delta,original.get(a.id).delta);
 assert.notEqual(now.get(b.id).delta,original.get(b.id).delta,'secondary rating changes B and its local effect');
 assert.equal(now.has(value.id),false);
 assert.equal(now.has(gate.id),false);
 assert.ok(now.has(secondary.id),'an explicit additional relationship has its own effect');
});
test('decision root and option boundaries are not marked as argumentative contributions',()=>{
 const p=C.createDemoProject(); const effects=C.marginalIndexEffects(p,C.evaluate(p));
 for(const n of p.nodes.filter(n=>n.relation==='option'))assert.equal(effects.has(n.id),false);
 assert.ok(effects.size>=2,'reasons under alternatives remain measurable');
});
test('UI presents leave-one-out differences and a non-additivity warning in all nine languages',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 const styles=fs.readFileSync(path.join(__dirname,'../src/styles.css'),'utf8');
 assert.match(src,/Core\.marginalIndexEffects\(project, evaluated\)/);
 assert.match(src,/importantNodeIds\.add\(item\.sourceId\|\|item\.childId\)/);
 assert.match(src,/badge\.title = importanceHint\(effect\)/);
 assert.match(src,/importanceHint\(effect\)/);
 assert.match(src,/difference\.title=importanceHint\(effect\)/);
 assert.match(styles,/reason-importance-badge/);
 const i18n=require('../src/i18n.js');
 for(const lang of i18n.languages)for(const key of ['importanceChange','importanceWhatIf','importanceExplanation','importanceProvisional'])
  assert.ok(i18n.messages[lang][key]?.length>0,`${lang}/${key}`);
});
