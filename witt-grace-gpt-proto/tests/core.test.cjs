const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/core.js');

function fixture(mode = 'argument') { const p=D.createBlankProject(mode);p.settings.assessmentWeighting='structural';return p; }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function child(doc, parent, relation, confidence, impact) {
  const n = D.addChild(doc, parent.id, relation, doc.users[0].id);
  n.confidence = confidence; n.impact = impact;
  return n;
}

test('new document is valid and contains exactly one root', () => {
  const doc = D.validateProject(fixture());
  assert.equal(doc.nodes.length, 1);
  assert.equal(doc.nodes[0].relation, 'root');
});
test('demo document round-trips losslessly through JSON validation', () => {
  const doc = D.createDemoProject();
  assert.deepEqual(D.validateProject(JSON.parse(JSON.stringify(doc))), doc);
});
test('a credible supporting child increases the parent index', () => {
  const doc = fixture(), root = D.rootNode(doc); root.confidence = 50;
  child(doc, root, 'support', 100, 5);
  const result = D.evaluate(doc).get(root.id);
  assert.ok(result.score > 50); assert.ok(result.score < 85);
});
test('a credible opposing child decreases the parent index', () => {
  const doc = fixture(), root = D.rootNode(doc); root.confidence = 50;
  child(doc, root, 'oppose', 100, 5);
  const result = D.evaluate(doc).get(root.id);
  assert.ok(result.score < 50); assert.ok(result.score > 15);
});
test('equal support and opposition cancel out', () => {
  const doc = fixture(), root = D.rootNode(doc); root.confidence = 60;
  child(doc, root, 'support', 100, 5); child(doc, root, 'oppose', 100, 5);
  assert.equal(D.evaluate(doc).get(root.id).score, 60);
});
test('20%-credible supporting child contributes one fifth of full strength, not zero', () => {
  const doc = fixture(), root = D.rootNode(doc); root.confidence = 52;
  child(doc, root, 'support', 20, 5);
  assert.equal(D.evaluate(doc).get(root.id).score, 57);
});
test('low and high computed scores remain bounded in 0..100', () => {
  for (const confidence of [0, 100]) {
    const doc = fixture(), root = D.rootNode(doc); root.confidence = confidence;
    for (let i = 0; i < 10; i++) child(doc, root, confidence ? 'support' : 'oppose', 100, 5);
    const score = D.evaluate(doc).get(root.id).score;
    assert.ok(score >= 0 && score <= 100);
  }
});
test('an equal vote policy averages users irrespective of shares', () => {
  const doc = fixture(), node = D.rootNode(doc), a = doc.users[0];
  const b = { id: 'b', name: 'B', shares: 100, role: 'editor' }; doc.users.push(b);
  D.upsertVote(doc, node.id, a.id, 10); D.upsertVote(doc, node.id, b.id, 90);
  assert.equal(D.getBaseConfidence(doc, node).base, 50);
});
test('share ownership NEVER changes a factual confidence estimate', () => {
  const doc = fixture(), node = D.rootNode(doc), a = doc.users[0];
  a.shares = 1;
  const b = { id: 'b', name: 'B', shares: 300, role: 'editor' };
  const c = { id: 'c', name: 'C', shares: 0, role: 'editor' };
  doc.users.push(b, c); doc.settings.voteWeighting = 'shares';
  D.upsertVote(doc, node.id, a.id, 0); D.upsertVote(doc, node.id, b.id, 100); D.upsertVote(doc, node.id, c.id, 50);
  assert.equal(D.getBaseConfidence(doc, node).base, 50);
  assert.equal(D.getBaseConfidence(doc, node).effectiveVotes, 3);
});
test('decision preferences can be share-weighted separately', () => {
  const doc = fixture('decision'), node = D.addChild(doc, D.rootNode(doc).id, 'option');
  const a = doc.users[0]; a.shares = 1;
  const b = { id: 'b', name: 'B', shares: 3, role: 'editor' };
  const c = { id: 'c', name: 'C', shares: 0, role: 'editor' };
  doc.users.push(b, c);
  D.upsertBallot(doc, node.id, a.id, 0); D.upsertBallot(doc, node.id, b.id, 100); D.upsertBallot(doc, node.id, c.id, 0);
  assert.equal(D.optionPreference(doc, node.id).preferenceScore, 100 / 3);
  doc.settings.voteWeighting = 'shares';
  const result = D.optionPreference(doc, node.id);
  assert.equal(result.preferenceScore, 75);
  assert.equal(result.preferenceVoters, 2);
  assert.equal(result.preferenceTotalPower, 4);
});
test('without factual votes node manual confidence is retained', () => {
  const doc = fixture(), node = D.rootNode(doc); node.confidence = 71;
  doc.users[0].shares = 0; doc.settings.voteWeighting = 'shares';
  assert.equal(D.getBaseConfidence(doc, node).base, 71);
  D.upsertVote(doc, node.id, doc.users[0].id, 5);
  assert.equal(D.getBaseConfidence(doc, node).base, 5);
});
test('a voter can change a preference without duplicating the ballot', () => {
  const doc = fixture('decision'), node = D.addChild(doc, D.rootNode(doc).id, 'option');
  D.upsertBallot(doc, node.id, doc.users[0].id, 10);
  D.upsertBallot(doc, node.id, doc.users[0].id, 70);
  assert.equal(doc.ballots.length, 1);
  assert.equal(doc.ballots[0].preference, 70);
});
test('a voter can update but not duplicate their own vote', () => {
  const doc = fixture(), node = D.rootNode(doc);
  D.upsertVote(doc, node.id, doc.users[0].id, 20);
  D.upsertVote(doc, node.id, doc.users[0].id, 80);
  assert.equal(doc.votes.length, 1);
  assert.equal(doc.votes[0].confidence, 80);
});
test('cannot add an option outside the decision root', () => {
  const doc = fixture('decision'), root = D.rootNode(doc);
  const opt = D.addChild(doc, root.id, 'option');
  assert.throws(() => D.addChild(doc, opt.id, 'option'), /Vaihtoehto/);
  assert.equal(D.validateProject(doc).nodes.length, 2);
});
test('reparenting cannot introduce a cycle or move root', () => {
  const doc = fixture(), root = D.rootNode(doc);
  const a = child(doc, root, 'support', 80, 3), b = child(doc, a, 'support', 80, 3);
  assert.equal(D.canReparent(doc, a.id, b.id), false);
  assert.equal(D.canReparent(doc, root.id, b.id), false);
  assert.throws(() => D.moveNode(doc, a.id, b.id), /sykli/);
});
test('collapsing hides all descendants without deleting them', () => {
  const doc = fixture(), root = D.rootNode(doc);
  const a = child(doc, root, 'support', 80, 3); child(doc, a, 'support', 80, 3);
  a.collapsed = true;
  assert.equal(D.visibleNodes(doc).length, 2);
  assert.equal(doc.nodes.length, 3);
});
test('deleting a subtree removes its descendants and their votes', () => {
  const doc = fixture(), root = D.rootNode(doc);
  const a = child(doc, root, 'support', 80, 3), b = child(doc, a, 'support', 80, 3);
  D.upsertVote(doc, b.id, doc.users[0].id, 70);
  D.removeSubtree(doc, a.id);
  assert.equal(doc.nodes.length, 1);
  assert.equal(doc.votes.length, 0);
  assert.throws(() => D.removeSubtree(doc, root.id), /Juurisolmua/);
});
test('sorts decision options by their indices', () => {
  const doc = fixture('decision'), root = D.rootNode(doc);
  const good = child(doc, root, 'option', 70, 3), bad = child(doc, root, 'option', 30, 3);
  const rank = D.decisionRanking(doc);
  assert.equal(rank[0].node.id, good.id);
  assert.equal(rank[1].node.id, bad.id);
});
test('auto layout provides deterministic positions in a two-level tree', () => {
  const doc = fixture(), root = D.rootNode(doc);
  const a = child(doc, root, 'support', 80, 3), b = child(doc, root, 'oppose', 80, 3);
  D.autoLayout(doc);
  assert.ok(a.position.x > root.position.x);
  assert.ok(b.position.y > a.position.y);
  assert.equal(root.position.y, (a.position.y + b.position.y) / 2);
});
test('rejects orphan parents, missing authors, cycles, and duplicate votes', () => {
  const doc = fixture(), root = D.rootNode(doc);
  const a = child(doc, root, 'support', 80, 3);
  let broken = clone(doc); broken.nodes[1].parentId = 'not-exists';
  assert.throws(() => D.validateProject(broken), /vanhempi puuttuu/);
  broken = clone(doc); broken.nodes[1].createdBy = 'unknown';
  assert.throws(() => D.validateProject(broken), /tekijä puuttuu/);
  broken = clone(doc); broken.nodes[0].parentId = a.id; broken.nodes[0].relation = 'support';
  assert.throws(() => D.validateProject(broken), /juuri/);
  broken = clone(doc); D.upsertVote(broken, root.id, broken.users[0].id, 50); broken.votes.push(clone(broken.votes[0]));
  assert.throws(() => D.validateProject(broken), /päällekkäinen/);
});
test('rejects manipulated confidence, negative power, unknown version, and XSS-length payloads', () => {
  const doc = fixture();
  for (const mutate of [
    d => { d.nodes[0].confidence = 101; },
    d => { d.users[0].shares = -2; },
    d => { d.schemaVersion = 999; },
    d => { d.nodes[0].title = 'x'.repeat(201); },
  ]) {
    const broken = clone(doc); mutate(broken);
    assert.throws(() => D.validateProject(broken));
  }
});

