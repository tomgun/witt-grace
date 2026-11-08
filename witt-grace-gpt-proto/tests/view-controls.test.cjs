const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
const core = require('../src/core.js');

test('view and focus controls exist with unique IDs and accessible labels', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate HTML IDs');
  for (const id of ['viewPreset', 'btnLayers', 'layersPanel', 'focusAll', 'focusSupport', 'focusOppose', 'btnFocusAnchor', 'focusAnchorText', 'focusSummary']) {
    assert.ok(ids.includes(id), `${id} is missing from index.html`);
    assert.ok(app.includes(`$('${id}')`) || (id.startsWith('focus') && app.includes('[data-focus]')), `${id} has no UI binding`);
  }
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /aria-label="Korostettavat argumentit"/);
});

test('all optional layer controls exist and none controls the claim text', () => {
  const layers = [...html.matchAll(/data-layer="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(new Set(layers), new Set(['labels', 'details', 'index', 'assessments', 'confidence', 'impact', 'comments', 'counts', 'links']));
  assert.equal(layers.length, 9);
  assert.match(app, /node-title', node\.title/);
  assert.doesNotMatch(html, /data-layer="title"/);
});

test('current demo remains a valid v3 JSON file and focus changes do not affect its serialization', () => {
  const demo = core.createDemoProject();
  const before = JSON.stringify(demo);
  for (const mode of ['support', 'oppose', 'all']) core.focusProjection(demo, core.rootNode(demo).id, mode);
  assert.equal(JSON.stringify(demo), before);
  assert.equal(demo.schemaVersion,core.VERSION);
  assert.deepEqual(core.validateProject(JSON.parse(before)), demo);
});
