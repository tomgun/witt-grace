const fs=require('node:fs');const path=require('node:path');
const f=path.join(__dirname,'../src/app.js');let s=fs.readFileSync(f,'utf8');
const anchor="    hero.append(explanation);\n    if(personal?.incomplete)hero.append(el('p','inline-warning',t('personalIncomplete')));";
if(!s.includes(anchor))throw Error('Could not locate exact score explanation insertion point');
const replacement=`    hero.append(explanation);
    // Explain the displayed number using the same memoized calculation as the
    // graph. Never synthesize missing personal ratings from structural defaults.
    // A secondary relationship is never silently included in this number.
    if (effective?.contributions?.length) {
      const breakdown=el('details','score-help score-breakdown');
      breakdown.append(el('summary','',t('scoreContributions')));
      const list=el('ul','score-contribution-list');
      for (const item of effective.contributions) {
        const source=project.nodes.find(n=>n.id===item.id);
        if(!source)continue;
        const missing=Boolean(item.missing);
        const impact=view.indexMode==='personal'?item.impact:
          (item.relation==='oppose'?-item.weight:item.weight);
        const rawStrength=view.indexMode==='personal'?item.score:item.strength;
        const magnitude=missing?'—':(item.magnitude??0).toFixed(2);
        const li=el('li','score-contribution');
        const button=el('button','btn quiet',source.title);
        button.type='button';button.onclick=()=>selectNode(source.id);
        const meta=el('small','',missing?t('personalIncomplete'):
          t('scoreContributionDetail',{impact:signed(impact),strength:rawStrength.toFixed(1),magnitude}));
        li.append(button,meta);list.append(li);
      }
      breakdown.append(list,el('p','inline-warning',t('linkScoreNotice')));
      hero.append(breakdown);
    }
    if(personal?.incomplete)hero.append(el('p','inline-warning',t('personalIncomplete')));`;
s=s.replace(anchor,replacement);fs.writeFileSync(f,s);
const p=path.join(__dirname,'../locales/messages.psv');let raw=fs.readFileSync(p,'utf8');
const additions=[
 ['scoreContributions','Indeksin perustelukohtainen erittely','Beiträge zum Index','Argument-by-argument index breakdown','Desglose del índice por argumentos','Détail de l’indice par argument','Вклад каждого аргумента в индекс','各论据对指数的贡献','根拠ごとの指数への寄与','논거별 지수 기여도'],
 ['scoreContributionDetail','Vaikutus {impact}/5 · uskottavuus {strength}% · laskentapaino {magnitude}','Einfluss {impact}/5 · Glaubwürdigkeit {strength}% · Gewicht {magnitude}','Influence {impact}/5 · credence {strength}% · effective weight {magnitude}','Influencia {impact}/5 · credibilidad {strength}% · peso {magnitude}','Influence {impact}/5 · crédibilité {strength}% · poids {magnitude}','Влияние {impact}/5 · достоверность {strength}% · вес {magnitude}','影响 {impact}/5 · 可信度 {strength}% · 权重 {magnitude}','影響 {impact}/5 · 確からしさ {strength}% · 重み {magnitude}','영향 {impact}/5 · 신뢰도 {strength}% · 가중치 {magnitude}']
];
for(const row of additions){if(raw.includes('\n'+row[0]+'|'))throw Error('Duplicate key: '+row[0]);raw+='\n'+row.join('|');}
raw=raw.replace(/\n\n+/g,'\n');fs.writeFileSync(p,raw.endsWith('\n')?raw:raw+'\n');
