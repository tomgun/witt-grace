// Translation lookup. Finnish is the source language and the fallback; a missing key returns the key itself, which the
// coverage test forbids in shipped UI. Locale persistence is the caller's business (src/lib/storage), not this module's.
import { LANGUAGES, MESSAGES } from './catalog.ts';
import type { Language, MessageKey } from './catalog.ts';

export type { Language, MessageKey };
export { LANGUAGES };

export const DEFAULT_LANGUAGE: Language = 'fi';
export const isLanguage = (value: unknown): value is Language => LANGUAGES.includes(value as Language);

export type Params = Record<string, string | number>;

/** Translate `key` in `language`, substituting `{name}` placeholders from `params`. */
export function translate(language: Language, key: MessageKey, params?: Params): string {
  const text = MESSAGES[language][key] ?? MESSAGES[DEFAULT_LANGUAGE][key] ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? '')) : text;
}
/** A translator bound to one language, the shape components receive. */
export const translator =
  (language: Language) =>
  (key: MessageKey, params?: Params): string =>
    translate(language, key, params);
export type Translator = ReturnType<typeof translator>;

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
