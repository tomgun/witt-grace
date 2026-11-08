from pathlib import Path
import json, copy, subprocess
root=Path(__file__).resolve().parents[1]
source=json.loads((root/'schemas/project.v1.schema.json').read_text())
new=copy.deepcopy(source)
new['$id']='urn:witt:project:v2'
new['title']='WITT project interchange schema v2 (GRACE Method)'
new['description']='Shape validation for WITT v2; tree semantics, unique IDs and reference integrity are validated by src/core.js. Legacy pseudo-user fields are not authenticated votes.'
new['properties']['schemaVersion']={'const':2}
new['properties']['comments']={'type':'array','maxItems':10000,'items':{'$ref':'#/$defs/comment'}}
new['required'].insert(new['required'].index('votes'),'comments')
new['$defs']['comment']={
 'type':'object','additionalProperties':False,
 'required':['id','nodeId','body','authorName','createdAt'],
 'properties':{'id':{'$ref':'#/$defs/id'},'nodeId':{'$ref':'#/$defs/id'},'body':{'type':'string','minLength':1,'maxLength':3000},'authorName':{'type':'string','maxLength':120},'createdAt':{'type':'string','minLength':1,'maxLength':50}}
}
(root/'schemas/project.v2.schema.json').write_text(json.dumps(new,indent=2,ensure_ascii=False)+'\n')
example=subprocess.check_output(['node','-e',"const d=require('./src/core.js');const p=d.createDemoProject();d.addComment(p,p.nodes[0].id,'Which evidence supports the launch timeline?');console.log(JSON.stringify(d.validateProject(p),null,2))"],cwd=root,text=True)
# Preserve the current v3 example; this script only regenerates the historic v2 fixture.
doc=json.loads(example); doc['schemaVersion']=2;doc.pop('links',None)
(root/'examples/product-launch-v2.witt.json').write_text(json.dumps(doc,indent=2,ensure_ascii=False)+'\n')
legacy=json.loads((root/'examples/product-launch.peruste.json').read_text())
legacy['schemaVersion']=1
(root/'examples/legacy-product-launch.peruste.json').write_text(json.dumps(legacy,indent=2,ensure_ascii=False)+'\n')
print('generated historical schema v2 and v2 example (current v3 untouched)')
