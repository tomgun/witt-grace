'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
const localizations = require(path.join(root, 'src/i18n.js'));

test('file input is outside the editor-only shell so home page picker works', () => {
  const input = html.indexOf('id="fileInput"');
  const shell = html.indexOf('class="app-shell"');
  assert.ok(input > html.indexOf('<body') && input < shell);
  assert.equal((html.match(/id="fileInput"/g) || []).length, 1);
  assert.match(js, /\$\('btnHomeOpen'\)\.onclick = chooseFile/);
  assert.match(js, /\$\('btnOpen'\)\.onclick = chooseFile/);
});

test('import and destructive actions do not depend on browser confirm dialogs', () => {
  assert.doesNotMatch(js, /\b(?:window\.)?confirm\s*\(/);
  assert.doesNotMatch(js, /\b(?:window\.)?alert\s*\(/);
  assert.doesNotMatch(js, /\b(?:window\.)?prompt\s*\(/);
  assert.match(html, /id="confirmDialog"/);
  assert.match(html, /id="confirmCancel" value="cancel"/);
  assert.match(html, /id="confirmAccept" value="confirm"/);
  assert.doesNotMatch(html, /<form\s+method="dialog"/);
  assert.match(js, /\$\('confirmCancel'\)\.onclick = \(\) => \$\('confirmDialog'\)\.close\('cancel'\)/);
  assert.match(js, /\$\('confirmAccept'\)\.onclick = \(\) => \$\('confirmDialog'\)\.close\('confirm'\)/);
  assert.match(js, /\$\('textAccept'\)\.onclick =/);
  assert.match(js, /\$\('noticeClose'\)\.onclick =/);
  assert.match(html, /id="noticeDialog"/);
  assert.match(html, /id="textDialog"/);
  assert.match(js, /await prepareReplacement\(t\('importConfirm'/);
  assert.match(js, /await askConfirm\(t\('deleteSubtreeConfirm'/);
});

test('edit menu, lower zone and context menu use one undoable subtree deletion command', () => {
  assert.match(js, /function deleteNode\(nodeId\)/);
  assert.match(js, /Core\.removeSubtree\(project,nodeId\)/);
  assert.match(js, /add\(t\('deleteSubtree'\), \(\) => deleteNode\(nodeId\)/);
  assert.match(js, /\$\(id\)\.onclick=\(\)=>deleteNode\(selectedId\)/);
});

test('full claim title is readable without entering inline edit mode', () => {
  assert.match(js, /'nodeTitle', 'textarea'/);
  assert.match(js, /autoGrow: true/);
  assert.match(css, /#nodeTitle\.field-autogrow/);
  assert.match(js, /previewClaimOn\(nodeEl, node, title\)/);
  assert.match(js, /previewClaimOn\(button, node, outlineText\)/);
  assert.match(html, /id="claimPreviewText"/);
});

test('a visible, optional shortcut to the evaluation fields exists in mapping mode', () => {
  assert.match(js, /view\.workflow !== 'evaluate'/);
  assert.match(js, /t\('evaluationHint'\)/);
  assert.match(js, /view\.workflow = 'evaluate'/);
  assert.match(js, /'nodeConfidence'/);
  assert.match(js, /'nodeImpact'/);
});

test('new dialog and evaluation captions are translated in every UI language', () => {
  for (const lang of localizations.languages) {
    for (const key of ['confirmationTitle','confirmContinue','noticeTitle','evaluationHint']) {
      assert.equal(typeof localizations.messages[lang]?.[key], 'string', `${lang}:${key}`);
      assert.ok(localizations.messages[lang][key].length > 0, `${lang}:${key}`);
    }
  }
});
