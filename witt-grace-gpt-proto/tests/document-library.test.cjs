'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const C=require('../src/core.js');const Library=require('../src/document-library.js');
function provider(){
 const data=new Map();let upgraded=false;
 const fake={open(name,version){
   const req={};
   queueMicrotask(()=>{
     const db={
       objectStoreNames:{contains:x=>upgraded&&x==='documents'},
       createObjectStore(){upgraded=true;},close(){},
       transaction(_table,mode){
         let pending=0,aborted=false,completed=false;let local=new Map([...data].map(([k,v])=>[k,structuredClone(v)]));
         const tx={oncomplete:null,onerror:null,onabort:null,abort(){aborted=true;tx.onabort?.();}};
         const finish=()=>{
           if(pending!==0||completed||aborted)return;
           completed=true;
           if(mode==='readwrite'){data.clear();for(const [k,v] of local)data.set(k,v);}
           tx.oncomplete?.();
         };
         const schedule=fn=>{
           pending++;
           const r={result:undefined,onsuccess:null,onerror:null};
           queueMicrotask(()=>{
             if(aborted)return;
             try{r.result=fn();r.onsuccess?.();}catch(e){r.error=e;r.onerror?.();}
             pending--;queueMicrotask(finish);
           });return r;
         };
         tx.objectStore=()=>({
           get:key=>schedule(()=>structuredClone(local.get(key))),
           getAll:()=>schedule(()=>structuredClone([...local.values()])),
           put:record=>schedule(()=>{local.set(record.id,structuredClone(record));return record.id;}),
           delete:key=>schedule(()=>{local.delete(key);return undefined;})
         });
         return tx;
       }
     };
     req.result=db;
     if(!upgraded)req.onupgradeneeded?.();
     req.onsuccess?.();
   });
   return req;
 }};
 return fake;
}
test('IndexedDB repository supports independent documents with versioned save, list, rename and delete',async()=>{
 const fake=provider();const a=await Library.open(fake),b=await Library.open(fake);
 const p=C.createBlankProject();p.title='First';
 const q=C.createBlankProject();q.title='Second';
 const first=await a.put(p),second=await a.put(q);
 assert.equal(first.revision,1);assert.equal(second.revision,1);
 assert.equal((await a.list()).length,2);
 const old=await b.get(p.id);assert.deepEqual(old.document,p);
 p.title='Renamed';p.updatedAt=new Date().toISOString();
 const renamed=await a.put(p,first.revision);assert.equal(renamed.revision,2);
 await assert.rejects(()=>b.put({...old.document,title:'Stale'},old.revision),/Ristiriitainen/);
 assert.equal((await b.get(p.id)).document.title,'Renamed');
 assert.equal((await a.put(p,null)).reused,true,'same content never causes needless overwrite');
 await assert.rejects(()=>b.remove(p.id,1),/muokattu/);
 await a.remove(q.id,second.revision);
 assert.deepEqual((await b.list()).map(x=>x.id),[p.id]);
 assert.equal(await a.get(q.id),null);
 a.close();b.close();
});
test('missing/blocked IndexedDB reports an explicit non-persistent failure',async()=>{
 await assert.rejects(()=>Library.open(null),/ei ole käytettävissä/);
});
test('full library backup contains every document and restore never overwrites colliding records',async()=>{
 const origin=await Library.open(provider());
 const a=C.createBlankProject();a.title='A';
 const b=C.createBlankProject();b.title='B';
 await origin.put(a);await origin.put(b);
 const backup=await origin.exportBundle();
 assert.equal(backup.format,'witt-document-library-v1');
 assert.deepEqual(new Set(backup.documents.map(d=>d.id)),new Set([a.id,b.id]));
 const same=await origin.importBundle(backup,C.validateProject,()=>C.uid());
 assert.deepEqual(same,{imported:2,duplicated:2});
 const records=await origin.list();assert.equal(records.length,4);
 for(const doc of [a,b])assert.deepEqual((await origin.get(doc.id)).document,doc,'restore must preserve original');
 const restored=await origin.exportBundle();assert.equal(restored.documents.length,4);
 origin.close();
});
test('malformed library backup is rejected before any write',async()=>{
 const repo=await Library.open(provider());const a=C.createBlankProject();await repo.put(a);
 const invalid={format:'witt-document-library-v1',documents:[a,{garbage:true}]};
 await assert.rejects(()=>repo.importBundle(invalid,C.validateProject,C.uid));
 assert.equal((await repo.list()).length,1);
 await assert.rejects(()=>repo.importBundle({format:'wrong',documents:[a]},C.validateProject,C.uid));
 await assert.rejects(()=>repo.importBundle({format:'witt-document-library-v1',documents:[a,a]},C.validateProject,C.uid),/Duplicate/);
 assert.equal((await repo.list()).length,1);
 repo.close();
});
