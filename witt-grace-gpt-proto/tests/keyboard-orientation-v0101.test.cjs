const test = require('node:test');
const assert = require('node:assert/strict');
const Keyboard = require('../src/keyboard-nav.js');
const fs = require('node:fs');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const css = fs.readFileSync(path.join(__dirname,'../src/styles.css'),'utf8');
const I18n = require('../src/i18n.js');
function fixture() {
  const nodes = [
    {id:'root',parentId:null,collapsed:false},
    {id:'a',parentId:'root',collapsed:false},
    {id:'b',parentId:'root',collapsed:false},
    {id:'a1',parentId:'a',collapsed:false},
    {id:'a2',parentId:'a',collapsed:false},
    {id:'b1',parentId:'b',collapsed:false},
  ];
  return {nodes,rootId:'root',visible:new Set(nodes.map(x=>x.id))};
}
function run(x,id,key,orientation='horizontal',positions) {
  return Keyboard.navigate(x.nodes,x.rootId,x.visible,id,key,orientation,positions);
}
const action=(action,id)=>({action,id});

test('horizontal arrows separate siblings from ancestor and child navigation',()=>{
 const x=fixture();
 assert.deepEqual(run(x,'root','ArrowRight'),action('select','a'));
 assert.deepEqual(run(x,'a','ArrowDown'),action('select','b'));
 assert.deepEqual(run(x,'b','ArrowUp'),action('select','a'));
 assert.deepEqual(run(x,'a1','ArrowDown'),action('select','a2'));
 assert.deepEqual(run(x,'a1','ArrowLeft'),action('select','a'));
 assert.deepEqual(run(x,'a1','ArrowUp'),{action:'none'});
 assert.deepEqual(run(x,'b','ArrowDown'),{action:'none'});
 assert.deepEqual(run(x,'a','ArrowLeft'),action('collapse','a'));
 x.nodes[1].collapsed=true;
 assert.deepEqual(run(x,'a','ArrowRight'),action('expand','a'));
 assert.deepEqual(run(x,'a','ArrowLeft'),action('select','root'));
});

test('vertical arrows rotate parent/children and sibling roles',()=>{
 const x=fixture();
 assert.deepEqual(run(x,'root','ArrowDown','vertical'),action('select','a'));
 assert.deepEqual(run(x,'a','ArrowRight','vertical'),action('select','b'));
 assert.deepEqual(run(x,'b','ArrowLeft','vertical'),action('select','a'));
 assert.deepEqual(run(x,'a1','ArrowUp','vertical'),action('select','a'));
 assert.deepEqual(run(x,'a','ArrowUp','vertical'),action('collapse','a'));
 x.nodes[1].collapsed=true;
 assert.deepEqual(run(x,'a','ArrowDown','vertical'),action('expand','a'));
 assert.deepEqual(run(x,'b','ArrowRight','vertical'),{action:'none'});
});

test('space toggles branches independently of visual orientation, never leaf nodes',()=>{
 const x=fixture();
 for(const orientation of ['horizontal','vertical','four-way']) {
  assert.deepEqual(run(x,'a',' ',orientation),action('collapse','a'));
  assert.deepEqual(run(x,'a1',' ',orientation),{action:'none'});
  x.nodes[1].collapsed=true;
  assert.deepEqual(run(x,'a','Spacebar',orientation),action('expand','a'));
  x.nodes[1].collapsed=false;
 }
});

test('four-way arrows follow position rather than arbitrary child order',()=>{
 const x=fixture();
 const pos=new Map([
  ['root',{x:100,y:100}],['a',{x:600,y:100}],['b',{x:-400,y:100}],
  ['a1',{x:100,y:600}],['a2',{x:100,y:-400}],['b1',{x:800,y:650}]
 ]);
 assert.deepEqual(run(x,'root','ArrowRight','four-way',pos),action('select','a'));
 assert.deepEqual(run(x,'root','ArrowLeft','four-way',pos),action('select','b'));
 assert.deepEqual(run(x,'root','ArrowDown','four-way',pos),action('select','a1'));
 assert.deepEqual(run(x,'root','ArrowUp','four-way',pos),action('select','a2'));
 assert.deepEqual(run(x,'a1','ArrowUp','four-way',pos),action('select','root'));
 assert.deepEqual(run(x,'root','Home','four-way',pos),action('select','root'));
 assert.deepEqual(run(x,'root','End','four-way',pos),action('select','b1'));
 assert.deepEqual(run(x,'root','ArrowRight','four-way'),{action:'none'});
});

test('context menu uses active shortcuts, adding defaults to + / -, and toolbar remains grouped',()=>{
 assert.match(app,/support:'\+', oppose:'-'/);
 assert.match(app,/shortcutEventName\(event\)/);
 assert.match(app,/new Set\(Object\.values\(next\)\)/);
 assert.match(app,/const keyLabel = el\('kbd', 'node-menu-shortcut', item\.key\)/);
 assert.match(app,/displayShortcut\(shortcuts\.support\)/);
 assert.match(app,/displayShortcut\(shortcuts\.oppose\)/);
 assert.match(app,/node\.id, event\.key, view\.orientation, nodePositions/);
 assert.match(app,/event\.key === 'Enter'\) \{\s*event\.preventDefault\(\); addNode/);
 assert.match(html,/id="shortcutCurrentAdd"/);
 assert.match(css,/\.node-menu-shortcut/);
 for(const key of ['shortcutNavHorizontal','shortcutNavVertical','shortcutNavFourWay','shortcutNavToggle','shortcutCurrentAdd']) {
  assert.ok(html.includes(`data-i18n="${key}"`) || key==='shortcutCurrentAdd',key);
  for(const locale of I18n.languages)assert.ok(I18n.messages[locale][key],`${locale}: ${key}`);
 }
 const positions=[...html.matchAll(/id="(fileMenu|assessmentMenu|viewMenu)"/g)].map(m=>m[1]);
 assert.deepEqual(positions,['fileMenu','assessmentMenu','viewMenu']);
});
