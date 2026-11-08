// must: src/lib/i18n/catalog.ts (languages, keys, Finnish) and src/lib/i18n/messages/<lang>.ts (one map per language)
//       are generated from locales/messages.psv — one reviewable table, nine languages — and every row is complete;
//       the generated files are committed and a test asserts they are in sync
// test: scripts/generate-locales.ts (npm run i18n); tests/unit/i18n.test.ts
// red-against: a key added to one language only, a duplicate key, a generated file edited by hand
// Exit codes: 0 ok · 1 the table is inconsistent · 2 the table cannot be read.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const LANGUAGES = ['fi', 'de', 'en', 'es', 'fr', 'ru', 'zh-Hans', 'ja', 'ko'] as const;

export interface Catalog {
  langs: string[];
  keys: string[];
  messages: Record<string, Record<string, string>>;
}

export function parseCatalog(text: string): Catalog {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split('|'));
  const [header, ...body] = rows;
  const langs = (header ?? []).slice(1);
  if (JSON.stringify(langs) !== JSON.stringify(LANGUAGES))
    throw new Error('Language order/coverage differs from the nine locales');
  const messages: Record<string, Record<string, string>> = Object.fromEntries(
    langs.map((lang) => [lang, {}])
  );
  const keys = new Set<string>();
  for (const [key = '', ...texts] of body) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid translation key: ${key}`);
    if (keys.has(key)) throw new Error(`Duplicate translation key: ${key}`);
    if (texts.length !== langs.length || texts.some((v) => !v.trim()))
      throw new Error(`Incomplete translation row: ${key}`);
    keys.add(key);
    langs.forEach((lang, i) => {
      (messages[lang] as Record<string, string>)[key] = texts[i] as string;
    });
  }
  return { langs, keys: [...keys], messages };
}

const HEADER = `// Generated from locales/messages.psv by scripts/generate-locales.ts. Edit the table, not this file.\n`;

/** The small always-loaded module: languages, the typed key list and Finnish (the source language and fallback). */
export function renderCatalog({ langs, keys, messages }: Catalog): string {
  return (
    HEADER +
    `export const LANGUAGES = ${JSON.stringify(langs)} as const;\n` +
    `export type Language = (typeof LANGUAGES)[number];\n` +
    `export const MESSAGE_KEYS = ${JSON.stringify(keys)} as const;\n` +
    `export type MessageKey = (typeof MESSAGE_KEYS)[number];\n` +
    `export type Messages = Record<MessageKey, string>;\n` +
    `export const FI: Messages = ${JSON.stringify(messages.fi)};\n`
  );
}
/** One lazily loaded module per language. */
export function renderLanguage({ messages }: Catalog, lang: string): string {
  return (
    HEADER +
    `import type { Messages } from '../catalog.ts';\nconst messages: Messages = ${JSON.stringify(messages[lang])};\nexport default messages;\n`
  );
}
/** Explicit import map so the bundler can split one chunk per language. */
export function renderLoaders({ langs }: Catalog): string {
  return (
    HEADER +
    `import type { Language, Messages } from './catalog.ts';\n` +
    `export const loaders: Record<Language, () => Promise<{ default: Messages }>> = {\n` +
    langs.map((lang) => `  '${lang}': () => import('./messages/${lang}.ts'),`).join('\n') +
    `\n};\n`
  );
}

const root = process.cwd();
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  let text = '';
  try {
    text = readFileSync(path.join(root, 'locales', 'messages.psv'), 'utf8');
  } catch (error) {
    console.error(`generate-locales: cannot read locales/messages.psv — ${(error as Error).message}`);
    process.exit(2);
  }
  try {
    const catalog = parseCatalog(text);
    const dir = path.join(root, 'src', 'lib', 'i18n');
    mkdirSync(path.join(dir, 'messages'), { recursive: true });
    writeFileSync(path.join(dir, 'catalog.ts'), renderCatalog(catalog));
    writeFileSync(path.join(dir, 'loaders.ts'), renderLoaders(catalog));
    for (const lang of catalog.langs)
      writeFileSync(path.join(dir, 'messages', `${lang}.ts`), renderLanguage(catalog, lang));
    console.log(`generate-locales: ${catalog.keys.length} keys × ${catalog.langs.length} languages`);
  } catch (error) {
    console.error(`generate-locales: ${(error as Error).message}`);
    process.exit(1);
  }
}
