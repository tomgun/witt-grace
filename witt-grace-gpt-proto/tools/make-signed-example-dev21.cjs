'use strict';
const fs=require('node:fs');
const C=require('../src/core.js');
const p=C.createBlankProject('decision'),user=p.users[0].id,root=p.nodes[0];
p.title='GRACE – perustelusaldo −100…+100';root.title='Miten perustelut vaikuttavat valintaan?';
p.settings.assessmentWeighting='equal';
function option(name){const n=C.addChild(p,root.id,'option',user);n.title=name;return n;}
function reason(parent,name,confidence,impact){
 const n=C.addChild(p,parent.id,impact<0?'oppose':'support',user);n.title=name;n.confidence=confidence;n.impact=Math.abs(impact);
 C.upsertVote(p,n.id,user,confidence);C.upsertEdgeAssessment(p,'primary',n.id,user,impact);return n;
}
const o1=option('Yksi 100 % / +5 puolto → +50');reason(o1,'Vahva puolto',100,5);
const o2=option('Kaksi erillistä puoltoa → +100');reason(o2,'Ensimmäinen puolto',100,5);reason(o2,'Toinen puolto',100,5);
const o3=option('Yksi 100 % / −5 vastaperustelu → −50');reason(o3,'Vahva vastaperustelu',100,-5);
const o4=option('Täysin tasapainossa → 0');reason(o4,'Puoltava peruste',100,5);reason(o4,'Vastustava peruste',100,-5);
const o5=option('Lapsenlapsen vaikutus → +37,5');const nested=reason(o5,'Väliväite (oma uskottavuus 50 %)',50,5);reason(nested,'Vahva aliperustelu',100,5);
const o6=option('Ei arvioitu → —');
C.autoLayout(p);
const scores=C.evaluate(p);
const expected=[50,100,-50,0,37.5,0];
for(const [i,o] of [o1,o2,o3,o4,o5,o6].entries()){
 const net=C.argumentBalance(scores.get(o.id).score);if(Math.abs(expected[i]-net)>1e-8)throw Error('Bad fixture '+o.title+': '+net);
}
fs.writeFileSync('examples/perustelusaldo-dev21.witt.json',JSON.stringify(C.validateProject(p),null,2)+'\n');
console.log('Created six-option v7 signed-score sample');
