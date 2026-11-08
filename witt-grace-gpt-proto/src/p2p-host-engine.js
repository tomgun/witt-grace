/* WITT experimental P2 host authority, cryptographically signed commands.
 * This is an internal protocol foundation, NOT a connected room, actual
 * identity verification or host-blind secret-ballot system. Each command is
 * verified against the seat's approved public key; the host sees live votes.
 * No network, relay, WebRTC or persistent storage is part of this module.
 */
(function (root, factory) {
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.WittP2HostEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MAX_SEATS=100, MAX_COMMAND_BYTES=32_000;
 const clone=x=>JSON.parse(JSON.stringify(x));
 const iso=()=>new Date().toISOString();
 const str=x=>typeof x==='string'&&x.length>0&&x.length<=100&&/^[\w-]+$/.test(x);
 const bytes=x=>new TextEncoder().encode(x);
 const cryptoAPI=()=>{
  const c=globalThis.crypto;
  if(!c?.subtle)throw Error('Secure WebCrypto context required');
  return c.subtle;
 };
 const toBase64=buffer=>{
  const a=new Uint8Array(buffer);
  if(typeof btoa==='function'){let s='';for(const c of a)s+=String.fromCharCode(c);return btoa(s);}
  return Buffer.from(a).toString('base64');
 };
 const fromBase64=text=>{
  if(typeof text!=='string'||!/^[-_A-Za-z0-9+/]*={0,2}$/.test(text)||text.length>1024)throw Error('Invalid signature encoding');
  if(typeof atob==='function')return Uint8Array.from(atob(text),c=>c.charCodeAt(0));
  return Uint8Array.from(Buffer.from(text,'base64'));
 };
 function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  if(value===null||['string','number','boolean'].includes(typeof value))return JSON.stringify(value);
  throw Error('Non-JSON protocol value');
 }
 async function generateSeatKey(){return cryptoAPI().generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);}
 async function exportPublicKey(key){return cryptoAPI().exportKey('jwk',key);}
 async function importPublicKey(jwk){
  if(!jwk||jwk.kty!=='EC'||jwk.crv!=='P-256'||jwk.d||!jwk.x||!jwk.y)throw Error('Only public P-256 JWK keys are accepted');
  return cryptoAPI().importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 }
 function createEnvelope(roomId,seatId,expectedRevision,action,commandId){
  if(!str(roomId)||!str(seatId)||!str(commandId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!action||typeof action.type!=='string')
   throw Error('Invalid command envelope');
  return {roomId,seatId,expectedRevision,commandId,action:clone(action)};
 }
 async function sign(envelope,privateKey){
  const body=canonical(envelope);
  if(bytes(body).byteLength>MAX_COMMAND_BYTES)throw Error('Command too large');
  return {...clone(envelope),signature:toBase64(await cryptoAPI().sign({name:'ECDSA',hash:'SHA-256'},privateKey,bytes(body)))};
 }
 async function verify(command,publicKey){
  if(!command||typeof command!=='object')return false;
  const {signature,...envelope}=command;
  const text=canonical(envelope);
  if(bytes(text).byteLength>MAX_COMMAND_BYTES)return false;
  return cryptoAPI().verify({name:'ECDSA',hash:'SHA-256'},publicKey,fromBase64(signature),bytes(text));
 }
 async function digest(value){return [...new Uint8Array(await cryptoAPI().digest('SHA-256',bytes(canonical(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');}
 function validateSeat(raw){
  const allowed=['id','name','role','publicKey','canVote','weight'];
  if(!raw||typeof raw!=='object'||Object.keys(raw).some(k=>!allowed.includes(k))||!str(raw.id)||typeof raw.name!=='string'||raw.name.length>120||
    !['host','editor','commenter','assessor','viewer'].includes(raw.role)||typeof raw.canVote!=='boolean'||!Number.isSafeInteger(raw.weight)||raw.weight<0||raw.weight>1_000_000)
    throw Error('Invalid voting seat');
  return clone(raw);
 }
 function publicRound(round){
  if(!round)return null;
  const base={id:round.id,state:round.state,openedAt:round.openedAt,closedAt:round.closedAt||null,
   proposalDigest:round.proposalDigest,numberOfSeats:round.seats.length,
   rules:clone(round.rules),optionIds:[...round.optionIds]};
  if(round.state==='closed')base.results=clone(round.results.public);
  return base;
 }
 class HostRoom {
  constructor(Core,{id,project,ownerSeat,ownerPublicKey}){
    if(!Core||!str(id))throw Error('Invalid room');
    this.Core=Core;this.id=id;this.project=Core.validateProject(project);
    const owner=validateSeat({...ownerSeat,role:'host'});
    if (!this.project.users.some(u=>u.id===owner.id)) {
      if(this.project.users.length>=100)throw Error('Project profile limit');
      this.project.users.push({id:owner.id,name:owner.name,shares:1,role:'owner'});
    }
    this.seats=new Map([[owner.id,{...owner,publicKey:clone(ownerPublicKey||owner.publicKey)}]]);
    this.revision=0;this.commands=new Set();this.audit=[];this.round=null;this.closedRounds=[];this._queue=Promise.resolve();
  }
  publicState(){return {roomId:this.id,revision:this.revision,project:clone(this.project),
    seats:[...this.seats.values()].map(({id,name,role,canVote,weight,publicKey})=>({id,name,role,canVote,weight,publicKey:clone(publicKey)})),
    round:publicRound(this.round),closedRounds:this.closedRounds.map(publicRound)};}
  hostBackup(){return {roomId:this.id,revision:this.revision,project:clone(this.project),
    seats:[...this.seats.values()].map(clone),audit:clone(this.audit),
    openRound:this.round?clone(this.round):null,closedRounds:clone(this.closedRounds),
    warning:'Host backup contains individual votes, public seat keys and assessments; protect it.'};}
  accept(command){
    // Serialize all asynchronous verification and state mutations. Two valid
    // signatures claiming the same revision cannot both commit concurrently.
    const task=this._queue.then(()=>this._accept(command));
    this._queue=task.catch(()=>{});
    return task;
  }
  async _accept(command){
    if(!command||typeof command!=='object'||!str(command.commandId)||!str(command.seatId)||command.roomId!==this.id||
       !Number.isSafeInteger(command.expectedRevision)||!command.action||typeof command.action.type!=='string')throw Error('Invalid command');
    if(this.commands.has(command.commandId))throw Error('Replay rejected');
    const seat=this.seats.get(command.seatId);
    if(!seat)throw Error('Unadmitted seat');
    const key=await importPublicKey(seat.publicKey);
    if(!await verify(command,key))throw Error('Invalid signature');
    if(command.expectedRevision!==this.revision)throw Error('Stale revision; fetch new snapshot and rebase');
    const {type}=command.action,payload=command.action.payload;
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Invalid command payload');
    const host=seat.role==='host',write=host||seat.role==='editor',assess=write||seat.role==='assessor',comment=assess||seat.role==='commenter';
    if(['seat.admit','seat.revoke','ballot.open','ballot.close','ballot.cancel'].includes(type)&&!host)throw Error('Host-only command');
    if(['claim.add','claim.edit','edge.add'].includes(type)&&!write)throw Error('Editor permission required');
    if(['claim.credence','edge.influence'].includes(type)&&!assess)throw Error('Assessor permission required');
    if(type==='comment.add'&&!comment)throw Error('Comment permission required');
    if(type==='ballot.cast'&&!seat.canVote)throw Error('Vote eligibility required');
    if(this.round?.state==='open'&&['claim.add','claim.edit','edge.add','claim.credence','edge.influence','comment.add'].includes(type))throw Error('Frozen proposal: close or cancel round before editing');
    let next=clone(this.project),nextSeats=null,nextRound=this.round?clone(this.round):null,closed=null,ack={};
    if(type==='seat.admit'){
      if(this.round?.state==='open')throw Error('Cannot alter seats while voting');
      if(this.seats.size>=MAX_SEATS)throw Error('Room full');
      const nextSeat=validateSeat(payload.seat);
      if(nextSeat.role==='host'||this.seats.has(nextSeat.id)||next.users.some(u=>u.id===nextSeat.id))throw Error('Duplicate or forbidden seat/profile');
      await importPublicKey(nextSeat.publicKey);
      if(!next.users.some(u=>u.id===nextSeat.id)){
        if(next.users.length>=100)throw Error('Project profile limit');
        next.users.push({id:nextSeat.id,name:nextSeat.name,shares:1,role:nextSeat.role==='viewer'?'viewer':'editor'});
      }
      nextSeats={add:nextSeat};ack={seatId:nextSeat.id};
    }else if(type==='seat.revoke'){
      if(this.round?.state==='open')throw Error('Cannot alter seats while voting');
      if(!this.seats.has(payload.id)||payload.id===seat.id)throw Error('Cannot revoke this seat');
      nextSeats={remove:payload.id};
    }else if(type==='claim.add'){
      const n=this.Core.addChild(next,payload.parentId,payload.relation,seat.id);
      if(typeof payload.title!=='string'||!payload.title.trim()||payload.title.length>200)throw Error('Invalid claim title');
      n.title=payload.title.trim();ack={nodeId:n.id};
    }else if(type==='claim.edit'){
      const n=next.nodes.find(n=>n.id===payload.nodeId);if(!n||!payload.title?.trim()||payload.title.length>200)throw Error('Invalid claim edit');
      n.title=payload.title.trim();
    }else if(type==='edge.add'){
      const edge=this.Core.addLink(next,payload.sourceId,payload.targetId,payload.relation,payload.impact);
      ack={linkId:edge.id};
    }else if(type==='claim.credence')this.Core.upsertVote(next,payload.nodeId,seat.id,payload.credence);
    else if(type==='edge.influence')this.Core.upsertEdgeAssessment(next,payload.subjectType,payload.subjectId,seat.id,payload.influence);
    else if(type==='comment.add'){
      const c=this.Core.addComment(next,payload.nodeId,payload.body,seat.name,seat.id);ack={commentId:c.id};
    }else if(type==='ballot.open'){
      if(next.mode!=='decision'||this.round?.state==='open')throw Error('Cannot start ballot here');
      const options=next.nodes.filter(n=>n.relation==='option').map(n=>n.id);
      if(options.length<2)throw Error('At least two alternatives required');
      const voters=[...this.seats.values()].filter(s=>s.canVote&&s.weight>0).map(s=>({id:s.id,weight:s.weight}));
      if(!voters.length)throw Error('No eligible voting seats');
      const rules=payload.rules||{};
      if(!Number.isFinite(rules.quorumFraction)||rules.quorumFraction<0||rules.quorumFraction>1||
        !Number.isFinite(rules.winnerFraction)||rules.winnerFraction<0||rules.winnerFraction>1)throw Error('Explicit quorum and winner threshold required');
      const frozen=clone(next);
      const proposalDigest=await digest({project:frozen,voters,options,rules});
      nextRound={id:payload.roundId,proposalDigest,project:frozen,optionIds:options,seats:voters,
        rules:{quorumFraction:rules.quorumFraction,winnerFraction:rules.winnerFraction},state:'open',openedAt:iso(),ballots:[],audit:[]};
      if(!str(nextRound.id)||this.closedRounds.some(r=>r.id===nextRound.id))throw Error('Round ID reused');
      ack={roundId:nextRound.id,proposalDigest};
    }else if(type==='ballot.cast'){
      if(!nextRound||nextRound.state!=='open'||payload.roundId!==nextRound.id)throw Error('Round not open');
      if(!nextRound.seats.some(s=>s.id===seat.id))throw Error('Seat not eligible in frozen snapshot');
      if(payload.optionId!==null&&!nextRound.optionIds.includes(payload.optionId))throw Error('Option not in frozen proposal');
      nextRound.ballots=nextRound.ballots.filter(b=>b.seatId!==seat.id);
      nextRound.ballots.push({seatId:seat.id,optionId:payload.optionId,commandId:command.commandId,signature:command.signature,at:iso()});
      nextRound.audit.push({seatId:seat.id,commandId:command.commandId,event:'cast-or-replace',at:iso()});
      ack={accepted:true,hiddenUntilClosed:true};
    }else if(type==='ballot.close'){
      if(!nextRound||nextRound.state!=='open')throw Error('No open ballot');
      const weights=new Map(nextRound.seats.map(s=>[s.id,s.weight]));
      const tally=Object.fromEntries(nextRound.optionIds.map(id=>[id,0]));
      let abstain=0,cast=0,total=0;
      for(const s of nextRound.seats)total+=s.weight;
      for(const ballot of nextRound.ballots){const w=weights.get(ballot.seatId);cast+=w;if(ballot.optionId===null)abstain+=w;else tally[ballot.optionId]+=w;}
      const decisive=cast-abstain;
      const ranked=Object.entries(tally).sort((a,b)=>b[1]-a[1]);
      const tied=ranked.length>1&&ranked[0][1]===ranked[1][1];
      const quorumMet=total>0&&cast/total>=nextRound.rules.quorumFraction;
      const winner=quorumMet&&decisive>0&&!tied&&ranked[0][1]/decisive>=nextRound.rules.winnerFraction?ranked[0][0]:null;
      nextRound.state='closed';nextRound.closedAt=iso();
      nextRound.results={public:{totalWeight:total,castWeight:cast,abstainWeight:abstain,nonparticipatingWeight:total-cast,
        choices:tally,quorumMet,winnerOptionId:winner,tied},private:{ballots:clone(nextRound.ballots),auditedChanges:clone(nextRound.audit)}};
      closed=clone(nextRound);ack={closed:true,winnerOptionId:winner};
    }else if(type==='ballot.cancel'){
      if(!nextRound||nextRound.state!=='open')throw Error('No open ballot');
      nextRound.state='cancelled';nextRound.closedAt=iso();closed=clone(nextRound);ack={cancelled:true};
    }else throw Error('Unsupported command type');
    next=this.Core.validateProject(next);
    const commandHash=await digest(command); // complete potentially failing async checks before committing state
    if(nextSeats?.add)this.seats.set(nextSeats.add.id,nextSeats.add);
    if(nextSeats?.remove)this.seats.delete(nextSeats.remove);
    this.project=next;this.round=nextRound;
    if(closed){this.closedRounds.push(closed);this.round=null;}
    this.commands.add(command.commandId);
    this.revision++;
    this.audit.push({revision:this.revision,commandId:command.commandId,seatId:seat.id,type,acceptedAt:iso(),
      commandHash,signature:command.signature,
      ...(type==='ballot.cast'?{detailsHidden:true}:{})});
    return {revision:this.revision,ack,publicState:this.publicState()};
  }
 }
 return {HostRoom,generateSeatKey,exportPublicKey,importPublicKey,createEnvelope,sign,verify,digest,canonical};
});
