/**
 * must: the Lehto (grove) theme stays readable in its daylight grove: text pairs reach WCAG AA 4.5:1, and the focus
 *       ring, the cards' border and the branch strokes reach 3:1 against the canvas and the cards (S-15, owner
 *       request 2026-11-12, redrawn light 2026-11-19; the decorations are beneath the cards and never lower these
 *       pairs)
 *       Every theme's secondary text (muted, subtle) and its supporting and opposing colours reach 4.5:1 on the
 *       page, card, panel and canvas backgrounds (WG-037, owner 2026-11-19, S-15: the prototype's light, paper,
 *       manuscript and ASCII greys were 2.7–4.4:1)
 * test: tests/unit/theme-contrast.test.ts (reads the `body[data-theme='grove']` token block of themes-added.css and
 *       every theme block of styles.css and themes-added.css)
 * red-against: a decorative colour pair copied from another theme that fails (a muted text of #2f9c58 on the
 *              forest surface), a selector rename that makes the parser see zero tokens and pass vacuously, a
 *              theme's grey restored to the prototype's value (light --muted #8190a7 is 3.05:1 on the page)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../../src/app/themes-added.css', import.meta.url), 'utf8');
const block = /body\[data-theme='grove'\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const tokens = new Map<string, string>();
for (const m of block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/g))
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
  assert.ok(value, `the grove block defines --${name}`);
  return value;
};

test('the parser found the grove tokens (a rename must not pass vacuously)', () => {
  assert.equal(tokens.size, 19);
  assert.equal(token('canvas'), '#e7f0da');
});

test('the WCAG ratio helper agrees with published values', () => {
  assert.equal(ratio('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(ratio('#777777', '#ffffff').toFixed(2), '4.48');
});

test('text pairs reach 4.5:1', () => {
  const pairs: [string, string][] = [
    ['ink', 'bg'],
    ['ink', 'surface'],
    ['ink', 'surface-secondary'],
    ['ink', 'panel'],
    ['ink', 'canvas'],
    ['ink', 'input'],
    ['muted', 'surface'],
    ['muted', 'panel'],
    ['subtle', 'surface'],
    ['accent-text', 'accent-soft'],
    ['green', 'green-bg'],
    ['red', 'red-bg'],
    ['option', 'option-bg'],
    ['green', 'surface'],
    ['red', 'surface'],
  ];
  for (const [fg, bg] of pairs)
    assert.ok(
      ratio(token(fg), token(bg)) >= 4.5,
      `${fg} on ${bg}: ${ratio(token(fg), token(bg)).toFixed(2)}`
    );
});

test('focus ring, borders and branch strokes reach 3:1', () => {
  for (const against of ['canvas', 'surface', 'accent-soft'])
    assert.ok(ratio(token('accent'), token(against)) >= 3, `accent on ${against}`);
  // A card's edge is its own colour, darker than the hairline `--border` of panels and fields.
  const cardBorder =
    /body\[data-theme='grove'\] \.node\[data-relation\] \{[^}]*border: 1\.5px solid (#[0-9a-f]{6});/.exec(
      css
    )?.[1];
  assert.equal(cardBorder, '#768c5e');
  for (const against of ['canvas', 'surface'])
    assert.ok(ratio(cardBorder, token(against)) >= 3, `card border on ${against}`);
  // The branch colours as the stylesheet writes them: living green, rowan red, lake blue.
  const strokes = ['edge-support', 'edge-oppose', 'edge-option'].map(
    (cls) =>
      new RegExp(`body\\[data-theme='grove'\\] \\.${cls} \\{[^}]*stroke: (#[0-9a-f]{6});`).exec(css)?.[1]
  );
  assert.deepEqual(strokes, ['#4f8a3c', '#b0572f', '#255f75']);
  for (const stroke of strokes as string[])
    assert.ok(ratio(stroke, token('canvas')) >= 3, `branch ${stroke} on canvas`);
});

test('every theme: muted, subtle, supporting and opposing text reach 4.5:1 on its backgrounds', () => {
  const sheets = [readFileSync(new URL('../../src/app/styles.css', import.meta.url), 'utf8'), css];
  const seen: string[] = [];
  // The tinted background each colour is also written on: notes on the accent tint, relation tags on their own tint.
  const TINTED: Record<string, string> = {
    muted: 'accent-soft',
    subtle: 'accent-soft',
    green: 'green-bg',
    red: 'red-bg',
  };
  for (const sheet of sheets)
    for (const m of sheet.matchAll(/body\[data-theme='([a-z-]+)'\][^{]*\{([^}]*)\}/g)) {
      const theme = new Map<string, string>();
      for (const t of (m[2] as string).matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/g))
        theme.set(t[1] as string, t[2] as string);
      if (!theme.has('muted') || !theme.has('bg')) continue;
      seen.push(m[1] as string);
      for (const fg of ['muted', 'subtle', 'green', 'red'])
        for (const bg of ['bg', 'surface', 'panel', 'canvas', TINTED[fg] as string]) {
          const a = theme.get(fg);
          const b = theme.get(bg);
          if (!a || !b) continue;
          assert.ok(ratio(a, b) >= 4.5, `${m[1]}: ${fg} ${a} on ${bg} ${b} is ${ratio(a, b).toFixed(2)}`);
        }
    }
  assert.deepEqual([...new Set(seen)].sort(), [
    'ascii',
    'bitberg',
    'comic',
    'cosmos',
    'dark',
    'grove',
    'hologram',
    'light',
    'manuscript-book',
    'manuscript-pen',
    'paper',
    'terminal',
  ]);
});
