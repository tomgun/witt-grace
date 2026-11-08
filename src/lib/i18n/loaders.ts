// Generated from locales/messages.psv by scripts/generate-locales.ts. Edit the table, not this file.
import type { Language, Messages } from './catalog.ts';
export const loaders: Record<Language, () => Promise<{ default: Messages }>> = {
  'fi': () => import('./messages/fi.ts'),
  'de': () => import('./messages/de.ts'),
  'en': () => import('./messages/en.ts'),
  'es': () => import('./messages/es.ts'),
  'fr': () => import('./messages/fr.ts'),
  'ru': () => import('./messages/ru.ts'),
  'zh-Hans': () => import('./messages/zh-Hans.ts'),
  'ja': () => import('./messages/ja.ts'),
  'ko': () => import('./messages/ko.ts'),
};
