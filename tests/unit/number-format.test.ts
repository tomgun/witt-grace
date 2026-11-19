/**
 * must: figures on screen follow the reader's language: a decimal comma in fi, de, es, fr and ru, a point in en,
 *       zh-Hans, ja and ko, and a true minus sign (−) in all nine; only figures change: ranges, version names and
 *       hyphenated words keep their hyphens, thousands are not grouped, and "—" for a missing value is untouched;
 *       until a language is set the formatters print as JavaScript does, which is what files and exports carry
 *       (WG-045, owner 2026-11-19, UI_INVENTORY S-15)
 * test: tests/unit/number-format.test.ts
 * red-against: every point replaced (a sentence's full stop turned into a comma, "v1.2" broken), the hyphen of
 *              "direct-reasons-v1" or "3-4" turned into a minus, the missing-value dash treated as a minus, a
 *              language left out of the comma set
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { balanceText, credencePercentText, signed } from '../../src/app/derive.ts';
import {
  PLAIN_NUMBERS,
  fig,
  numberStyleOf,
  setNumberLanguage,
  withNumberStyle,
} from '../../src/app/numberFormat.ts';
import { LANGUAGES } from '../../src/lib/i18n/i18n.ts';

const FI = numberStyleOf('fi');
const EN = numberStyleOf('en');

test('the nine languages: comma in five, point in four, a true minus in all', () => {
  assert.deepEqual(
    LANGUAGES.map((l) => `${l}:${numberStyleOf(l).decimal}${numberStyleOf(l).minus}`),
    ['fi:,−', 'de:,−', 'en:.−', 'es:,−', 'fr:,−', 'ru:,−', 'zh-Hans:.−', 'ja:.−', 'ko:.−']
  );
});

test('figures change, words and punctuation do not', () => {
  assert.equal(withNumberStyle('-30.8 †', FI), '−30,8 †');
  assert.equal(withNumberStyle('+3.3/5', FI), '+3,3/5');
  assert.equal(withNumberStyle('96.9 %', FI), '96,9 %');
  assert.equal(withNumberStyle('87%/-3.3', FI), '87%/−3,3');
  assert.equal(withNumberStyle('-1…+2', FI), '−1…+2');
  assert.equal(withNumberStyle('(-3.5/5)', FI), '(−3,5/5)');
  assert.equal(withNumberStyle('-30.8 †', EN), '−30.8 †');
  // Not figures: a range, a version name, a sentence's full stop, the missing-value dash, an already true minus.
  assert.equal(withNumberStyle('3-4 perustelua', FI), '3-4 perustelua');
  assert.equal(withNumberStyle('direct-reasons-v1', FI), 'direct-reasons-v1');
  assert.equal(withNumberStyle('Arvioijia 3. Tulos 0.', FI), 'Arvioijia 3. Tulos 0.');
  assert.equal(withNumberStyle('—', FI), '—');
  assert.equal(withNumberStyle('−5…+5', FI), '−5…+5');
  assert.equal(withNumberStyle('1234.5', FI), '1234,5');
});

test('before a language is set the formatters print as JavaScript does', () => {
  assert.equal(withNumberStyle('-30.8', PLAIN_NUMBERS), '-30.8');
  assert.equal(signed(-3.5), '-3.5');
  assert.equal(balanceText(34.6), '-30.8');
  assert.equal(credencePercentText(96.94), '96.9 %');
});

test('with a language set every formatter follows it', () => {
  try {
    setNumberLanguage('fi');
    assert.equal(signed(-3.5), '−3,5');
    assert.equal(signed(2), '+2');
    assert.equal(balanceText(34.6), '−30,8');
    assert.equal(balanceText(75), '+50,0');
    assert.equal(credencePercentText(96.94), '96,9 %');
    assert.equal(fig('0.1'), '0,1');
    setNumberLanguage('en');
    assert.equal(balanceText(34.6), '−30.8');
  } finally {
    // The style is one per process, and each test file runs in its own.
    setNumberLanguage('en');
  }
});
