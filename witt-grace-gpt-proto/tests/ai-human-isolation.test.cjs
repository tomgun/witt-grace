'use strict';
const test=require('node:test'); const assert=require('node:assert/strict');
const fs=require('node:fs'); const path=require('node:path');
const Core=require('../src/core.js'); const AI=require('../src/ai-roundtrip.js'); const Lens=require('../src/review-lens.js');
function caseFixture(){
 const p=Core.createBlankProject(),root=p.nodes[0],owner=p.users[0];
 const b=Core.addChild(p,root.id,'support',owner.id); b.title='One parent and one relation';
 const human2={id:Core.uid(),name:'Muu arvioija',role:'editor',shares:1};p.users.push(human2);
 const ai={id:Core.uid(),name:'AI · Pienempi malli',role:'editor',shares:1,profileKind:'ai'};p.users.push(ai);
 for(const u of [owner,human2,ai]){
  Core.upsertVote(p,root.id,u.id,u===ai?99:50);
  Core.upsertVote(p,b.id,u.id,u===ai?95:90);
  Core.upsertEdgeAssessment(p,'primary',b.id,u.id,u===owner?5:u===human2?-3:5);
 }
 return {p,root,b,owner,human2,ai};
}
test('AI influence excluded from human aggregate and default review lens, but AI expressly selectable',()=>{
 const {p,root,b,owner,human2,ai}=caseFixture();
 assert.equal(Core.getBaseConfidence(p,root).base,50);
 assert.deepEqual(Core.currentInfluenceReviews(p,'primary',b.id).map(a=>a.userId).sort(),[owner.id,human2.id].sort());
 assert.equal(Core.influenceSummary(p,'primary',b.id).mean,1);
 assert.equal(Core.influenceSummary(p,'primary',b.id,true).mean,7/3);
 const ordinary=Lens.projectLens(p);
 assert.equal(ordinary.totalCount,2);
 assert.equal(ordinary.selectedCount,2);
 assert.equal(ordinary.userIds.has(ai.id),false);
 assert.equal(ordinary.impact.get(b.id).count,2);
 const include=Lens.projectLens(p,[ai.id,owner.id]);
 assert.equal(include.impact.get(b.id).count,2);
 assert.equal(include.totalCount,3);
 assert.equal(include.userIds.has(ai.id),true);
 assert.equal(include.credence.get(root.id).mean,74.5);
 const onlyAI=Lens.projectLens(p,[ai.id]);
 assert.equal(onlyAI.impact.get(b.id).mean,5);
 assert.equal(Core.evaluateAssessor(p,ai.id).get(root.id).incomplete,false);
});
test('AI schema downloaded to user is exactly runtime validation shape',()=>{
 const file=JSON.parse(fs.readFileSync(path.join(__dirname,'../schemas/ai-review.v1.schema.json'),'utf8'));
 assert.deepEqual(file,AI.schema);
 assert.ok(file.properties.relationAssessments);
 assert.ok(file.$defs.claim.properties.sources);
 assert.ok(file.$defs.claim.properties.constraintStatus);
});
test('AI proposal can include sources and classify gate without accidentally creating truth votes',()=>{
 const {p,root,b,owner}=caseFixture();
 const req=AI.makeRequest(p,Core);
 const patch={format:AI.RESPONSE_FORMAT,projectId:p.id,baseFingerprint:req.baseFingerprint,assessor:'Malli',
  claims:[{tempId:'hardRule',parentId:b.id,relation:'oppose',title:'Lupa vaaditaan',semanticType:'constraint',constraintStatus:'unmet',authorVisibility:'anonymous',
    sources:[{url:'https://example.net/legal-rule',note:'Vahvistus puuttuu'}]}],
  assessments:[{nodeId:b.id,credence:40}],
  relationAssessments:[{subjectType:'primary',subjectId:b.id,influence:-4}],
  comments:[{nodeId:'hardRule',body:'Tarvitaan todellinen lupa, eikä tekoälyarvio riitä'}]
 };
 const {project:result}=AI.prepareMerge(p,patch,Core);
 const aiprofile=result.users.at(-1),newClaim=result.nodes.find(n=>n.title==='Lupa vaaditaan');
 assert.equal(newClaim.constraintStatus,'unmet');
 assert.equal(newClaim.semanticType,'constraint');
 assert.equal(newClaim.authorVisibility,'anonymous');
 assert.equal(newClaim.sources[0].url,'https://example.net/legal-rule');
 assert.equal(Core.personalCredence(result,b.id,aiprofile.id).confidence,40);
 assert.equal(Core.personalInfluence(result,'primary',b.id,aiprofile.id).record.influence,-4);
 assert.equal(result.votes.some(v=>v.nodeId===newClaim.id),false);
 assert.equal(result.comments.some(v=>v.nodeId===newClaim.id),true);
 assert.equal(Core.validateProject(result).schemaVersion,8);
});
test('AI cannot smuggle credibility estimate onto an untruthassessable value',()=>{
 const {p,b}=caseFixture(), req=AI.makeRequest(p,Core);
 const patch={format:AI.RESPONSE_FORMAT,projectId:p.id,baseFingerprint:req.baseFingerprint,assessor:'Malli',
  claims:[{tempId:'value',parentId:b.id,relation:'support',title:'Vapaus on tärkeää',semanticType:'value'}],
  assessments:[{nodeId:'value',credence:95}]};
 assert.throws(()=>AI.prepareMerge(p,patch,Core),/totuususkottavuuden arviota/);
 assert.equal(p.users.filter(Core.isAIProfile).length,1,'no mutation to existing source document');
});

test('cross-field duplicate AI influence is rejected instead of last-write-wins',()=>{
 const {p,b}=caseFixture(),req=AI.makeRequest(p,Core);
 const patch={format:AI.RESPONSE_FORMAT,projectId:p.id,baseFingerprint:req.baseFingerprint,assessor:'Malli',
  assessments:[{nodeId:b.id,primaryInfluence:4}],
  relationAssessments:[{subjectType:'primary',subjectId:b.id,influence:-4}]};
 assert.throws(()=>AI.prepareMerge(p,patch,Core),/Duplicate primary influence/);
});

test('AI profiles cannot cast human decision preference ballots, even when manually selecting a profile',()=>{
 const p=Core.createBlankProject('decision'),root=p.nodes[0],option=Core.addChild(p,root.id,'option',p.users[0].id);
 const human=p.users[0],ai={id:Core.uid(),name:'AI',shares:1,role:'editor',profileKind:'ai'};p.users.push(ai);
 Core.upsertBallot(p,option.id,human.id,40);
 assert.throws(()=>Core.upsertBallot(p,option.id,ai.id,99),/AI-arvioijalle/);
 p.ballots.push({id:Core.uid(),userId:ai.id,optionId:option.id,preference:99,updatedAt:new Date().toISOString()});
 assert.equal(Core.optionPreference(p,option.id).preferenceScore,40, 'even pre-existing imported AI ballot must not count');
 assert.equal(Core.optionPreference(p,option.id).preferenceVoters,1);
});
