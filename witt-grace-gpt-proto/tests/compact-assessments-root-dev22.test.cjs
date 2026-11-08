'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../src/core.js');
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
function tree(){
 const p=C.createBlankProject('argument'),u=p.users[0].id,root=C.rootNode(p);
 const a=C.addChild(p,root.id,'support',u);a.title='A supports the thesis';
 const b=C.addChild(p,a.id,'support',u);b.title='B supports A';
 return {p,u,root,a,b};
}
test('dev22: newly created premise defaults to 100% but no personal or collective vote is invented',()=>{
 const {p,u,root,a,b}=tree();
 assert.equal(root.confidence,50,'root neutral reference remains distinct from premise default');
 assert.equal(a.confidence,100);assert.equal(b.confidence,100);
 assert.equal(C.newNode({}).confidence,100);
 assert.equal(p.votes.length,0);assert.equal(p.edgeAssessments.length,0);
 assert.equal(C.evaluate(p).get(b.id).base,null,'a default is not a submitted review');
 assert.equal(C.evaluateAssessor(p,u).get(a.id).score,null);
});
test('dev22: argument root scores child assessments without an explicit root credence vote',()=>{
 const {p,u,root,a,b}=tree();
 assert.equal(C.evaluate(p).get(root.id).base,50);
 assert.equal(C.evaluate(p).get(root.id).score,50);
 C.upsertVote(p,a.id,u,100);C.upsertEdgeAssessment(p,'primary',a.id,u,5);
 const collective=C.evaluate(p).get(root.id);
 near(collective.score,75);near(C.argumentBalance(collective.score),50);
 assert.equal(collective.incomplete,true,'an unassessed grandchild is correctly marked incomplete');
 const individual=C.evaluateAssessor(p,u).get(root.id);
 near(individual.score,75);assert.equal(individual.incomplete,true);
 C.upsertVote(p,b.id,u,0);C.upsertEdgeAssessment(p,'primary',b.id,u,0);
 assert.equal(C.evaluate(p).get(root.id).incomplete,false);
 assert.equal(C.evaluateAssessor(p,u).get(root.id).incomplete,false);
 assert.equal(p.votes.some(v=>v.nodeId===root.id),false);
});
test('dev22: a grandchild changes the mid-node and argument root, both collective and individual',()=>{
 const {p,u,root,a,b}=tree();
 for(const [n,confidence] of [[a,50],[b,100]])C.upsertVote(p,n.id,u,confidence);
 for(const n of [a,b])C.upsertEdgeAssessment(p,'primary',n.id,u,5);
 for(const scores of [C.evaluate(p),C.evaluateAssessor(p,u)]){
   near(scores.get(b.id).score,100);near(scores.get(a.id).score,75);
   near(scores.get(root.id).score,68.75);
   near(C.argumentBalance(scores.get(root.id).score),37.5);
 }
 // A low-credence grandchild decreases the mid-claim's strength and root's score.
 C.upsertVote(p,b.id,u,0);
 near(C.evaluate(p).get(a.id).score,50);
 near(C.evaluate(p).get(root.id).score,62.5);
});
test('dev22: assessment shares produce weighted exact means and no AI is silently included',()=>{
 const {p,u,root,a}=tree();const owner=p.users[0];owner.shares=5;
 const guest={id:'guest',name:'Guest',role:'editor',shares:1};p.users.push(guest);
 const ai={id:'ai',name:'AI',role:'editor',shares:20,profileKind:'ai'};p.users.push(ai);
 for(const [id,pct,w] of [[u,100,5],[guest.id,50,-5],[ai.id,0,-5]]){
  C.upsertVote(p,a.id,id,pct);C.upsertEdgeAssessment(p,'primary',a.id,id,w);
 }
 p.settings.assessmentWeighting='equal';
 near(C.getBaseConfidence(p,a).base,75);
 near(C.evaluate(p).get(root.id).contributions[0].impact,0);
 p.settings.assessmentWeighting='shares';
 near(C.getBaseConfidence(p,a).base, (500+50)/6);
 near(C.evaluate(p).get(root.id).contributions[0].impact,(25-5)/6);
 near(C.evaluate(p).get(root.id).score,50+5*((25-5)/6)*((500+50)/6/100));
});
test('dev22: decision root stays unscored and no evidence leaks across option boundaries',()=>{
 const p=C.createBlankProject('decision'),u=p.users[0].id,root=C.rootNode(p);
 const option=C.addChild(p,root.id,'option',u),premise=C.addChild(p,option.id,'support',u);
 assert.equal(premise.confidence,100);
 C.upsertVote(p,premise.id,u,100);C.upsertEdgeAssessment(p,'primary',premise.id,u,5);
 assert.equal(C.evaluate(p).get(root.id).score,null);
 near(C.evaluate(p).get(option.id).score,75);
});
test('dev22: combined ratings are a separate view layer; compact style distinguishes collective averages and exports',()=>{
 const root=path.resolve(__dirname,'..');
 const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'src/styles.css'),'utf8');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/data-layer="assessments"/);
 assert.match(app,/function nodeAssessmentSnapshot\(node\)/);
 assert.match(app,/const averaging=!personal && mode!=='structural'/);
 assert.match(app,/Core\.getBaseConfidence\(project,node\)/);
 assert.match(app,/const impact=!fields\.impact\?null:shared\?shared\.influence:filtered\?null:shownInfluence\(node\)/);
 assert.match(app,/if \(l\.assessments && ratings\)/);
 assert.match(app,/if\(layers\.assessments && ratings\)/);
 assert.match(css,/\.meta-assessment\.aggregated \.meta-value \{ font-style:italic/);
});

test('dev22: a locked shared reason supplies its own credence and influence even without personal votes',()=>{
 const {p,u,root}=tree();
 const shared=C.addSharedReason(p,'Fixed premise',80,4);
 const use=C.attachSharedReason(p,shared.id,root.id,u);
 const collective=C.evaluate(p).get(root.id);
 near(collective.contributions.find(c=>c.id===use.id).impact,4);
 near(collective.contributions.find(c=>c.id===use.id).strength,80);
 near(C.evaluateAssessor(p,u).get(use.id).base,80);
 assert.equal(C.personalCredence(p,use.id,u),null,'a fixed library reason is not a user vote');
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 assert.match(app,/shared\?shared\.confidence/);
 assert.match(app,/shared\?shared\.influence/);
 assert.match(app,/averaging=!personal && mode!==\'structural\' && !shared/);
});
