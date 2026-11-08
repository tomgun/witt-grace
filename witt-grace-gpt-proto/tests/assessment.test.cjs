const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const fs = require('node:fs');
const path = require('node:path');

test('review order is deterministic and includes collapsed descendants regardless of view filters', () => {
  const project = C.createBlankProject('argument');
  const root = C.rootNode(project);
  const a = C.addChild(project, root.id, 'support');
  const b = C.addChild(project, a.id, 'oppose');
  C.addChild(project, root.id, 'oppose');
  a.collapsed = true;
  const expected = [root.id, a.id, b.id, project.nodes[3].id];
  assert.deepEqual(C.assessmentOrder(project), expected);
  assert.deepEqual(C.assessmentOrder(C.validateProject(project)), expected);
  assert.ok(!C.visibleNodes(project).some(n => n.id === b.id));
});

test('decision options are not truth propositions: review their reasons, not option credibility', () => {
  const project = C.createDemoProject();
  const ids = C.assessmentOrder(project);
  assert.equal(ids.length, project.nodes.filter(n => n.kind === 'claim').length);
  assert.ok(!ids.includes(C.rootNode(project).id));
  const opt = project.nodes.find(n => n.relation === 'option');
  assert.ok(!ids.includes(opt.id));
  assert.equal(C.signedInfluence(opt), null);
  assert.deepEqual(C.assessmentFields(opt), {credence:false,impact:false});
  assert.throws(() => C.applyAssessment(project, opt.id, 60), /totuususkottavuud/);
  assert.throws(() => C.upsertVote(project, opt.id, project.users[0].id, 70), /totuususkottavuud/);
  assert.equal(C.evaluate(project).get(opt.id).base, 50);
  opt.confidence=99; // This is no longer an option truth probability or score input.
  assert.equal(C.evaluate(project).get(opt.id).base, 50);
});

test('signed influence maps to existing support/oppose relation and nonnegative impact', () => {
  const project = C.createBlankProject();project.settings.assessmentWeighting='structural';
  const root = C.rootNode(project);
  const child = C.addChild(project, root.id, 'support');
  C.applyAssessment(project, child.id, 87, -5);
  assert.equal(child.confidence, 87);
  assert.equal(child.impact, 5);
  assert.equal(child.relation, 'oppose');
  assert.equal(C.signedInfluence(child), -5);
  C.applyAssessment(project, child.id, 87, 3.5);
  assert.equal(child.relation, 'support');
  assert.equal(child.impact, 3.5);
  C.applyAssessment(project, child.id, 87, 0);
  assert.equal(child.impact, 0);
  assert.equal(child.relation, 'neutral'); // zero means explicitly neutral
  assert.equal(C.signedInfluence(child), 0);
  assert.deepEqual(C.validateProject(project).nodes.find(n=>n.id===child.id), child);
});

test('credence and influence are independent; score contributions respect sign and zero', () => {
  const project = C.createBlankProject();project.settings.assessmentWeighting='structural';
  const root = C.rootNode(project);
  root.confidence=50;
  const child = C.addChild(project, root.id, 'support');
  C.applyAssessment(project, child.id, 90, 4);
  const support = C.evaluate(project).get(root.id).score;
  C.applyAssessment(project, child.id, 90, -4);
  const oppose = C.evaluate(project).get(root.id).score;
  C.applyAssessment(project, child.id, 90, 0);
  const neutral = C.evaluate(project).get(root.id).score;
  assert.ok(support > neutral);
  assert.ok(oppose < neutral);
  assert.equal(neutral, 50);
});

test('invalid assessments are rejected without mutating document', () => {
  const project = C.createBlankProject();
  const id = C.addChild(project, C.rootNode(project).id, 'oppose').id;
  const before = JSON.stringify(project);
  for (const [cred, edge] of [[-1,1],[101,1],[NaN,1],[65,-5.1],[65,Infinity],[65,null],[65,'-3']]) {
    assert.throws(() => C.applyAssessment(project, id, cred, edge));
    assert.equal(JSON.stringify(project),before);
  }
});

test('review wizard is present in toolbar and focus-only controls with accessible dialog structure', () => {
  const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  for (const id of ['assessmentDialog','btnAssess','btnAssessQuick','assessmentCredence','assessmentCredenceNumber','assessmentInfluence','btnAssessPrev','btnAssessNext','btnAssessSkip','btnAssessRestart','assessmentProgress']) {
    assert.match(html,new RegExp(`id="${id}"`));
  }
  const localization = fs.readFileSync(path.join(__dirname,'../locales/messages.psv'),'utf8');
  for (const key of ['assessmentStart','assessmentCredence','assessmentInfluence','assessmentSummary']) assert.match(localization,new RegExp(`^${key}\\|`,'m'));
});
