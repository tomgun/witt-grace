'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'src','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'src','styles.css'),'utf8');

test('dev32: all four zone buttons appear before language and theme selectors in one header group',()=>{
  const header=html.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1];
  assert.ok(header,'top bar present');
  const right=header.indexOf('<div class="header-right">');
  assert.ok(right>=0);
  const ids=['btnZoneLeft','btnZoneTop','btnZoneRight','btnZoneBottom','localeSelect','themeSelect'];
  const positions=ids.map(id=>header.indexOf(`id="${id}"`));
  assert.ok(positions.every(p=>p>right),'all zone and language/theme controls belong to header right');
  assert.deepEqual([...positions].sort((a,b)=>a-b),positions,'zone buttons precede language/theme');
  assert.equal((header.match(/class="zone-controls"/g)||[]).length,1);
});

test('dev32: the view settings trigger is a two-way toggle with accessible state',()=>{
  assert.match(html,/id="btnViewSettings"[^>]*aria-controls="viewDock"[^>]*aria-expanded="false"/);
  assert.match(app,/\$\('btnViewSettings'\)\.onclick=toggleViewDock/);
  assert.match(app,/function toggleViewDock\(\)\{if\(view\.dockHidden\)showViewDock\(\);else hideViewDock\(\);\}/);
  assert.match(app,/\$\('btnViewSettings'\)\.setAttribute\('aria-expanded',String\(!view\.dockHidden\)\)/);
});

test('dev32: floating view settings are viewport-positioned, movable, and not clipped by canvas',()=>{
  assert.match(app,/document\.querySelector\('\.app-shell'\)\.appendChild\(panel\)/);
  assert.match(app,/function viewDockSafeTop\(\)/);
  assert.match(app,/view\.dockScreenPosition=\{x:rect\.left,y:rect\.top\}/);
  assert.match(css,/#viewDock \{position:fixed;/);
  assert.match(css,/\.app-shell > \.topbar,\.app-shell > \.toolbar\{position:relative;z-index:75;/);
});
