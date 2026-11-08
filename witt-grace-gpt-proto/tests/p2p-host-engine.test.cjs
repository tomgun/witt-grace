'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../src/core.js'), P=require('../src/p2p-host-engine.js');
async function fixture(){
 const host=await P.generateSeatKey(),editor=await P.generateSeatKey(),viewer=await P.generateSeatKey();
 const ids={host:'seat-host',editor:'seat-editor',viewer:'seat-viewer'};
 const p=Core.createBlankProject('decision');
 const opt1=Core.addChild(p,p.nodes[0].id,'option',p.users[0].id);opt1.title='Option one';
 const opt2=Core.addChild(p,p.nodes[0].id,'option',p.users[0].id);opt2.title='Option two';
 const room=new P.HostRoom(Core,{id:'room-test',project:p,ownerSeat:{id:ids.host,name:'Host',canVote:true,weight:1,publicKey:await P.exportPublicKey(host.publicKey)}});
 let id=0;
 const send=async(name,action,expected=room.revision)=>room.accept(await P.sign(P.createEnvelope(room.id,ids[name],expected,action,'command-'+(++id)),{host,editor,viewer}[name].privateKey));
 const admit=async(name,role,weight=1,canVote=true)=>send('host',{type:'seat.admit',payload:{seat:{id:ids[name],name,role,canVote,weight,publicKey:await P.exportPublicKey(({host,editor,viewer}[name]).publicKey)}}});
 return {room,send,admit,ids,opt1,opt2,host,editor,viewer};
}
test('verified host command protocol rejects unsigned, unknown, stale and replayed commands',async()=>{
 const {room,send,admit,ids,editor}=await fixture();
 await admit('editor','editor');
 const prev=room.revision;
 const envelope=P.createEnvelope(room.id,ids.editor,prev,{type:'comment.add',payload:{nodeId:room.project.nodes[0].id,body:'Hello'}},'single-unique');
 const signed=await P.sign(envelope,editor.privateKey);
 await room.accept(signed);
 await assert.rejects(()=>room.accept(signed),/Replay/);
 const forged={...signed,commandId:'new-id',action:{type:'comment.add',payload:{nodeId:room.project.nodes[0].id,body:'Forged'}}};
 await assert.rejects(()=>room.accept(forged),/Invalid signature/);
 await assert.rejects(()=>send('editor',{type:'claim.credence',payload:{nodeId:room.project.nodes[0].id,credence:75}},prev),/Stale revision/);
 await assert.rejects(()=>send('editor',{type:'seat.revoke',payload:{id:ids.host}}),/Host-only/);
 assert.equal(room.audit.length,2);
});
test('two distinct signed local people keep their claim assessments and edge influences separate',async()=>{
 const {room,send,admit,ids}=await fixture();
 await admit('editor','assessor');
 const opt=room.project.nodes[1].id;
 const c=Core.addChild(room.project,opt,'support',ids.host);c.title='Key reason';
 // The host makes a baseline revision with a signed edit before the assessors vote.
 await send('host',{type:'claim.credence',payload:{nodeId:c.id,credence:30}});
 await send('editor',{type:'claim.credence',payload:{nodeId:c.id,credence:90}});
 await send('host',{type:'edge.influence',payload:{subjectType:'primary',subjectId:c.id,influence:-5}});
 await send('editor',{type:'edge.influence',payload:{subjectType:'primary',subjectId:c.id,influence:4}});
 assert.equal(Core.personalCredence(room.project,c.id,ids.host).confidence,30);
 assert.equal(Core.personalCredence(room.project,c.id,ids.editor).confidence,90);
 assert.equal(Core.personalInfluence(room.project,'primary',c.id,ids.host).record.influence,-5);
 assert.equal(Core.personalInfluence(room.project,'primary',c.id,ids.editor).record.influence,4);
});
test('viewer cannot edit, comment, assess or vote without eligibility; host admission does not change existing authors',async()=>{
 const {room,send,admit,opt1}=await fixture();
 const originalAuthor=room.project.nodes[0].createdBy;
 await admit('viewer','viewer',0,false);
 await assert.rejects(()=>send('viewer',{type:'claim.add',payload:{parentId:opt1.id,relation:'support',title:'Bad'}}),/Editor permission/);
 await assert.rejects(()=>send('viewer',{type:'comment.add',payload:{nodeId:opt1.id,body:'Bad'}}),/Comment permission/);
 await assert.rejects(()=>send('viewer',{type:'claim.credence',payload:{nodeId:opt1.id,credence:20}}),/Assessor permission/);
 await assert.rejects(()=>send('viewer',{type:'ballot.cast',payload:{roundId:'test',optionId:opt1.id}}),/Vote eligibility/);
 assert.equal(room.project.nodes[0].createdBy,originalAuthor);
});
test('ballots hide interim votes from public state; freeze rules and provenance, tally weighted, close immutably',async()=>{
 const {room,send,admit,opt1,opt2}=await fixture();
 await admit('editor','editor',3,true);
 const opening=await send('host',{type:'ballot.open',payload:{roundId:'round-1',rules:{quorumFraction:0.6,winnerFraction:0.6}}});
 assert.equal(opening.publicState.round.state,'open');
 assert.equal('ballots' in opening.publicState.round,false);
 assert.equal('results' in opening.publicState.round,false);
 await assert.rejects(()=>send('editor',{type:'claim.add',payload:{parentId:opt1.id,relation:'support',title:'Change'}}),/Frozen proposal/);
 await assert.rejects(()=>send('host',{type:'seat.revoke',payload:{id:'seat-editor'}}),/Cannot alter seats/);
 const voteOne=await send('editor',{type:'ballot.cast',payload:{roundId:'round-1',optionId:opt1.id}});
 assert.equal(voteOne.ack.hiddenUntilClosed,true);
 assert.ok(!JSON.stringify(voteOne.publicState.round).includes('ballots')); // legacy P1 project.ballots remains separate
 await send('editor',{type:'ballot.cast',payload:{roundId:'round-1',optionId:opt2.id}});
 await send('host',{type:'ballot.cast',payload:{roundId:'round-1',optionId:opt2.id}});
 const result=await send('host',{type:'ballot.close',payload:{}});
 assert.equal(result.ack.winnerOptionId,opt2.id);
 assert.equal(result.publicState.closedRounds[0].results.choices[opt2.id],4);
 assert.equal(result.publicState.round,null);
 assert.equal('ballots' in result.publicState.closedRounds[0],false,'individual ballots remain host-private');
 const backup=room.hostBackup();
 assert.equal(backup.closedRounds[0].results.private.ballots.length,2,'last accepted ballot per seat with signed receipt');
 assert.equal(backup.closedRounds[0].audit.length,3);
 await assert.rejects(()=>send('host',{type:'ballot.open',payload:{roundId:'round-1',rules:{quorumFraction:.6,winnerFraction:.6}}}),/reused/);
});
test('weight is not truth: same assessments, separate governance shares; invalid signed payload rejected',async()=>{
 const {room,send,admit,ids}=await fixture();
 await admit('editor','editor',99,true);
 const factual=Core.addChild(room.project,room.project.nodes[1].id,'support',ids.host);
 const nodeId=factual.id;
 await send('host',{type:'claim.credence',payload:{nodeId,credence:40}});
 await send('editor',{type:'claim.credence',payload:{nodeId,credence:80}});
 assert.equal(Core.getBaseConfidence(room.project,room.project.nodes.find(n=>n.id===nodeId)).base,60);
 assert.equal(room.seats.get(ids.editor).weight,99);
 await assert.rejects(()=>send('host',{type:'claim.edit',payload:{nodeId,title:''}}),/Invalid claim edit/);
});

test('concurrent signed commands with identical base revision serialize; one is rejected without state loss',async()=>{
 const {room,admit,ids,editor}=await fixture();await admit('editor','editor');
 const factual=Core.addChild(room.project,room.project.nodes[1].id,'support',ids.host);
 const revision=room.revision,nodeId=factual.id;
 const make=async (n,credence)=>P.sign(P.createEnvelope(room.id,ids.editor,revision,{type:'claim.credence',payload:{nodeId,credence}},'race-'+n),editor.privateKey);
 const commands=await Promise.all([make(1,51),make(2,80)]);
 const result=await Promise.allSettled(commands.map(cmd=>room.accept(cmd)));
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 assert.match(result.find(r=>r.status==='rejected').reason.message,/Stale revision/);
 assert.equal(Core.personalCredence(room.project,nodeId,ids.editor).confidence,51);
 assert.equal(room.audit.length,2);
 assert.equal(room.audit[1].commandHash.length,64);
});
