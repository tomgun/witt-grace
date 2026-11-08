const test=require('node:test');const assert=require('node:assert/strict');
const C=require('../src/core.js');const X=require('../src/contributions.js');const D=require('../src/ai-draft-v2.js');
function base(){const p=C.createBlankProject('decision');p.title='Saturday';p.nodes[0].title='Plans';const a=C.addChild(p,p.nodes[0].id,'option',p.users[0].id);a.title='Pool';const b=C.addChild(p,a.id,'support',p.users[0].id);b.title='Family time';return C.validateProject(p);}
function patch(p){return {format:X.FORMAT,projectId:p.id,baseFingerprint:X.fingerprint(p),author:{kind:'ai',name:'Model'},claims:[{tempId:'fresh',parentId:p.nodes[1].id,relation:'oppose',title:'Crowded'}],edits:[{nodeId:p.nodes[2].id,title:'Quality time'}],assessments:[{nodeId:'fresh',credence:85,primaryInfluence:-3}],comments:[{nodeId:'fresh',body:'Depends on weather'}]};}
test('contribution applies AI changes into separate AI profile without overwriting existing project',()=>{
 const p=base(),before=JSON.stringify(p);const m=X.merge(p,patch(p),C);assert.equal(JSON.stringify(p),before);
 const ai=m.project.users.find(u=>u.profileKind==='ai');assert.ok(ai);assert.match(ai.name,/AI/);assert.equal(m.project.nodes.find(n=>n.id===p.nodes[2].id).title,'Quality time');
 assert.equal(m.project.nodes.find(n=>n.title==='Crowded').createdBy,ai.id);
 assert.ok(m.project.votes.some(v=>v.userId===ai.id&&v.confidence===85));
 assert.ok(m.project.comments.some(c=>c.authorId===ai.id&&c.body==='Depends on weather'));
});
test('human source is NOT labeled AI; importer controls source type and name',()=>{
 const p=base(),result=X.merge(p,patch(p),C,{}, {kind:'human',name:'Liisa'});
 const person=result.project.users.find(u=>u.id===result.actor.id);assert.equal(person.profileKind,'human');assert.equal(person.name,'Liisa');
 assert.ok(result.project.comments.every(c=>c.authorId!==person.id||c.authorName==='Liisa'));
});
test('import categories allow excluding all imported AI assessment values and comments',()=>{
 const p=base(),result=X.merge(p,patch(p),C,{assessments:false,comments:false,edits:false});
 assert.equal(result.project.votes.length,p.votes.length);assert.equal(result.project.edgeAssessments.length,p.edgeAssessments.length);
 assert.equal(result.project.comments.length,p.comments.length);assert.equal(result.project.nodes.find(n=>n.id===p.nodes[2].id).title,p.nodes[2].title);
 assert.ok(result.project.nodes.some(n=>n.title==='Crowded'));
});
test('no mutation on stale context, foreign doc, unsupported fields',()=>{
 const p=base(),before=JSON.stringify(p),s=patch(p);s.baseFingerprint='0123456789abcdef';assert.throws(()=>X.merge(p,s,C),/changed/);
 s.baseFingerprint=X.fingerprint(p);s.projectId='foreign';assert.throws(()=>X.merge(p,s,C),/different/);
 s.projectId=p.id;s.ballots=[];assert.throws(()=>X.validate(s),/unexpected/);assert.equal(JSON.stringify(p),before);
});
test('WITT human export creates a reusable patch for another WITT original with correct author',()=>{
 const p=base(),e=C.validateProject(p),human=e.users[0];const newNode=C.addChild(e,e.nodes[1].id,'support',human.id);newNode.title='Exercise';e.nodes[2].details='Reworded detail';C.upsertVote(e,newNode.id,human.id,76);C.upsertEdgeAssessment(e,'primary',newNode.id,human.id,4);C.addComment(e,newNode.id,'My comment',human.name,human.id);
 const diff=X.diff(p,e,C,'Nimimerkki',human.id);
 assert.equal(diff.author.kind,'human');assert.equal(diff.author.name,'Nimimerkki');assert.equal(diff.claims.length,1);assert.equal(diff.edits.length,1);
 const merged=X.merge(p,diff,C);const id=merged.actor.id;
 assert.equal(merged.project.users.find(u=>u.id===id).profileKind,'human');assert.equal(merged.project.nodes.find(n=>n.id===p.nodes[2].id).details,'Reworded detail');
 assert.ok(merged.project.comments.some(c=>c.body==='My comment'&&c.authorId===id));
 assert.ok(merged.project.votes.some(v=>v.userId===id&&v.confidence===76));
});
test('new full AI draft includes editable new claims, optional AI assessments and locked shared reasons',()=>{
 const raw={...D.EXAMPLE,mode:'decision'};const p=D.toProject(raw,C);
 assert.ok(p.nodes.some(n=>n.title==='Go swimming with children'));assert.equal(p.sharedReasons.length,1);
 assert.ok(p.users.some(u=>u.profileKind==='ai'));assert.ok(p.votes.some(v=>v.confidence===70));
});
test('unchecked AI assessments never import locked shared-reason numerical defaults indirectly',()=>{
 const p=base(),v=patch(p);v.sharedReasons=[{tempId:'common1',title:'Shared benefit',credence:88,influence:4}];
 v.sharedAttachments=[{reasonId:'common1',parentId:p.nodes[1].id}];
 const imported=X.merge(p,v,C,{assessments:false,sharedReasons:true});
 assert.equal(imported.project.sharedReasons.length,0);
 assert.ok(!imported.project.nodes.some(n=>n.sharedReasonId));
 assert.ok(imported.project.nodes.some(n=>n.title==='Crowded'));
});
test('new AI draft can import tree/comments with all AI ratings disabled, without locked masters',()=>{
 const doc=D.toProject(D.EXAMPLE,C,{assessments:false,sharedReasons:true,comments:true});
 assert.equal(doc.votes.length,0);assert.equal(doc.edgeAssessments.length,0);
 assert.equal(doc.sharedReasons.length,0);
 assert.ok(doc.comments.some(c=>c.body.includes('family stays together')));
});
test('invalid or missing human nickname is never silently converted into AI or accepted',()=>{
 const p=base(),v=patch(p);
 assert.throws(()=>X.merge(p,v,C,{}, {kind:'human',name:' '}),/source name|invalid text/);
 assert.throws(()=>X.merge(p,v,C,{}, {kind:'robot',name:'Me'}),/Source must be/);
});
test('AI request examples respect decision option nesting and assess-only mode',()=>{
 const p=C.createBlankProject('decision');
 const extend=X.makeRequest(p,C,'extend','fi');
 assert.equal(extend.responseExample.claims[0].relation,'option');
 assert.equal(extend.responseExample.claims[1].parentId,'option1');
 const opts=base(),assess=X.makeRequest(opts,C,'assess','fi');
 assert.equal(assess.responseExample.claims.length,0);
 assert.ok(assess.responseExample.assessments.every(a=>opts.nodes.some(n=>n.id===a.nodeId)));
});
