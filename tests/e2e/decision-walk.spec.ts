/**
 * must: in decision mode a person adds two options from the left panel, reviews a reason under one in Punnitse and
 *       reads +50 for that option and "—" for the other in the options ranking of the decision root; a second local
 *       person is added through the text prompt and becomes the actor; the actor select lists both; a reason directly
 *       under an option is rated as its significance for the option, a deeper one as its influence on the parent
 *       (UI_INVENTORY S-15); "," adds a value judgment and an own type name ("Kriteeri") shows on the card and
 *       passes to the next option (V-01, U-01, UX-D04, UI_INVENTORY S-05, S-08 §19, S-11.22)
 * test: tests/e2e/decision-walk.spec.ts (desktop)
 * red-against: the option balance shown before any review as 0, a review copied to the other option, the new person
 *              replacing the first one's work
 */
import { expect, test } from '@playwright/test';
import { addNamed, reviewSelected, startBlank } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await startBlank(page, 'decision');
});

test('two options, a review, the ranking and a second person', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  await expect(page.locator('#modeDecision')).toHaveClass(/active/);
  await addNamed(page, '#btnOption', 'Vaihtoehto A');
  await page.locator('[data-testid^="outline-"]').first().click();
  await addNamed(page, '#btnOption', 'Vaihtoehto B');
  await expect(page.getByTestId('node-count')).toHaveText('3');

  await page.locator('#btnWorkflowEvaluate').click();
  await page.locator('[data-testid^="outline-"]', { hasText: 'Vaihtoehto A' }).click();
  await addNamed(page, '#btnSupport', 'Halvin');
  await reviewSelected(page, '100', '5');
  await page.locator('[data-testid^="outline-"]').first().click();
  const ranking = page.getByTestId('decision-overview');
  await expect(
    ranking.locator('.ranking-row', { hasText: 'Vaihtoehto A' }).locator('.ranking-score')
  ).toHaveText('+50');
  await expect(
    ranking.locator('.ranking-row', { hasText: 'Vaihtoehto B' }).locator('.ranking-score')
  ).toHaveText('—');

  // A second local person through the prototype's text prompt.
  await page.locator('#actorSelect').selectOption('__add_local_user__');
  await page.locator('#textValue').fill('Bea');
  await page.locator('#textAccept').click();
  await expect(page.locator('#actorSelect')).toContainText('Bea');
  await expect(page.locator('#actorSelect')).toHaveValue(/.+/);
  const selected = await page.locator('#actorSelect option:checked').textContent();
  expect(selected).toBe('Bea');
  // Bea sees the first person's review as the shared result, not as her own.
  await page.locator('[data-testid^="outline-"]', { hasText: 'Halvin' }).click();
  await expect(page.locator('#inspector')).toContainText('Käyttäjänä: Bea');
  await expect(page.getByTestId('review-credence')).toHaveValue('100');
  await expect(page.locator('#inspector .inline-warning').first()).toContainText('Et ole vielä arvioinut');
});

test('a reason under an option rates its significance; a deeper reason rates its influence on the parent', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  await addNamed(page, '#btnOption', 'Uimaan tänään');
  await page.locator('#btnWorkflowEvaluate').click();
  await addNamed(page, '#btnSupport', 'En ole treenannut moneen päivään');
  await expect(page.locator('label[for="nodeImpact"]')).toContainText(
    'Oma arvio merkityksestä vaihtoehdolle'
  );
  await expect(page.locator('#inspector > .inspector-note').first()).toContainText(
    'merkityksen tälle vaihtoehdolle'
  );
  await addNamed(page, '#btnSupport', 'Kalenterissa näkyy tauko');
  await expect(page.locator('label[for="nodeImpact"]')).toContainText('Oma vaikutusarvio vanhempaan');
});

test('"," adds a value judgment; an own type name shows on the card and passes to the next option', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  await addNamed(page, '#btnOption', 'Myytävyys');
  const option = page.locator('#nodesLayer .node', { hasText: 'Myytävyys' });
  await page.getByTestId('node-type-label').fill('Kriteeri');
  await page.getByTestId('node-type-label').press('Enter');
  await expect(option.locator('.node-tag')).toHaveText(/kriteeri/i);
  await page.locator('#viewport').focus();
  await page.keyboard.press(',');
  const editor = page.locator('.node-inline-editor');
  await expect(editor).toBeFocused();
  await editor.fill('Asiakaskokemus on tärkeää');
  await editor.press('Enter');
  const value = page.locator('#nodesLayer .node', { hasText: 'Asiakaskokemus on tärkeää' });
  await expect(value.locator('.node-semantic')).toHaveText('Arvostus');
  // A reason's own type name joins its direction in one tag; the card's buttons sit at its right edge.
  await page.getByTestId('node-type-label').fill('Tavoite');
  await page.getByTestId('node-type-label').press('Enter');
  await expect(value.locator('.node-tag')).toHaveText(/puoltava tavoite/i);
  const card = (await value.boundingBox())!;
  const plus = (await value.locator('.node-add.support').boundingBox())!;
  expect(plus.x).toBeGreaterThan(card.x + card.width / 2);
  await page.locator('[data-testid^="outline-"]').first().click();
  await addNamed(page, '#btnOption', 'Työkokemus');
  await expect(page.locator('#nodesLayer .node', { hasText: 'Työkokemus' }).locator('.node-tag')).toHaveText(
    /kriteeri/i
  );
});
