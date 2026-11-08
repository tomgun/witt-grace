/* Snapshot-based undo/redo for document edits AND device-local tree placement.
 * Does not store camera, layers, locale, active node or arguments as HTML.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.WittHistory=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function snapshot(project, offsets, explicitlyClosedIds=[]){return JSON.stringify({project, fourWayOffsets:offsets||{}, explicitlyClosedIds:[...explicitlyClosedIds]});}
function unpack(value){const data=JSON.parse(value);if(!data||typeof data!=='object'||!data.project)throw Error('Invalid WITT history snapshot');return data;}
function createHistory(limit=60){
 const past=[], future=[];
 return {
  record(before,after){if(before===after)return false;past.push(before);if(past.length>limit)past.shift();future.length=0;return true;},
  undo(current){if(!past.length)return null;future.push(current);return past.pop();},
  redo(current){if(!future.length)return null;past.push(current);return future.pop();},
  reset(){past.length=0;future.length=0;},
  get canUndo(){return past.length>0;},get canRedo(){return future.length>0;}
 };
}
return{snapshot,unpack,createHistory};
});
