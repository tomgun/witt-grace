const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const Core=require('../src/core.js');const root=path.resolve(__dirname,'..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'examples',name),'utf8'));
test('canonical examples are current v6 JSON and round-trip without changes',()=>{
 for(const file of ['product-launch.witt.json','product-launch-with-links.witt.json','four-way-tree.witt.json','cost-rebuttal-with-links.witt.json']){
  const doc=read(file);assert.equal(doc.schemaVersion,Core.VERSION,file);
  assert.deepEqual(Core.validateProject(doc),doc,file);
 }
});
test('older v1-v5 files are deliberately unsupported in the prototype',()=>{
 const current=Core.createBlankProject();
 for(const old of [1,2,3,4,5]){
  const copy={...structuredClone(current),schemaVersion:old};
  assert.throws(()=>Core.validateProject(copy),/vain nykyinen versio/,String(old));
 }
});
test('v6 schema contains no separate value priority rating',()=>{
 const schema=JSON.parse(fs.readFileSync(path.join(root,'schemas/project.v8.schema.json')));
 assert.equal(schema.properties.schemaVersion.const,8);
 assert.ok(schema.required.includes('edgeAssessments'));
 assert.deepEqual(schema.$defs.edgeAssessment.properties.subjectType.enum,['primary','secondary']);
 assert.equal(Object.hasOwn(schema.properties,'valueAssessments'),false);
 assert.equal(Object.hasOwn(schema.$defs,'valueAssessment'),false);
});
test('current documents preserve source, relation and review data exactly',()=>{
 const doc=read('debate-painonhallinta.witt.json');
 assert.ok(doc.votes.length>0&&doc.edgeAssessments.length>0);
 const next=Core.validateProject(JSON.parse(JSON.stringify(doc)));
 assert.deepEqual(next,doc);
});
