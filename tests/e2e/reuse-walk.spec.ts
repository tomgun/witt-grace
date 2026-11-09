/**
 * must: a reason under option A is attached under option B through "Liitä myös muihin solmuihin…" (the library
 *       inspector); the new use appears in the tree at once, is rated separately (70 %/+4 vs 90 %/−3), the library
 *       card lists two connections, and a card created in the pane attaches to the selected node
 *       (UX-C02…C05, G-12, UI_INVENTORY S-05 §A.4, S-08 §1b)
 * test: tests/e2e/reuse-walk.spec.ts (desktop)
 * red-against: ratings copied to the second use, the use attached under the source itself, the card created invisibly
 */
import { expect, test } from '@playwright/test';
import { addNamed, reviewSelected, startBlank } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await startBlank(page, 'decision');
});

test('reuse a reason under a second option with independent ratings', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  for (const title of ['Uimahalli', 'Luontoretki']) {
    await page.locator('[data-testid^="outline-"]').first().click();
    await addNamed(page, '#btnOption', title);
  }
  await page.locator('#btnWorkflowEvaluate').click();
  await page.locator('[data-testid^="outline-"]', { hasText: 'Uimahalli' }).click();
  await addNamed(page, '#btnSupport', 'Saamme perheen yhteistä aikaa');
  await reviewSelected(page, '70', '4');

  // Promote and attach under Luontoretki from the library inspector.
  await page.getByTestId('reuse-open').click();
  const target = page.getByTestId('reuse-target');
  await target.selectOption({ label: 'Luontoretki' });
  await page.getByTestId('reuse-attach').click();
  await expect(page.getByTestId('node-count')).toHaveText('5');
  await expect(page.getByTestId('concept-box')).toBeVisible();
  await expect(page.locator('.node .shared-node-mark')).toHaveCount(2);
  // The new use starts from the document template, never from the first use's rating.
  await expect(page.getByTestId('review-credence')).toHaveValue('100');
  await expect(page.locator('#inspector .inline-warning').first()).toContainText('Et ole vielä arvioinut');
  await reviewSelected(page, '90', '-3');
  const uses = page
    .locator('.node', { hasText: 'Saamme perheen yhteistä aikaa' })
    .locator('.meta-assessment .meta-value');
  await expect(uses.nth(0)).toHaveText('70%/+4');
  await expect(uses.nth(1)).toHaveText('90%/-3');

  // The library card shows the concept with two connections; selecting it lists both uses with their pairs.
  await page.locator('#btnRepeatTab').click();
  const card = page.locator('[data-testid^="repeat-card-"]');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Yhteyksiä 2');
  await card.click();
  const useRows = page.locator('[data-testid^="repeat-use-"]');
  await expect(useRows.nth(0)).toContainText('Uimahalli');
  await expect(useRows.nth(0)).toContainText('70%/+4');
  await expect(useRows.nth(1)).toContainText('Luontoretki');
  await expect(useRows.nth(1)).toContainText('90%/-3');

  // A reason created in the pane attaches to the selected node (Uimahalli) through the inspector.
  await page.locator('#btnOutlineTab').click();
  await page.locator('[data-testid^="outline-"]', { hasText: 'Uimahalli' }).click();
  await page.locator('#btnRepeatTab').click();
  await page.getByTestId('repeat-title').fill('Hinta on kohtuullinen');
  await page.getByTestId('repeat-create').click();
  await expect(card).toHaveCount(2);
  await expect(page.getByTestId('reuse-target')).toHaveValue(/.+/);
  await page.getByTestId('reuse-attach').click();
  await expect(page.getByTestId('node-count')).toHaveText('6');
  await expect(
    page.locator('[data-testid^="repeat-card-"]', { hasText: 'Hinta on kohtuullinen' })
  ).toContainText('Yhteyksiä 1');
});
