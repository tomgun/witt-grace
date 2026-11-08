/* WITT offline external-AI round-trip. Explicit, reviewable proposals only.
 * AI assessments belong to a distinct named local assessor, never to a human.
 * A fingerprint is a change detector, NOT a cryptographic signature.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WittAIRoundtrip = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const REQUEST_FORMAT = 'witt-ai-review-request-v1';
  const RESPONSE_FORMAT = 'witt-ai-review-v1';
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const safeId = x => typeof x === 'string' && x.length > 0 && x.length <= 100 && /^[A-Za-z0-9_-]+$/.test(x);
  function keys(value, allowed, required, label) {
    if (!object(value)) throw Error(`${label}: expected object`);
    for (const name of Object.keys(value)) if (!allowed.includes(name)) throw Error(`${label}: unexpected ${name}`);
    for (const name of required) if (!Object.hasOwn(value, name)) throw Error(`${label}: missing ${name}`);
  }
  function text(value, limit, label, required = true) {
    if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw Error(`${label}: invalid text`);
    return value.trim();
  }
  function rel(value) { if (!['support','oppose','option'].includes(value)) throw Error('Invalid relationship'); return value; }
  function influence(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value)>5 || value*2!==Math.round(value*2))
      throw Error('Influence must be -5…+5 in 0.5 steps');
    return value;
  }
  function credence(value) {
    if (!Number.isInteger(value) || value<0 || value>100) throw Error('Credence must be an integer 0…100');
    return value;
  }
  // This is only a stale-project check; attackers can forge it. Import is never
  // treated as an authentication, authorization or authenticity mechanism.
  function fingerprint(project) {
    const bytes = JSON.stringify(project);
    let h1 = 0x811c9dc5, h2 = 0x8cc7aa3b;
    for (let i = 0; i < bytes.length; i++) {
      h1 = Math.imul(h1 ^ bytes.charCodeAt(i), 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ bytes.charCodeAt(i), 0x01000193) >>> 0;
    }
    return h1.toString(16).padStart(8,'0') + h2.toString(16).padStart(8,'0');
  }
  const RESPONSE_EXAMPLE = {
    format: RESPONSE_FORMAT, projectId: 'COPY_FROM_REQUEST', baseFingerprint: 'COPY_FROM_REQUEST',
    assessor: 'Example model or assistant',
    claims: [{ tempId:'pro1', parentId:'EXISTING_NODE_ID', relation:'support',
      title:'A new claim to consider', details:'What is known, unknown, and what to verify' }],
    links: [],
    relationAssessments: [],
    assessments: [{nodeId:'pro1',credence:65,primaryInfluence:2},
      {nodeId:'EXISTING_NODE_ID',credence:70}],
    comments: [{nodeId:'pro1',body:'AI observation — verify against independent sources.'}]
  };
  const schema = {
    $schema:'https://json-schema.org/draft/2020-12/schema',
    title:'WITT AI review response, proposed changes only',
    type:'object',additionalProperties:false,
    required:['format','projectId','baseFingerprint','assessor'],
    properties: {
      format:{const:RESPONSE_FORMAT},projectId:{type:'string',minLength:1,maxLength:100},
      baseFingerprint:{type:'string',pattern:'^[a-f0-9]{16}$'},
      assessor:{type:'string',minLength:1,maxLength:70},
      claims:{type:'array',maxItems:200,items:{$ref:'#/$defs/claim'}},
      links:{type:'array',maxItems:200,items:{$ref:'#/$defs/link'}},
      assessments:{type:'array',maxItems:400,items:{$ref:'#/$defs/assessment'}},
      relationAssessments:{type:'array',maxItems:400,items:{$ref:'#/$defs/relationAssessment'}},
      comments:{type:'array',maxItems:400,items:{$ref:'#/$defs/comment'}}
    },
    $defs: {
      id:{type:'string',minLength:1,maxLength:100},
      claim:{type:'object',additionalProperties:false,required:['tempId','parentId','relation','title'],properties:{
        tempId:{$ref:'#/$defs/id'},parentId:{$ref:'#/$defs/id'},
        relation:{enum:['support','oppose','option']},title:{type:'string',minLength:1,maxLength:200},
        details:{type:'string',maxLength:5000},semanticType:{enum:['unspecified','fact','assumption','value','constraint','prerequisite']},
        constraintStatus:{enum:['unknown','met','unmet']},authorVisibility:{enum:['named','anonymous']},
        sources:{type:'array',maxItems:25,items:{type:'object',additionalProperties:false,required:['url','note'],properties:{url:{type:'string',maxLength:1000,pattern:'^https?://'},note:{type:'string',maxLength:500}}}}
      }},
      link:{type:'object',additionalProperties:false,required:['sourceId','targetId','relation'],properties:{
        sourceId:{$ref:'#/$defs/id'},targetId:{$ref:'#/$defs/id'},relation:{enum:['support','oppose']},
        influence:{type:'number',minimum:-5,maximum:5,multipleOf:0.5}
      }},
      assessment:{type:'object',additionalProperties:false,required:['nodeId'],anyOf:[{required:['credence']},{required:['primaryInfluence']}],properties:{
        nodeId:{$ref:'#/$defs/id'},credence:{type:'integer',minimum:0,maximum:100},
        primaryInfluence:{type:'number',minimum:-5,maximum:5,multipleOf:0.5}
      }},
      relationAssessment:{type:'object',additionalProperties:false,required:['subjectType','subjectId','influence'],properties:{subjectType:{enum:['primary','secondary']},subjectId:{$ref:'#/$defs/id'},influence:{type:'number',minimum:-5,maximum:5,multipleOf:0.5}}},
      comment:{type:'object',additionalProperties:false,required:['nodeId','body'],properties:{
        nodeId:{$ref:'#/$defs/id'},body:{type:'string',minLength:1,maxLength:3000}
      }}
    }
  };
  function makeRequest(project, Core, language = 'fi') {
    const canonical = Core.validateProject(project);
    return {
      format:REQUEST_FORMAT,
      projectId:canonical.id,
      baseFingerprint:fingerprint(canonical),
      language,
      instructions:'The document is supplied by its user. Propose incremental claims, extra links, your own assessments and comments. Do not replace or delete existing content or write human ratings. Copy projectId and baseFingerprint unchanged. Return only a JSON object in witt-ai-review-v1 format. Human must review and approve before any changes are applied.',
      document:canonical,
      responseExample:{...RESPONSE_EXAMPLE,projectId:canonical.id,baseFingerprint:fingerprint(canonical),
        claims:[{...RESPONSE_EXAMPLE.claims[0],parentId:canonical.nodes[0].id}],
        assessments:[{...RESPONSE_EXAMPLE.assessments[0]},{...RESPONSE_EXAMPLE.assessments[1],nodeId:canonical.nodes[0].id}]}
    };
  }
  function makePrompt(request) {
    return [
      'Review the following CURRENT WITT / GRACE Method document. This is NOT a blank-tree request.',
      'Return ONE JSON object using the witt-ai-review-v1 response format (no markdown fences).',
      'Read the full document: include original claims, relationships, existing reviewer estimates and comments in your reasoning.',
      'Suggest useful missing claims and rebuttals, optional additional links, YOUR OWN claim credence (0…100) and SIGNED relation influences (−5…+5), and explanatory comments.',
      'Each assessment expresses your opinion as a SEPARATE named AI assessor; never copy yourself into an existing human profile, never overwrite human ratings, votes, or comments.',
      'An assessment primaryInfluence belongs to the claim-to-immediate-parent relationship. Negative values oppose it, positive support it, zero is neutral, regardless of the structural relation label.',
      'Use existing node IDs for existing claims. For new claims use unique tempId identifiers and refer to tempIds from parentId, nodeId, sourceId or targetId. Use existing IDs when adding links between existing claims.',
      'Do not duplicate claims, invent citations or imply that your numerical estimates are verified facts. State uncertainties and what evidence is needed in comments.',
      'New claims may include semanticType and source URLs; values, mandatory constraints and prerequisites are NOT true/false claims. Do not assign credence to them. Mark gates unknown unless there is independently verifiable reason and explicit human confirmation.',
      'To assess an existing secondary link, use relationAssessments: [{subjectType:"secondary",subjectId:"LINK_ID",influence:-3}]; this stays your AI opinion only.',
      'Copy projectId and baseFingerprint EXACTLY, and set assessor to your model or assistant name.',
      'Use only the properties in the response schema. You may leave claims, links, relationAssessments, assessments or comments empty, but propose at least one change.',
      'Output in language: '+request.language+'. Maximum 200 new claims, 200 links, 400 assessments and 400 comments.',
      'Complete request JSON follows (it includes the responseExample and the full document):',
      JSON.stringify(request,null,2)
    ].join('\n\n');
  }
  function validatePatch(raw) {
    if (typeof raw === 'string') raw = JSON.parse(raw);
    keys(raw,['format','projectId','baseFingerprint','assessor','claims','links','relationAssessments','assessments','comments'],['format','projectId','baseFingerprint','assessor'],'review');
    if (raw.format!==RESPONSE_FORMAT) throw Error('Not a WITT AI review response');
    const projectId=text(raw.projectId,100,'projectId');
    const baseFingerprint=text(raw.baseFingerprint,16,'baseFingerprint');
    if (!/^[0-9a-f]{16}$/.test(baseFingerprint)) throw Error('Invalid project fingerprint');
    const assessor=text(raw.assessor,70,'assessor');
    const validateArray=(rows,max,label,fn)=>{
      if (rows === undefined) return [];
      if (!Array.isArray(rows) || rows.length>max) throw Error(`${label}: invalid count`);
      return rows.map((row,i)=>fn(row,`${label} ${i+1}`));
    };
    const seenClaims=new Set();
    const claims=validateArray(raw.claims,200,'claims',(c,label)=>{
      keys(c,['tempId','parentId','relation','title','details','semanticType','constraintStatus','sources','authorVisibility'],['tempId','parentId','relation','title'],label);
      if(!safeId(c.tempId)||!safeId(c.parentId)||seenClaims.has(c.tempId))throw Error(label+': invalid or duplicate ID');
      seenClaims.add(c.tempId);
      if(c.semanticType!==undefined&&!['unspecified','fact','assumption','value','constraint','prerequisite'].includes(c.semanticType))throw Error(label+': invalid semantic type');
      if(c.constraintStatus!==undefined&&(!['constraint','prerequisite'].includes(c.semanticType)||!['unknown','met','unmet'].includes(c.constraintStatus)))throw Error(label+': invalid gate');
      if(c.authorVisibility!==undefined&&!['named','anonymous'].includes(c.authorVisibility))throw Error(label+': invalid author label');
      if(c.sources!==undefined&&(!Array.isArray(c.sources)||c.sources.length>25))throw Error(label+': invalid sources');
      const sources=c.sources?.map(source=>{
        keys(source,['url','note'],['url','note'],label+' source');
        if(typeof source.url!=='string'||source.url.length>1000||!/^https?:\/\//i.test(source.url))throw Error(label+': source must be http(s)');
        try{const u=new URL(source.url);if(!u.hostname||!['http:','https:'].includes(u.protocol))throw Error();}catch(_){throw Error(label+': invalid source URL');}
        return {url:source.url,note:text(source.note,500,label+' source note',false)};
      });
      return {tempId:c.tempId,parentId:c.parentId,relation:rel(c.relation),title:text(c.title,200,label+' title'),details:c.details===undefined?'':text(c.details,5000,label+' details',false),
        ...(c.semanticType!==undefined?{semanticType:c.semanticType}:{}),...(c.constraintStatus!==undefined?{constraintStatus:c.constraintStatus}:{}),
        ...(sources!==undefined?{sources}:{}),...(c.authorVisibility!==undefined?{authorVisibility:c.authorVisibility}:{})};
    });
    const seenLinks=new Set();
    const links=validateArray(raw.links,200,'links',(link,label)=>{
      keys(link,['sourceId','targetId','relation','influence'],['sourceId','targetId','relation'],label);
      if(!safeId(link.sourceId)||!safeId(link.targetId))throw Error(label+': invalid endpoint');
      const key=JSON.stringify([link.sourceId,link.targetId]);
      if (seenLinks.has(key))throw Error(label+': duplicate link');
      seenLinks.add(key);
      return {sourceId:link.sourceId,targetId:link.targetId,relation:rel(link.relation),
        ...(link.influence===undefined?{}:{influence:influence(link.influence)})};
    });
    const seenRelationAssess=new Set();
    const relationAssessments=validateArray(raw.relationAssessments,400,'relationAssessments',(a,label)=>{
      keys(a,['subjectType','subjectId','influence'],['subjectType','subjectId','influence'],label);
      if(!['primary','secondary'].includes(a.subjectType)||!safeId(a.subjectId))throw Error(label+': invalid relation');
      const key=JSON.stringify([a.subjectType,a.subjectId]);if(seenRelationAssess.has(key))throw Error(label+': duplicate');seenRelationAssess.add(key);
      return {subjectType:a.subjectType,subjectId:a.subjectId,influence:influence(a.influence)};
    });
    const seenAssess=new Set();
    const assessments=validateArray(raw.assessments,400,'assessments',(a,label)=>{
      keys(a,['nodeId','credence','primaryInfluence'],['nodeId'],label);
      if(!safeId(a.nodeId)||seenAssess.has(a.nodeId))throw Error(label+': invalid or duplicate node');
      seenAssess.add(a.nodeId);
      if(a.credence===undefined&&a.primaryInfluence===undefined)throw Error(label+': at least one estimate required');
      return {nodeId:a.nodeId,...(a.credence===undefined?{}:{credence:credence(a.credence)}),
        ...(a.primaryInfluence===undefined?{}:{primaryInfluence:influence(a.primaryInfluence)})};
    });
    // A reviewer has only one opinion per exact edge. Never let two answer
    // fields silently overwrite one another according to parser order.
    for (const a of assessments) if (a.primaryInfluence !== undefined &&
      seenRelationAssess.has(JSON.stringify(['primary', a.nodeId])))
      throw Error('Duplicate primary influence in assessments and relationAssessments');
    const comments=validateArray(raw.comments,400,'comments',(c,label)=>{
      keys(c,['nodeId','body'],['nodeId','body'],label);
      if(!safeId(c.nodeId))throw Error(label+': invalid node');
      return {nodeId:c.nodeId,body:text(c.body,3000,label+' body')};
    });
    if(!claims.length&&!links.length&&!relationAssessments.length&&!assessments.length&&!comments.length)throw Error('Empty AI proposal');
    return {format:RESPONSE_FORMAT,projectId,baseFingerprint,assessor,claims,links,relationAssessments,assessments,comments};
  }
  function prepareMerge(project, raw, Core) {
    const patch=validatePatch(raw);
    const original=Core.validateProject(project);
    if(patch.projectId!==original.id)throw Error('Response belongs to a different document. No changes imported.');
    if(patch.baseFingerprint!==fingerprint(original))throw Error('The document changed after export. Export again and ask AI to regenerate; no changes imported.');
    const next=Core.validateProject(original);
    const profileId=Core.uid();
    let profileName='AI · '+patch.assessor;
    if (profileName.length>120) profileName=profileName.slice(0,120);
    let serial=2;
    const stem=profileName;
    while(next.users.some(p=>p.name.toLocaleLowerCase()===profileName.toLocaleLowerCase())) {
      profileName=stem.slice(0,112)+` (${serial++})`;
    }
    if(next.users.length>=100)throw Error('Reviewer profile limit reached');
    next.users.push({id:profileId,name:profileName,shares:1,role:'editor',profileKind:'ai'});
    const idMap=new Map(original.nodes.map(n=>[n.id,n.id]));
    const list=[];
    let waiting=[...patch.claims];
    while(waiting.length) {
      let inserted=0;
      const remainder=[];
      for(const entry of waiting) {
        if (!idMap.has(entry.parentId)) {remainder.push(entry);continue;}
        if(idMap.has(entry.tempId))throw Error('AI temp ID collides with an existing ID');
        const created=Core.addChild(next,idMap.get(entry.parentId),entry.relation,profileId);
        created.title=entry.title; created.details=entry.details; created.impact=0; created.confidence=50;
        for (const key of ['semanticType','constraintStatus','sources','authorVisibility']) if(entry[key]!==undefined)created[key]=entry[key];
        idMap.set(entry.tempId,created.id);
        list.push({nodeId:created.id,parentId:created.parentId,relation:entry.relation,title:entry.title});
        inserted++;
      }
      if(!inserted)throw Error('A proposed claim has missing/cyclic parent reference');
      waiting=remainder;
    }
    const resolve=reference=>{if(!idMap.has(reference))throw Error('AI references unknown claim '+reference);return idMap.get(reference);};
    const linkDetails=[];
    for(const item of patch.links) {
      if(item.relation==='option')throw Error('A secondary link cannot be an option');
      const sourceId=resolve(item.sourceId),targetId=resolve(item.targetId);
      const link=Core.addLink(next,sourceId,targetId,item.relation,0);
      if(item.influence!==undefined)Core.upsertEdgeAssessment(next,'secondary',link.id,profileId,item.influence);
      linkDetails.push({sourceId,targetId,relation:item.relation,influence:item.influence??null});
    }
    const relationDetails=[];
    for(const item of patch.relationAssessments) {
      if(item.subjectType==='secondary'){
        const linked=next.links.find(l=>l.id===item.subjectId);
        if(!linked)throw Error('AI relation assessment refers to unknown existing secondary link');
        Core.upsertEdgeAssessment(next,'secondary',linked.id,profileId,item.influence);
      } else {
        const nodeId=resolve(item.subjectId);
        Core.upsertEdgeAssessment(next,'primary',nodeId,profileId,item.influence);
      }
      relationDetails.push(item);
    }
    const assessmentDetails=[];
    for (const item of patch.assessments) {
      const nodeId=resolve(item.nodeId);
      if (item.credence!==undefined) {
        if(next.nodes.find(n=>n.id===nodeId)?.kind==='decision')throw Error('Decision question has no credence');
        Core.upsertVote(next,nodeId,profileId,item.credence);
      }
      if(item.primaryInfluence!==undefined)Core.upsertEdgeAssessment(next,'primary',nodeId,profileId,item.primaryInfluence);
      assessmentDetails.push({nodeId,credence:item.credence??null,primaryInfluence:item.primaryInfluence??null});
    }
    const commentDetails=[];
    for (const item of patch.comments) {
      const nodeId=resolve(item.nodeId);
      Core.addComment(next,nodeId,item.body,profileName,profileId);
      commentDetails.push({nodeId,body:item.body});
    }
    next.updatedAt=new Date().toISOString();
    return {project:Core.validateProject(next),assessor:profileName,claims:list,links:linkDetails,
      assessments:assessmentDetails,relationAssessments:relationDetails,comments:commentDetails,patch};
  }
  return { REQUEST_FORMAT, RESPONSE_FORMAT, schema, fingerprint, makeRequest, makePrompt, validatePatch, prepareMerge };
});
