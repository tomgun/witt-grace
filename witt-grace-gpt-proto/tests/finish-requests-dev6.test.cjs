'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Core=require('../src/core.js');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
function example(){
 const p=Core.createBlankProject('decision'),owner=p.users[0];
 const a={id:Core.uid(),name:'A',role:'editor',shares:5},b={id:Core.uid(),name:'B',role:'editor',shares:1};
 p.users.push(a,b);
 const x=Core.addChild(p,p.nodes[0].id,'option',owner.id),y=Core.addChild(p,p.nodes[0].id,'option',owner.id);
 x.title='Domestic cloud';y.title='Foreign cloud';
 return {p,owner,a,b,x,y};
}
test('neutral relationships are first-class, produce no structural contribution and survive JSON',()=>{
 const {p,owner,x}=example();
 const n=Core.addChild(p,x.id,'neutral',owner.id);n.title='No agreed direction';n.impact=0;
 Core.upsertVote(p,n.id,owner.id,100);
 // Option credibility is no longer a personal truth rating; neutral index base is 50.
 assert.equal(Core.signedInfluence(n),0);
 assert.equal(Core.evaluate(p).get(x.id).score,50);
 const saved=Core.validateProject(p);assert.equal(saved.nodes.find(v=>v.id===n.id).relation,'neutral');
 Core.upsertEdgeAssessment(p,'primary',n.id,owner.id,-5);
 assert.equal(Core.evaluateAssessor(p,owner.id).get(x.id).score,25,'a personally assessed neutral structural link may have negative personal influence');
 // Option credibility is no longer a personal truth rating; neutral index base is 50.
 assert.ok(Core.personalInfluence(p,'primary',n.id,owner.id).current);
});
test('one value has relationship-specific impact on different options, no third priority rating is needed',()=>{
 const {p,owner,a,x,y}=example();
 const value=Core.addChild(p,x.id,'support',owner.id);value.semanticType='value';value.title='Domestic ownership';
 const link=Core.addLink(p,value.id,y.id,'oppose',3);
 Core.upsertEdgeAssessment(p,'primary',value.id,owner.id,5);
 Core.upsertEdgeAssessment(p,'secondary',link.id,owner.id,-3);
 Core.upsertEdgeAssessment(p,'primary',value.id,a.id,-1);
 const left=Core.optionValueProfile(p,x.id,owner.id),right=Core.optionValueProfile(p,y.id,owner.id);
 assert.equal(left.items[0].impact,5);assert.equal(right.items[0].impact,-3);
 assert.equal(left.items[0].summary.positive,1);assert.equal(left.items[0].summary.negative,1);
 assert.equal('valueAssessments' in p,false,'no separate value importance field');
 assert.equal('valueAssessments' in Core.validateProject(p),false);
});
test('voting snapshots shares, keeps assessments independent, hides result preview state and locks closure',()=>{
 const {p,owner,a,b,x,y}=example();
 p.settings.voteWeighting='shares';
 const round=Core.startVotingRound(p,{anonymous:true,hideResults:true});
 assert.deepEqual(round.optionIds,[x.id,y.id]);assert.equal(round.weightByUser[a.id],5);
 a.shares=900;
 Core.upsertBallot(p,x.id,a.id,100);
 Core.upsertBallot(p,x.id,b.id,0);
 assert.equal(Core.optionPreference(p,x.id).preferenceScore,500/6);
 Core.upsertBallot(p,y.id,owner.id,80);
 Core.upsertBallot(p,y.id,a.id,20);
 Core.removeBallot(p,y.id,owner.id);
 assert.equal(p.voteAudit.filter(v=>v.action==='retract').length,1);
 assert.equal(p.votes.length,0);assert.equal(p.edgeAssessments.length,0);
 assert.equal(round.status,'open');assert.equal(round.hideResults,true);assert.equal(round.anonymous,true);
 assert.ok(Core.validateProject(p));
 assert.throws(()=>Core.closeVotingRound(p,a.id),/Only owner/);
 Core.closeVotingRound(p,owner.id);
 assert.equal(round.status,'closed');assert.ok(round.closedAt);
 assert.throws(()=>Core.upsertBallot(p,x.id,b.id,20),/closed/);
 assert.throws(()=>Core.removeBallot(p,x.id,a.id),/closed/);
 assert.deepEqual(Core.validateProject(JSON.parse(JSON.stringify(p))),Core.validateProject(p));
});
test('equal share voting and AI voters are separate from human ballots',()=>{
 const {p,owner,a,x}=example();
 const ai={id:Core.uid(),name:'AI',role:'editor',shares:1000000,profileKind:'ai'};p.users.push(ai);
 Core.upsertBallot(p,x.id,owner.id,100);
 Core.upsertBallot(p,x.id,a.id,0);
 assert.equal(Core.optionPreference(p,x.id).preferenceScore,50);
 assert.throws(()=>Core.upsertBallot(p,x.id,ai.id,20),/AI-/);
 assert.ok(Core.startVotingRound(p,{anonymous:false}).status==='open');
 assert.equal(Core.optionPreference(p,x.id).preferenceScore,50);
});
test('schema validation rejects tampered voting rounds and obsolete file versions',()=>{
 const {p,owner,x}=example();Core.startVotingRound(p);Core.upsertBallot(p,x.id,owner.id,80);
 let bad=structuredClone(p);bad.votingRound.weightByUser.extra=100;
 assert.throws(()=>Core.validateProject(bad),/weight user/);
 bad=structuredClone(p);bad.voteAudit[0].userId='missing';
 assert.throws(()=>Core.validateProject(bad),/Audit actor/);
 bad=structuredClone(p);bad.votingRound.optionIds=['missing'];
 assert.throws(()=>Core.validateProject(bad),/round options/);
 const legacy=structuredClone(p);legacy.schemaVersion=4;
 assert.throws(()=>Core.validateProject(legacy),/vain nykyinen versio/);
});
test('UX: star button, segmented mapping, compact card types, drag toggle and local vote UI present',()=>{
 assert.match(app,/node-add option/);
 assert.match(app,/node\.parentId===null/);
 assert.match(html,/id="btnWorkflowExplore"/);assert.match(html,/id="btnWorkflowEvaluate"/);
 assert.match(app,/header\.append\(el\('span', 'node-tag'/);
 assert.match(html,/id="btnViewSettings"/);
 assert.match(html,/id="dragFromText"/);
 assert.match(html,/id="voteDialog"/);
 assert.match(app,/startVotingFromUI/);
 assert.match(app,/t\('voteResultsHidden'\)/);
 assert.doesNotMatch(app,/Core\.upsertValuePriority/);
});
test('closed votes are archived on a new round, never silently reused, and remain visible after JSON import',()=>{
 const {p,owner,a,x,y}=example();p.settings.voteWeighting='shares';
 const first=Core.startVotingRound(p,{anonymous:true,hideResults:true});
 Core.upsertBallot(p,x.id,owner.id,100);Core.upsertBallot(p,x.id,a.id,20);
 const score=Core.optionPreference(p,x.id).preferenceScore;
 Core.closeVotingRound(p,owner.id);
 assert.throws(()=>Core.removeLocalProfile(p,a.id),/osallistujaa ei voi poistaa/);
 const next=Core.startVotingRound(p,{anonymous:false,hideResults:true});
 assert.notEqual(next.id,first.id);
 assert.equal(p.ballots.length,0,'a new vote must not inherit the old ballots');
 assert.equal(Core.optionPreference(p,x.id).preferenceScore,null);
 assert.equal(p.voteHistory.length,1);assert.equal(p.voteHistory[0].round.status,'closed');
 assert.equal(Core.optionPreferenceForRound(p.voteHistory[0].round,p.voteHistory[0].ballots,x.id).preferenceScore,score);
 const saved=Core.validateProject(JSON.parse(JSON.stringify(p)));
 assert.equal(saved.voteHistory.length,1);assert.equal(saved.voteHistory[0].ballots.length,2);
 assert.equal(saved.voteHistory[0].round.anonymous,true);
 assert.throws(()=>Core.removeLocalProfile(saved,a.id),/osallistujaa ei voi poistaa/);
 const tampered=structuredClone(saved);tampered.voteHistory[0].ballots[0].optionId='unknown';
 assert.throws(()=>Core.validateProject(tampered),/historic ballot/i);
 const changed=structuredClone(saved);changed.voteHistory[0].round.weightByUser[a.id]=0;
 assert.notEqual(Core.optionPreferenceForRound(changed.voteHistory[0].round,changed.voteHistory[0].ballots,x.id).preferenceScore,score);
});
