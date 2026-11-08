/**
 * must: the generated catalog equals what locales/messages.psv renders to; every key exists non-empty in all nine
 *       languages; placeholders agree across languages; the prototype's vocabulary is present in Finnish (UX-11, A008)
 * test: tests/unit/i18n.test.ts
 * red-against: a hand edit to catalog.ts, a key present in fi only, a `{count}` placeholder dropped in one language
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parseCatalog, renderCatalog } from '../../scripts/generate-locales.ts';
import { LANGUAGES, MESSAGES, MESSAGE_KEYS } from '../../src/lib/i18n/catalog.ts';
import { translate, translator } from '../../src/lib/i18n/i18n.ts';

const table = readFileSync(path.join(process.cwd(), 'locales', 'messages.psv'), 'utf8');

test('catalog.ts is exactly what the table renders to', () => {
  const generated = readFileSync(path.join(process.cwd(), 'src', 'lib', 'i18n', 'catalog.ts'), 'utf8');
  assert.equal(generated, renderCatalog(parseCatalog(table)));
});

test('every key is translated, non-empty and not the raw key in all nine languages', () => {
  assert.equal(LANGUAGES.length, 9);
  assert.ok(MESSAGE_KEYS.length > 800, `keys: ${MESSAGE_KEYS.length}`);
  for (const key of MESSAGE_KEYS)
    for (const lang of LANGUAGES) {
      const text = MESSAGES[lang][key];
      assert.ok(typeof text === 'string' && text.trim(), `empty ${lang}/${key}`);
      assert.notEqual(text, key, `raw key ${lang}/${key}`);
    }
});

test('placeholders agree across languages', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of MESSAGE_KEYS) {
    const expected = placeholders(MESSAGES.fi[key]);
    for (const lang of LANGUAGES)
      assert.deepEqual(placeholders(MESSAGES[lang][key]), expected, `${lang}/${key}`);
  }
});

test("the prototype's Finnish vocabulary is the glossary", () => {
  assert.equal(translate('fi', 'modeArgument'), 'Argumentointi');
  assert.equal(translate('fi', 'modeDecision'), 'Päätös');
  const t = translator('fi');
  assert.equal(t('language'), 'Kieli');
  assert.equal(translate('en', 'modeDecision'), 'Decision');
});

test('placeholders are substituted and missing params become empty strings', () => {
  const key = MESSAGE_KEYS.find((k) => /\{count\}/.test(MESSAGES.fi[k]));
  assert.ok(key, 'a key with {count} exists');
  assert.ok(!translate('fi', key, { count: 3 }).includes('{count}'));
  assert.ok(!translate('fi', key, {}).includes('{count}'));
});
