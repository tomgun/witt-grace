const test=require('node:test');const assert=require('node:assert/strict');
const Core=require('../src/core.js'),X=require('../src/contributions.js');
function fixture(){
 const original=Core.createBlankProject('argument');const owner=original.users[0];owner.name='Aino';
 const edited=Core.validateProject(original);
 edited.users.push({id:'local_b',name:'Ben',shares:1,role:'editor',profileKind:'human'});
 const a=Core.addChild(edited,edited.nodes[0].id,'support',owner.id);a.title='Ainon peruste';
 const b=Core.addChild(edited,a.id,'support','local_b');b.title='Benin peruste';
 Core.upsertVote(edited,a.id,owner.id,74);Core.upsertEdgeAssessment(edited,'primary',a.id,owner.id,3);
 Core.upsertVote(edited,b.id,'local_b',89);Core.upsertEdgeAssessment(edited,'primary',b.id,'local_b',-2.5);
 Core.upsertVote(edited,a.id,'local_b',65);
 Core.addComment(edited,a.id,'Ainon kommentti',owner.name,owner.id);
 Core.addComment(edited,a.id,'Benin kommentti','Ben','local_b');
 return {original,edited,owner,a,b};
}
test('exports separate named users; cross-user parent and assessments round-trip',()=>{
 const {original,edited,owner,a,b}=fixture();
 const bundle=X.diffBundle(original,edited,Core);
 assert.equal(bundle.format,X.GROUP_FORMAT);assert.deepEqual(bundle.contributors.map(c=>c.name),['Aino','Ben']);
 const aPatch=bundle.contributors[0].patch,bPatch=bundle.contributors[1].patch;
 assert.equal(aPatch.claims.length,1);assert.equal(aPatch.claims[0].title,a.title);
 assert.equal(bPatch.claims.length,1);assert.equal(bPatch.claims[0].parentId,a.id);
 assert.ok(bPatch.assessments.find(r=>r.nodeId===a.id&&r.credence===65));
 const accepted=X.mergeBundle(original,bundle,Core);
 const newA=accepted.project.nodes.find(n=>n.title===a.title),newB=accepted.project.nodes.find(n=>n.title===b.title);
 assert.equal(newB.parentId,newA.id);
 const p1=accepted.actors.find(a=>a.sourceUserId===owner.id).id,p2=accepted.actors.find(a=>a.sourceUserId==='local_b').id;
 assert.notEqual(p1,p2);assert.equal(newA.createdBy,p1);assert.equal(newB.createdBy,p2);
 assert.equal(accepted.project.votes.find(v=>v.userId===p2&&v.nodeId===newA.id).confidence,65);
 assert.equal(accepted.project.votes.find(v=>v.userId===p1&&v.nodeId===newA.id).confidence,74);
 assert.equal(accepted.project.comments.find(c=>c.body==='Benin kommentti').authorId,p2);
});
test('does not misattribute untracked changes to an unrelated local participant',()=>{
 const {original,edited,owner}=fixture();const root=edited.nodes[0];root.title='Changed title without tracking';
 const bundle=X.diffBundle(original,edited,Core);
 assert.equal(bundle.unattributedEdits.length,1);
 assert.equal(bundle.unattributedEdits[0].nodeId,root.id);
 assert.ok(bundle.contributors.every(c=>c.patch.edits.length===0));
 const merged=X.mergeBundle(original,bundle,Core);
 assert.equal(merged.project.nodes[0].title,original.nodes[0].title);
});
test('tracked edit belongs to the actual last editor rather than the exporter',()=>{
 const {original,edited}=fixture();const root=edited.nodes[0];root.title='Benin otsikko';root.lastEditedBy='local_b';
 const bundle=X.diffBundle(original,edited,Core);const byName=new Map(bundle.contributors.map(c=>[c.name,c.patch]));
 assert.equal(byName.get('Aino').edits.length,0);assert.equal(byName.get('Ben').edits.length,1);
 const imported=X.mergeBundle(original,bundle,Core);
 assert.equal(imported.project.nodes[0].title,'Benin otsikko');
});
test('duplicate contributors and malformed authors fail closed',()=>{
 const {original,edited}=fixture();const bundle=X.diffBundle(original,edited,Core);
 bundle.contributors.push(bundle.contributors[0]);assert.throws(()=>X.validateBundle(bundle),/duplicate/);
 bundle.contributors.pop();bundle.contributors[0].patch.author.name='Someone else';assert.throws(()=>X.validateBundle(bundle),/source attribution/);
});
test('reviewing a tracked edit preserves the imported author, not the accepting owner',()=>{
 const {original,edited}=fixture();edited.nodes[0].title='Benin päivittämä';edited.nodes[0].lastEditedBy='local_b';
 const bundle=X.diffBundle(original,edited,Core),result=X.mergeBundle(original,bundle,Core);
 const mappedBen=result.actors.find(a=>a.sourceUserId==='local_b').id;
 assert.equal(result.project.nodes[0].lastEditedBy,mappedBen);
 assert.notEqual(result.project.nodes[0].lastEditedBy,original.users[0].id);
});
test('users referenced by edit or connection provenance cannot be deleted',()=>{
 const {original}=fixture(),next=Core.validateProject(original);next.users.push({id:'local_b',name:'Ben',shares:1,role:'editor'});
 next.nodes[0].lastEditedBy='local_b';
 assert.throws(()=>Core.removeLocalProfile(next,'local_b'),/Muokkaajan/);
 delete next.nodes[0].lastEditedBy;
 const linkTarget=Core.addChild(next,next.nodes[0].id,'support',original.users[0].id);
 const linkSource=Core.addChild(next,next.nodes[0].id,'oppose',original.users[0].id);
 const link=Core.addLink(next,linkSource.id,linkTarget.id,'support',0);link.createdBy='local_b';
 assert.throws(()=>Core.removeLocalProfile(next,'local_b'),/Muokkaajan/);
});

test('anonymous legacy comment text is not assigned to a matching display name',()=>{
 const {original,edited,owner}=fixture();
 edited.comments.push({id:Core.uid(),nodeId:original.nodes[0].id,body:'Vanhasta tuonnista',authorName:owner.name,createdAt:new Date().toISOString()});
 const bundle=X.diffBundle(original,edited,Core);
 assert.equal(bundle.unattributedComments,1);
 const a=bundle.contributors.find(c=>c.name===owner.name);
 assert.ok(!a.patch.comments.some(c=>c.body==='Vanhasta tuonnista'));
 assert.ok(!X.mergeBundle(original,bundle,Core).project.comments.some(c=>c.body==='Vanhasta tuonnista'));
});
