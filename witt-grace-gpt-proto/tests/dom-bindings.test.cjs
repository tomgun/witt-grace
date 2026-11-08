const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const app = fs.readFileSync(path.join(root,'src/app.js'),'utf8');

test('every statically referenced DOM ID exists in source HTML', () => {
  const declared = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
  // Created lazily by makeInputField in the inspector, not part of static HTML.
  const generatedInCode = new Set(['actorPreference']);
  for (const [,id] of app.matchAll(/\$\('([^']+)'\)/g)) {
    assert.ok(declared.has(id) || generatedInCode.has(id), `missing index.html element id="${id}"`);
  }
  // The two omitted tags in the v0.6.0 source HTML triggered a real
  // runtime crash even though the previously built dist HTML worked.
  for(const id of ['tableComments','tableArea','btnTreeView','btnTableView']) assert.ok(declared.has(id),id);
  assert.match(html,/data-i18n="shortcutTable"/);
});


test('UI footer version matches package version',()=>{
  const v=require('../package.json').version;
  assert.match(html,new RegExp(`WITT\\s*<b>${v.replaceAll('.','\\.')}<\\/b>`));
});
