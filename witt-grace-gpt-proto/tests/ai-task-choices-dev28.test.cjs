'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const AIDraft = require('../src/ai-draft-v2.js');
const Contributions = require('../src/contributions.js');
const Core = require('../src/core.js');

test('both AI workflows present only two equivalent task actions; schema is opt-in', () => {
  for (const prefix of ['aiDraft', 'aiReview']) {
    const advanced = prefix === 'aiDraft' ? 'aiDraftAdvanced' : 'aiReviewAdvanced';
    const status = `${prefix}TaskStatus`;
    assert.match(html, new RegExp(`<details id="${advanced}"[^>]*>`));
    assert.match(html, new RegExp(`<p id="${status}"[^>]*role="status"[^>]*aria-live="polite"`));
  }
  const draft = html.slice(html.indexOf('id="aiDraftPromptStep"'), html.indexOf('id="aiDraftImportStep"'));
  assert.ok(draft.indexOf('id="btnAICopy"') < draft.indexOf('id="btnAIDownloadPrompt"'));
  assert.ok(draft.indexOf('id="btnAIDownloadPrompt"') < draft.indexOf('id="btnAIDownloadSchema"'));
  const review = html.slice(html.indexOf('id="btnAIReviewExport"') - 240, html.indexOf('id="aiReviewTaskStatus"'));
  assert.match(review, /data-i18n="aiTaskDownloadSame"/);
  assert.match(review, /data-i18n="aiTaskCopy"/);
  assert.match(app, /'aiDraftPromptPreviewDetails'\)\.open=true/);
  assert.match(app, /'aiReviewPromptPreviewDetails'\)\.open=true/);
  // Failure must not place a task in the IMPORT-response field.
  const copy = app.match(/\$\('btnAIReviewCopy'\)\.onclick[\s\S]*?\$\('aiReviewMode'\)\.onchange/)[0];
  assert.doesNotMatch(copy, /'aiReviewPaste'\)\.value=/);
});

test('standalone draft task includes schema, response example and user topic', () => {
  const task = AIDraft.buildTask({mode:'argument',topic:'Ostetaanko lämpöpumppu?',language:'fi'});
  assert.ok(task.includes('Ostetaanko lämpöpumppu?'));
  assert.ok(task.includes('JSON SCHEMA'));
  assert.ok(task.includes('"format": "witt-ai-draft-v2"'));
  assert.ok(task.includes(JSON.stringify(AIDraft.schema,null,2)));
  assert.ok(task.includes('Cross-links also contribute'));
});

test('existing-tree AI task embeds its schema: separate JSON download is optional', () => {
  const project = Core.createBlankProject('argument');
  const req = Contributions.makeRequest(project, Core, 'extend', 'fi');
  const task = Contributions.makePrompt(req);
  assert.ok(task.includes('JSON schema for your response'));
  assert.ok(task.includes(JSON.stringify(Contributions.schema,null,2)));
  assert.ok(task.includes('Full current document and request follows:'));
  assert.ok(task.includes(project.id));
});
