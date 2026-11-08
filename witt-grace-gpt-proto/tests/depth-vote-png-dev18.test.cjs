const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Layout=require('../src/view-layout.js');
const Export=require('../src/diagram-export.js');
const Core=require('../src/core.js');
const BASE=path.join(__dirname,'..');

test('depth preview reveals root, options, reasons then leaves without document mutations',()=>{
 const p=Core.createBlankProject('decision'),user=p.users[0].id,root=p.nodes[0];
 const a=Core.addChild(p,root.id,'option',user),b=Core.addChild(p,root.id,'option',user);
 const reason=Core.addChild(p,a.id,'support',user),leaf=Core.addChild(p,reason.id,'oppose',user);
 b.collapsed=true; a.collapsed=true;
 const before=JSON.stringify(p),cases=[[0,[root.id]],[1,[root.id,a.id,b.id]],[2,[root.id,a.id,b.id,reason.id]],[3,[root.id,a.id,b.id,reason.id,leaf.id]]];
 for(const [level,expected]of cases){
  const proj=Layout.depthProjection(p.nodes,level);
  assert.deepEqual([...proj.visibleIds].sort(),expected.sort());
  assert.equal(proj.maxDepth,3);
 }
 const extended=Layout.depthProjection(p.nodes,1,new Map([[a.id,false]]));
 assert.ok(extended.visibleIds.has(leaf.id),'manual open reveals an entire subtree at depth 1');
 const shortened=Layout.depthProjection(p.nodes,3,new Map([[a.id,true]]));
 assert.ok(!shortened.visibleIds.has(reason.id),'manual close wins at maximum slider depth');
 assert.deepEqual([...shortened.collapsedIds],[a.id]);
 assert.equal(Layout.maxTreeDepth(p.nodes),3);
 assert.equal(JSON.stringify(p),before,'depth playback cannot persist any collapsed changes');
});

test('multiple branch override scopes: closing inside a force-opened subtree wins',()=>{
 const nodes=[{id:'r',parentId:null},{id:'a',parentId:'r'},{id:'b',parentId:'a'},{id:'c',parentId:'b'}];
 const projected=Layout.depthProjection(nodes,0,new Map([['r',false],['b',true]]));
 assert.deepEqual([...projected.visibleIds].sort(),['a','b','r']);
 assert.ok(projected.collapsedIds.has('b'));
 assert.equal(Layout.depthProjection(nodes,3).visibleIds.size,4);
});

test('PNG plan tries larger-than-old 16K canvases when reasonable and caps raw memory',()=>{
 const now=Export.pngPlan(18000,2200,1,'auto');
 assert.ok(now.single,'18K-wide 39.6MP image must no longer automatically tile');
 assert.equal(now.estimatedRGBABytes,158400000);
 assert.equal(Export.pngPlan(22000,4500,1).single,true,'99MP accepted');
 assert.equal(Export.pngPlan(22000,5000,1).single,false,'110MP exceeds memory safety budget');
 assert.equal(Export.pngPlan(22000,2000,1,'tiles').single,false,'explicit ZIP mode');
 assert.equal(Export.pngPlan(22000,3000,1,'auto',2).single,false,'low-memory limit');
 assert.equal(Export.pngPlan(33000,1000,1).single,false,'browser canvas dimensions limit');
 assert.equal(Export.pngPlan(1000,1000,3).pixels,9000000);
});

test('UI wires the depth slider, reset, voting draft preservation and PNG policy',()=>{
 const html=fs.readFileSync(path.join(BASE,'index.html'),'utf8');
 const app=fs.readFileSync(path.join(BASE,'src/app.js'),'utf8');
 for(const id of ['treeDepthSlider','treeDepthValue','btnDepthReset','exportPngMode','exportPngEstimate'])
  assert.ok(html.includes(`id="${id}"`),`Missing UI: ${id}`);
 assert.match(app,/depthOverrides\.clear\(\)/);
 assert.match(app,/depthProjection\(project\.nodes/);
 assert.match(app,/ballotDrafts\.set\(option\.id/);
 assert.match(app,/ballotDrafts\.has\(option\.id\)/);
 assert.match(app,/pngPlan\(/);
});
