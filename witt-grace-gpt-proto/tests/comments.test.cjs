const test = require('node:test');
const assert = require('node:assert/strict');
const Domain = require('../src/core.js');
const copy = doc => JSON.parse(JSON.stringify(doc));

test('comment belongs to node and round-trips', () => {
  const doc = Domain.createBlankProject();
  const node = Domain.rootNode(doc);
  const comment = Domain.addComment(doc, node.id, '   Should we cite a source?  ');
  assert.equal(comment.body, 'Should we cite a source?');
  assert.deepEqual(Domain.validateProject(copy(doc)), doc);
});

test('comments do not alter scoring or focus projection', () => {
  const doc = Domain.createDemoProject();
  const root = Domain.rootNode(doc);
  const before = [...Domain.evaluate(doc)].map(([id,v]) => [id,v.score]);
  const focusBefore = [...Domain.focusProjection(doc,root.id,'oppose').matchIds];
  Domain.addComment(doc, root.id, 'A note, not an argument.');
  assert.deepEqual([...Domain.evaluate(doc)].map(([id,v]) => [id,v.score]), before);
  assert.deepEqual([...Domain.focusProjection(doc,root.id,'oppose').matchIds], focusBefore);
});

test('deleting a subtree also deletes its comments', () => {
  const doc = Domain.createBlankProject();
  const root = Domain.rootNode(doc);
  const a = Domain.addChild(doc,root.id,'oppose',doc.users[0].id);
  const b = Domain.addChild(doc,a.id,'support',doc.users[0].id);
  Domain.addComment(doc,root.id,'Keep');
  Domain.addComment(doc,b.id,'Drop');
  Domain.removeSubtree(doc,a.id);
  assert.equal(doc.comments.length,1);
  assert.equal(doc.comments[0].nodeId,root.id);
});

test('unsupported document versions are rejected rather than silently migrated', () => {
  const current=Domain.createBlankProject();
  const older={...copy(current),schemaVersion:4};
  assert.throws(()=>Domain.validateProject(older),/vain nykyinen versio/);
  assert.deepEqual(Domain.validateProject(current),current);
});

test('invalid comment data fails validation', () => {
  const doc = Domain.createBlankProject();
  const comment = Domain.addComment(doc,doc.nodes[0].id,'Valid');
  let invalid=copy(doc); invalid.comments[0].nodeId='missing';
  assert.throws(()=>Domain.validateProject(invalid),/Kommentin/);
  invalid=copy(doc); invalid.comments.push({...comment});
  assert.throws(()=>Domain.validateProject(invalid),/Kommentin/);
  invalid=copy(doc); invalid.comments[0].body='<svg onload=alert(1)>'.repeat(500);
  assert.throws(()=>Domain.validateProject(invalid),/Kommentti/);
});

test('comment deletion supports undo snapshots without mutating other values', () => {
  const doc=Domain.createBlankProject();
  const comment=Domain.addComment(doc,doc.nodes[0].id,'Reconsider this.');
  const before=JSON.stringify(doc);
  Domain.deleteComment(doc,comment.id);
  assert.equal(doc.comments.length,0);
  assert.equal(Domain.validateProject(JSON.parse(before)).comments.length,1);
});
