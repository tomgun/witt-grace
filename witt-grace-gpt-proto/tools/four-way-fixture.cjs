const fs=require('node:fs'),path=require('node:path');
const Core=require('../src/core.js');
const p=Core.createBlankProject('argument');
p.title='WITT - 4-suuntainen rakenne (esimerkki)';
const root=Core.rootNode(p); root.title='Mihin suuntaan kehitämme tuotetta?';
const titles=['Käytettävyys','Asiakastarpeet','Tietoturva','Ylläpidettävyys','Kustannukset','Integraatiot','Saavutettavuus','Tietomalli','Suorituskyky','Markkinointi','Aikataulu','Yhteistyö'];
for(let i=0;i<12;i++){
 const child=Core.addChild(p,root.id,i%3===0?'oppose':'support',p.users[0].id);
 child.title=titles[i]+' pitää huomioida';
 for(let j=0;j<2+(i%3);j++){
  const grand=Core.addChild(p,child.id,j%2?'oppose':'support',p.users[0].id);
  grand.title=['Vaikuttaa asiakkaan kokemukseen','Riskit voidaan hallita','Kokeilu lisää tietoa','Tarvitsemme selkeät mittarit'][j];
  if(i%3===0 && j===1){
   const h=Core.addChild(p,grand.id,'oppose',p.users[0].id);
   h.title='Vastaväite kannattaa tarkistaa';
  }
 }
}
const out=path.resolve(__dirname,'../examples/four-way-tree.witt.json');
fs.writeFileSync(out,JSON.stringify(Core.validateProject(p),null,2)+'\n');
console.log('wrote',out,p.nodes.length,'nodes');
