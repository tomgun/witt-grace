const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const css = fs.readFileSync(path.join(root,'src/styles.css'),'utf8');
const app = fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const Layout = require('../src/view-layout.js');
const I18n = require('../src/i18n.js');
const Core = require('../src/core.js');
test('locale picker lists the nine requested languages in exact order',()=>{
  const picker = html.match(/<select[^>]*id="localeSelect"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(picker,'locale selector missing');
  assert.deepEqual([...picker[1].matchAll(/<option[^>]*value="([^"]+)"/g)].map(m=>m[1]),['fi','de','en','es','fr','ru','zh-Hans','ja','ko']);
});
test('all supported language entries are present and localized without touching user text',()=>{
  assert.deepEqual(I18n.languages,['fi','de','en','es','fr','ru','zh-Hans','ja','ko']);
  for(const lang of I18n.languages){
    I18n.setLocale(lang);
    for(const key of Object.keys(I18n.messages.fi)){
      assert.ok(I18n.messages[lang][key].trim(),`missing ${lang}/${key}`);
      assert.notEqual(I18n.t(key),key,`raw key leaked ${lang}/${key}`);
    }
  }
  I18n.setLocale('fi');
  assert.match(html,/id="projectTitle"/);
  assert.doesNotMatch(html,/<input[^>]*data-i18n="docName"[^>]*id="projectTitle"/);
});
test('focus mode has minimal controls, keyboard escape and hides both side panels',()=>{
  for(const id of ['btnFocusQuick','btnFocusView','orientationSelect','btnOrientationQuick','zoomReset']) assert.ok(html.includes(`id="${id}"`),id);
  assert.match(app,/event\.key === 'Escape' && focusOnly/);
  for(const selector of ['.topbar','.toolbar','.leftpanel','.inspector-panel','.app-footer']) assert.ok(css.includes(`body.witt-focus ${selector}`),selector);
});
test('orientation control provides horizontal, vertical, four-way without mutating data',()=>{
  assert.deepEqual(Layout.ORIENTATIONS,['horizontal','vertical','four-way']);
  assert.match(html,/value="four-way"/);
  assert.match(app,/fourWayOffsets/);
  const doc=Core.createDemoProject();const before=JSON.stringify(doc);
  const root=Core.rootNode(doc);const snap=Layout.fourWayProjection(doc.nodes,root.id);
  Core.focusProjection(doc,root.id,'oppose');
  assert.ok(snap.positions.size>0);
  assert.equal(JSON.stringify(doc),before);
});
test('large supplied example has all four sectors and no overlapping nodes at any visual density',()=>{
  const p=Core.validateProject(JSON.parse(fs.readFileSync(path.join(root,'examples/four-way-tree.witt.json'),'utf8')));
  assert.ok(p.nodes.length>50);
  for(const cardHeight of [94,154,176]){
    const {positions,groups}=Layout.fourWayProjection(p.nodes,Core.rootNode(p).id,252,cardHeight);
    assert.deepEqual(new Set([...groups.values()]),new Set(['root','right','left','up','down']));
    const nodes=[...positions];
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i][1],b=nodes[j][1];
      assert.ok(!(a.x<b.x+262 && a.x+262>b.x && a.y<b.y+cardHeight+10 && a.y+cardHeight+10>b.y),`${nodes[i][0]} intersects ${nodes[j][0]}`);
    }
  }
});
