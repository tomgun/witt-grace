/* Offline, read-only visual export of a GRACE tree.
 * No network, no external rendering library and no mutation of project state.
 * The SVG is independently readable; PNG and PDF are derived from that same SVG.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.WittDiagramExport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CARD_W=252;
  const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  function lines(value,limit=34,max=3){
    const words=String(value||'').trim().split(/\s+/).filter(Boolean);
    const out=[];let row='';
    for(let word of words){
      while(word.length>limit){if(row){out.push(row);row='';}out.push(word.slice(0,limit-1)+'…');word=word.slice(limit-1);}
      if(!row)row=word;
      else if((row+' '+word).length<=limit)row+=' '+word;
      else{out.push(row);row=word;}
    }
    if(row)out.push(row);
    if(out.length>max){out.length=max;out[max-1]=out[max-1].slice(0,limit-1).replace(/\s+$/,'')+'…';}
    return out;
  }
  const colors={
    light:{bg:'#f8fafc',card:'#ffffff',ink:'#17223a',muted:'#66758d',border:'#d8e1ed',footer:'#f4f6fb',support:'#168b83',oppose:'#d36c43',option:'#6556bc',neutral:'#778398',important:'#f3b62d',accent:'#554bb1'},
    dark:{bg:'#111827',card:'#1e293b',ink:'#f1f5ff',muted:'#c1c8da',border:'#44516a',footer:'#172234',support:'#3bcabb',oppose:'#ffa27b',option:'#b9a7ff',neutral:'#b5c0ce',important:'#ffc857',accent:'#b7aaff'}
  };
  function edgeColor(relation,p){return p[relation]||p.neutral;}
  function nodeBadge(node){
    return node.relation==='group'?'▣':node.relation==='option'?'◆':node.relation==='support'?'+':node.relation==='oppose'?'−':node.relation==='neutral'?'0':'◇';
  }
  function renderSvg(snapshot){
    const nodes=snapshot.nodes||[],edges=snapshot.edges||[];
    if(!nodes.length)throw Error('No tree nodes to export');
    if(nodes.length>2500)throw Error('Too many nodes for a visual export (2500 maximum)');
    const p=colors[snapshot.palette==='dark'?'dark':'light'];
    const cardHeight=snapshot.layers?.details||snapshot.layers?.ratings?176:148;
    const padding=48,header=90;
    const minX=Math.min(...nodes.map(n=>n.x)),minY=Math.min(...nodes.map(n=>n.y));
    const maxX=Math.max(...nodes.map(n=>n.x+CARD_W)),maxY=Math.max(...nodes.map(n=>n.y+cardHeight));
    const width=Math.ceil(maxX-minX+padding*2),height=Math.ceil(maxY-minY+padding*2+header);
    if(width>40000||height>40000||width*height>220000000)throw Error('Tree is too large for raster export. Reduce visible branches.');
    const ox=padding-minX,oy=padding+header-minY;
    const bits=[];
    bits.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(snapshot.title)}">`);
    bits.push(`<rect width="${width}" height="${height}" fill="${p.bg}"/>`);
    bits.push(`<defs><marker id="witt-sup" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 Z" fill="${p.support}"/></marker><marker id="witt-opp" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 Z" fill="${p.oppose}"/></marker></defs>`);
    bits.push(`<text x="${padding}" y="44" fill="${p.ink}" font-family="Arial, sans-serif" font-size="24" font-weight="700">${esc(lines(snapshot.title,80,1)[0])}</text>`);
    bits.push(`<text x="${padding}" y="66" fill="${p.muted}" font-family="Arial, sans-serif" font-size="12">${esc(snapshot.subtitle||'WITT · GRACE')} · ${nodes.length} ${esc(snapshot.nodeWord||'nodes')}</text>`);
    bits.push(`<g transform="translate(${ox} ${oy})">`);
    for(const edge of edges){
      const color=edge.personalDirection===null&&edge.unassessed?p.neutral:typeof edge.personalDirection==='number'?edge.personalDirection>0?p.support:edge.personalDirection<0?p.oppose:p.neutral:edgeColor(edge.relation,p);
      const strong=!!(snapshot.highlight&&edge.important);
      const opacity=edge.dim?'.18':edge.secondary?'.55':'.85';
      const dash=edge.secondary?'7 6':edge.personalDirection===0||edge.relation==='neutral'?'3 5':edge.relation==='oppose'?'7 5':'';
      if(strong)bits.push(`<path d="${esc(edge.d)}" fill="none" stroke="${p.important}" stroke-width="10" opacity=".33" stroke-linecap="round"/>`);
      bits.push(`<path d="${esc(edge.d)}" fill="none" stroke="${color}" stroke-width="${strong?4.5:edge.secondary?2:2.7}" stroke-linecap="round" opacity="${opacity}"${dash?` stroke-dasharray="${dash}"`:''}/>`);
    }
    for(const n of nodes){
      const x=n.x,y=n.y,relation=n.relation||'neutral';const color=edgeColor(relation,p);
      const strong=!!(snapshot.highlight&&n.important), dim=n.dim?'.35':'1';
      bits.push(`<g opacity="${dim}">`);
      if(strong)bits.push(`<rect x="${x-5}" y="${y-5}" width="${CARD_W+10}" height="${cardHeight+10}" rx="15" fill="none" stroke="${p.important}" stroke-width="4"/>`);
      bits.push(`<rect x="${x}" y="${y}" width="${CARD_W}" height="${cardHeight}" rx="12" fill="${p.card}" stroke="${strong?p.important:p.border}" stroke-width="${strong?2:1.3}"/>`);
      bits.push(`<path d="M${x+12} ${y+2} H${x+CARD_W-12}" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`);
      const titleLines=lines(n.title,36,3);
      // The app owns localized type labels. Never fall back to English enum
      // identifiers (ROOT/OPPOSE/SUPPORT/OPTION) when labels are disabled.
      const tag=String(n.typeLabel||'');
      if(tag)bits.push(`<text x="${x+12}" y="${y+19}" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="${color}">${esc(nodeBadge(n)+'  '+tag)}</text>`);
      if(n.shared)bits.push(`<text x="${x+CARD_W-10}" y="${y+19}" text-anchor="end" font-family="Arial, sans-serif" font-size="9" fill="${p.muted}">↗</text>`);
      const titleY=y+40;
      titleLines.forEach((l,i)=>bits.push(`<text x="${x+12}" y="${titleY+i*17}" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="${p.ink}">${esc(l)}</text>`));
      if(snapshot.layers?.details&&n.details){
        const detailY=Math.max(y+101,titleY+titleLines.length*17+4);
        bits.push(`<text x="${x+12}" y="${detailY}" font-family="Arial, sans-serif" font-size="10" fill="${p.muted}">${esc(lines(n.details,44,1)[0])}</text>`);
      }
      if(snapshot.layers?.ratings && n.chips?.length){
        bits.push(`<rect x="${x+1}" y="${y+cardHeight-46}" width="${CARD_W-2}" height="45" rx="10" fill="${p.footer}"/>`);
        const tokens=n.chips.map(v=>String(v)).filter(Boolean), rows=[];let line='';
        for(const token of tokens){if((line+'  '+token).length>43){if(line)rows.push(line);line=token;}else line+=(line?'  ·  ':'')+token;}
        if(line)rows.push(line);
        rows.slice(0,2).forEach((l,i)=>bits.push(`<text x="${x+12}" y="${y+cardHeight-27+i*17}" font-family="Arial, sans-serif" font-size="10" font-weight="600" fill="${p.muted}">${esc(l.slice(0,48))}</text>`));
      }
      bits.push('</g>');
    }
    bits.push('</g></svg>');
    return {svg:bits.join(''),width,height};
  }
  function download(blob,name){
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function imageFromSvg(svg){return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
    const im=new Image();im.onload=()=>{URL.revokeObjectURL(url);resolve(im);};im.onerror=()=>{URL.revokeObjectURL(url);reject(Error('SVG renderer could not load the export'));};im.src=url;
  });}
  function canvasFor(width,height){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;}
  function blobFor(canvas,type,quality){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?.size?resolve(b):reject(Error('Cannot encode exported image')),type,quality));}
  // A full canvas is expensive even when the compressed PNG on disk is small.
  // Up to 100MP =~400MB RGBA before browser copies; low-memory devices are
  // capped at 48MP. Larger trees fall back to bounded tiles automatically.
  const PNG_SINGLE_MAX_PIXELS=100000000, PNG_SINGLE_MAX_SIDE=32767;
  function pngPlan(width,height,scale=2,mode='auto',memoryGiB=undefined){
    const s=clamp(Number(scale)||1,1,3),w=Math.round(width*s),h=Math.round(height*s);
    if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<=0||h<=0)throw Error('Invalid PNG dimensions');
    const pixels=w*h;
    const budget=Number(memoryGiB)>0 && Number(memoryGiB)<=4?48000000:PNG_SINGLE_MAX_PIXELS;
    return {width:w,height:h,pixels,estimatedRGBABytes:pixels*4,
      single:mode!=='tiles'&&w<=PNG_SINGLE_MAX_SIDE&&h<=PNG_SINGLE_MAX_SIDE&&pixels<=budget};
  }
  async function pngBlob(svg,width,height,scale=2){
    const plan=pngPlan(width,height,scale);
    if(!plan.single)throw Error('PNG dimensions exceed the single-image memory budget');
    const im=await imageFromSvg(svg),canvas=canvasFor(plan.width,plan.height);
    try{
      if(canvas.width!==plan.width||canvas.height!==plan.height)throw Error('Browser canvas size limit exceeded');
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('Browser PNG canvas unavailable');
      ctx.drawImage(im,0,0,plan.width,plan.height);
      return await blobFor(canvas,'image/png');
    }finally{canvas.width=0;canvas.height=0;}
  }
  // A PNG has no intrinsic 16k pixel limit; a browser canvas often does.
  // Encode a single image when safe. Otherwise clip the independent SVG into
  // bounded 4096px PNG parts, bundled into one self-contained ZIP download.
  function tileSvg(svg,sourceW,sourceH,x,y,pixelW,pixelH,scale){
    if(!svg.startsWith('<svg '))throw Error('Expected a WITT export SVG');
    const head=svg.indexOf('>');if(head<0)throw Error('Invalid SVG export');
    const root=svg.slice(0,head+1)
      .replace(/\swidth="[^"]*"/,'')
      .replace(/\sheight="[^"]*"/,'')
      .replace(/\sviewBox="[^"]*"/,'');
    return root.slice(0,-1)+` width="${pixelW}" height="${pixelH}" viewBox="${x/scale} ${y/scale} ${pixelW/scale} ${pixelH/scale}">`+svg.slice(head+1);
  }
  const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
  function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
  function zipStored(entries){
    const enc=new TextEncoder(),chunks=[],directory=[];let offset=0;
    const add=bytes=>{chunks.push(bytes);offset+=bytes.length;};
    const u16=(data,p,v)=>{data[p]=v&255;data[p+1]=(v>>>8)&255;};
    const u32=(data,p,v)=>{u16(data,p,v&65535);u16(data,p+2,v>>>16);};
    for(const entry of entries){
      const name=enc.encode(entry.name),bytes=entry.bytes instanceof Uint8Array?entry.bytes:new Uint8Array(entry.bytes);
      if(name.length>65535||bytes.length>0xffffffff)throw Error('ZIP entry too large');
      const crc=crc32(bytes),start=offset,local=new Uint8Array(30+name.length);
      u32(local,0,0x04034b50);u16(local,4,20);u16(local,6,0x800);u16(local,8,0);u32(local,14,crc);u32(local,18,bytes.length);u32(local,22,bytes.length);u16(local,26,name.length);local.set(name,30);
      add(local);add(bytes);
      const central=new Uint8Array(46+name.length);u32(central,0,0x02014b50);u16(central,4,20);u16(central,6,20);u16(central,8,0x800);u32(central,16,crc);u32(central,20,bytes.length);u32(central,24,bytes.length);u16(central,28,name.length);u32(central,42,start);central.set(name,46);directory.push(central);
    }
    const directoryStart=offset;
    for(const entry of directory)add(entry);
    const directoryLength=offset-directoryStart;
    if(entries.length>65535||offset>0xffffffff)throw Error('ZIP too large');
    const ending=new Uint8Array(22);u32(ending,0,0x06054b50);u16(ending,8,entries.length);u16(ending,10,entries.length);u32(ending,12,directoryLength);u32(ending,16,directoryStart);add(ending);
    return new Blob(chunks,{type:'application/zip'});
  }
  async function pngExport(svg,width,height,scale=2,mode='auto'){
    const s=clamp(Number(scale)||1,1,3);
    const deviceMemory=typeof navigator==='object'?navigator.deviceMemory:undefined;
    const plan=pngPlan(width,height,s,mode,deviceMemory);
    const fullW=plan.width,fullH=plan.height;
    let fallbackReason='';
    if(plan.single){
      try{return{blob:await pngBlob(svg,width,height,s),tiled:false,tiles:1};}
      catch(error){fallbackReason=error?.message||'Browser cannot encode a single PNG';}
    }
    const tile=3584; // ~12.8 million pixels/canvas, comfortably below 60 MP.
    const cols=Math.ceil(fullW/tile),rows=Math.ceil(fullH/tile);
    if(cols*rows>144)throw Error('PNG requires too many tiles; try SVG or PDF');
    const manifest=['WITT high-resolution PNG tiles','',`Complete image: ${fullW} x ${fullH} pixels`,`Scale: ${s}x`,`Grid: ${cols} columns x ${rows} rows`,'','Images are tiled without overlap. X and Y coordinates are in the complete image.',''];
    const entries=[];
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const x=col*tile,y=row*tile,w=Math.min(tile,fullW-x),h=Math.min(tile,fullH-y);
      const fragment=tileSvg(svg,width,height,x,y,w,h,s);
      const im=await imageFromSvg(fragment),canvas=canvasFor(w,h);
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('Browser PNG drawing unavailable');
      ctx.drawImage(im,0,0,w,h);
      const bytes=new Uint8Array(await(await blobFor(canvas,'image/png')).arrayBuffer());
      canvas.width=0;canvas.height=0;
      const name=`tile_r${String(row+1).padStart(2,'0')}_c${String(col+1).padStart(2,'0')}_x${x}_y${y}.png`;
      manifest.push(`${name}: ${w} x ${h} pixels, x=${x}, y=${y}`);
      entries.push({name,bytes});
    }
    entries.unshift({name:'README.txt',bytes:new TextEncoder().encode(manifest.join('\n')+'\n')});
    return{blob:zipStored(entries),tiled:true,tiles:cols*rows,fallbackReason};
  }
  const ascii=s=>new TextEncoder().encode(s);
  function pdfBytes(pages,orientation='landscape'){
    if(!pages.length)throw Error('PDF needs pages');
    const W=orientation==='portrait'?595.276:841.890,H=orientation==='portrait'?841.890:595.276;
    const fontObj=3+pages.length*3,objects=new Map();
    objects.set(1,ascii('<< /Type /Catalog /Pages 2 0 R >>'));
    objects.set(2,ascii(`<< /Type /Pages /Kids [${pages.map((_,i)=>`${3+3*i} 0 R`).join(' ')}] /Count ${pages.length} >>`));
    pages.forEach((p,i)=>{
      const base=3+3*i,pad=25,availW=W-pad*2,availH=H-pad*2;
      const scale=Math.min(availW/p.width,availH/p.height),iw=p.width*scale,ih=p.height*scale;
      const left=(W-iw)/2,bottom=(H-ih)/2;
      objects.set(base,ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im  ${base+2} 0 R >> /Font << /F1 ${fontObj} 0 R >> >> /Contents ${base+1} 0 R >>`));
      const stream=ascii(`q ${iw.toFixed(3)} 0 0 ${ih.toFixed(3)} ${left.toFixed(3)} ${bottom.toFixed(3)} cm /Im Do Q\nBT /F1 8 Tf ${W-72} 14 Td (Page ${i+1}/${pages.length}) Tj ET\n`);
      objects.set(base+1,concat([ascii(`<< /Length ${stream.length} >>\nstream\n`),stream,ascii('endstream')]));
      objects.set(base+2,concat([ascii(`<< /Type /XObject /Subtype /Image /Width ${p.pixelsX} /Height ${p.pixelsY} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`),p.jpeg,ascii('\nendstream')]));
    });
    objects.set(fontObj,ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
    const chunks=[ascii('%PDF-1.4\n%WITT\n')],offsets=[0];let length=chunks[0].length;
    for(let i=1;i<=fontObj;i++){
      offsets[i]=length;const value=concat([ascii(`${i} 0 obj\n`),objects.get(i),ascii('\nendobj\n')]);chunks.push(value);length+=value.length;
    }
    const xref=length;let xrefBody=`xref\n0 ${fontObj+1}\n0000000000 65535 f \n`;
    for(let i=1;i<=fontObj;i++)xrefBody+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
    chunks.push(ascii(xrefBody+`trailer\n<< /Size ${fontObj+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
    return concat(chunks);
  }
  function concat(parts){let total=0;for(const p of parts)total+=p.length;const buf=new Uint8Array(total);let at=0;for(const p of parts){buf.set(p,at);at+=p.length;}return buf;}
  // Render each PDF page from a bounded SVG viewBox. Avoid decoding a giant
  // full-tree SVG as an Image before pagination: browser image decoders can
  // reject it even when every individual A4 page is a modest raster size.
  function pdfTilePlan(width,height,orientation='landscape'){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Invalid PDF export dimensions');
    const pageW=orientation==='portrait'?1020:1280,pageH=orientation==='portrait'?1450:880;
    const overlap=36,stepW=pageW-overlap,stepH=pageH-overlap;
    const cols=Math.max(1,Math.ceil((width-overlap)/stepW)),rows=Math.max(1,Math.ceil((height-overlap)/stepH));
    if(cols*rows>150)throw Error('PDF would exceed 150 pages; reduce visible branches or use SVG');
    const tiles=[];
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const x=col*stepW,y=row*stepH;
      tiles.push({x,y,width:Math.min(pageW,width-x),height:Math.min(pageH,height-y),col,row});
    }
    return tiles;
  }
  // The full drawing remains in the original viewBox, but it is rasterized
  // directly at the reduced image dimensions, not at native 40k resolution.
  function sizeSvg(svg,pixelW,pixelH){
    if(!svg.startsWith('<svg '))throw Error('Expected a WITT export SVG');
    const end=svg.indexOf('>');if(end<0)throw Error('Invalid SVG export');
    const root=svg.slice(0,end+1).replace(/\swidth="[^"]*"/,'').replace(/\sheight="[^"]*"/,'');
    return root.slice(0,-1)+` width="${pixelW}" height="${pixelH}">`+svg.slice(end+1);
  }
  function pdfFitRasterSize(width,height){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Invalid PDF export dimensions');
    const s=Math.min(1,Math.sqrt(18000000/(width*height)),16000/width,16000/height);
    return{width:Math.max(1,Math.floor(width*s)),height:Math.max(1,Math.floor(height*s))};
  }
  async function pdfBlob(svg,width,height,mode='pages-auto'){
    const orientation=mode==='pages-portrait'?'portrait':mode==='pages-landscape'?'landscape':height>width*1.15?'portrait':'landscape';
    const tiles=[];
    if(mode==='fit'){
      const {width:w,height:h}=pdfFitRasterSize(width,height);
      const im=await imageFromSvg(sizeSvg(svg,w,h));
      const c=canvasFor(w,h),ctx=c.getContext('2d');if(!ctx)throw Error('Browser PDF drawing unavailable');
      ctx.drawImage(im,0,0,w,h);
      tiles.push({width:w,height:h,pixelsX:w,pixelsY:h,jpeg:jpegBytes(c)});
      c.width=0;c.height=0;
    }else{
      for(const tile of pdfTilePlan(width,height,orientation)){
        const {x,y,width:w,height:h}=tile;
        const im=await imageFromSvg(tileSvg(svg,width,height,x,y,w,h,1));
        const c=canvasFor(w,h),ctx=c.getContext('2d');if(!ctx)throw Error('Browser PDF drawing unavailable');
        ctx.drawImage(im,0,0,w,h);
        tiles.push({width:w,height:h,pixelsX:w,pixelsY:h,jpeg:jpegBytes(c)});
        c.width=0;c.height=0;
      }
    }
    return new Blob([pdfBytes(tiles,orientation)],{type:'application/pdf'});
  }
  function jpegBytes(canvas){const raw=atob(canvas.toDataURL('image/jpeg',.9).split(',')[1]);const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;}
  return{renderSvg,pngBlob,pngPlan,pngExport,pdfBlob,pdfBytes,pdfTilePlan,pdfFitRasterSize,sizeSvg,download,lines,zipStored,tileSvg};
});
