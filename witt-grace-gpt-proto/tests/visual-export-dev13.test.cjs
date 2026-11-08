const test=require('node:test');
const assert=require('node:assert/strict');
const Export=require('../src/diagram-export.js');
const fixture={title:'Lauantai & leikki',palette:'light',highlight:true,layers:{details:true,ratings:true},nodes:[
 {id:'a',x:100,y:150,title:'Mitä teemme lauantaina?',relation:'root',typeLabel:'Päätös',chips:['Indeksi 52'],important:false},
 {id:'b',x:450,y:150,title:'Uimahalliin lasten kanssa',relation:'option',typeLabel:'Päätösvaihtoehto',details:'Saamme yhteistä aikaa',chips:['Indeksi: 70','U: 80%'],important:true}
],edges:[{relation:'option',d:'M 352 230 C 390 230, 415 230, 450 230',important:true}]};
test('pure SVG tree export is escaped, self-contained, whole-tree and includes highlighted links',()=>{
 const initial=JSON.stringify(fixture);
 const result=Export.renderSvg(fixture);
 assert.ok(result.width>600&&result.height>200);
 assert.match(result.svg,/xmlns="http:\/\/www.w3.org\/2000\/svg"/);
 assert.match(result.svg,/Lauantai &amp; leikki/);
 assert.match(result.svg,/Uimahalliin lasten kanssa/);
 assert.match(result.svg,/Saamme yhteistä aikaa/);
 assert.match(result.svg,/stroke-width="10"/);
 assert.doesNotMatch(result.svg,/foreignObject|<script|<image[^>]+href=/);
 assert.equal(JSON.stringify(fixture),initial,'export never mutates model snapshot');
});
test('different visibility and highlighting settings change output without changing source',()=>{
 const a=Export.renderSvg(fixture).svg;
 const b=Export.renderSvg({...fixture,highlight:false,layers:{details:false,ratings:false},nodes:fixture.nodes.filter(n=>n.id==='a'),edges:[]}).svg;
 assert.notEqual(a,b);
 assert.doesNotMatch(b,/Saamme yhteistä aikaa|stroke-width="10"/);
 assert.match(b,/Mitä teemme lauantaina/);
});
test('metacharacters in text are harmless and lines are bounded',()=>{
 const o=Export.renderSvg({...fixture,title:'<img src=x onerror="hi">',nodes:[{...fixture.nodes[0],title:'<script>alert(1)</script> & text'}],edges:[]});
 assert.doesNotMatch(o.svg,/<script>|<img/);
 assert.match(o.svg,/&lt;script&gt;/);
 assert.ok(Export.lines('pitkä '+('asia '.repeat(100)),30,3).length<=3);
});
test('PDF writer produces valid xref and one or more independent JPEG pages',()=>{
 const jpg=Uint8Array.from([0xff,0xd8,0xff,0xd9]);
 const pdf=Export.pdfBytes([{width:450,height:300,pixelsX:450,pixelsY:300,jpeg:jpg},{width:450,height:300,pixelsX:450,pixelsY:300,jpeg:jpg}]);
 const txt=new TextDecoder('latin1').decode(pdf);
 assert.match(txt,/^%PDF-1\.4/);
 assert.match(txt,/\/Count 2/);
 assert.match(txt,/\/Subtype \/Image/);
 assert.match(txt,/\/Filter \/DCTDecode/);
 assert.match(txt,/startxref/);
 assert.match(txt,/%%EOF/);
});
test('browser export affordance and module present in both source and standalone build configuration',()=>{
 const fs=require('node:fs');const path=require('node:path');const base=path.join(__dirname,'..');
 const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
 const build=fs.readFileSync(path.join(base,'tools/build.cjs'),'utf8');
 assert.match(html,/id="btnExportVisual"/);
 assert.match(html,/id="visualExportDialog"/);
 assert.match(html,/id="exportHighlights"/);
 assert.match(html,/id="exportPdfLayout"/);
 assert.match(build,/diagram-export\.js/);
});
