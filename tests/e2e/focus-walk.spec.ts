/**
 * must: in the tree-only view (Näkymä → Vain puu, F) leaving is the last button at the right end of the bar and
 *       names its key; "Koko näyttö, ei painikkeita" hides the bar, the zoom control and the legend and leaves two
 *       small marks in the corner, ⋯ to bring the buttons back and × to leave the view; leaving by F or Esc ends the
 *       bare state too (owner 2026-11-19, UI_INVENTORY S-07, S-15)
 * test: tests/e2e/focus-walk.spec.ts (desktop 1440×900)
 * red-against: the exit first on the left, far from where the view was entered; a bare state with no way back; the
 *              bare state surviving into the next visit of the view
 */
import { expect, test } from '@playwright/test';
import { startBlank } from './helpers.ts';

test('tree only: the exit at the right with its key; a bare full screen with a way back', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the tree-only bar is a desktop walk');
  await startBlank(page, 'argument');
  await page.locator('#viewport').focus();
  await page.keyboard.press('f');
  const bar = page.locator('.canvas-quick-controls');
  await expect(bar).toBeVisible();
  await expect(page.locator('.inspector-panel')).toBeHidden();

  // The exit is the last control, at the right edge, and says F.
  const exit = page.locator('#btnFocusQuick');
  await expect(exit).toContainText('Poistu puunäkymästä');
  await expect(exit.locator('kbd')).toHaveText('F');
  expect(await bar.evaluate((el) => el.lastElementChild?.id)).toBe('btnFocusQuick');
  const box = (await exit.boundingBox())!;
  expect(box.x + box.width).toBeGreaterThan(1440 - 40);

  // Bare: nothing but the tree and two small marks.
  await page.locator('#btnFocusBare').click();
  await expect(bar).toBeHidden();
  await expect(page.locator('.zoom-controls')).toBeHidden();
  await expect(page.locator('.legend')).toBeHidden();
  await expect(page.locator('.node.is-root')).toBeVisible();
  const corner = page.getByTestId('bare-controls');
  await expect(corner.locator('button')).toHaveCount(2);
  await page.locator('#btnFocusBareShow').click();
  await expect(bar).toBeVisible();
  await expect(corner).toHaveCount(0);

  // × leaves the view; the next visit starts with the buttons.
  await page.locator('#btnFocusBare').click();
  await page.locator('#btnFocusBareExit').click();
  await expect(page.locator('.inspector-panel')).toBeVisible();
  await page.locator('#viewport').focus();
  await page.keyboard.press('f');
  await expect(bar).toBeVisible();
  await page.locator('#btnFocusBare').click();
  await page.keyboard.press('f');
  await expect(page.locator('.inspector-panel')).toBeVisible();
  await page.keyboard.press('f');
  await expect(bar).toBeVisible();
  await exit.click();
  await expect(page.locator('.inspector-panel')).toBeVisible();
});

/**
 * must: the document's title is shown whole in the top bar when there is room for it (owner 2026-11-19, S-15)
 * red-against: a title field of a fixed 345 px that cuts "Rekrytointi: kolme kandidaattia samoilla kriteereillä"
 */
test('a long document title is shown whole', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'a phone has no room for a long title');
  await startBlank(page, 'argument');
  const title = page.locator('#projectTitle');
  await title.fill('Rekrytointi: kolme kandidaattia samoilla kriteereillä');
  await title.press('Enter');
  await expect(title).toHaveValue('Rekrytointi: kolme kandidaattia samoilla kriteereillä');
  expect(await title.evaluate((el: HTMLInputElement) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});
