const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const Core=require('../src/core.js'),AIDraft=require('../src/ai-draft-v2.js'),Contributions=require('../src/contributions.js'),AIStarter=require('../src/ai-starter.js');
const Import=require('../src/import-validation.js'),projectSchema=require('../src/project-import-schema.js');
const deps={Core,AIDraft,Contributions,AIStarter,projectSchema};
const samplePath=path.join(__dirname,'../examples/ai-draft-with-ratings-dev14.witt.json');
const sample=()=>JSON.parse(fs.readFileSync(samplePath,'utf8'));
const check=(payload,opts={})=>Import.inspect(payload,deps,opts);
function has(report,path,code){return report.issues.some(e=>e.path===path&&(!code||e.code===code));}
test('schema import validator is generated from canonical project v6 schema',()=>assert.deepEqual(projectSchema,require('../schemas/project.v8.schema.json')));
test('accepts actual current WITT document and original user AI JSON with reviews',()=>{
 const doc=Core.createBlankProject('decision');assert.equal(check(JSON.stringify(doc)).ok,true);
 const uploaded=fs.readFileSync(path.join(__dirname,'fixtures/ai-gnu-linux-rated.witt.json'),'utf8');
 const result=check(uploaded);assert.equal(result.ok,true,JSON.stringify(result.issues));assert.equal(result.format,'draft');
 const incoming=AIDraft.toProject(result.parsed,Core);assert.equal(incoming.users.some(Core.isAIProfile),true);
});
test('diagnoses several independent errors with accurate JSON paths and actionable suggestions',()=>{
 const doc=sample();doc.claims[0].credence=135;doc.claims[0].influence=1.3;
 delete doc.claims[1].parentId;doc.claims[2].relation='helps';doc.claims[3].surprise=true;
 const result=check(JSON.stringify(doc));assert.equal(result.ok,false);
 assert.equal(has(result,'$.claims[0].credence','MAXIMUM'),true);
 assert.equal(has(result,'$.claims[0].influence','STEP'),true);
 assert.equal(has(result,'$.claims[1].parentId','REQUIRED'),true);
 assert.equal(has(result,'$.claims[2].relation','ENUM'),true);
 assert.equal(has(result,'$.claims[3].surprise','UNKNOWN_FIELD'),true);
 assert.match(Import.reportText(result,'draft.json'),/Korjaa:/);
});
test('pinpoints JSON syntax line, column and never mutates input',()=>{
 const raw='{\n  "format": "witt-ai-draft-v2",\n  "claims": [1,],\n}';
 const result=check(raw);assert.equal(result.ok,false);
 assert.equal(result.issues[0].code,'JSON_SYNTAX');assert.ok(result.issues[0].line>=3);assert.ok(result.issues[0].column>=1);
 assert.match(Import.reportText(result),/rivi [0-9]+, sarake [0-9]+/);
});
test('suggests stripping Markdown code fences without silently modifying source',()=>{
 const r=check('```json\n'+JSON.stringify(sample())+'\n```');assert.equal(r.issues[0].code,'MARKDOWN');assert.match(r.issues[0].fix,/```/);
});
test('detects dangling parent, links, comments, attachments and ID collisions',()=>{
 const draft=sample();const first=draft.claims[0];const second=draft.claims[1];second.id=first.id;
 draft.claims[2].parentId='missing';draft.links=[{sourceId:'ghost',targetId:'root',relation:'support'}];
 draft.comments=[{nodeId:'ghost',body:'A comment'}];draft.sharedAttachments=[{parentId:'ghost',reasonId:'missing'}];
 const r=check(draft);assert.equal(r.ok,false);assert.equal(has(r,'$.claims[1].id','DUPLICATE_ID'),true);
 assert.equal(has(r,'$.claims[2].parentId','MISSING_PARENT'),true);
 assert.equal(has(r,'$.links[0].sourceId','MISSING_LINK_ENDPOINT'),true);
 assert.equal(has(r,'$.comments[0].nodeId','MISSING_COMMENT_NODE'),true);
 assert.equal(has(r,'$.sharedAttachments[0].reasonId','MISSING_SHARED_REASON'),true);
});
test('rejects credence on decisions/values and option influences with specific paths',()=>{
 const draft=sample();draft.root.credence=70;
 const option=draft.claims.find(n=>n.relation==='option');option.credence=90;option.influence=3;
 const reason=draft.claims.find(n=>n.credence!==undefined&&n.relation!=='option');reason.semanticType='value';
 const r=check(draft);assert.equal(r.ok,false);
 assert.equal(has(r,'$.root.credence','DECISION_CREDENCE'),true);
 assert.ok(r.issues.some(i=>i.code==='NON_FACTUAL_CREDENCE'));
 assert.ok(r.issues.some(i=>i.code==='OPTION_INFLUENCE'));
});
test('rejects mismatched import workflow with suggested correct route',()=>{
 const r=check(sample(),{expected:'project'});
 assert.equal(r.ok,false);assert.equal(has(r,'$.format','WRONG_IMPORT'),true);
});
test('human WITT and AI contribution formats share validator and preserve author kind',()=>{
 const p=Core.createBlankProject();const proposed={...structuredClone(Contributions.example),
  projectId:p.id,baseFingerprint:Contributions.fingerprint(Core.validateProject(p)),
  author:{kind:'human',name:'Tero'},claims:[{tempId:'new1',parentId:p.nodes[0].id,relation:'support',title:'Uusi peruste'}]};
 const r=check(proposed,{expected:'contribution',currentProject:p});assert.equal(r.ok,true,JSON.stringify(r.issues));assert.equal(r.parsed.author.kind,'human');
 proposed.assessments[0].credence=222;const bad=check(proposed,{expected:'contribution',currentProject:p});assert.ok(has(bad,'$.assessments[0].credence','MAXIMUM'));
});
test('prevents outdated contribution import before it reaches merge logic',()=>{
 const p=Core.createBlankProject();const payload={...structuredClone(Contributions.example),projectId:p.id,baseFingerprint:'0000000000000000',claims:[{tempId:'new1',parentId:p.nodes[0].id,relation:'support',title:'Peruste'}]};
 const r=check(payload,{currentProject:p});assert.ok(has(r,'$.baseFingerprint','STALE_PROPOSAL'));
});
test('rejects unsupported old project version without auto-migration',()=>{
 const old=Core.createBlankProject();old.schemaVersion=4;
 const r=check(old);assert.ok(has(r,'$.schemaVersion','VERSION'));
});
test('validates library bundle documents individually before any commit',()=>{
 const good=Core.createBlankProject();const bad=structuredClone(good);bad.nodes[0].confidence=150;
 const r=check({format:'witt-document-library-v1',exportedAt:'2026-11-07',documents:[good,bad]}, {expected:'library'});
 assert.ok(has(r,'$.documents[1].nodes[0].confidence','MAXIMUM'));
 const yes=check({format:'witt-document-library-v1',documents:[good]}, {expected:'library'});assert.equal(yes.ok,true,JSON.stringify(yes.issues));
});
test('source HTML binds visible report with copy/download/close and all import paths',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 for(const id of ['importReportDialog','importReportIssues','btnImportReportCopy','btnImportReportDownload'])assert.ok(html.includes(`id="${id}"`));
 for(const token of ["inspectImport(await file.text()", "inspectImport(raw,'draft'", "inspectImport(raw,'contribution'", "inspectImport(await file.text(),'library'"])assert.ok(app.includes(token),token);
});

test('does not modify input or the current active document when validation fails',()=>{
 const active=Core.createBlankProject('argument');const source=sample();source.claims[0].credence=150;
 const beforeSource=JSON.stringify(source),beforeActive=JSON.stringify(active);
 const report=check(source,{currentProject:active});assert.equal(report.ok,false);
 assert.equal(JSON.stringify(source),beforeSource);assert.equal(JSON.stringify(active),beforeActive);
});
test('recognizes AI prompt request JSON as a request, not an importable response',()=>{
 const r=check({format:'witt-contribution-request-v2',projectId:'123'});
 assert.equal(r.ok,false);assert.equal(r.issues[0].code,'REQUEST_NOT_RESPONSE');
});
