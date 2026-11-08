/* WITT P1: optional IndexedDB document library. Local, same-origin and offline.
 * Browser clearing storage removes these records; independent JSON backups remain
 * essential. Edits use optimistic revisions to reject stale cross-tab writes.
 * This module never initiates network requests or reads localStorage.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.WittDocumentLibrary=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const NAME='witt-document-library';const STORE='documents';const VERSION=1;
 const clone=o=>JSON.parse(JSON.stringify(o));
 function open(provider=typeof indexedDB!=='undefined'?indexedDB:null){
   if(!provider) return Promise.reject(Error('IndexedDB ei ole käytettävissä tässä selainympäristössä'));
   return new Promise((resolve,reject)=>{
     let req;
     try {req=provider.open(NAME,VERSION);}catch(error){reject(error);return;}
     req.onupgradeneeded=()=>{
       const db=req.result;
       if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
     };
     req.onerror=()=>reject(req.error||Error('IndexedDB:n avaaminen epäonnistui'));
     req.onblocked=()=>reject(Error('Tietokanta on toisen ikkunan lukitsema'));
     req.onsuccess=()=>{
       const db=req.result;
       db.onversionchange=()=>db.close();
       resolve(createRepository(db));
     };
   });
 }
 function createRepository(db){
   let closed=false;
   const transact=(mode,operation)=>new Promise((resolve,reject)=>{
     if(closed){reject(Error('Tietokantayhteys on suljettu'));return;}
     let tx;
     try {tx=db.transaction(STORE,mode);}catch(error){reject(error);return;}
     let result;let fail=null;
     tx.oncomplete=()=>fail?reject(fail):resolve(result);
     tx.onerror=()=>reject(tx.error||Error('Tietokantaoperaatio epäonnistui'));
     tx.onabort=()=>reject(fail||tx.error||Error('Tietokantamuutos peruttiin'));
     const finish=value=>{result=value;};
     const abort=error=>{fail=error;try{tx.abort();}catch(_){reject(error);}};
     try {operation(tx.objectStore(STORE),finish,abort);}catch(error){abort(error);}
   });
   function get(id){return transact('readonly',(store,finish,abort)=>{
     const req=store.get(id);
     req.onsuccess=()=>finish(req.result?clone(req.result):null);
     req.onerror=()=>abort(req.error);
   });}
   function list(){return transact('readonly',(store,finish,abort)=>{
     const req=store.getAll();
     req.onsuccess=()=>finish(req.result.map(r=>({id:r.id,title:r.title,updatedAt:r.updatedAt,savedAt:r.savedAt,revision:r.revision,nodeCount:r.nodeCount})).sort((a,b)=>b.savedAt.localeCompare(a.savedAt)));
     req.onerror=()=>abort(req.error);
   });}
   function put(document,expectedRevision=null){
     if(!document||typeof document.id!=='string'||!document.id||typeof document.title!=='string'||!Array.isArray(document.nodes))return Promise.reject(Error('Tallennettava asiakirja on virheellinen'));
     const safe=clone(document);
     if(expectedRevision!==null&&(!Number.isSafeInteger(expectedRevision)||expectedRevision<1))return Promise.reject(Error('Virheellinen odotettu versio'));
     return transact('readwrite',(store,finish,abort)=>{
       const req=store.get(safe.id);
       req.onerror=()=>abort(req.error);
       req.onsuccess=()=>{
         const old=req.result;
         if(old&&expectedRevision!==old.revision){
           if(expectedRevision===null&&JSON.stringify(old.document)===JSON.stringify(safe)){
             finish({id:old.id,revision:old.revision,reused:true});return;
           }
           abort(Error('Ristiriitainen asiakirjaversio: vie paikallinen työ JSONiksi ja avaa kirjaston uusin versio. Tietoja ei korvattu.'));return;
         }
         if(!old&&expectedRevision!==null){abort(Error('Asiakirja on poistettu toisessa ikkunassa. Tallennus estettiin.'));return;}
         const revision=(old?.revision||0)+1;
         const record={id:safe.id,title:safe.title,updatedAt:safe.updatedAt,savedAt:new Date().toISOString(),nodeCount:safe.nodes.length,revision,document:safe};
         const saved=store.put(record);
         saved.onerror=()=>abort(saved.error);
         finish({id:safe.id,revision,reused:false});
       };
     });
   }
   function remove(id,expectedRevision){
     if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)return Promise.reject(Error('Poistoon vaaditaan asiakirjan tunnettu versio'));
     return transact('readwrite',(store,finish,abort)=>{
       const read=store.get(id);
       read.onerror=()=>abort(read.error);
       read.onsuccess=()=>{
         if(!read.result){abort(Error('Asiakirjaa ei enää ole'));return;}
         if(read.result.revision!==expectedRevision){abort(Error('Asiakirjaa on muokattu toisessa ikkunassa. Poisto estettiin.'));return;}
         const req=store.delete(id);req.onerror=()=>abort(req.error);finish({id,deleted:true});
       };
     });
   }
   // Export the actual repository contents, not just the last active tab.
   // This makes a portable backup independent of origin-scoped IndexedDB.
   async function exportBundle(){
     const documents=await transact('readonly',(store,finish,abort)=>{
       const req=store.getAll();req.onsuccess=()=>finish(req.result.map(r=>clone(r.document)));
       req.onerror=()=>abort(req.error);
     });
     return {format:'witt-document-library-v1',exportedAt:new Date().toISOString(),documents};
   }
   // Import is all-or-nothing. Any colliding IDs are explicitly duplicated;
   // existing documents and the editor's active document are never overwritten.
   // Validation happens before opening a write transaction, to prevent partial
   // imports even when the input contains a malformed document in the middle.
   function importBundle(bundle,validate,createId){
     if(!bundle||bundle.format!=='witt-document-library-v1'||!Array.isArray(bundle.documents)||bundle.documents.length>1000)
       return Promise.reject(Error('Invalid WITT library bundle'));
     if(typeof validate!=='function'||typeof createId!=='function')return Promise.reject(Error('Import validators required'));
     let originals;
     try{
       originals=bundle.documents.map(doc=>clone(validate(clone(doc))));
       if(originals.some(doc=>!doc||typeof doc.id!=='string'||!doc.id||!Array.isArray(doc.nodes)))throw Error('Invalid document');
       if(new Set(originals.map(doc=>doc.id)).size!==originals.length)throw Error('Duplicate document IDs in bundle');
     }catch(e){return Promise.reject(e);}
     return transact('readwrite',(store,finish,abort)=>{
       const req=store.getAll();req.onerror=()=>abort(req.error);
       req.onsuccess=()=>{
         const used=new Set(req.result.map(r=>r.id));
         const timestamp=new Date().toISOString();let copied=0;
         try {
           for(const item of originals){
             const doc=clone(item);
             if(used.has(doc.id)){
               let id=null;
               for(let tries=0;tries<12;tries++){
                 const candidate=createId();if(typeof candidate==='string'&&candidate&&!used.has(candidate)){id=candidate;break;}
               }
               if(!id)throw Error('Could not generate collision-free document ID');
               doc.id=id;doc.title=doc.title+' (imported)';copied++;
             }
             used.add(doc.id);
             const record={id:doc.id,title:doc.title,updatedAt:doc.updatedAt,savedAt:timestamp,
               nodeCount:doc.nodes.length,revision:1,document:doc};
             const put=store.put(record);put.onerror=()=>abort(put.error);
           }
           finish({imported:originals.length,duplicated:copied});
         }catch(error){abort(error);}
       };
     });
   }
   return {get,list,put,remove,exportBundle,importBundle,close(){closed=true;db.close();}};
 }
 return {open,createRepository,NAME,VERSION};
});
