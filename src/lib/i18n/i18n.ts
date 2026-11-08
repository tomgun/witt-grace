// Translation lookup. Finnish is the source language, always loaded, and the fallback; the other eight languages load
// on demand (one chunk each). A missing key returns the key itself, which the coverage test forbids in shipped UI.
import { FI, LANGUAGES } from './catalog.ts';
import type { Language, MessageKey, Messages } from './catalog.ts';
import { loaders } from './loaders.ts';

export type { Language, MessageKey, Messages };
export { LANGUAGES, FI };

export const DEFAULT_LANGUAGE: Language = 'fi';
export const isLanguage = (value: unknown): value is Language => LANGUAGES.includes(value as Language);

export type Params = Record<string, string | number>;

/** Translate `key` from a loaded message map, substituting `{name}` placeholders from `params`; Finnish fills gaps. */
export function translate(messages: Messages, key: MessageKey, params?: Params): string {
  const text = messages[key] ?? FI[key] ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? '')) : text;
}
/** A translator bound to one loaded language, the shape components receive. */
export const translator =
  (messages: Messages) =>
  (key: MessageKey, params?: Params): string =>
    translate(messages, key, params);
export type Translator = ReturnType<typeof translator>;

const cache = new Map<Language, Messages>([['fi', FI]]);
/** Load a language's messages once; later calls resolve from the cache. */
export async function loadMessages(language: Language): Promise<Messages> {
  const cached = cache.get(language);
  if (cached) return cached;
  const module = await loaders[language]();
  cache.set(language, module.default);
  return module.default;
}

export const LANGUAGE_NAMES: Record<Language, string> = {
  fi: 'Suomi',
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  ru: 'Русский',
  'zh-Hans': '简体中文',
  ja: '日本語',
  ko: '한국어',
};
