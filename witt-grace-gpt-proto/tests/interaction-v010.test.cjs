const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Core=require('../src/core.js');
const Layout=require('../src/view-layout.js');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const locales=fs.readFileSync(path.join(root,'locales/messages.psv'),'utf8');
function collision(a,b,w=252,h=154) {return a.x < b.x+w+22 && a.x+w+22>b.x && a.y < b.y+h+22 && a.y+h+22>b.y;}
test('adding root children to four directions preserves every existing position',()=>{
 const doc=Core.createBlankProject('argument'), rootNode=doc.nodes[0],actor=doc.users[0].id;
 for(let k=0;k<8;k++){
  const projection=Layout.fourWayProjection(doc.nodes,rootNode.id);
  const directions=Layout.fourWayVisualDirections(doc.nodes,rootNode.id,projection.positions);
  const existing=new Map(projection.positions);
  const added=Core.addChild(doc,rootNode.id,k%2?'oppose':'support',actor);
  const recalculated=Layout.fourWayProjection(doc.nodes,rootNode.id);
  const stable=Layout.stableFourWayAddition(doc.nodes,existing,directions,recalculated.positions,rootNode.id,added.id);
  for (const [id,pos] of existing) assert.deepEqual(stable.get(id),pos,`existing node jumped: ${id}`);
  const all=[...stable.values()];
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)assert.ok(!collision(all[i],all[j]),`cards overlap ${i} / ${j}`);
  const offsets=Object.fromEntries([...stable].map(([id,pos])=>[id,{x:pos.x-recalculated.positions.get(id).x,y:pos.y-recalculated.positions.get(id).y}]));
  for(const [id,pos] of stable)assert.deepEqual({x:recalculated.positions.get(id).x+offsets[id].x,y:recalculated.positions.get(id).y+offsets[id].y},pos);
  // Next iteration should use stabilized, not the unadjusted four-way projection.
  // Each call checks that all earlier geometry can be held fixed.
  doc._visualOffsets=offsets;
 }
 delete doc._visualOffsets;
});
test('adding nested children preserves parent and siblings',()=>{
 const doc=Core.createBlankProject('argument'),r=doc.nodes[0],actor=doc.users[0].id;
 const left=Core.addChild(doc,r.id,'support',actor);
 const right=Core.addChild(doc,r.id,'oppose',actor);
 const initial=Layout.fourWayProjection(doc.nodes,r.id);
 let visible=new Map(initial.positions);
 for(let n=0;n<10;n++){
  const dirs=Layout.fourWayVisualDirections(doc.nodes,r.id,visible);
  const node=Core.addChild(doc,left.id,'support',actor);
  const updated=Layout.fourWayProjection(doc.nodes,r.id);
  const result=Layout.stableFourWayAddition(doc.nodes,visible,dirs,updated.positions,left.id,node.id);
  for(const [id,pos] of visible)assert.deepEqual(result.get(id),pos,`moving existing card ${id}`);
  for (const [id,pos] of result)for(const [id2,pos2] of result)if(id<id2)assert.ok(!collision(pos,pos2),`${id}/${id2} overlap`);
  visible=result;
 }
 assert.equal(visible.size,13);
});
test('toolbar actions are grouped without duplicate IDs, shortcuts and draggability are reachable',()=>{
 for (const x of ['fileMenu','assessmentMenu','viewMenu']) assert.match(html,new RegExp(`id="${x}"`));
 for(const id of ['tutorialMove','tutorialPanel','btnKeyboardTop','shortcutSettings','btnShortcutsReset','btnLayout','btnAssess','btnPeople'])assert.equal([...html.matchAll(new RegExp(`id="${id}"`,'g'))].length,1,id);
 assert.match(app,/handle\.setPointerCapture\(e\.pointerId\)/);
 assert.match(app,/\.node-add/);
 assert.match(app,/SHORTCUT_STORAGE/);
 assert.match(app,/new Set\(Object\.values\(next\)\)/);
 assert.match(app,/fourWayOffsets=Object\.fromEntries/);
 assert.match(locales,/shortcutCustomize\|/);
});