test('removing an option also removes its decision ballots', () => {
  const doc = fixture('decision'), root = D.rootNode(doc);
  const opt = D.addChild(doc, root.id, 'option');
  D.upsertBallot(doc, opt.id, doc.users[0].id, 90);
  D.removeSubtree(doc, opt.id);
  assert.equal(doc.ballots.length, 0);
  assert.equal(D.validateProject(doc).nodes.length, 1);
});
test('refuses imported wrong root type and duplicate option preferences', () => {
  const doc = fixture('decision'), root = D.rootNode(doc), opt = D.addChild(doc, root.id, 'option');
  let broken = clone(doc); broken.nodes[0].kind = 'claim';
  assert.throws(() => D.validateProject(broken), /Juuren tyyppi/);
  D.upsertBallot(doc, opt.id, doc.users[0].id, 75);
  broken = clone(doc); broken.ballots.push(clone(doc.ballots[0]));
  assert.throws(() => D.validateProject(broken), /Päätösääni on päällekkäinen/);
});

test('focus computes the stance of nested rebuttals relative to the selected branch', () => {
  const doc = fixture(), root = D.rootNode(doc);
  const first = child(doc, root, 'oppose', 80, 2);
  const rebuttal = child(doc, first, 'oppose', 90, 3);
  const supportsTheObjection = child(doc, first, 'support', 90, 3);
  const underminesTheRebuttal = child(doc, rebuttal, 'oppose', 90, 3);
  const focusSupport = D.focusProjection(doc, root.id, 'support');
  assert.deepEqual([...focusSupport.matchIds], [rebuttal.id]);
  const focusOppose = D.focusProjection(doc, root.id, 'oppose');
  assert.deepEqual(new Set(focusOppose.matchIds), new Set([first.id, supportsTheObjection.id, underminesTheRebuttal.id]));
  assert.equal(D.focusProjection(doc, first.id, 'support').matchIds.has(supportsTheObjection.id), true);
  assert.equal(D.focusProjection(doc, first.id, 'oppose').matchIds.has(rebuttal.id), true);
});

