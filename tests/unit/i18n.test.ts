/**
 * must: the generated catalog, loaders and per-language modules equal what locales/messages.psv renders to; every key
 *       exists non-empty in all nine languages; placeholders agree across languages; the prototype's vocabulary is
 *       present in Finnish (UX-11, A008)
 * test: tests/unit/i18n.test.ts
 * red-against: a hand edit to a generated file, a key present in fi only, a `{count}` placeholder dropped in one language
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  parseCatalog,
  renderCatalog,
  renderLanguage,
  renderLoaders,
} from '../../scripts/generate-locales.ts';
import { FI, LANGUAGES, MESSAGE_KEYS } from '../../src/lib/i18n/catalog.ts';
import { loadMessages, translate, translator } from '../../src/lib/i18n/i18n.ts';

const root = process.cwd();
const catalog = parseCatalog(readFileSync(path.join(root, 'locales', 'messages.psv'), 'utf8'));
const generated = (...parts: string[]) =>
  readFileSync(path.join(root, 'src', 'lib', 'i18n', ...parts), 'utf8');

test('the generated files are exactly what the table renders to', () => {
  assert.equal(generated('catalog.ts'), renderCatalog(catalog));
  assert.equal(generated('loaders.ts'), renderLoaders(catalog));
  for (const lang of catalog.langs)
    assert.equal(generated('messages', `${lang}.ts`), renderLanguage(catalog, lang));
});

test('every key is translated, non-empty and not the raw key in all nine languages', async () => {
  assert.equal(LANGUAGES.length, 9);
  assert.ok(MESSAGE_KEYS.length > 800, `keys: ${MESSAGE_KEYS.length}`);
  for (const lang of LANGUAGES) {
    const messages = await loadMessages(lang);
    for (const key of MESSAGE_KEYS) {
      const text = messages[key];
      assert.ok(typeof text === 'string' && text.trim(), `empty ${lang}/${key}`);
      assert.notEqual(text, key, `raw key ${lang}/${key}`);
    }
  }
});

test('placeholders agree across languages', async () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const lang of LANGUAGES) {
    const messages = await loadMessages(lang);
    for (const key of MESSAGE_KEYS)
      assert.deepEqual(placeholders(messages[key]), placeholders(FI[key]), `${lang}/${key}`);
  }
});

test("the prototype's Finnish vocabulary is the glossary; other languages load on demand", async () => {
  assert.equal(translate(FI, 'modeArgument'), 'Argumentointi');
  assert.equal(translate(FI, 'modeDecision'), 'Päätös');
  const t = translator(FI);
  assert.equal(t('language'), 'Kieli');
  const en = await loadMessages('en');
  assert.equal(translate(en, 'modeDecision'), 'Decision');
  assert.equal(await loadMessages('en'), en, 'cached');
});

test('placeholders are substituted and missing params become empty strings', () => {
  const key = MESSAGE_KEYS.find((k) => /\{count\}/.test(FI[k]));
  assert.ok(key, 'a key with {count} exists');
  assert.ok(!translate(FI, key, { count: 3 }).includes('{count}'));
  assert.ok(!translate(FI, key, {}).includes('{count}'));
});
