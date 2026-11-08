const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/core.js');
const Layout = require('../src/view-layout.js');
const History = require('../src/history.js');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
function example() {
  const doc = Core.createBlankProject();doc.settings.assessmentWeighting='structural';
  const a = Core.rootNode(doc);
  a.title = 'Buy system'; a.confidence = 50;
  const b = Core.addChild(doc, a.id, 'oppose');
  b.title = 'Too expensive'; b.confidence = 80; b.impact = 4;
  const c = Core.addChild(doc, b.id, 'oppose');
  c.title = 'Savings exceed costs'; c.confidence = 90; c.impact = 3;
  return {doc,a,b,c};
}
test('a claim opposes its parent and separately supports root, without duplicate credence', () => {
  const {doc,a,b,c} = example();
  const link = Core.addLink(doc, c.id, a.id, 'support', 2.5);
  assert.equal(c.parentId,b.id);
  assert.equal(c.relation,'oppose');
  assert.equal(c.confidence,90);
  assert.equal(link.relation,'support');
  assert.equal(link.impact,2.5);
  assert.equal(doc.nodes.filter(n => n.id === c.id).length,1);
  assert.equal(Core.validateProject(doc).links[0].targetId,a.id);
});
test('a secondary relation is saved, migrated independently and exported losslessly', () => {
  const {doc,a,c} = example();
  Core.addLink(doc,c.id,a.id,'support',1);
  const copy=Core.validateProject(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(copy,doc);
  assert.equal(copy.schemaVersion,Core.VERSION);
});
test('signed secondary relationships contribute to each target, without duplicating their source credence', () => {
  const {doc,a,b,c}=example();
  const before=Core.evaluate(doc).get(a.id).score;
  const link=Core.addSignedLink(doc,c.id,a.id,5);
  assert.equal(Core.signedLinkImpact(link),5);
  assert.ok(Core.evaluate(doc).get(a.id).score>before);
  Core.updateSignedLink(doc,link.id,-4);
  assert.equal(Core.signedLinkImpact(link),-4);
  assert.ok(Core.evaluate(doc).get(a.id).score<before);
  assert.equal(doc.nodes.filter(n=>n.id===c.id).length,1,'same node and same credence');
  assert.equal(Core.getBaseConfidence(doc,c).base,90);
  assert.equal(b.impact,4);
  assert.ok(Core.secondaryOverlapWarning(doc,link),'converging graph paths are signalled');
  assert.throws(()=>Core.updateSignedLink(doc,link.id,-5.1),/−5…\+5/);
});
test('reject self-links, direct parent duplicates, and duplicate cross-links', () => {
  const {doc,a,b,c}=example();
  assert.equal(Core.canAddLink(doc,c.id,c.id),false);
  assert.equal(Core.canAddLink(doc,c.id,b.id),false);
  assert.throws(() => Core.addLink(doc,c.id,b.id,'support',3),/syklin|olemassa/);
  assert.equal(Core.canAddLink(doc,c.id,a.id),true);
  Core.addLink(doc,c.id,a.id);
  assert.equal(Core.canAddLink(doc,c.id,a.id),false);
});
test('cross-links may not form directed cycles, including through primary tree', () => {
  const {doc,a,b,c}=example();
  assert.equal(Core.canAddLink(doc,a.id,c.id),false); // c->b->a exists
  assert.equal(Core.canAddLink(doc,b.id,c.id),false); // c->b exists
  Core.addLink(doc,c.id,a.id);
  const d=Core.addChild(doc,a.id,'support');
  Core.addLink(doc,d.id,c.id,'support',2);
  assert.equal(Core.canAddLink(doc,c.id,d.id),false); // d->c already
});
test('reparenting must preserve acyclicity of all primary and secondary relations', () => {
  const {doc,a,b,c}=example();
  const d=Core.addChild(doc,a.id,'support');
  Core.addLink(doc,d.id,c.id);
  assert.equal(Core.canReparent(doc,c.id,d.id),false);
  assert.throws(()=>Core.moveNode(doc,c.id,d.id),/virheellinen/);
  assert.equal(c.parentId,b.id);
});
test('all secondary link changes validate values, undo snapshot keeps links', () => {
  const {doc,a,c}=example();
  assert.throws(()=>Core.addLink(doc,c.id,a.id,'support',Infinity));
  assert.throws(()=>Core.addLink(doc,c.id,a.id,'neutral',3));
  const previous=History.snapshot(doc,{});
  const link=Core.addLink(doc,c.id,a.id,'oppose',4);
  assert.throws(()=>Core.updateLink(doc,link.id,'support',6));
  assert.equal(link.relation,'oppose');
  Core.updateLink(doc,link.id,'support',0);
  assert.equal(link.impact,0);
  assert.equal(JSON.parse(previous).project.links.length,0);
  Core.removeLink(doc,link.id);
  assert.deepEqual(doc.links,[]);
});
test('deleting a subtree removes all incoming and outgoing secondary links', () => {
  const {doc,a,b,c}=example();
  const d=Core.addChild(doc,a.id,'support');
  Core.addLink(doc,c.id,d.id,'support',1);
  Core.addLink(doc,d.id,b.id,'oppose',2);
  assert.equal(doc.links.length,2);
  Core.removeSubtree(doc,b.id);
  assert.equal(doc.links.length,0);
  assert.equal(doc.nodes.length,2);
});
test('invalid link references, duplicate IDs, cycles and bad numeric values are rejected on import', () => {
  const {doc,a,c}=example();
  const link=Core.addLink(doc,c.id,a.id);
  const badRef=structuredClone(doc); badRef.links[0].targetId='missing';
  assert.throws(()=>Core.validateProject(badRef));
  const duplicate=structuredClone(doc);duplicate.links.push({...link,id:'unique'});
  assert.throws(()=>Core.validateProject(duplicate));
  const value=structuredClone(doc);value.links[0].impact=999;
  assert.throws(()=>Core.validateProject(value));
  const cycle=structuredClone(doc);cycle.links.push({id:'bad',sourceId:a.id,targetId:c.id,relation:'oppose',impact:3});
  assert.throws(()=>Core.validateProject(cycle));
});
test('primary tree highlight is unchanged and supplemental links only affect its optional layer', () => {
  const {doc,a,c}=example();Core.addLink(doc,c.id,a.id);
  const before=JSON.stringify(doc);
  const focus=Core.focusProjection(doc,a.id,'support');
  assert.equal(focus.matchIds.has(c.id),true); // two opposing edges
  assert.equal(JSON.stringify(doc),before);
});
test('secondary connector uses finite SVG positions in every orientation', () => {
  for (const layout of ['horizontal','vertical','four-way']) {
    const from={x:50,y:20},to=layout==='four-way'?{x:50,y:520}:{x:500,y:130};
    const path=Layout.secondaryLinkPath(from,to,252,154);
    assert.match(path,/^M .* C /);
    assert.doesNotMatch(path,/NaN|Infinity|undefined/);
  }
});
test('secondary links are a separate layer with editor and touchable management controls', () => {
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
  assert.match(html,/data-layer="links"/);
  for (const id of ['linkDialog','linkTarget','linkImpact','linkAdd','existingLinks']) {
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(app,/Core\.addSignedLink/);
  assert.match(app,/Core\.removeLink/);
  assert.match(app,/Core\.updateSignedLink/);
  assert.match(app,/view\.layers\.links/);
  assert.match(html,/secondary-support-arrow/);
});

test('real v3 cost-rebuttal fixture loads without duplication', () => {
  const doc=JSON.parse(fs.readFileSync(path.join(root,'examples/cost-rebuttal-with-links.witt.json'),'utf8'));
  const normalized = Core.validateProject(doc);
  assert.equal(normalized.schemaVersion,Core.VERSION);
  assert.deepEqual(normalized.edgeAssessments, []);
  assert.deepEqual(normalized.nodes, doc.nodes);
  assert.deepEqual(normalized.links, doc.links);
  assert.equal(doc.nodes.length,3);
  assert.equal(doc.links.length,1);
  assert.equal(doc.links[0].sourceId,doc.nodes[2].id);
  assert.equal(doc.links[0].targetId,doc.nodes[0].id);
});

test('long secondary relation bends around an intermediate aligned card', () => {
  const d=Layout.secondaryLinkPath({x:700,y:100},{x:30,y:100},252,176);
  // The two bezier control points must be below the intervening cards.
  assert.match(d,/C [\d.]+ [\d.]+, [\d.]+ [\d.]+,/);
  assert.ok(Number(d.split(' C ')[1].split(' ')[1].replace(',',''))>100+176);
});

test('only current active browser draft is resumed, old keys are ignored', () => {
  const Workspace=require('../src/workspace.js');
  const data={'witt-project-v2':'unsupported old draft', [Workspace.PROJECT_KEY]:'current draft'};
  const storage={getItem:key=>data[key]||null};
  assert.ok(Workspace.hasSavedWork(storage));
  assert.equal(Workspace.rawActive(storage).key,Workspace.PROJECT_KEY);
  assert.equal(Workspace.rawActive(storage).raw,'current draft');
  delete data[Workspace.PROJECT_KEY];
  assert.equal(Workspace.hasSavedWork(storage),false);
});
