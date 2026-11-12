/**
 * must: the Lehto (grove) theme stays readable on its dark forest: text pairs reach WCAG AA 4.5:1, and the focus
 *       ring, card borders and branch strokes reach 3:1 against the canvas and the cards (S-15, owner request
 *       2026-11-12; the decorations are beneath the cards and never lower these pairs)
 * test: tests/unit/theme-contrast.test.ts (reads the `body[data-theme='grove']` token block of themes-added.css)
 * red-against: a decorative colour pair copied from another theme that fails (a muted text of #2f9c58 on the
 *              forest surface), a selector rename that makes the parser see zero tokens and pass vacuously
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
  assert.equal(token('canvas'), '#06100a');
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
  for (const against of ['canvas', 'surface'])
    assert.ok(ratio(token('border'), token(against)) >= 3, `border on ${against}`);
  for (const stroke of ['#8fc46a', '#e0905f', token('option')])
    assert.ok(ratio(stroke, token('canvas')) >= 3, `branch ${stroke} on canvas`);
});
