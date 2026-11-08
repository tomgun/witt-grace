/**
 * must: a reason under option A can be attached under option B from its inspector; the new use appears in the tree at
 *       once, is rated separately (70 %/+4 vs 90 %/−3), the shelf lists the concept with both uses, and a shelf-created
 *       reason attaches to the selected node (UX-C02…C05, G-12)
 * test: tests/e2e/reuse-walk.spec.ts (desktop)
 * red-against: ratings copied to the second use, the use attached under the source itself, the card created invisibly
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test('reuse a reason under a second option with independent ratings', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  await page.getByTestId('menu-file').locator('summary').click();
  await page.getByTestId('menu-new-decision').click();
  await page.getByTestId('replace-confirm').click();
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('Alt+4');
  for (const title of ['Uimahalli', 'Luontoretki']) {
    await page.locator('[data-testid^="outline-"]').first().click();
    await page.getByTestId('bottom-add-option').click();
    await page.getByTestId('node-title').fill(title);
    await page.getByTestId('node-title').press('Enter');
  }
  await page.locator('[data-testid^="outline-"]', { hasText: 'Uimahalli' }).click();
  await page.getByTestId('bottom-add-support').click();
  await page.getByTestId('node-title').fill('Saamme perheen yhteistä aikaa');
  await page.getByTestId('node-title').press('Enter');
  await page.getByTestId('review-credence').fill('70');
  await page.getByTestId('review-influence').fill('4');
  await page.getByTestId('review-save').click();

  // Attach the same reason under Luontoretki from the inspector.
  await page.getByTestId('reuse-open').click();
  const target = page.getByTestId('reuse-target');
  await target.selectOption({ label: 'Luontoretki' });
  await page.getByTestId('reuse-attach').click();
  await expect(page.getByTestId('node-count')).toHaveText('5');
  await expect(page.getByTestId('concept-box')).toBeVisible();
  await expect(page.locator('.node-badge')).toHaveCount(2);
  // The new use starts unrated: its own ratings, never copied.
  await expect(page.getByTestId('review-credence-value')).toHaveText('100%');
  await page.getByTestId('review-credence').fill('90');
  await page.getByTestId('review-influence').fill('-3');
  await page.getByTestId('review-save').click();

  // The shelf shows one concept with two uses and their separate pairs.
  await page.getByTestId('left-tab-repeat').click();
  const card = page.locator('[data-testid^="repeat-card-"]');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Käytössä 2 kohdassa');
  const uses = card.locator('[data-testid^="repeat-use-"]');
  await expect(uses.nth(0)).toContainText('Uimahalli · 70%/+4');
  await expect(uses.nth(1)).toContainText('Luontoretki · 90%/-3');

  // A reason created in the shelf attaches to the selected node (Uimahalli).
  await page.getByTestId('left-tab-tree').click();
  await page.locator('[data-testid^="outline-"]', { hasText: 'Uimahalli' }).click();
  await page.getByTestId('left-tab-repeat').click();
  await page.getByTestId('repeat-title').fill('Hinta on kohtuullinen');
  await page.getByTestId('repeat-create').click();
  await expect(card).toHaveCount(2);
  const second = page.locator('[data-testid^="repeat-card-"]', { hasText: 'Hinta on kohtuullinen' });
  await second.locator('[data-testid^="repeat-attach-"]').click();
  await expect(page.getByTestId('node-count')).toHaveText('6');
  await expect(second).toContainText('Käytössä 1 kohdassa');
});
