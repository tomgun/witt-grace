// Figures on screen as the reader's language writes them (WG-045, owner 2026-11-19, UI_INVENTORY S-15): a decimal
// comma in Finnish, German, Spanish, French and Russian, and one minus sign (−, U+2212) instead of the hyphen in
// every language. The formatters of derive.ts, format.ts and the components build a figure with a point and a
// hyphen, as JavaScript does, and pass it through `fig` last. Files, exports and AI tasks are built elsewhere
// (src/domain, src/lib) and keep the point and the hyphen: they are data, and byte-equal to the prototype's.
import type { Language } from '../lib/i18n/i18n.ts';

export interface NumberStyle {
  decimal: '.' | ',';
  minus: '-' | '−';
}
/** As JavaScript prints numbers. The style until the browser entry sets the reader's, and so in unit tests. */
export const PLAIN_NUMBERS: NumberStyle = { decimal: '.', minus: '-' };
const DECIMAL_COMMA: ReadonlySet<Language> = new Set<Language>(['fi', 'de', 'es', 'fr', 'ru']);

export const numberStyleOf = (language: Language): NumberStyle => ({
  decimal: DECIMAL_COMMA.has(language) ? ',' : '.',
  minus: '−',
});

/** Rewrites the figures inside a text: a point between two digits is the decimal sign, a hyphen straight before a
 * digit and not after a letter or a digit is a minus (so "−5…+5", "3-4" and "direct-reasons-v1" stay as they are). */
export function withNumberStyle(text: string, style: NumberStyle): string {
  let out = text;
  if (style.minus !== '-') out = out.replace(/(^|[^\p{L}\p{N}])-(?=\d)/gu, `$1${style.minus}`);
  if (style.decimal !== '.') out = out.replace(/(\d)\.(?=\d)/g, `$1${style.decimal}`);
  return out;
}

let current: NumberStyle = PLAIN_NUMBERS;
/** Set once at start and on every language change by the browser entry (main.tsx). */
export function setNumberLanguage(language: Language): void {
  current = numberStyleOf(language);
}
/** A formatted figure, or a short text holding figures, in the reader's style. */
export const fig = (text: string): string => withNumberStyle(text, current);
