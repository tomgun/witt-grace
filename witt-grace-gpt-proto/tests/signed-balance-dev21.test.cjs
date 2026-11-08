'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../src/core.js');
const eq=(value,expected)=>assert.ok(Math.abs(value-expected)<1e-8,`${value} != ${expected}`);
const fixture=()=>{
 const p=C.createBlankProject('decision');p.settings.assessmentWeighting='structural';
 const o=C.addChild(p,p.nodes[0].id,'option',p.users[0].id);
 return {p,o};
};
const add=(p,parent,confidence,impact)=>{
 const c=C.addChild(p,parent.id,impact<0?'oppose':'support',p.users[0].id);
 c.confidence=confidence;c.impact=Math.abs(impact);return c;
};
const balance=(p,id)=>C.argumentBalance(C.evaluate(p).get(id).score);

test('signed display: neutral 0, full support +50, 2 supports +100, 2 objections -100',()=>{
 const {p,o}=fixture();eq(balance(p,o.id),0);
 add(p,o,100,5);eq(balance(p,o.id),50);
 add(p,o,100,5);eq(balance(p,o.id),100);
 const x=fixture();add(x.p,x.o,100,-5);eq(balance(x.p,x.o.id),-50);
 add(x.p,x.o,100,-5);eq(balance(x.p,x.o.id),-100);
 const y=fixture();add(y.p,y.o,100,5);add(y.p,y.o,100,-5);eq(balance(y.p,y.o.id),0);
});

test('signed display: low credence support is STILL positive, it does not become objection',()=>{
 const {p,o}=fixture();
 add(p,o,20,5);
 eq(balance(p,o.id),10); // raw 55 is displayed +10, not -60
 eq(C.argumentBalance(20),-60); // underlying child's credibility is 20, not its signed net contribution
});

test('signed display: negative and positive scores retain depth-3 propagation',()=>{
 const {p,o}=fixture();
 const b=add(p,o,50,5),c=add(p,b,100,5);
 eq(balance(p,c.id),100);
 eq(balance(p,b.id),50);
 eq(balance(p,o.id),37.5); // raw 68.75
 c.confidence=0;
 eq(balance(p,b.id),0);
 eq(balance(p,o.id),25); // raw 62.5
});

test('signed display: null and invalid scores stay missing; 0 is actual neutrality',()=>{
 assert.equal(C.argumentBalance(null),null);
 assert.equal(C.argumentBalance(undefined),null);
 assert.equal(C.argumentBalance(NaN),null);
 assert.equal(C.argumentBalance(Infinity),null);
 eq(C.argumentBalance(50),0);
 eq(C.argumentBalance(0),-100);
 eq(C.argumentBalance(100),100);
});

test('signed display: DOM, voting background and visual export use common result formatter',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 assert.match(app,/function balanceText\(/);
 assert.match(app,/const resultText = \(node, result, digits=1\)/);
 assert.match(app,/balanceText\(result.score,digits\)/);
 assert.match(app,/t\('voteArgumentResult',\{score:resultText\(/);
 assert.match(app,/layers.index&&Core.indexAssessable\(n\)\)chips.push\(`\$\{t\('indexChip'\)\}: \$\{resultText\(n,result,0\)\}`\)/);
 assert.match(app,/ai-option-score',score\)/);
 assert.match(app,/balanceDeltaText\(effect.delta/);
 assert.doesNotMatch(app,/option\.score\.toFixed\(1\)/);
});