test('decision options are neutral focus boundaries (claims are assessed relative to their own option)', () => {
  const doc = fixture('decision'), root = D.rootNode(doc);
  const a = child(doc, root, 'option', 50, 2);
  const b = child(doc, root, 'option', 50, 2);
  const aPro = child(doc, a, 'support', 90, 3);
  const aCon = child(doc, a, 'oppose', 90, 3);
  const bPro = child(doc, b, 'support', 90, 3);
  const support = D.focusProjection(doc, root.id, 'support');
  assert.deepEqual(new Set(support.matchIds), new Set([aPro.id, bPro.id]));
  assert.equal(support.matchIds.has(a.id), false);
  assert.equal(support.matchIds.has(b.id), false);
  assert.equal(D.focusProjection(doc, root.id, 'oppose').matchIds.has(aCon.id), true);
});

test('focus peeks through collapsed ancestors without changing collapse state or the normal view', () => {
  const doc = fixture(), root = D.rootNode(doc);
  const a = child(doc, root, 'oppose', 90, 3);
  const hiddenMatch = child(doc, a, 'oppose', 90, 3);
  const hiddenNonmatch = child(doc, a, 'support', 90, 3);
  a.collapsed = true;
  const before = JSON.stringify(doc);
  assert.equal(D.visibleNodes(doc).some(n => n.id === hiddenMatch.id), false);
  const projection = D.focusProjection(doc, root.id, 'support');
  assert.equal(projection.matchIds.has(hiddenMatch.id), true);
  assert.equal(projection.peekIds.has(hiddenMatch.id), true);
  assert.equal(projection.visibleIds.has(hiddenMatch.id), true);
  assert.equal(projection.visibleIds.has(hiddenNonmatch.id), false);
  assert.equal(JSON.stringify(doc), before);
  assert.equal(D.focusProjection(doc, root.id, 'all').visibleIds.has(hiddenMatch.id), false);
});

test('focus reveals an anchor below a collapsed ancestor and its matching descendants', () => {
  const doc = fixture(), root = D.rootNode(doc);
  const a = child(doc, root, 'support', 75, 2);
  const anchor = child(doc, a, 'oppose', 70, 4);
  const pro = child(doc, anchor, 'support', 90, 2);
  a.collapsed = true;
  const focus = D.focusProjection(doc, anchor.id, 'support');
  for (const node of [root, a, anchor, pro]) assert.equal(focus.visibleIds.has(node.id), true);
  assert.equal(focus.matchIds.has(pro.id), true);
  assert.equal(focus.matchIds.has(a.id), false);
  assert.equal(a.collapsed, true);
  assert.equal(D.visibleNodes(doc).some(n => n.id === anchor.id), false);
});

test('focus is visual only; scoring and ballots stay exactly the same', () => {
  const doc = fixture('decision'), root = D.rootNode(doc);
  const option = child(doc, root, 'option', 55, 4);
  const a = child(doc, option, 'oppose', 80, 3);
  D.upsertBallot(doc, option.id, doc.users[0].id, 70);
  D.upsertVote(doc, a.id, doc.users[0].id, 35);
  const before = JSON.stringify(doc), score = D.evaluate(doc).get(option.id).score;
  for (const mode of ['support', 'oppose', 'all']) D.focusProjection(doc, option.id, mode);
  assert.equal(JSON.stringify(doc), before);
  assert.equal(D.evaluate(doc).get(option.id).score, score);
  assert.deepEqual(D.validateProject(doc), doc);
  assert.throws(() => D.focusProjection(doc, root.id, 'invalid'), /Tuntematon/);
});
