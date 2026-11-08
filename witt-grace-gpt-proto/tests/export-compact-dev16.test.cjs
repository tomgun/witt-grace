const test=require('node:test');
const assert=require('node:assert/strict');
const Layout=require('../src/view-layout.js');
const Export=require('../src/diagram-export.js');
const Core=require('../src/core.js');

test('compact visible layout ignores collapsed descendants but does not change manual positions',()=>{
  const project=Core.createBlankProject('decision');const root=project.nodes[0];
  const options=[];
  for(let i=0;i<4;i++){
    const option=Core.addChild(project,root.id,'option',project.users[0].id);options.push(option);
    for(let j=0;j<25;j++)Core.addChild(project,option.id,'support',project.users[0].id);
  }
  Core.autoLayout(project);
  const before=JSON.stringify(project);
  const raw=options.map(o=>o.position.y);
  assert.ok(Math.max(...raw)-Math.min(...raw)>10000);
  const visible=new Set([root.id,...options.map(o=>o.id)]);
  for(const orientation of ['horizontal','vertical','four-way']){
    const {positions}=Layout.compactVisibleProjection(project.nodes,visible,orientation,252,148);
    assert.equal(positions.size,5);
    const xs=[...positions.values()].map(p=>p.x),ys=[...positions.values()].map(p=>p.y);
    assert.ok(Math.max(...xs)-Math.min(...xs)<1800,orientation+' x spread');
    assert.ok(Math.max(...ys)-Math.min(...ys)<1700,orientation+' y spread');
  }
  assert.equal(JSON.stringify(project),before);
});

test('visual export uses localized node labels and never renders raw English relation identifiers',()=>{
  const base={title:'Mitä teen lauantaina?',palette:'light',layers:{details:false,ratings:false},
   nodes:[{id:'a',x:0,y:0,title:'Päätös',relation:'root',typeLabel:'PÄÄTÖS'},
     {id:'b',x:330,y:0,title:'Uimahalliin',relation:'option',typeLabel:'VAIHTOEHTO'},
     {id:'c',x:660,y:0,title:'Saamme yhteistä aikaa',relation:'support',typeLabel:'PUOLTAA'}],edges:[]};
  const withLabels=Export.renderSvg(base).svg;
  assert.match(withLabels,/PÄÄTÖS/);
  assert.match(withLabels,/VAIHTOEHTO/);
  assert.match(withLabels,/PUOLTAA/);
  assert.doesNotMatch(withLabels,/>\s*(?:ROOT|OPPOSE|SUPPORT|OPTION)\s*</);
  const withoutLabels=Export.renderSvg({...base,nodes:base.nodes.map(n=>({...n,typeLabel:''}))}).svg;
  assert.doesNotMatch(withoutLabels,/\b(?:ROOT|OPPOSE|SUPPORT|OPTION)\b/);
});

test('tiled SVG retains original content, uses a precise crop viewBox and does not mutate',()=>{
  const original=Export.renderSvg({title:'Suomi',layers:{details:false,ratings:false},nodes:[{x:0,y:0,id:'n',title:'Väite',relation:'root',typeLabel:'PÄÄVÄITE'}],edges:[]});
  const crop=Export.tileSvg(original.svg,original.width,original.height,4000,1000,3000,1800,2);
  assert.match(crop,/width="3000" height="1800" viewBox="2000 500 1500 900"/);
  assert.match(crop,/PÄÄVÄITE/);
  assert.equal(Export.tileSvg(original.svg,original.width,original.height,4000,1000,3000,1800,2),crop);
});

test('large PNG ZIP is a standards-compliant archive with UTF-8 names and stored file bytes',async()=>{
  const bytes=Uint8Array.from([0,1,2,3,254,255]);
  const blob=Export.zipStored([{name:'README.txt',bytes:new TextEncoder().encode('WITT')},{name:'rivi_Ä.png',bytes}]);
  const raw=new Uint8Array(await blob.arrayBuffer());
  assert.equal(new DataView(raw.buffer).getUint32(0,true),0x04034b50);
  assert.equal(new DataView(raw.buffer).getUint32(raw.length-22,true),0x06054b50);
  assert.equal(blob.type,'application/zip');
  assert.deepEqual(bytes,Uint8Array.from([0,1,2,3,254,255]));
});
