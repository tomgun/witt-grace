const test=require('node:test');
const assert=require('node:assert/strict');
const Export=require('../src/diagram-export.js');

test('PDF page plan bounds all raster canvases, overlaps adjacent tiles, and covers final edges',()=>{
  for(const orientation of ['portrait','landscape']){
    const W=5820,H=9230;
    const plan=Export.pdfTilePlan(W,H,orientation);
    assert.ok(plan.length>5 && plan.length<=150);
    const pageW=orientation==='portrait'?1020:1280;
    const pageH=orientation==='portrait'?1450:880;
    assert.deepEqual([plan[0].x,plan[0].y],[0,0]);
    for(const tile of plan){
      assert.ok(tile.width>0&&tile.height>0);
      assert.ok(tile.width<=pageW&&tile.height<=pageH);
      assert.ok(tile.x>=0&&tile.y>=0);
      assert.ok(tile.x+tile.width<=W&&tile.y+tile.height<=H);
      const right=plan.find(p=>p.row===tile.row&&p.col===tile.col+1);
      if(right)assert.equal(tile.x+tile.width-right.x,36);
      const below=plan.find(p=>p.col===tile.col&&p.row===tile.row+1);
      if(below)assert.equal(tile.y+tile.height-below.y,36);
    }
    assert.ok(plan.some(tile=>tile.x+tile.width===W));
    assert.ok(plan.some(tile=>tile.y+tile.height===H));
    assert.equal(new Set(plan.map(p=>`${p.x}/${p.y}`)).size,plan.length);
  }
});

test('PDF page plan validates dimensions and prevents excessive memory use',()=>{
  assert.deepEqual(Export.pdfTilePlan(100,100),[{x:0,y:0,width:100,height:100,col:0,row:0}]);
  assert.throws(()=>Export.pdfTilePlan(0,600),/Invalid/);
  assert.throws(()=>Export.pdfTilePlan(Infinity,600),/Invalid/);
  assert.throws(()=>Export.pdfTilePlan(50000,40000),/150 pages/);
});

test('PDF single-page fit rewrites pixel dimensions but preserves full viewBox and text',()=>{
  const original=Export.renderSvg({title:'Kokonainen argumenttipuu',layers:{},nodes:[
    {id:'a',x:100,y:120,title:'Alku',relation:'root',typeLabel:'VÄITE'},
    {id:'b',x:400,y:10000,title:'Loppu',relation:'support',typeLabel:'PUOLTAA'}
  ],edges:[]});
  const resized=Export.sizeSvg(original.svg,480,720);
  const root=resized.slice(0,resized.indexOf('>'));
  assert.match(root,/\bwidth="480"/);
  assert.match(root,/\bheight="720"/);
  assert.match(root,new RegExp(`viewBox="0 0 ${original.width} ${original.height}"`));
  assert.match(resized,/Alku/);
  assert.match(resized,/Loppu/);
  assert.equal(original.svg.includes('width="480"'),false);
});


test('PDF fit scales extremely tall or wide diagrams to a safe single page',()=>{
  for(const [w,h] of [[700,20000],[39000,700],[40000,40000],[800,1200]]){
    const s=Export.pdfFitRasterSize(w,h);
    assert.ok(s.width>0&&s.height>0&&s.width<=16000&&s.height<=16000);
    assert.ok(s.width*s.height<=18000000);
    assert.ok(Math.abs((s.width/s.height)/(w/h)-1)<0.01);
  }
  assert.throws(()=>Export.pdfFitRasterSize(0,100),/Invalid/);
});
