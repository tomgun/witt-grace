/* Read-only projections of selected named local assessors. All records stay in the
 * WITT document. No identity inference, authority weights, or score mutations.
 */
(function(root,factory){const core=typeof module!=='undefined'&&module.exports?require('./core.js'):root.WittCore;const api=factory(core);if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.WittReviewLens=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
  'use strict';
  const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : null;
  const range = a => a.length>1 ? Math.max(...a)-Math.min(...a) : 0;
  const selected = (project, ids) => ids === null || ids === undefined ? new Set(project.users.filter(u=>u.profileKind!=='ai').map(u=>u.id)) : new Set((ids||[]).filter(id=>project.users.some(u=>u.id===id)));
  function projectLens(project, ids=null) {
    const people=selected(project,ids), filtered=ids!==null && ids!==undefined;
    const votes=project.votes.filter(v=>people.has(v.userId));
    const edges=(project.edgeAssessments||[]).filter(a=>people.has(a.userId));
    const credence=new Map(), impact=new Map(), rows=[];
    const byUser=new Map(project.users.map(u=>[u.id,u.name]));
    for(const node of project.nodes){
      const rv=votes.filter(v=>v.nodeId===node.id);
      const rvStats={mean:mean(rv.map(v=>v.confidence)),count:rv.length,range:range(rv.map(v=>v.confidence)),reviews:rv.map(v=>({...v,name:byUser.get(v.userId)||''}))};
      credence.set(node.id,rvStats);
      if(rv.length>=2)rows.push({kind:'credence',nodeId:node.id,title:node.title,spread:rvStats.range,rawSpread:rvStats.range,units:'/100',count:rv.length,details:rvStats.reviews.map(v=>`${v.name}: ${v.confidence}/100`)});
      if(node.parentId && node.relation!=='option') {
        const parent=project.nodes.find(n=>n.id===node.parentId);
        const fingerprint=JSON.stringify([node.id,node.parentId,node.title,parent?.title||'',node.relation]);
        const good=edges.filter(a=>a.subjectType==='primary'&&a.subjectId===node.id&&a.fingerprint===fingerprint);
        const ir={...Core.summarizeInfluenceReviews(good),range:range(good.map(a=>a.influence)),reviews:good.map(v=>({...v,name:byUser.get(v.userId)||''}))};
        impact.set(node.id,ir);
        if(good.length>=2)rows.push({kind:'impact',nodeId:node.id,title:node.title,spread:ir.range*10,rawSpread:ir.range,units:'/5',count:good.length,signSplit:ir.signConflict,status:ir.status,positive:ir.positive,negative:ir.negative,neutral:ir.neutral,details:ir.reviews.map(v=>`${v.name}: ${v.influence>0?'+':''}${v.influence}/5`)});
      }
    }
    rows.sort((a,b)=>b.spread-a.spread||a.title.localeCompare(b.title));
    const comparisons=[];
    const ordered=project.users.filter(u=>people.has(u.id));
    for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++){
      const a=ordered[i],b=ordered[j],differences=[];
      for(const node of project.nodes){
        const av=votes.find(v=>v.userId===a.id&&v.nodeId===node.id),bv=votes.find(v=>v.userId===b.id&&v.nodeId===node.id);
        if(av&&bv)differences.push(Math.abs(av.confidence-bv.confidence));
        const ai=impact.get(node.id);
        if(ai){const x=ai.reviews.find(v=>v.userId===a.id),y=ai.reviews.find(v=>v.userId===b.id);if(x&&y)differences.push(Math.abs(x.influence-y.influence)*10);}
      }
      if(differences.length>=3)comparisons.push({a:a.name,b:b.name,shared:differences.length,distance:mean(differences)});
    }
    comparisons.sort((a,b)=>a.distance-b.distance||b.shared-a.shared);
    return {userIds:people,filtered,credence,impact,disagreements:rows,comparisons,selectedCount:people.size,totalCount:(filtered&&ordered.some(u=>u.profileKind==='ai') ? project.users.length : project.users.filter(u=>u.profileKind!=='ai').length)};
  }
  return {projectLens,selected};
});
