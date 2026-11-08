const fs=require('node:fs');const path=require('node:path');
let file=path.join(__dirname,'../src/document-library.js');let s=fs.readFileSync(file,'utf8');
const anchor='   return {get,list,put,remove,close(){closed=true;db.close();}};';
if(!s.includes(anchor))throw Error('library anchor missing');
s=s.replace(anchor,`   // Export the actual repository contents, not just the last active tab.
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
   return {get,list,put,remove,exportBundle,importBundle,close(){closed=true;db.close();}};`);
fs.writeFileSync(file,s);
file=path.join(__dirname,'../index.html');s=fs.readFileSync(file,'utf8');
const target='<div class="dialog-actions"><button type="button" id="btnLibraryRefresh"';
if(!s.includes(target))throw Error('dialog anchor absent');
s=s.replace(target,'<input type="file" id="libraryBackupInput" class="visually-hidden" accept="application/json,.json" />\n    <div class="dialog-actions"><button type="button" id="btnLibraryBackup" class="btn quiet" data-i18n="libraryBackup">Vie kaikki JSONina</button><button type="button" id="btnLibraryRestore" class="btn quiet" data-i18n="libraryRestore">Tuo varmuuskopio</button><button type="button" id="btnLibraryRefresh"');fs.writeFileSync(file,s);
file=path.join(__dirname,'../src/app.js');s=fs.readFileSync(file,'utf8');
const bind="    $('btnLibraryRefresh').onclick = libraryRows;";
if(!s.includes(bind))throw Error('binding anchor absent');
s=s.replace(bind,`    $('btnLibraryBackup').onclick=async()=>{
      try {
        await librarySaveQueue;
        const repo=await initLibrary();if(!repo)throw libraryFailure||Error(t('libraryUnavailable'));
        const backup=await repo.exportBundle();
        downloadFile('witt-library-backup.json',JSON.stringify(backup,null,2)+'\\n','application/json;charset=utf-8');
        $('libraryStatus').textContent=t('libraryBackupReady',{count:backup.documents.length});
      }catch(err){$('libraryStatus').textContent=err.message;}
    };
    $('btnLibraryRestore').onclick=()=>$('libraryBackupInput').click();
    $('libraryBackupInput').onchange=async event=>{
      const file=event.target.files?.[0];event.target.value='';if(!file)return;
      try {
        if(file.size>25_000_000)throw Error(t('importTooLarge'));
        const backup=JSON.parse(await file.text());
        if(!backup||!Array.isArray(backup.documents))throw Error(t('libraryInvalidBackup'));
        // Do not restore silently: the action can create many new records.
        if(!await askConfirm(t('libraryRestoreConfirm',{count:backup.documents.length}),t('libraryRestore')))return;
        const repo=await initLibrary();if(!repo)throw libraryFailure||Error(t('libraryUnavailable'));
        await librarySaveQueue;
        const result=await repo.importBundle(backup,Core.validateProject,Core.uid);
        await libraryRows();
        $('libraryStatus').textContent=t('libraryRestored',{count:result.imported,copies:result.duplicated});
      }catch(err){$('libraryStatus').textContent=err.message||t('libraryInvalidBackup');}
    };
`+bind);
fs.writeFileSync(file,s);
file=path.join(__dirname,'../locales/messages.psv');s=fs.readFileSync(file,'utf8');
const rows=[
 ['libraryBackup','Vie kaikki JSONina','Alle als JSON exportieren','Export all as JSON','Exportar todo como JSON','Tout exporter en JSON','Экспортировать всё в JSON','全部导出为 JSON','すべて JSON に書き出す','모두 JSON으로 내보내기'],
 ['libraryRestore','Tuo varmuuskopio','Sicherung importieren','Import backup','Importar copia de seguridad','Importer la sauvegarde','Импортировать резервную копию','导入备份','バックアップを読み込む','백업 가져오기'],
 ['libraryBackupReady','{count} asiakirjan varmuuskopio ladattu.','Sicherung mit {count} Dokumenten heruntergeladen.','Backup of {count} documents downloaded.','Copia de {count} documentos descargada.','Sauvegarde de {count} documents téléchargée.','Резервная копия {count} документов скачана.','已下载 {count} 份文档的备份。','{count} 件の文書をバックアップしました。','문서 {count}개의 백업을 다운로드했습니다.'],
 ['libraryRestoreConfirm','Tuodaanko {count} asiakirjaa? Nykyisiä asiakirjoja ei korvata; tunnisteiden ristiriidassa luodaan kopio.','{count} Dokumente importieren? Bestehende werden nicht ersetzt; bei Konflikt wird eine Kopie erstellt.','Import {count} documents? Existing documents are never overwritten; ID conflicts become copies.','¿Importar {count} documentos? Los existentes no se sobrescriben; los conflictos crean copias.','Importer {count} documents ? Les documents existants restent intacts ; les conflits créent des copies.','Импортировать {count} документов? Существующие не изменяются; при совпадениях создаются копии.','导入 {count} 份文档？不会覆盖现有文档，冲突时创建副本。','{count} 件を読み込みますか？既存文書は上書きせず、競合時はコピーします。','문서 {count}개를 가져올까요? 기존 문서는 덮어쓰지 않으며 충돌 시 사본을 만듭니다.'],
 ['libraryRestored','Tuotiin {count} asiakirjaa, joista {copies} kopiona.','{count} Dokumente importiert, davon {copies} Kopien.','Imported {count} documents, including {copies} copies.','Se importaron {count} documentos, {copies} como copias.','{count} documents importés, dont {copies} copies.','Импортировано {count} документов, копий: {copies}.','已导入 {count} 份文档，其中 {copies} 份为副本。','{count} 件を読み込み、{copies} 件をコピーしました。','문서 {count}개 가져옴, 그중 {copies}개 복사본.'],
 ['libraryInvalidBackup','Virheellinen asiakirjakirjaston varmuuskopio.','Ungültige Bibliothekssicherung.','Invalid document library backup.','Copia de biblioteca no válida.','Sauvegarde de bibliothèque non valide.','Недопустимая резервная копия библиотеки.','无效的文档库备份。','無効な文書ライブラリのバックアップです。','잘못된 문서 라이브러리 백업입니다.']
];
for(const row of rows){if(s.includes('\n'+row[0]+'|'))throw Error('duplicate '+row[0]);s+='\n'+row.join('|');}
s=s.replace(/\n\n+/g,'\n');fs.writeFileSync(file,s.endsWith('\n')?s:s+'\n');
