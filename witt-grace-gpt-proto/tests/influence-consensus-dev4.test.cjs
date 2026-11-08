const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/core.js');
const Lens = require('../src/review-lens.js');
const fs = require('node:fs');
const path = require('node:path');

function fixture() {
  const project = Core.createBlankProject('argument');
  const root = Core.rootNode(project);
  root.title = 'Root';
  const reason = Core.addChild(project, root.id, 'support');
  reason.title = 'Reason';
  const second = {id: Core.uid(), name:'Second',role:'editor',shares:3};
  const ai = {id: Core.uid(),name:'AI researcher',profileKind:'ai',role:'editor',shares:1};
  project.users.push(second, ai);
  const [a,b,c]=project.users;
  return {project,root,reason,a,b,c};
}
function score(project,rootId) { return Core.evaluate(project).get(rootId).score; }

test('the mean of opposite human directions is zero but the state is NOT neutral', () => {
  const {project,root,reason,a,b,c}=fixture();
  const before=score(project,root.id);
  Core.upsertEdgeAssessment(project,'primary',reason.id,a.id,4);
  Core.upsertEdgeAssessment(project,'primary',reason.id,b.id,-4);
  Core.upsertEdgeAssessment(project,'primary',reason.id,c.id,5);
  const status=Core.influenceSummary(project,'primary',reason.id);
  assert.equal(status.mean,0);
  assert.equal(status.status,'contradictory');
  assert.equal(status.signConflict,true);
  assert.deepEqual([status.positive,status.negative,status.neutral,status.count],[1,1,0,2]);
  assert.equal(Core.influenceSummary(project,'primary',reason.id,true).mean,5/3);
  assert.equal(Lens.projectLens(project).impact.get(reason.id).status,'contradictory');
  assert.equal(Lens.projectLens(project,[a.id,b.id]).impact.get(reason.id).status,'contradictory');
  assert.equal(score(project,root.id),before,'a read-only disagreement indicator never changes the scoring heuristic');
});

test('all neutral, mixed neutral, same-sign and absent assessments mean distinct things', () => {
  const {project,reason,a,b}=fixture();
  assert.equal(Core.influenceSummary(project,'primary',reason.id).status,'unassessed');
  assert.equal(Core.influenceSummary(project,'primary',reason.id).mean,null);
  Core.upsertEdgeAssessment(project,'primary',reason.id,a.id,0);
  assert.equal(Core.influenceSummary(project,'primary',reason.id).status,'neutral');
  Core.upsertEdgeAssessment(project,'primary',reason.id,b.id,0);
  assert.equal(Core.influenceSummary(project,'primary',reason.id).status,'neutral');
  Core.upsertEdgeAssessment(project,'primary',reason.id,b.id,3);
  assert.equal(Core.influenceSummary(project,'primary',reason.id).status,'mixed-neutral');
  assert.equal(Core.influenceSummary(project,'primary',reason.id).signConflict,false);
  Core.upsertEdgeAssessment(project,'primary',reason.id,a.id,2);
  assert.equal(Core.influenceSummary(project,'primary',reason.id).status,'support');
  Core.upsertEdgeAssessment(project,'primary',reason.id,a.id,-2);
  Core.upsertEdgeAssessment(project,'primary',reason.id,b.id,-1);
  assert.equal(Core.influenceSummary(project,'primary',reason.id).status,'oppose');
});

test('a current selected subset uses only its members; missing, stale and AI ratings do not masquerade as zero', () => {
  const {project,root,reason,a,b,c}=fixture();
  Core.upsertEdgeAssessment(project,'primary',reason.id,a.id,0);
  Core.upsertEdgeAssessment(project,'primary',reason.id,b.id,5);
  Core.upsertEdgeAssessment(project,'primary',reason.id,c.id,-5);
  const defaultLens=Lens.projectLens(project);
  assert.equal(defaultLens.impact.get(reason.id).status,'mixed-neutral');
  assert.equal(defaultLens.userIds.has(c.id),false);
  assert.equal(Lens.projectLens(project,[c.id]).impact.get(reason.id).status,'oppose');
  assert.equal(Lens.projectLens(project,[b.id]).impact.get(reason.id).status,'support');
  assert.equal(Lens.projectLens(project,[a.id]).impact.get(reason.id).status,'neutral');
  assert.equal(Lens.projectLens(project,[a.id,c.id]).impact.get(reason.id).status,'mixed-neutral');
  assert.equal(Lens.projectLens(project,[]).impact.get(reason.id).status,'unassessed');
  assert.equal(Lens.projectLens(project,['unknown']).impact.get(reason.id).count,0);
  root.title='Edited parent';
  assert.equal(Core.influenceSummary(project,'primary',reason.id).status,'unassessed');
  assert.equal(Lens.projectLens(project).impact.get(reason.id).status,'unassessed');
  assert.equal(project.edgeAssessments.length,3,'do not delete stale ratings');
});

test('secondary links use the same explicit distinction and preserve single claim identity', () => {
  const {project,root,reason,a,b}=fixture();
  const target=Core.addChild(project,root.id,'oppose');
  target.title='Target';
  const link=Core.addLink(project,reason.id,target.id,'support',4);
  Core.upsertEdgeAssessment(project,'secondary',link.id,a.id,-2.5);
  Core.upsertEdgeAssessment(project,'secondary',link.id,b.id,2.5);
  const state=Core.influenceSummary(project,'secondary',link.id);
  assert.equal(state.status,'contradictory');
  assert.equal(state.mean,0);
  assert.equal(project.nodes.filter(n=>n.id===reason.id).length,1);
  assert.deepEqual(Core.validateProject(structuredClone(project)),project);
});

test('all nine locales and all UI surfaces expose the distinction, not a color-only signal', () => {
  const root=path.resolve(__dirname,'..');
  const data=fs.readFileSync(path.join(root,'locales/messages.psv'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'src/styles.css'),'utf8');
  const matrix=data.trim().split(/\r?\n/).filter(row=>/^influence(Status|Distribution)/.test(row));
  assert.equal(matrix.length,5);
  for(const row of matrix)assert.equal(row.split('|').length,10);
  for(const signature of ['renderReviewLensDialog','renderMobileArguments','renderInspector','renderEdges','renderTable'])assert.ok(app.includes('function '+signature),signature);
  for(const cls of ['influence-status-contradictory','influence-status-neutral','influence-status-mixed-neutral','edge-review-contradictory'])assert.ok(css.includes(cls),cls);
});
