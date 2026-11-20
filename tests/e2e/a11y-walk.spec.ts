/**
 * must: a keyboard or screen reader user gets the page's structure (accessibility check 2026-11-20, S-15): the home
 *       screen has one main landmark at the top level and one h1; the workspace has an h1 naming the document, its
 *       toolbar and view settings are named regions, the first Tab stop is "Siirry sisältöön" which moves the
 *       focus to the selected card or the table's search field; a tree card is a tree item and not an article; the buttons on a card are 24 px
 *       at the tree's natural size
 * test: tests/e2e/a11y-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: main nested in a region, a workspace without a heading, the toolbar's label on an element without a
 *              role (so never read), the skip button leaving the focus where it was, the main area made focusable (a press on a
 *              card's text then takes the focus from the card and the arrow keys stop working), a card button 23 px high
 */
import { expect, test } from '@playwright/test';
import { startBlank } from './helpers.ts';

test('landmarks, headings and the way past the control rows', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveCount(1);
  expect(await page.locator('main').evaluate((el) => !!el.parentElement?.closest('section, [role]'))).toBe(
    false
  );

  await startBlank(page, 'argument');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText(/^WITT: /);
  await expect(page.getByRole('region', { name: 'Muokkaa' })).toHaveCount(1);
  await expect(page.locator('#nodesLayer .node').first()).toHaveJSProperty('tagName', 'DIV');
  const add = page.locator('.node.is-root .node-add[data-relation="support"]');
  expect(
    await add.evaluate((el) => [(el as HTMLElement).offsetWidth, (el as HTMLElement).offsetHeight])
  ).toEqual([24, 24]);

  // The skip button is the first stop and is seen only while it has the focus.
  const skip = page.locator('#btnSkipToContent');
  await page.locator('#btnBackHome').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(skip).toBeFocused();
  await expect(skip).toHaveText('Siirry sisältöön');
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  if (await page.locator('#btnTreeView.active').count())
    await expect(page.locator('#nodesLayer .node.selected')).toBeFocused();
  else await expect(page.locator('#tableSearch')).toBeFocused();
  await expect(skip).not.toBeInViewport();
});
