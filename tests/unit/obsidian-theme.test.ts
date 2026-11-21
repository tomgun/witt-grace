/**
 * must: the Obsidiaani (obsidian) theme is crisp text on black: every text pair reaches WCAG AA 4.5:1 (the ink on
 *       the page at least 15:1), the gold accent, the cards' edge and the branch strokes reach 3:1 against the
 *       canvas and the cards, and nothing in the theme blurs text or lifts surfaces (no text-shadow, no shadow, no
 *       filter); its two fonts, Cormorant Garamond and Space Grotesk, are files of the app with their OFL
 *       texts beside them, never another host's (S-15, owner 2026-11-21)
 *       The skin is kept per browser like the other special skins, and the diagram export treats it as dark
 * test: tests/unit/obsidian-theme.test.ts (reads the `body[data-theme='obsidian']` rules of themes-added.css)
 * red-against: a grey copied from a light theme for the muted text (#6b6b6b is 3.5:1 on #121212), the hairline
 *              `--border` used as the card edge (#2c2c2c is 1.4:1 on the canvas), a glow copied from Terminaali,
 *              a selector rename that makes the parser see zero tokens, a font linked from a font CDN (a request that
 *              leaves the browser), a font file named in the stylesheet but not committed, a font without its licence, `obsidian` missing from the stored skins
 *              so it reloads as the document theme, a white diagram exported from the black skin
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { createStore } from '../../src/app/store.ts';
import { DARK_APPEARANCES } from '../../src/lib/export/diagram.ts';
import { memoryStore } from '../../src/lib/storage.ts';

const css = readFileSync(new URL('../../src/app/themes-added.css', import.meta.url), 'utf8');
const rules = [...css.matchAll(/body\[data-theme='obsidian'\][^{]*\{([^}]*)\}/g)].map((m) => m[1] as string);
const tokens = new Map<string, string>();
for (const m of (rules[0] ?? '').matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/g))
  tokens.set(m[1] as string, m[2] as string);

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
const token = (name: string): string => {
  const value = tokens.get(name);
  assert.ok(value, `the obsidian block defines --${name}`);
  return value;
};

test('the parser found the obsidian tokens (a rename must not pass vacuously)', () => {
  assert.equal(tokens.size, 20);
  assert.equal(token('bg'), '#0a0a0a');
  assert.equal(token('ink'), '#ffffff');
  assert.equal(token('accent'), '#d4af37');
});

test('text pairs reach 4.5:1 and the ink on the page 15:1', () => {
  const pairs: [string, string][] = [
    ['ink', 'bg'],
    ['ink', 'surface'],
    ['ink', 'surface-secondary'],
    ['ink', 'panel'],
    ['ink', 'canvas'],
    ['ink', 'input'],
    ['muted', 'surface-secondary'],
    ['subtle', 'surface-secondary'],
    ['accent-text', 'accent-soft'],
    ['accent-text', 'surface'],
    ['option', 'option-bg'],
    ['option', 'surface'],
  ];
  for (const [fg, bg] of pairs)
    assert.ok(
      ratio(token(fg), token(bg)) >= 4.5,
      `${fg} on ${bg}: ${ratio(token(fg), token(bg)).toFixed(2)}`
    );
  assert.ok(ratio(token('ink'), token('bg')) >= 15);
  // The primary button writes the page's black on gold.
  assert.ok(ratio(token('bg'), token('accent')) >= 4.5);
});

test('the gold accent, the card edge and the branch strokes reach 3:1', () => {
  for (const against of ['canvas', 'surface', 'accent-soft'])
    assert.ok(ratio(token('accent'), token(against)) >= 3, `accent on ${against}`);
  const cardBorder =
    /body\[data-theme='obsidian'\] \.node\[data-relation\] \{[^}]*border: 1px solid (#[0-9a-f]{6});/.exec(
      css
    )?.[1];
  assert.equal(cardBorder, '#666666');
  for (const against of ['canvas', 'surface'])
    assert.ok(ratio(cardBorder, token(against)) >= 3, `card edge on ${against}`);
  const strokes = ['edge-support', 'edge-oppose', 'edge-option'].map(
    (cls) =>
      new RegExp(`body\\[data-theme='obsidian'\\] \\.${cls} \\{[^}]*stroke: (#[0-9a-f]{6});`).exec(css)?.[1]
  );
  assert.deepEqual(strokes, ['#7ad6a2', '#f2907f', '#93b9ff']);
  for (const stroke of strokes as string[])
    assert.ok(ratio(stroke, token('canvas')) >= 3, `branch ${stroke} on canvas`);
});

test('crisp: no text-shadow, glow, filter or blur anywhere in the theme', () => {
  assert.ok(rules.length >= 10, `${rules.length} obsidian rules`);
  for (const body of rules) {
    assert.doesNotMatch(body, /text-shadow|filter|blur|url\(/);
    for (const m of body.matchAll(/box-shadow:\s*([^;]*);/g))
      assert.match(m[1] as string, /^(none|0 0 0 1px var\(--accent\))$/, `box-shadow ${m[1]}`);
  }
  assert.match(rules[0] as string, /--shadow:\s*none;/);
});

test('a stored obsidian skin is kept per browser', () => {
  const kept = memoryStore();
  kept.setItem('witt-appearance-v1', 'obsidian');
  assert.equal(createStore({ store: kept, persistent: false }).get().appearance, 'obsidian');
});

test('the diagram export draws the obsidian skin with the dark palette', () => {
  assert.ok(DARK_APPEARANCES.includes('obsidian'));
});

test('the theme’s fonts are the app’s own files with their licences; no stylesheet names another host', () => {
  const faces = [...css.matchAll(/@font-face \{([^}]*)\}/g)]
    .map((m) => m[1] as string)
    .filter((body) => /'(Cormorant Garamond|Space Grotesk)'/.test(body));
  const files = faces.map(
    (body) => /src: url\('\.\/fonts\/([a-z0-9-]+\.woff2)'\) format\('woff2'\);/.exec(body)?.[1]
  );
  assert.deepEqual(files, [
    'cormorant-garamond-latin-700-normal.woff2',
    'cormorant-garamond-cyrillic-700-normal.woff2',
    'space-grotesk-latin-400-normal.woff2',
    'space-grotesk-latin-700-normal.woff2',
  ]);
  for (const file of [...(files as string[]), 'CormorantGaramond-OFL.txt', 'SpaceGrotesk-OFL.txt'])
    assert.ok(existsSync(new URL(`../../src/app/fonts/${file}`, import.meta.url)), file);
  for (const body of faces) assert.match(body, /font-display: swap;/);
  assert.match(rules[0] as string, /font-family: 'Space Grotesk',/);
  assert.match(css, /font-family: 'Cormorant Garamond', 'Iowan Old Style'/);
  for (const sheet of ['themes-added.css', 'styles.css'])
    assert.doesNotMatch(
      readFileSync(new URL(`../../src/app/${sheet}`, import.meta.url), 'utf8'),
      /url\(\s*['"]?(https?:)?\/\//
    );
});
