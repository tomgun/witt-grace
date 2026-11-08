'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const Core=require('../src/core.js'),AI=require('../src/ai-roundtrip.js');
test('comment authorId remains linked to actual local profile even after rename; no forged actor',()=>{
 const p=Core.createBlankProject(),a=p.users[0];
 const person={id:Core.uid(),name:'Nimimerkki A',role:'editor',shares:1};p.users.push(person);
 const c=Core.addComment(p,p.nodes[0].id,'Comment example',person.name,person.id);
 assert.equal(c.authorId,person.id);
 person.name='Nimimerkki B';
 assert.equal(Core.validateProject(p).comments[0].authorId,person.id);
 assert.throws(()=>Core.removeLocalProfile(p,person.id),/Kommentin kirjoittajaprofiilia/);
 assert.throws(()=>Core.addComment(p,p.nodes[0].id,'Forgery','Someone else','missing-id'),/tekija.*puuttuu|tekijätunniste puuttuu/iu);
 const forged=structuredClone(p);forged.comments[0].authorId='unknown-id';
 assert.throws(()=>Core.validateProject(forged),/Kommentin tunniste/);
});
test('AI-origin comments have stable reviewer ID, not just editable name prefix',()=>{
 const p=Core.createBlankProject(); const request=AI.makeRequest(p,Core);
 const r={format:AI.RESPONSE_FORMAT,projectId:p.id,baseFingerprint:request.baseFingerprint,assessor:'Model',comments:[{nodeId:p.nodes[0].id,body:'Check assumption'}]};
 const result=AI.prepareMerge(p,r,Core).project;
 const ai=result.users.find(Core.isAIProfile);
 assert.equal(result.comments[0].authorId,ai.id);
 ai.name='New label';
 assert.equal(Core.validateProject(result).comments[0].authorId,ai.id);
});
