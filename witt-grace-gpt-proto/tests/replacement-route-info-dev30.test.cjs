'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Core=require('../src/core.js');
const Workspace=require('../src/workspace.js');
const I18n=require('../src/i18n.js');
const fakeStorage=()=>{
  const data=new Map();
  return {getItem:key=>data.get(key)||null,setItem:(key,val)=>data.set(key,String(val))};
};

test('replacement summary identifies current work, edit time, and separate browser autosave',()=>{
  const storage=fakeStorage();
  const p=Core.createBlankProject('decision');
  p.title='Merkittävä päätös';
  p.updatedAt='2026-11-07T17:01:00Z';
  Workspace.persist(storage,p,'2026-11-07T19:45:00Z');
  const detail=Workspace.activeSummary(storage,p);
  assert.equal(detail.title,'Merkittävä päätös');
  assert.equal(detail.mode,'decision');
  assert.equal(detail.nodeCount,p.nodes.length);
  assert.equal(detail.editedAt,'2026-11-07T17:01:00Z');
  assert.equal(detail.browserSavedAt,'2026-11-07T19:45:00Z');
  assert.equal(detail.sessionOnly,false);
  const other=Core.createBlankProject('argument');
  assert.equal(Workspace.activeSummary(storage,other).browserSavedAt,null,'never show another project’s autosave');
  assert.equal(Workspace.activeSummary(storage,p,true).browserSavedAt,null,'private-tab fallback is not persistent');
  assert.equal(Workspace.activeSummary(storage,p,true).sessionOnly,true);
});

test('replacement summary tolerates invalid or missing time without inventing dates',()=>{
  const storage=fakeStorage(),p=Core.createBlankProject();
  p.updatedAt='not-a-time';p.title='';
  Workspace.persist(storage,p,'also-invalid');
  const detail=Workspace.activeSummary(storage,p);
  assert.equal(detail.title,null);
  assert.equal(detail.editedAt,null);
  assert.equal(detail.browserSavedAt,null);
});

test('the same modal covers new, imported, library, example and AI replacement',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
  for(const id of ['replaceCurrentName','replaceCurrentInfo','replaceEditedAt','replaceAutosavedAt'])
    assert.match(html,new RegExp(`id="${id}"`));
  assert.match(app,/Workspace\.activeSummary\(storage,project,storageState\.temporary\)/);
  assert.equal((app.match(/async function prepareReplacement\(/g)||[]).length,1);
  assert.ok((app.match(/await prepareReplacement\(/g)||[]).length>=5);
});

test('multiple evaluated routes are informative, not an error, and never modify calculation',()=>{
  I18n.setLocale('fi');
  const msg=I18n.t('linkOverlapWarning');
  assert.match(msg,/Yhteysreittien huomio/);
  assert.match(msg,/lasketaan mukaan/);
  assert.doesNotMatch(msg,/varoitus|virhe|tupla/i);
  const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../src/styles.css'),'utf8');
  assert.match(app,/link-route-note/);
  assert.match(app,/has-route-note/);
  assert.doesNotMatch(app,/link-overlap-warning|has-overlap/);
  assert.match(css,/\.link-route-note\{/);
  assert.doesNotMatch(css,/\.link-route-note\{[^}]*var\(--warn/);
  assert.match(app,/Core\.secondaryOverlapWarning\(project,link\)/);
});
