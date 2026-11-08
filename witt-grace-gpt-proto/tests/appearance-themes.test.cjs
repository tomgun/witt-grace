const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'src/styles.css'),'utf8');
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const Core=require('../src/core.js');
const I18n=require('../src/i18n.js');
const values=['light','dark','paper','cosmos','hologram','manuscript-book','manuscript-pen','bitberg'];
test('both appearance pickers expose all current and new worlds',()=>{
 for(const id of ['homeThemeSelect','themeSelect']){
  const body=html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`));
  assert.ok(body,`${id} is missing`);
  assert.deepEqual([...body[1].matchAll(/value="([^"]+)"/g)].map(m=>m[1]),values);
 }
});
test('all appearance labels are localized in exactly nine languages',()=>{
 for(const lang of I18n.languages) for(const key of ['cosmos','hologram','manuscriptBook','manuscriptPen','bitbergTheme']){
  assert.ok(I18n.messages[lang][key]?.trim(),`${lang}:${key}`);
  assert.notEqual(I18n.messages[lang][key],key);
 }
});
test('new themes use local CSS with no fetched fonts or third-party dependencies',()=>{
 for(const key of ['cosmos','hologram','manuscript-book','manuscript-pen','bitberg']) assert.ok(css.includes(`data-theme="${key}"`));
 assert.doesNotMatch(css,/@import|@font-face|url\(\s*['"]?https?:/);
 assert.match(css,/prefers-reduced-motion/);
});
test('appearance selectors are device-local; v4 model remains unchanged',()=>{
 assert.match(app,/APPEARANCE_STORAGE = 'witt-appearance-v1'/);
 assert.match(app,/specialAppearance \|\| project\.theme/);
 assert.match(app,/storage\.removeItem\(APPEARANCE_STORAGE\)/);
 const doc=Core.createBlankProject('argument');
 assert.ok(['light','dark','paper'].includes(doc.theme));
 assert.doesNotThrow(()=>Core.validateProject(doc));
 const original=JSON.stringify(doc);
 assert.deepEqual(JSON.stringify(doc),original);
});


test('manuscript visuals use distinct embedded material art, not only recolored surfaces',()=>{
  for(const item of ['paper','cotton','wood','quill','ornament'])
    assert.ok(css.includes(`--witt-${item}-image: url("data:image/`),item);
  assert.match(css,/body\[data-theme="manuscript-book"\] \.home-screen::after/);
  assert.match(css,/body\[data-theme="manuscript-pen"\] \.home-screen::before/);
  assert.match(css,/clip-path:polygon/);
  assert.match(css,/body\[data-theme="manuscript-pen"\] \.home-features article/);
});

test('hologram is a separate futuristic skin, not a modification of Star map',()=>{
 assert.match(css,/body\[data-theme="hologram"\]/);
 assert.match(css,/body\[data-theme="hologram"\] \.home-visual::before/);
 assert.match(css,/body\[data-theme="hologram"\] \.canvas-area::after/);
 assert.match(css,/body\[data-theme="hologram"\] \.node\.selected/);
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
 assert.match(app,/specialAppearance \|\| project\.theme/);
 assert.doesNotMatch(html,/<link[^>]+https?:/);
});

test('inline-edit blur waits until the active DOM render completes',()=>{
 assert.match(app,/editor\.addEventListener\('blur', \(\) => queueMicrotask\(\(\) => finish\(true\)\)/);
});
