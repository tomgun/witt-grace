'use strict';
// Reproducible native-v8 argument tree for secondary-link browser QA.
const fs=require('node:fs');
const path=require('node:path');
const Core=require('../src/core.js');
const project=Core.createBlankProject('argument');
const owner=project.users[0];
project.title='Lisayhteydet: sama perustelu useaan kohteeseen';
project.settings.assessmentWeighting='structural';
const root=Core.rootNode(project);root.title='Jarjestelma kannattaa hankkia';root.confidence=50;
const objection=Core.addChild(project,root.id,'oppose',owner.id);
objection.title='Jarjestelma on liian kallis';objection.confidence=50;objection.impact=5;
const savings=Core.addChild(project,objection.id,'oppose',owner.id);
savings.title='Saastot ylittavat kustannukset';savings.confidence=100;savings.impact=5;
const benefit=Core.addChild(project,root.id,'support',owner.id);
benefit.title='Parantaa kayttoa';benefit.confidence=100;benefit.impact=1;
// Human-readable Unicode titles, kept out of shell/source encoding assumptions.
project.title='Lis\u00e4yhteydet: sama perustelu useaan kohteeseen';
root.title='J\u00e4rjestelm\u00e4 kannattaa hankkia';
objection.title='J\u00e4rjestelm\u00e4 on liian kallis';
savings.title='S\u00e4\u00e4st\u00f6t ylitt\u00e4v\u00e4t kustannukset';
benefit.title='Parantaa k\u00e4ytt\u00f6\u00e4';
const file=path.join(__dirname,'../examples/witt-lisayhteydet-dev26.witt.json');
fs.writeFileSync(file,JSON.stringify(Core.validateProject(project),null,2)+'\n');
console.log('Created',file);
// Separate user-facing fixture contains an actual scored extra route and an
// unlinked reusable-library concept ready for drag-and-drop into the tree.
const extra=Core.addSignedLink(project,savings.id,root.id,4);
Core.upsertVote(project,savings.id,owner.id,100);
Core.upsertEdgeAssessment(project,'secondary',extra.id,owner.id,4);
Core.addReasonConcept(project,'S\u00e4\u00e4st\u00e4\u00e4 ty\u00f6aikaa','fact');
const ready=path.join(__dirname,'../examples/witt-bitberg-reititys-dev26.witt.json');
fs.writeFileSync(ready,JSON.stringify(Core.validateProject(project),null,2)+'\n');
console.log('Created',ready);
