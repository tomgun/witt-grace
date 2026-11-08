const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const I18n = require('../src/i18n.js');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');

const referenced = new Set([
  ...[...html.matchAll(/data-i18n(?:-title|-placeholder|-aria)?="([^"]+)"/g)].map(match => match[1]),
  ...[...app.matchAll(/\bt\(\s*['"]([A-Za-z][A-Za-z0-9]*)['"]/g)].map(match => match[1])
]);

test('all static UI translation keys exist in all nine languages', () => {
  for (const key of referenced) for (const lang of I18n.languages) {
    assert.ok(Object.hasOwn(I18n.messages[lang], key), `Missing ${lang}/${key}`);
    assert.ok(I18n.messages[lang][key].trim(), `Empty ${lang}/${key}`);
    assert.notEqual(I18n.messages[lang][key], key, `Raw UI key ${lang}/${key}`);
  }
});

test('keyboard help displays actual instructions instead of raw i18n keys', () => {
  const keys = ['shortcutNavigation', 'shortcutEditing', 'shortcutAdding', 'shortcutContext', 'shortcutOther'];
  for (const lang of I18n.languages) {
    I18n.setLocale(lang);
    for (const key of keys) {
      assert.ok(html.includes(`data-i18n="${key}"`), `Missing HTML marker ${key}`);
      assert.notEqual(I18n.t(key), key, `Keyboard help leaks ${lang}/${key}`);
      assert.match(I18n.t(key), /[A-Za-z0-9]/, `Keyboard help is not actionable: ${lang}/${key}`);
    }
  }
  I18n.setLocale('fi');
});
