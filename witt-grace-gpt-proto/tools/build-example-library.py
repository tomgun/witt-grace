#!/usr/bin/env python3
"""Rebuild the offline example library from the single canonical JSON examples."""
import json, pathlib
base=pathlib.Path(__file__).resolve().parents[1]
entries=[('painonhallinta','Painonhallinta: mikä on kestävä tapa?','Liikunta, nälkä, ruoan mieluisuus, aika ja yksilöllinen sopivuus.'),('etatyomalli','Etä- ja lähityö: yhteinen työskentelymalli','Kolmen toimistopäivän mallia arvioivat eri työtilanteissa olevat.'),('kaupunkiliikenne','Kaupunkiliikenne: keskustan läpiajo','Asukkaan, yrittäjän ja esteettömyyden näkökulmat.'),('tekoalykehitys','Tekoälyagentit ohjelmistokehityksessä','Tuottavuuden, tietoturvan ja toimitusvastuun vertailu.'),('pilvialusta','Päätöksenteko: pilvialustan valinta','Kolme arvioijaa, faktat ja arvostukset, erisuuntaiset vaikutukset sekä reunaehdot.')]
examples=[]
for key,title,description in entries:
    path=f'debate-{key}.witt.json'
    p=json.loads((base/'examples'/path).read_text(encoding='utf-8'))
    examples.append(dict(id=key,title=title,description=description,filename=path,project=p))
text='''/* Generated offline from examples/debate-*.witt.json. All data is fictional. */\n(function(root,factory){const api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;if(root)root.WittExamples=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){"use strict";\nconst samples='''+json.dumps(examples,ensure_ascii=False,separators=(',',':'))+''';\nfunction list(){return samples.map(({project,...rest})=>({...rest,participants:project.users.map(u=>u.name),nodeCount:project.nodes.length}));}\nfunction get(id){const s=samples.find(v=>v.id===id);return s?JSON.parse(JSON.stringify(s.project)):null;}return {list,get};\n});\n'''
(base/'src/examples.js').write_text(text,encoding='utf-8')
print('Updated',len(examples),'offline examples')
