/* WITT portable JSON import preflight. Local-only, deterministic, non-mutating.
 * One report for human-generated documents and AI-generated JSON.
 * The JSON Schema is a diagnostic preflight, NOT a replacement for domain validation.
 */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.WittImportValidation=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const issue=(code,path,message,fix,extra={})=>({severity:'error',code,path,message,fix,...extra});
const fmtNames={project:'WITT-dokumentti v5',draft:'AI:n arvioitu puu v2',contribution:'WITT-/AI-muutosehdotus v2',starter:'Vanha AI-runko v1',library:'Asiakirjakirjaston varmuuskopio'};
function formatOf(raw){
 if(!isObject(raw))return 'unknown';
 if(raw.format==='witt-ai-draft-v2')return 'draft';
 if(raw.format==='witt-contribution-v2'||raw.format==='witt-contribution-bundle-v1')return 'contribution';
 if(raw.format==='witt-ai-starter-v1')return 'starter';
 if(raw.format==='witt-document-library-v1')return 'library';
 if(Object.hasOwn(raw,'schemaVersion'))return 'project';
 return 'unknown';
}
function syntaxPosition(message,input){
 let match=String(message).match(/position\s+(\d+)/i),offset=match?Number(match[1]):null;
 if(offset===null){match=String(message).match(/line\s+(\d+)\s+column\s+(\d+)/i);if(match){const lines=input.split(/\r?\n/);offset=lines.slice(0,Number(match[1])-1).reduce((sum,line)=>sum+line.length+1,0)+Number(match[2])-1;}}
 if(offset===null){
  // V8 may omit the position for errors such as "Unexpected token ']'".
  // Locate an illegal trailing comma outside JSON strings as a precise fallback.
  let inString=false,escaped=false;
  for(let i=0;i<input.length;i++){
   const ch=input[i];
   if(inString){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')inString=false;continue;}
   if(ch==='"'){inString=true;continue;}
   if(ch===','){let j=i+1;while(/\s/.test(input[j]||''))j++;if(input[j]===']'||input[j]==='}'){offset=j;break;}}
  }
 }
 if(offset===null&&/unexpected end|end of json/i.test(message))offset=input.length;
 if(offset===null)return {};
 offset=Math.min(Math.max(offset,0),input.length);
 const before=input.slice(0,offset),parts=before.split('\n');
 return {line:parts.length,column:parts[parts.length-1].length+1};
}
function checkSchema(value,schema,rootSchema,path,issues,max=50){
 if(issues.length>=max||!schema)return;
 if(schema.$ref){const parts=schema.$ref.split('/').slice(1).map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~'));
  let target=rootSchema;for(const p of parts)target=target?.[p];
  if(!target){issues.push(issue('SCHEMA',path,'Skeemaviite on virheellinen: '+schema.$ref,'Korjaa WITTin validointiskeema.'));return;}
  checkSchema(value,target,rootSchema,path,issues,max);return;
 }
 if(schema.anyOf){
  const candidates=schema.anyOf.map(branch=>{const tmp=[];checkSchema(value,branch,rootSchema,path,tmp,max);return tmp;});
  if(candidates.every(c=>c.length)){
   const names=schema.anyOf.map(b=>(b.required||[]).join(' + ')).filter(Boolean);
   issues.push(issue('ANY_OF',path,'Pakollinen vaihtoehtoinen kenttä puuttuu.',names.length?'Lisää vähintään jokin seuraavista: '+names.join(' tai '):'Täydennä vaadittu rakenne.'));
  }
 }
 if(schema.type){const types=Array.isArray(schema.type)?schema.type:[schema.type];
  const valid=types.some(type=>type==='null'?value===null:type==='array'?Array.isArray(value):type==='object'?isObject(value):type==='integer'?Number.isInteger(value):type==='number'?typeof value==='number'&&Number.isFinite(value):typeof value===type);
  if(!valid){issues.push(issue('TYPE',path,'Väärä tietotyyppi (nyt '+(value===null?'null':Array.isArray(value)?'array':typeof value)+').','Odotettu tyyppi: '+types.join(' tai ')+'.'));return;}
 }
 if(Object.hasOwn(schema,'const')&&value!==schema.const){issues.push(issue('CONST',path,'Virheellinen vakioarvo: '+String(value)+'.','Arvon pitää olla '+JSON.stringify(schema.const)+'.'));return;}
 if(schema.enum&&!schema.enum.includes(value)){issues.push(issue('ENUM',path,'Arvo '+JSON.stringify(value)+' ei ole sallittu.','Sallitut arvot: '+schema.enum.map(x=>JSON.stringify(x)).join(', ')+'.'));return;}
 if(typeof value==='string'){
  if(schema.minLength!==undefined&&value.length<schema.minLength)issues.push(issue('MIN_LENGTH',path,'Teksti on liian lyhyt.','Pituus vähintään '+schema.minLength+' merkkiä.'));
  if(schema.maxLength!==undefined&&value.length>schema.maxLength)issues.push(issue('MAX_LENGTH',path,'Teksti on liian pitkä ('+value.length+' merkkiä).','Enintään '+schema.maxLength+' merkkiä.'));
  if(schema.pattern&&!(new RegExp(schema.pattern).test(value)))issues.push(issue('PATTERN',path,'Tunniste tai tekstimuoto ei vastaa vaadittua mallia.','Käytä mallia: '+schema.pattern+'.'));
 }
 if(typeof value==='number'){
  if(schema.minimum!==undefined&&value<schema.minimum)issues.push(issue('MINIMUM',path,'Arvo '+value+' on liian pieni.','Pienin sallittu arvo on '+schema.minimum+'.'));
  if(schema.maximum!==undefined&&value>schema.maximum)issues.push(issue('MAXIMUM',path,'Arvo '+value+' on liian suuri.','Suurin sallittu arvo on '+schema.maximum+'.'));
  if(schema.multipleOf!==undefined&&Math.abs(value/schema.multipleOf-Math.round(value/schema.multipleOf))>1e-8)issues.push(issue('STEP',path,'Arvon tarkkuus ei ole sallittu.','Käytä '+schema.multipleOf+' askelta, esimerkiksi −3,5 tai +4.'));
 }
 if(Array.isArray(value)){
  if(schema.minItems!==undefined&&value.length<schema.minItems)issues.push(issue('MIN_ITEMS',path,'Taulukossa on liian vähän alkioita.','Vähintään '+schema.minItems+' alkiota.'));
  if(schema.maxItems!==undefined&&value.length>schema.maxItems)issues.push(issue('MAX_ITEMS',path,'Taulukossa on liian monta alkiota ('+value.length+').','Enintään '+schema.maxItems+' alkiota.'));
  if(schema.items)for(let i=0;i<value.length&&issues.length<max;i++)checkSchema(value[i],schema.items,rootSchema,path+'['+i+']',issues,max);
 }
 if(isObject(value)){
  for(const key of (schema.required||[]))if(!Object.hasOwn(value,key)&&issues.length<max)issues.push(issue('REQUIRED',path+'.'+key,'Pakollinen kenttä puuttuu.','Lisää kenttä "'+key+'" oikealla tietotyypillä.'));
  if(schema.additionalProperties===false&&schema.properties){for(const key of Object.keys(value))if(!Object.hasOwn(schema.properties,key)&&issues.length<max)issues.push(issue('UNKNOWN_FIELD',path+'.'+key,'Tuntematon kenttä "'+key+'".','Poista kenttä tai korjaa nimi. Tuonti ei hyväksy ylimääräisiä kenttiä.'));}
  if(schema.properties)for(const key of Object.keys(schema.properties))if(Object.hasOwn(value,key)&&issues.length<max)checkSchema(value[key],schema.properties[key],rootSchema,path+'.'+key,issues,max);
 }
}
function checkDraftGraph(raw,issues){
 if(!isObject(raw.root)||!Array.isArray(raw.claims))return;
 if(raw.mode==='decision'&&raw.root.credence!==undefined)issues.push(issue('DECISION_CREDENCE','$.root.credence','Päätöskysymykselle ei anneta totuusprosenttia.','Poista root.credence ja arvioi perustelujen uskottavuus.'));
 const known=new Map([[raw.root.id,'$.root.id']]);
 raw.claims.forEach((c,i)=>{if(!isObject(c)||typeof c.id!=='string')return;
  if(known.has(c.id))issues.push(issue('DUPLICATE_ID',`$.claims[${i}].id`,'Sama solmutunniste on käytössä useasti.','Anna jokaiselle solmulle yksilöllinen id. Edellinen: '+known.get(c.id)));
  else known.set(c.id,`$.claims[${i}].id`);
 });
 raw.claims.forEach((c,i)=>{if(!isObject(c))return;const path=`$.claims[${i}]`;
  if(typeof c.parentId==='string'&&!known.has(c.parentId))issues.push(issue('MISSING_PARENT',path+'.parentId','Vanhempaa "'+c.parentId+'" ei löydy.','Käytä olemassa olevan root- tai claim-solmun id:tä.'));
  if(c.relation==='option'&&(raw.mode!=='decision'||c.parentId!==raw.root.id))issues.push(issue('OPTION_PARENT',path+'.relation','Päätösvaihtoehdon tulee olla päätösjuuren välitön lapsi.','Siirrä option-suhde suoraan päätösjuureen.'));
  if((c.relation==='option'||['value','constraint','prerequisite'].includes(c.semanticType))&&c.credence!==undefined)issues.push(issue('NON_FACTUAL_CREDENCE',path+'.credence','Tähän solmutyyppiin ei kuulu uskottavuusprosenttia.','Poista credence-kenttä; suhteelle voi jäädä vaikutusarvio.'));
  if(c.relation==='option'&&c.influence!==undefined)issues.push(issue('OPTION_INFLUENCE',path+'.influence','Päätösvaihtoehdon suhdetta ei arvioida vaikutusarvolla.','Poista influence-kenttä; arvioi vaihtoehdon perustelut.'));
 });
 for(const [id,p] of known){if(p==='$.root.id')continue;const seen=new Set();let current=id;while(current!==raw.root.id){if(seen.has(current)){issues.push(issue('CYCLE',p,'Solmujen parentId-viitteet muodostavat syklin.','Poista kehä ja viittaa lopulta juureen.'));break;}seen.add(current);const c=raw.claims.find(n=>n?.id===current);if(!c||!known.has(c.parentId))break;current=c.parentId;}}
 const shared=new Set((raw.sharedReasons||[]).map(r=>r?.id));
 (raw.sharedAttachments||[]).forEach((a,i)=>{if(!isObject(a))return;if(!shared.has(a.reasonId))issues.push(issue('MISSING_SHARED_REASON',`$.sharedAttachments[${i}].reasonId`,'Yhteisperustetta ei löydy.','Käytä sharedReasons-listalla olevaa id:tä.'));if(!known.has(a.parentId))issues.push(issue('MISSING_PARENT',`$.sharedAttachments[${i}].parentId`,'Liitoksen vanhempaa ei löydy.','Korjaa parentId.'));});
 (raw.links||[]).forEach((l,i)=>{if(!isObject(l))return;for(const field of ['sourceId','targetId'])if(!known.has(l[field]))issues.push(issue('MISSING_LINK_ENDPOINT',`$.links[${i}].${field}`,'Lisäyhteyden solmua ei löydy.','Käytä olemassa olevan solmun id:tä.'));});
 (raw.comments||[]).forEach((c,i)=>{if(isObject(c)&&!known.has(c.nodeId))issues.push(issue('MISSING_COMMENT_NODE',`$.comments[${i}].nodeId`,'Kommentin kohdesolmua ei löydy.','Vaihda nodeId olemassa olevaan solmuun.'));});
}
function checkProjectGraph(raw,issues){
 if(!Array.isArray(raw.nodes))return;
 const known=new Map(),users=new Set((raw.users||[]).map(u=>u?.id));
 raw.nodes.forEach((n,i)=>{if(!isObject(n)||typeof n.id!=='string')return;if(known.has(n.id))issues.push(issue('DUPLICATE_ID',`$.nodes[${i}].id`,'Solmun tunniste on jo käytössä.','Anna eri id.'));else known.set(n.id,i);});
 raw.nodes.forEach((n,i)=>{if(!isObject(n))return;
  if(n.parentId!==null&&typeof n.parentId==='string'&&!known.has(n.parentId))issues.push(issue('MISSING_PARENT',`$.nodes[${i}].parentId`,'Vanhempaa "'+n.parentId+'" ei löydy.','Valitse olemassa oleva solmu.'));
  if(typeof n.createdBy==='string'&&!users.has(n.createdBy))issues.push(issue('MISSING_AUTHOR',`$.nodes[${i}].createdBy`,'Tekijää ei löydy käyttäjälistasta.','Lisää käyttäjä users-taulukkoon tai korjaa createdBy.'));
 });
 for(const [field,targetField,knowns] of [['votes','nodeId',known],['edgeAssessments','subjectId',known]]){
  if(!Array.isArray(raw[field]))continue;
  raw[field].forEach((r,i)=>{if(!isObject(r))return;if(field==='edgeAssessments'&&r.subjectType==='secondary')return;
   if(typeof r[targetField]==='string'&&!knowns.has(r[targetField]))issues.push(issue('MISSING_TARGET',`$.${field}[${i}].${targetField}`,'Arvio viittaa olemattomaan solmuun.','Korjaa viite tai lisää solmu.'));
  });
 }
}
function inspect(input,dependencies={},opts={}){
 const errors=[];let parsed=input;
 const maxErrors=opts.maxErrors||60;
 if(typeof input==='string'){
  if(input.length>(opts.maxBytes||25_000_000))errors.push(issue('TOO_LARGE','$','JSON-sisältö on liian suuri.','Pienennä tiedostoa.'));
  if(!errors.length){
   const trimmed=input.trim();
   if(/^```/.test(trimmed))errors.push(issue('MARKDOWN','$','Tiedosto sisältää Markdown-koodiaidan.','Poista ```json- ja ```-rivit; tiedoston tulee sisältää pelkkä JSON-olio.'));
   else{try{parsed=JSON.parse(input);}catch(e){errors.push(issue('JSON_SYNTAX','$','JSON-syntaksivirhe: '+e.message,'Korjaa pilkut, lainausmerkit, hakasulut tai puuttuva sulje.',syntaxPosition(e.message,input)));}}
  }
 }
 if(errors.length)return {ok:false,format:'invalid',formatName:'JSON-syntaksi',issues:errors,parsed:null};
 if(!isObject(parsed))return {ok:false,format:'unknown',formatName:'Tuntematon',issues:[issue('ROOT_TYPE','$','JSON:n ylimmän tason on oltava olio.','Aloita tiedosto merkillä { ja lopeta merkillä }.')],parsed};
 const format=formatOf(parsed),formatName=fmtNames[format]||'Tuntematon tiedostomuoto';
 if(format==='unknown'){
  const request=typeof parsed.format==='string'&&/request|task/i.test(parsed.format);
  const old=parsed.format==='witt-ai-review-v1';
  errors.push(issue(request?'REQUEST_NOT_RESPONSE':old?'OBSOLETE_FORMAT':'FORMAT',parsed.format?'$.format':'$',
   request?'Tämä on AI:lle tarkoitettu tehtävätiedosto, ei WITTiin tuotava vastaus.':old?'Tiedosto käyttää vanhaa AI-muutosehdotuksen muotoa.':'WITT ei tunnista JSON:n tiedostomuotoa.',
   request?'Anna tehtävätiedosto kielimallille ja tuo sen palauttama JSON-vastaus.':old?'Pyydä AI:ta tuottamaan witt-contribution-v2 tai witt-ai-draft-v2.':'WITT-dokumentissa tarvitaan schemaVersion: 5; AI-puussa format: "witt-ai-draft-v2"; muutosehdotuksessa format: "witt-contribution-v2".'));
 }
 if(opts.expected&&format!==opts.expected)errors.push(issue('WRONG_IMPORT', '$'+(parsed.format?'.format':'.schemaVersion'), 'Tämä on '+formatName+', mutta tähän tuontiin odotetaan '+(fmtNames[opts.expected]||opts.expected)+'.','Käytä Tiedosto → Avaa JSON -toimintoa tai valitse oikea tuonti.'));
 if(format==='project'&&parsed.schemaVersion!==dependencies.Core?.VERSION)return {ok:false,format,formatName,parsed,issues:[issue('VERSION','$.schemaVersion','Dokumentin schemaVersion '+parsed.schemaVersion+' ei vastaa nykyistä versiota '+dependencies.Core?.VERSION+'.','Käytä nykyisen version JSON-tiedostoa. Vanhojen dokumenttien automaattista migraatiota ei ole.')]};
 let schema=null;
 if(format==='project')schema=dependencies.projectSchema;
 if(format==='draft')schema=dependencies.AIDraft?.schema;
 if(format==='contribution')schema=parsed.format==='witt-contribution-bundle-v1'?dependencies.Contributions?.bundleSchema:dependencies.Contributions?.schema;
 if(format==='starter')schema=dependencies.AIStarter?.schema;
 if(format==='library'){
  if(!Array.isArray(parsed.documents))errors.push(issue('REQUIRED','$.documents','Varmuuskopiosta puuttuu documents-taulukko.','Varmuuskopio on muodostettava WITTin Asiakirjakirjaston viennillä.'));
  else if(parsed.documents.length>1000)errors.push(issue('MAX_ITEMS','$.documents','Liian monta asiakirjaa.','Vähennä asiakirjojen määrää.'));
  else parsed.documents.forEach((doc,i)=>{
   const inner=[];if(dependencies.projectSchema)checkSchema(doc,dependencies.projectSchema,dependencies.projectSchema,`$.documents[${i}]`,inner,Math.max(1,maxErrors-errors.length));errors.push(...inner);
  });
 }
 if(schema&&errors.length<maxErrors)checkSchema(parsed,schema,schema,'$',errors,maxErrors);
 if(errors.length<maxErrors&&format==='draft')checkDraftGraph(parsed,errors);
 if(errors.length<maxErrors&&format==='project')checkProjectGraph(parsed,errors);
 if(!errors.length){try{
  if(format==='project')dependencies.Core.validateProject(parsed);
  if(format==='draft'){dependencies.AIDraft.validate(parsed);dependencies.AIDraft.toProject(parsed,dependencies.Core);}
  if(format==='contribution'){
   (parsed.format==='witt-contribution-bundle-v1'?dependencies.Contributions.validateBundle(parsed):dependencies.Contributions.validate(parsed));
   if(opts.currentProject){
    const current=dependencies.Core.validateProject(opts.currentProject);
    if(parsed.projectId!==current.id)errors.push(issue('WRONG_PROJECT','$.projectId','Ehdotus on tehty eri WITT-dokumenttiin.','Luo ehdotus nykyisen dokumentin uudella AI-/WITT-tehtävätiedostolla.'));
    else if(parsed.baseFingerprint!==dependencies.Contributions.fingerprint(current))errors.push(issue('STALE_PROPOSAL','$.baseFingerprint','Ehdotus perustuu vanhaan dokumentin versioon.','Luo uusi ehdotus nykyisestä dokumentista; vanhaa tiedostoa ei tuoda automaattisesti.'));
   }
  }
  if(format==='starter'){dependencies.AIStarter.validate(parsed);dependencies.AIStarter.toProject(parsed,dependencies.Core);}
  if(format==='library')for(const doc of parsed.documents)dependencies.Core.validateProject(doc);
 }catch(e){errors.push(issue('DOMAIN','$','WITTin rakennetarkistus hylkäsi tiedoston: '+e.message,'Korjaa virhe ja tarkista solmujen, suhteiden ja arvioijien viittaukset.'));}}
 return {ok:errors.length===0,format,formatName,issues:errors.slice(0,maxErrors),parsed};
}
function reportText(report,filename=''){const lines=['WITT JSON -tarkistusraportti',filename?'Tiedosto: '+filename:null,'Muoto: '+report.formatName,report.ok?'Tulos: hyväksytty':'Tulos: hylätty ('+report.issues.length+' virhettä)', ''];
 for(const [i,e] of report.issues.entries()){lines.push((i+1)+'. ['+e.code+'] '+e.path+(e.line?' (rivi '+e.line+', sarake '+e.column+')':''),e.message,'Korjaa: '+e.fix,'');}
 if(report.ok)lines.push('JSON on tarkistettu skeeman ja nykyisen WITT-tietomallin perusteella.');
 return lines.filter(x=>x!==null).join('\n');}
return {inspect,reportText,checkSchema,formatOf};
});
