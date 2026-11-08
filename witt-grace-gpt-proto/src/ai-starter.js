/* Offline, untrusted AI starter-tree interchange. Only claims and relationships;
 * there are no fabricated credence scores, reviewer identities or ballots.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WittAIStarter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FORMAT = 'witt-ai-starter-v1';
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:witt:ai-starter:v1', title: 'WITT unassessed claim tree draft',
    description: 'Unassessed claims only. Import creates editable WITT v4; no person, credence, relation-impact rating or ballot is accepted.',
    type: 'object', additionalProperties: false,
    required: ['format','title','root','claims'],
    properties: {
      format: {const: FORMAT}, title: {type:'string',minLength:1,maxLength:200},
      root: {$ref:'#/$defs/root'},
      claims: {type:'array',maxItems:200,items:{$ref:'#/$defs/claim'}}
    },
    $defs: {
      id: {type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]{0,39}$'},
      title: {type:'string',minLength:1,maxLength:200},
      details: {type:'string',maxLength:3000},
      root: {type:'object',additionalProperties:false,required:['id','title'],properties:{
        id:{$ref:'#/$defs/id'},title:{$ref:'#/$defs/title'},details:{$ref:'#/$defs/details'}
      }},
      claim: {type:'object',additionalProperties:false,required:['id','parentId','relation','title'],properties:{
        id:{$ref:'#/$defs/id'},parentId:{$ref:'#/$defs/id'},relation:{enum:['support','oppose']},
        title:{$ref:'#/$defs/title'},details:{$ref:'#/$defs/details'}
      }}
    }
  };
  const isObject = x => x && typeof x === 'object' && !Array.isArray(x);
  function fields(obj, allowed, required, what) {
    if (!isObject(obj)) throw Error(`${what}: object required`);
    for (const key of Object.keys(obj)) if (!allowed.includes(key)) throw Error(`${what}: prohibited property ${key}`);
    for (const key of required) if (!Object.hasOwn(obj,key)) throw Error(`${what}: missing ${key}`);
  }
  function boundedText(x, max, what) {
    if (typeof x !== 'string' || !x.trim() || x.length > max) throw Error(`${what}: invalid text length`);
    return x.trim();
  }
  function optionalText(x, what) {
    if (x === undefined) return '';
    if (typeof x !== 'string' || x.length > 3000) throw Error(`${what}: invalid details`);
    return x;
  }
  function id(x) {
    if (typeof x !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(x)) throw Error('Invalid claim ID');
    return x;
  }
  function validate(raw) {
    if (typeof raw === 'string') raw = JSON.parse(raw);
    fields(raw,['format','title','root','claims'],['format','title','root','claims'],'starter');
    if (raw.format !== FORMAT) throw Error('Unknown starter format');
    const title = boundedText(raw.title,200,'title');
    fields(raw.root,['id','title','details'],['id','title'],'root');
    const root = {id:id(raw.root.id),title:boundedText(raw.root.title,200,'root title'),details:optionalText(raw.root.details,'root')};
    if (!Array.isArray(raw.claims) || raw.claims.length > 200) throw Error('At most 200 claims');
    const seen = new Set([root.id]);
    const claims = raw.claims.map((c,i)=>{
      fields(c,['id','parentId','relation','title','details'],['id','parentId','relation','title'],`claim ${i+1}`);
      const next = {id:id(c.id),parentId:id(c.parentId),relation:c.relation,
        title:boundedText(c.title,200,'claim title'),details:optionalText(c.details,'claim')};
      if (seen.has(next.id)) throw Error('Duplicate claim ID');
      if (!['support','oppose'].includes(next.relation)) throw Error('Invalid relation');
      seen.add(next.id);
      return next;
    });
    // Topological validation: arbitrary input order is fine; dangling parents and cycles fail.
    const completed = new Set([root.id]);
    let pending = [...claims];
    while (pending.length) {
      const remainder = pending.filter(c=>!completed.has(c.parentId));
      pending.filter(c=>completed.has(c.parentId)).forEach(c=>completed.add(c.id));
      if (remainder.length === pending.length) throw Error('Claim cycle or missing parent');
      pending = remainder;
    }
    return {format:FORMAT,title,root,claims};
  }
  function toProject(input, Core) {
    const draft = validate(input);
    const project = Core.createBlankProject('argument');
    project.title = draft.title;
    const root = project.nodes[0];
    root.title = draft.root.title; root.details = draft.root.details;
    root.confidence = 50; root.impact = 0; // Neutral placeholders, never AI assessments.
    const ids = new Map([[draft.root.id,root.id]]);
    let pending = [...draft.claims];
    while (pending.length) {
      const accepted = pending.filter(c=>ids.has(c.parentId));
      if (!accepted.length) throw Error('Unresolvable claim parent');
      for (const c of accepted) {
        const n = Core.addChild(project, ids.get(c.parentId),c.relation,project.users[0].id);
        n.title=c.title; n.details=c.details; n.confidence=50; n.impact=0;
        ids.set(c.id,n.id);
      }
      pending = pending.filter(c=>!ids.has(c.id));
    }
    return Core.validateProject(project);
  }
  function buildPrompt(language = 'fi', topic = '') {
    const lang = {fi:'Finnish',de:'German',en:'English',es:'Spanish',fr:'French',ru:'Russian',
      'zh-Hans':'Simplified Chinese',ja:'Japanese',ko:'Korean'}[language] || 'English';
    const subject = (topic || '').trim().slice(0,1000) || '(Choose a concrete claim / question)';
    const example = {format:FORMAT,title:'Example subject',root:{id:'root',title:'Should this be done?'},claims:[
      {id:'reason1',parentId:'root',relation:'support',title:'A supporting reason'},
      {id:'objection1',parentId:'root',relation:'oppose',title:'An objection'},
      {id:'reply1',parentId:'objection1',relation:'oppose',title:'A reply to the objection'}]};
    return [
      'Create an EDITABLE, UNASSESSED argument tree for WITT / GRACE Method.',
      'Topic: '+subject,
      'Write titles and details in '+lang+'. Return ONLY a single valid JSON object, no Markdown or commentary.',
      'Required format: '+FORMAT+'. Follow the JSON shape of this example:',
      JSON.stringify(example,null,2),
      'Use a single root claim and an array of nodes with unique ASCII IDs.',
      'Each child relation is support or oppose RELATIVE TO ITS IMMEDIATE PARENT; opposing an objection can support the root.',
      'Include substantial arguments and fair counterarguments, up to 200 claims; prefer 2-4 meaningful levels rather than filler.',
      'If a claim has multiple targets, place it once under its clearest primary parent; the user can add secondary links later.',
      'Optional details strings may describe reasoning, open questions and what evidence is needed.',
      'Do not invent studies, citations, quotes, numerical evidence or factual certainty. Mark unverified propositions as questions to check.',
      'NEVER include confidence, impact, probability, votes, edgeAssessments, ballots, people or scores. Humans do assessments later.',
      'Max title length 200 characters, details 3000. IDs must match /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.',
      'Return JSON that can be imported directly into WITT as '+FORMAT+'.'
    ].join('\n\n');
  }
  return { FORMAT, schema, validate, toProject, buildPrompt };
});
