'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/core.js');
const Workspace = require('../src/workspace.js');
const AI = require('../src/ai-starter.js');
const fs = require('node:fs');
const path = require('node:path');

function storage(initial = {}, rejectKey = '') {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key=>values.has(key)?values.get(key):null,
    setItem: (key,val)=>{if(key===rejectKey) throw Error('QUOTA');values.set(key,String(val));},
    removeItem:key=>values.delete(key),
    keys:()=>[...values.keys()],
    values
  };
}
const validDraft = () => ({format:AI.FORMAT,title:'Must the city improve cycling?',
  root:{id:'main',title:'Should the city build protected cycle lanes?',details:'Explore uncertainty, not a vote.'},
  claims:[
    {id:'rebuttal',parentId:'objection',relation:'oppose',title:'Safer crossings can mitigate this'},
    {id:'objection',parentId:'main',relation:'oppose',title:'Construction costs money'},
    {id:'reason',parentId:'main',relation:'support',title:'Separation may reduce conflicts',details:'Evidence needed'}
  ]
});

test('browser save metadata includes the actual document and timestamp without changing v5 JSON',()=>{
  const s=storage(),p=Core.createBlankProject('argument');
  const before=JSON.stringify(p);
  Workspace.persist(s,p,'2026-11-06T12:00:00.000Z');
  assert.equal(s.getItem(Workspace.PROJECT_KEY),before);
  assert.deepEqual(Workspace.readMeta(s).active,{id:p.id,title:p.title,savedAt:'2026-11-06T12:00:00.000Z'});
  Workspace.recordEvent(s,'lastOpenedJson','example.witt.json',p.id,'2026-11-06T12:01:00Z');
  Workspace.recordEvent(s,'lastExportedJson','export.witt.json',p.id,'2026-11-06T12:02:00Z');
  assert.equal(Workspace.readMeta(s).lastOpenedJson.filename,'example.witt.json');
  assert.equal(Workspace.readMeta(s).lastExportedJson.at,'2026-11-06T12:02:00Z');
  assert.equal(JSON.stringify(p),before);
});

test('save metadata storage failure cannot erase a successfully saved document',()=>{
  const s=storage({},Workspace.META_KEY),p=Core.createBlankProject();
  assert.doesNotThrow(()=>Workspace.persist(s,p));
  assert.equal(Core.validateProject(JSON.parse(s.getItem(Workspace.PROJECT_KEY))).id,p.id);
});

test('one active autosave is replaced without silently archiving old drafts',()=>{
  const s=storage(),first=Core.createBlankProject('argument');
  first.title='First document';
  Workspace.persist(s,first);
  const second=Core.createBlankProject('decision');
  second.title='Second document';
  Workspace.persist(s,second);
  assert.equal(Workspace.rawActive(s).key,Workspace.PROJECT_KEY);
  assert.equal(Core.validateProject(JSON.parse(Workspace.rawActive(s).raw)).title,'Second document');
  assert.equal(Workspace.readMeta(s).active.title,'Second document');
  assert.deepEqual(s.keys().sort(),[Workspace.META_KEY,Workspace.PROJECT_KEY].sort());
  assert.equal('archiveActive' in Workspace,false);
  assert.equal('readArchiveIndex' in Workspace,false);
});

test('unsupported older browser storage keys are not read or migrated',()=>{
  const first=Core.createBlankProject();
  const s=storage({'witt-project-v2':JSON.stringify(first),'peruste-project-v1':JSON.stringify(first)});
  assert.equal(Workspace.rawActive(s),null);
  assert.equal(Workspace.hasSavedWork(s),false);
  assert.equal(s.getItem('witt-project-v2'),JSON.stringify(first));
  assert.equal(s.getItem('peruste-project-v1'),JSON.stringify(first));
});

test('active-draft storage failure never overwrites existing saved project',()=>{
  const original=Core.createBlankProject();
  const s=storage({[Workspace.PROJECT_KEY]:JSON.stringify(original)},Workspace.PROJECT_KEY);
  const attempted=Core.createBlankProject();
  assert.throws(()=>Workspace.persist(s,attempted),/QUOTA/);
  assert.equal(JSON.parse(s.getItem(Workspace.PROJECT_KEY)).id,original.id);
});

test('AI draft imports into a clean editable WITT v5 tree, no generated votes/ballots/ratings',()=>{
  const draft=validDraft();
  const p=AI.toProject(draft,Core);
  assert.equal(p.schemaVersion,Core.VERSION);
  assert.equal(p.title,draft.title);
  assert.equal(p.nodes.length,4);
  assert.equal(p.nodes.find(n=>n.title==='Safer crossings can mitigate this').parentId,
    p.nodes.find(n=>n.title==='Construction costs money').id);
  assert.deepEqual(p.votes,[]);
  assert.deepEqual(p.edgeAssessments,[]);
  assert.deepEqual(p.ballots,[]);
  assert.deepEqual(p.links,[]);
  assert.ok(p.nodes.every(n=>n.confidence===50&&n.impact===0));
  assert.deepEqual(Core.validateProject(JSON.parse(JSON.stringify(p))),p);
});

test('AI draft cannot smuggle scores, people or relationship impact ratings',()=>{
  for(const [target,key,value] of [['root','confidence',87],['claims','impact',5],['top','votes',[]],['top','ballots',[]],['top','links',[]]]) {
    const d=validDraft();
    if(target==='root') d.root[key]=value;
    else if(target==='claims')d.claims[0][key]=value;
    else d[key]=value;
    assert.throws(()=>AI.toProject(d,Core),/prohibited property/);
  }
});

test('AI import rejects malformed graph, duplicate IDs, cycles, missing parents and extra claims',()=>{
  const d=validDraft();d.claims[0].id='objection';
  assert.throws(()=>AI.validate(d),/Duplicate/);
  const missing=validDraft();missing.claims[1].parentId='unknown';
  assert.throws(()=>AI.validate(missing),/cycle or missing parent/);
  const cycle=validDraft();cycle.claims[1].parentId='rebuttal';
  assert.throws(()=>AI.validate(cycle),/cycle or missing parent/);
  const tooMany=validDraft();tooMany.claims=Array.from({length:201},(_,i)=>({id:`c${i}`,parentId:'main',relation:'support',title:'Claim'}));
  assert.throws(()=>AI.validate(tooMany),/At most 200/);
  const proto=validDraft();proto.claims[0].id='__proto__';
  assert.throws(()=>AI.validate(proto),/Invalid claim ID/); // leading underscore disallowed
});

test('downloadable AI schema stays synchronized with runtime parser and no external API is called',()=>{
  const schema=JSON.parse(fs.readFileSync(path.join(__dirname,'../schemas/ai-starter.v1.schema.json'),'utf8'));
  assert.deepEqual(schema,AI.schema);
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.$defs.claim.additionalProperties,false);
  for(const lang of ['fi','de','en','es','fr','ru','zh-Hans','ja','ko']) {
    const text=AI.buildPrompt(lang,'Test topic');
    assert.ok(text.includes('Test topic'));
    assert.ok(text.includes('NEVER include confidence, impact'));
    assert.ok(text.includes('witt-ai-starter-v1'));
  }
});
