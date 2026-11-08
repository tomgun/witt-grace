/* Read-only assessor perspective. This never changes project records or the
 * active editing identity. Separate from the decision ballot and its weights.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.WittAssessorView=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function summary(project,Core,assessorId){
  const user=project.users.find(u=>u.id===assessorId);
  if(!user)throw Error('Unknown assessor');
  const credenceReviews=project.votes.filter(v=>v.userId===assessorId&&project.nodes.some(n=>n.id===v.nodeId&&Core.truthAssessable(n))).length;
  const primaryReviews=(project.edgeAssessments||[]).filter(a=>a.userId===assessorId&&a.subjectType==='primary'&&Core.personalInfluence(project,'primary',a.subjectId,assessorId).current).length;
  const secondaryReviews=(project.edgeAssessments||[]).filter(a=>a.userId===assessorId&&a.subjectType==='secondary'&&Core.personalInfluence(project,'secondary',a.subjectId,assessorId).current).length;
  const options=project.mode==='decision'?Core.decisionRankingForAssessor(project,assessorId):[];
  const rows=options.map(item=>{
    const descendants=new Set(Core.descendants(project,item.node.id));
    const reviewedPrimary=(project.edgeAssessments||[]).filter(a=>a.userId===assessorId&&a.subjectType==='primary'&&descendants.has(a.subjectId)&&Core.personalInfluence(project,'primary',a.subjectId,assessorId).current).length;
    // A base-50 option with no argument ratings must not become a highlighted
    // "winner" merely because no user has assessed the grounds yet.
    return {...item,reviewedPrimary,eligible:!!item.complete&&item.feasibility.status==='feasible'&&reviewedPrimary>0&&Number.isFinite(item.score)};
  });
  const contenders=rows.filter(r=>r.eligible);
  const best=contenders.length?Math.max(...contenders.map(r=>r.score)):null;
  const leadingIds=contenders.filter(r=>Math.abs(r.score-best)<1e-7).map(r=>r.node.id);
  return {user,credenceReviews,primaryReviews,secondaryReviews,rows,leadingIds,best};
}
return {summary};
});
