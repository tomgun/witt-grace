/**
 * must: a person can start an argument document, add a supporting reason with the keyboard, name it, review it as
 *       100 % / +5 and read +50 as the thesis balance; a missing review shows "—/—" on the card and marks the balance incomplete; the work survives a reload;
 *       the zones toggle with Alt+1..4 and the file menu exports JSON (UX-A05, UX-B01, UX-D01, UX-D02, UX-E07, G-05)
 * test: tests/e2e/argument-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: the balance shown as 0 before any review, a review saved under the wrong node, the autosave skipped
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test('start, add a reason with +, review it and read the balance', async ({ page }) => {
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.getByTestId('node-count')).toHaveText('1');
  // A thesis without reasons starts from the neutral base: 0, complete (G-02 first row).
  const rootBalance = page.locator('[data-testid^="balance-"]').first();
  await expect(rootBalance).toHaveText(/Perustelutulos 0$/);

  // Keyboard: focus the canvas, press + to add a supporting reason under the selected (root) node.
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('+');
  await expect(page.getByTestId('node-count')).toHaveText('2');
  const title = page.getByTestId('node-title');
  await expect(title).toBeFocused();
  await title.fill('Hinta on alhainen');
  await title.press('Enter');
  await expect(page.locator('.node-title', { hasText: 'Hinta on alhainen' })).toBeVisible();

  // Review: credence 100 %, influence +5, confirm.
  await page.getByTestId('review-credence').fill('100');
  await page.getByTestId('review-influence').fill('5');
  await page.getByTestId('review-save').click();
  await expect(page.getByTestId('review-credence-value')).toHaveText('100%');
  await expect(page.getByTestId('review-influence-value')).toHaveText('+5');

  // The thesis balance is +50 (one perfect +5 support), shown on the root card and when the root is selected.
  await expect(rootBalance).toContainText('+50');
  await page.locator('[data-testid^="outline-"]').first().click();
  await expect(page.getByTestId('score-balance')).toContainText('+50');

  // Reload: the autosave brought the work back.
  await page.reload();
  await expect(page.getByTestId('node-count')).toHaveText('2');
  await expect(page.locator('[data-testid^="balance-"]').first()).toContainText('+50');
});

test('a second unreviewed reason makes the balance incomplete, not zero', async ({ page }) => {
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('+');
  await page.getByTestId('review-credence').fill('100');
  await page.getByTestId('review-influence').fill('5');
  await page.getByTestId('review-save').click();
  await page.locator('[data-testid^="outline-"]').first().click();
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('-');
  await expect(page.getByTestId('node-count')).toHaveText('3');
  const pair = page.locator('[data-testid^="pair-"]').last();
  await expect(pair).toHaveText('—/—');
  await page.locator('[data-testid^="outline-"]').first().click();
  await expect(page.getByTestId('score-balance')).toContainText('+50');
  await expect(page.getByTestId('score-balance')).toContainText('Arviointi kesken');
});

test('zones toggle with Alt+1..4 and the file menu exports JSON', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the pane buttons are desktop controls');
  await expect(page.getByTestId('outline')).toBeVisible();
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('Alt+1');
  await expect(page.getByTestId('outline')).toHaveCount(0);
  await page.keyboard.press('Alt+1');
  await expect(page.getByTestId('outline')).toBeVisible();
  await page.keyboard.press('Alt+4');
  await expect(page.getByTestId('bottom-zone')).toBeVisible();
  await page.keyboard.press('Alt+V');
  await expect(page.getByTestId('view-dock')).toBeVisible();
  await page.keyboard.press('Alt+V');
  await expect(page.getByTestId('view-dock')).toHaveCount(0);

  await page.getByTestId('menu-file').locator('summary').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('menu-save').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.witt\.json$/);
  const text = await (
    await file.createReadStream()
  )
    .toArray()
    .then((chunks) => Buffer.concat(chunks).toString('utf8'));
  const parsed = JSON.parse(text) as { schemaVersion: number; settings: { scoring: string } };
  expect(parsed.schemaVersion).toBe(8);
  expect(parsed.settings.scoring).toBe('evidence-v3-links');
});

test('switching to decision mode offers options; Bitberg theme applies', async ({ page }) => {
  await page.getByTestId('mode-decision').click();
  await expect(page.getByTestId('mode-decision')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('menu-edit').locator('summary').click();
  await page.getByTestId('menu-add-option').click();
  await expect(page.getByTestId('node-count')).toHaveText('2');
  await expect(page.locator('.node[data-relation="option"]')).toHaveCount(1);
  await page.getByTestId('theme-select').selectOption('bitberg');
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'bitberg');
});
