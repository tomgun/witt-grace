'use strict';
// Deliberately small, hand-calculated dev32 smoke/goldens for future PR review.
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/core.js');
const near = (actual, wanted) => assert.ok(Math.abs(actual-wanted)<1e-10, `${actual} !== ${wanted}`);

test('handoff golden: one/two perfect primary supports use neutral base and signed scale',()=>{
  const p=Core.createBlankProject('decision');
  p.settings.assessmentWeighting='structural';
  const root=Core.rootNode(p), option=Core.addChild(p,root.id,'option');
  const a=Core.addChild(p,option.id,'support');a.confidence=100;a.impact=5;
  near(Core.evaluate(p).get(option.id).score,75);
  near(Core.argumentBalance(Core.evaluate(p).get(option.id).score),50);
  const b=Core.addChild(p,option.id,'support');b.confidence=100;b.impact=5;
  near(Core.evaluate(p).get(option.id).score,100);
  near(Core.argumentBalance(Core.evaluate(p).get(option.id).score),100);
  assert.equal(Core.validateProject(structuredClone(p)).schemaVersion,8);
});

test('handoff golden: nested support propagates rather than only decorating child',()=>{
  const p=Core.createBlankProject('argument');p.settings.assessmentWeighting='structural';
  const root=Core.rootNode(p), middle=Core.addChild(p,root.id,'support'), leaf=Core.addChild(p,middle.id,'support');
  root.confidence=50;middle.confidence=50;middle.impact=5;leaf.confidence=100;leaf.impact=5;
  const before=JSON.stringify(p);
  const scores=Core.evaluate(p);
  near(scores.get(leaf.id).score,100);
  near(scores.get(middle.id).score,75);
  near(scores.get(root.id).score,68.75);
  near(Core.argumentBalance(scores.get(root.id).score),37.5);
  assert.equal(JSON.stringify(p),before,'read-only scoring must not mutate project');
});

test('handoff golden: one authored direct crosslink is an additional separately scored edge',()=>{
  const p=Core.createBlankProject('argument');p.settings.assessmentWeighting='structural';
  const root=Core.rootNode(p), middle=Core.addChild(p,root.id,'support'), leaf=Core.addChild(p,middle.id,'support');
  root.confidence=50;middle.confidence=50;middle.impact=5;leaf.confidence=100;leaf.impact=5;
  const extra=Core.addSignedLink(p,leaf.id,root.id,5);
  near(Core.evaluate(p).get(root.id).score,93.75);
  assert.equal(Core.secondaryOverlapWarning(p,extra),true,'informative duplicate-path detection only');
  near(Core.evaluate(p).get(root.id).contributions.filter(x=>x.subjectType==='secondary').length,1);
  assert.equal(Core.validateProject(structuredClone(p)).schemaVersion,8);
});

test('handoff safety: editable 100% template does not fabricate a human credibility vote',()=>{
  const p=Core.createBlankProject('argument'),root=Core.rootNode(p);
  const reason=Core.addChild(p,root.id,'support',p.users[0].id);
  reason.confidence=100;reason.impact=5;
  assert.equal(p.votes.some(x=>x.nodeId===reason.id),false);
  assert.equal(Core.evaluate(p).get(root.id).incomplete,true);
});
