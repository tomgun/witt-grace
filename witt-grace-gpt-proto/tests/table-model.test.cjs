const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/core.js');
const Table = require('../src/table-model.js');
function make() {
  const doc = Core.createBlankProject('argument');
  const a = Core.rootNode(doc); a.title = 'Acquire system';
  const b = Core.addChild(doc, a.id, 'oppose'); b.title='Too expensive';
  const c = Core.addChild(doc, b.id, 'oppose'); c.title='Savings exceed costs';
  const d = Core.addChild(doc, a.id, 'support'); d.title='Less manual work';
  b.collapsed = true;
  return {doc,a,b,c,d};
}
test('table projection is depth-first and includes collapsed descendants, without mutation', () => {
 const {doc,a,b,c,d} = make();
 const before=JSON.stringify(doc);
 const rows=Table.projectRows(doc);
 assert.deepEqual(rows.map(row=>row.id),[a,b,c,d].map(n=>n.id));
 assert.deepEqual(rows.map(row=>row.depth),[0,1,2,1]);
 assert.equal(rows[2].isCollapsedDescendant,true);
 assert.equal(rows[2].parent.title,'Too expensive');
 assert.equal(rows[2].grandparent.title,'Acquire system');
 assert.deepEqual(rows[2].path,['Acquire system','Too expensive','Savings exceed costs']);
 assert.equal(JSON.stringify(doc),before);
});
test('rebuttal of rebuttal stays locally opposing but chain direction is supporting', () => {
 const {doc,b,c}=make();
 const row=Table.projectRows(doc).find(r=>r.id===c.id);
 assert.equal(row.relation,'oppose');
 assert.equal(row.chainDirection,1);
 assert.equal(row.anchorTitle,'Acquire system');
 const direct=Table.projectRows(doc,{stance:'oppose'});
 assert.deepEqual(direct.map(r=>r.id),[b.id,c.id]);
});
test('search finds a claim by its parent context, or by its own title', () => {
 const {doc,a,b,c}=make();
 assert.deepEqual(Table.projectRows(doc,{query:'too expensive'}).map(r=>r.id),[b.id,c.id]);
 assert.deepEqual(Table.projectRows(doc,{query:'savings',stance:'oppose'}).map(r=>r.id),[c.id]);
 assert.deepEqual(Table.projectRows(doc,{query:'does not exist'}),[]);
});
test('one claim is one row even if it has multiple secondary links', () => {
 const {doc,a,b,c}=make();
 Core.addLink(doc,c.id,a.id,'support',2.5);
 const rows=Table.projectRows(doc);
 assert.equal(rows.filter(r=>r.id===c.id).length,1);
 const detail=Table.assessmentDetails(doc,c.id);
 assert.equal(detail.links.length,1);
 assert.equal(detail.links[0].direction,'outgoing');
 assert.equal(detail.links[0].otherTitle,'Acquire system');
});
test('stored individual assessments can be inspected without changing vote weights or scores', () => {
 const {doc,c}=make();
 const user=doc.users[0]; user.shares=8;
 Core.upsertVote(doc,c.id,user.id,90);
 const before=JSON.stringify(doc);
 const detail=Table.assessmentDetails(doc,c.id);
 assert.equal(detail.reviews.length,1);
 assert.equal(detail.reviews[0].credence,90);
 assert.equal(detail.reviews[0].name,'Minä');
 assert.equal(detail.credence,c.confidence);
 assert.equal(JSON.stringify(doc),before);
});
test('decision options form separate argument-chain anchors', () => {
 const doc=Core.createBlankProject('decision'); const question=Core.rootNode(doc);
 const option=Core.addChild(doc,question.id,'option'); option.title='Option X';
 const oppose=Core.addChild(doc,option.id,'oppose');
 const rebut=Core.addChild(doc,oppose.id,'oppose');
 const rows=Table.projectRows(doc);
 assert.equal(rows.find(r=>r.id===option.id).chainDirection,0);
 assert.equal(rows.find(r=>r.id===rebut.id).chainDirection,1);
 assert.equal(rows.find(r=>r.id===rebut.id).anchorTitle,'Option X');
});
