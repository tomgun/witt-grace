'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Core=require('../src/core.js');
test('decision ranking respects distinct personal signs and does not silently use group averages',()=>{
  const p=Core.createBlankProject('decision'), root=p.nodes[0], a=p.users[0];
  const b={id:Core.uid(),name:'B',role:'editor',shares:1};p.users.push(b);
  const c={id:Core.uid(),name:'C',role:'editor',shares:1};p.users.push(c);
  const one=Core.addChild(p,root.id,'option',a.id);one.title='One';
  const two=Core.addChild(p,root.id,'option',a.id);two.title='Two';
  const reason=Core.addChild(p,one.id,'support',a.id);reason.title='Domestic provider';
  for (const user of [a,b,c]) {
    Core.upsertVote(p,reason.id,user.id,100);
  }
  Core.upsertEdgeAssessment(p,'primary',reason.id,a.id,5);
  Core.upsertEdgeAssessment(p,'primary',reason.id,b.id,-3);
  Core.upsertEdgeAssessment(p,'primary',reason.id,c.id,0);
  const ma=Core.decisionRankingForAssessor(p,a.id),mb=Core.decisionRankingForAssessor(p,b.id),mc=Core.decisionRankingForAssessor(p,c.id);
  assert.equal(ma[0].node.id,one.id,'positive importance promotes this option');
  assert.equal(mb[0].node.id,two.id,'negative importance demotes this option');
  assert.equal(mc.find(item=>item.node.id===one.id).score,50,'neutral relation has no effect on the option index');
  assert.equal(ma.every(item=>item.complete),true);
});
test('incomplete personal options are not silently ranked using another assessor and never jump ahead of feasible option',()=>{
  const p=Core.createBlankProject('decision'),root=p.nodes[0],owner=p.users[0];
  const option=Core.addChild(p,root.id,'option',owner.id);option.title='A';
  const alternative=Core.addChild(p,root.id,'option',owner.id);alternative.title='B';
  const reason=Core.addChild(p,option.id,'support',owner.id);
  // Both options start from neutral index 50; only factual reasons get credibility.
  let list=Core.decisionRankingForAssessor(p,owner.id);
  assert.equal(list[0].node.id,alternative.id,'complete score before incomplete score');
  assert.equal(list.find(it=>it.node.id===option.id).complete,false);
  Core.upsertVote(p,reason.id,owner.id,100);
  Core.upsertEdgeAssessment(p,'primary',reason.id,owner.id,5);
  list=Core.decisionRankingForAssessor(p,owner.id);
  assert.equal(list[0].node.id,option.id,'once fully assessed personal result can rank');
  const gate=Core.addChild(p,option.id,'oppose',owner.id);
  gate.semanticType='constraint';gate.constraintStatus='unmet';
  list=Core.decisionRankingForAssessor(p,owner.id);
  assert.equal(list[0].node.id,alternative.id,'hard gate outranks even fully assessed high score');
});
