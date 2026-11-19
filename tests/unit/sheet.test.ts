/**
 * must: the phone inspector's sheet has three heights, low, half and full: a drag up or down moves one step and
 *       stays at the ends, a tap goes one step up and from full back to low (WG-042, owner 2026-11-19, S-15)
 * test: tests/unit/sheet.test.ts
 * red-against: a drag wrapping round from full to low, a tap that stops at full (the sheet could never be lowered
 *              with a tap), up and down swapped
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { SHEET_SIZES, nextSheetSize } from '../../src/app/sheet.ts';

test('three heights, lowest first', () => {
  assert.deepEqual([...SHEET_SIZES], ['low', 'half', 'full']);
});

test('a drag moves one step and stays at the ends', () => {
  assert.equal(nextSheetSize('half', 'up'), 'full');
  assert.equal(nextSheetSize('full', 'up'), 'full');
  assert.equal(nextSheetSize('half', 'down'), 'low');
  assert.equal(nextSheetSize('low', 'down'), 'low');
  assert.equal(nextSheetSize('low', 'up'), 'half');
  assert.equal(nextSheetSize('full', 'down'), 'half');
});

test('a tap goes up and from the top back to the lowest', () => {
  assert.equal(nextSheetSize('low', 'tap'), 'half');
  assert.equal(nextSheetSize('half', 'tap'), 'full');
  assert.equal(nextSheetSize('full', 'tap'), 'low');
});
