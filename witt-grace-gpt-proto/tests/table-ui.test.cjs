const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const build=fs.readFileSync(path.join(root,'tools/build.cjs'),'utf8');

test('table view is a read-only projection with a keyboard-enabled switch',()=>{
 for(const id of ['btnTreeView','btnTableView','tableArea','tableFilter','tableSearch','argumentTableBody']){
  assert.match(html,new RegExp(`id="${id}"`));
  assert.ok(app.includes(`$('${id}')`));
 }
 assert.match(app,/selectPresentation\(view\.presentation === 'table' \? 'tree' : 'table'\)/);
 assert.match(app,/Table\.projectRows\(project, tableState\)/);
 assert.match(app,/Table\.assessmentDetails\(project, node\.id\)/);
 assert.ok(build.includes('table-model.js'));
 assert.ok(html.includes('src/table-model.js'));
});
