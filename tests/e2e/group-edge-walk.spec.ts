/**
 * must: an option group added under the decision question hangs from the tree by a visible line of the options'
 *       colour, like an option does (owner 2026-11-25: “jos sellaisen lisää juurisolmusta, ne tulevat irralliseksi
 *       puusta”; the prototype's `edge-group` has no stroke rule, S-15)
 * test: tests/e2e/group-edge-walk.spec.ts (desktop 1440×900)
 * red-against: the line into a group drawn with no stroke, as in the prototype
 */
import { expect, test } from '@playwright/test';
import { ensureTree } from './helpers.ts';

test.skip(({ viewport }) => (viewport?.width ?? 1440) < 1000, 'the walk drives the desktop tree');

test('the line into an option group is drawn like the line into an option', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#btnHomeNew').click();
  await page.locator('#btnNewWorkDecision').click();
  const editor = page.locator('.node-inline-editor');
  await expect(editor).toBeFocused();
  await editor.fill('Mihin muutamme?');
  await editor.press('Enter');
  await ensureTree(page);
  await page.locator('#btnOptionGroup').click();
  await expect(editor).toBeFocused();
  await editor.fill('Kaupungit');
  await editor.press('Enter');
  await page.locator('.node', { hasText: 'Mihin muutamme?' }).first().locator('.node-title').click();
  await page.locator('#btnOption').click();
  await expect(editor).toBeFocused();
  await editor.fill('Jäädään tähän');
  await editor.press('Enter');
  const stroke = (selector: string) =>
    page.locator(selector).evaluate((el) => window.getComputedStyle(el).stroke);
  const group = await stroke('.edge.edge-group');
  expect(group).not.toBe('none');
  expect(group).toBe(await stroke('.edge.edge-option:not(.edge-group)'));
});
