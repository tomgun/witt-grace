/**
 * must: what just happened is said where it is seen: deleting a card shows "Poistettu: <title>" with Kumoa, which
 *       brings the card back and removes the notice; saving the file shows "JSON-tiedosto ladattu"; a notice that
 *       only confirms something can be closed and is drawn above the page, not under it (WG-044, owner 2026-11-19,
 *       UI_INVENTORY S-15)
 * test: tests/e2e/notice-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: the notice element without any style rule (rendered below the footer, never seen), Kumoa undoing
 *              nothing, the notice left on screen after the undo
 */
import { expect, test } from '@playwright/test';
import { addNamed, startBlank } from './helpers.ts';

test('a deletion and a saved file are confirmed; Kumoa brings the card back', async ({ page }) => {
  await startBlank(page, 'argument');
  await addNamed(page, '#btnSupport', 'Säästää aikaa');
  await expect(page.getByTestId('node-count')).toHaveText('2');
  await page.locator('#nodesLayer .node', { hasText: 'Säästää aikaa' }).focus();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('node-count')).toHaveText('1');

  const notice = page.getByTestId('notice');
  await expect(notice).toContainText('Poistettu: Säästää aikaa');
  // Drawn over the page, inside the window.
  const box = (await notice.boundingBox())!;
  const size = page.viewportSize()!;
  expect(box.y + box.height).toBeLessThanOrEqual(size.height);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(size.width);
  expect(await notice.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');

  await page.locator('#btnNoticeUndo').click();
  await expect(page.getByTestId('node-count')).toHaveText('2');
  await expect(page.locator('.node-title', { hasText: 'Säästää aikaa' })).toBeVisible();
  await expect(notice).toHaveCount(0);

  const download = page.waitForEvent('download');
  await page.locator('#fileMenu > summary').click();
  await page.locator('#btnSave').click();
  await download;
  await expect(notice).toHaveText(/JSON-tiedosto ladattu/);
  await notice.getByRole('button', { name: 'Sulje' }).click();
  await expect(notice).toHaveCount(0);
});
