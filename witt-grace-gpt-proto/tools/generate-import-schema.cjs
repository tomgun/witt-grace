/* Single source of truth: project validator schema is generated directly from JSON schema. */
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=JSON.parse(fs.readFileSync(path.join(root,'schemas/project.v8.schema.json'),'utf8'));
const result='/* GENERATED from schemas/project.v8.schema.json; do not edit. */\n'+
  '(function(root,factory){const api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;if(root)root.WittProjectImportSchema=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){return '+JSON.stringify(source)+';});\n';
fs.writeFileSync(path.join(root,'src/project-import-schema.js'),result);
console.log('Project import schema generated from schemas/project.v8.schema.json');
