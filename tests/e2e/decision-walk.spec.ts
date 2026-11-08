/**
 * must: in decision mode a person adds two options, reviews a reason under one, adds a second person, opens a ballot
 *       round, both cast preferences, the owner closes the round and the results show the weighted preference per
 *       option while the argument balance stays separate (V-01, V-02, V-04, U-01, UX-D04)
 * test: tests/e2e/decision-walk.spec.ts (desktop)
 * red-against: a ballot accepted before the round opens, a result shown while hidden, the balance mixed into the vote
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test('two options, a review, two people, a ballot round', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  await page.getByTestId('menu-file').locator('summary').click();
  await page.getByTestId('menu-new-decision').click();
  await page.getByTestId('replace-confirm').click();
  await expect(page.getByTestId('mode-decision')).toHaveAttribute('aria-pressed', 'true');

  // Two options under the decision root (keyboard: the bottom zone via Alt+4 then buttons).
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('Alt+4');
  await page.getByTestId('bottom-add-option').click();
  await page.getByTestId('node-title').fill('Vaihtoehto A');
  await page.getByTestId('node-title').press('Enter');
  await page.locator('[data-testid^="outline-"]').first().click();
  await page.getByTestId('bottom-add-option').click();
  await page.getByTestId('node-title').fill('Vaihtoehto B');
  await page.getByTestId('node-title').press('Enter');
  await expect(page.getByTestId('node-count')).toHaveText('3');

  // A reason under A, reviewed 100 % / +5 → A's balance +50.
  await page.locator('[data-testid^="outline-"]', { hasText: 'Vaihtoehto A' }).click();
  await page.getByTestId('bottom-add-support').click();
  await page.getByTestId('node-title').fill('Halvin');
  await page.getByTestId('node-title').press('Enter');
  await page.getByTestId('review-credence').fill('100');
  await page.getByTestId('review-influence').fill('5');
  await page.getByTestId('review-save').click();
  await page.locator('[data-testid^="outline-"]').first().click();
  const overview = page.getByTestId('options-overview');
  await expect(overview.locator('li', { hasText: 'Vaihtoehto A' })).toContainText('+50');
  await expect(overview.locator('li', { hasText: 'Vaihtoehto B' })).toContainText('0');

  // A second person.
  page.once('dialog', (dialog) => dialog.accept('Bea'));
  await page.getByTestId('actor-select').selectOption('__add__');
  await expect(page.getByTestId('actor-select')).toContainText('Bea');
  await page.getByTestId('actor-select').selectOption({ label: 'Minä' });

  // Open the ballot as the owner, cast as me, then as Bea, close, read results.
  await page.getByTestId('menu-review').locator('summary').click();
  await page.getByTestId('menu-vote').click();
  await expect(page.getByTestId('vote-status')).toHaveText('Äänestys ei ole vielä alkanut');
  await page.getByTestId('vote-start').click();
  await expect(page.getByTestId('vote-status')).toHaveText('Äänestyskierros on avoin');
  const rows = page.locator('[data-testid^="vote-row-"]');
  await expect(rows).toHaveCount(2);
  const sliderA = page.locator('[data-testid^="vote-slider-"]').first();
  await sliderA.fill('90');
  await page.locator('[data-testid^="vote-save-"]').first().click();
  await expect(page.locator('[data-testid^="vote-value-"]').first()).toHaveText('90/100');
  await expect(page.getByTestId('vote-results')).toContainText('Tulokset on piilotettu');
  await page.getByTestId('vote-close').click();
  await page.getByTestId('actor-select').selectOption({ label: 'Bea' });
  await page.getByTestId('menu-review').locator('summary').click();
  await page.getByTestId('menu-vote').click();
  await page.locator('[data-testid^="vote-slider-"]').nth(1).fill('100');
  await page.locator('[data-testid^="vote-save-"]').nth(1).click();
  await page.getByTestId('vote-close').click();
  await page.getByTestId('actor-select').selectOption({ label: 'Minä' });
  await page.getByTestId('menu-review').locator('summary').click();
  await page.getByTestId('menu-vote').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('vote-end').click();
  await expect(page.getByTestId('vote-status')).toHaveText('Äänestyskierros päättyi');
  const results = page.locator('[data-testid^="vote-result-"]');
  await expect(results.first()).toContainText('90.0/100');
  await expect(results.nth(1)).toContainText('100.0/100');
  await expect(results.first()).toContainText('1 äänestäjää');
});
