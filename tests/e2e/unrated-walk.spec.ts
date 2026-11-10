/**
 * must: a neutral reason added from the left panel starts as an unrated note: dotted card with "Ei arvioida", greyed
 *       sliders, no effect on the thesis (+20.0 without †); unchecking it brings the sliders back; "Ei vaikutusta"
 *       saves the person's own 0 without a credence and the thesis stays complete, shows as "✓ Oma arviosi: ei
 *       vaikutusta" with Peru, dims the person's branch below it and excludes it; Peru takes the 0 back; "Tarkka asteikko (0,1)" turns the
 *       influence slider to 0.1 steps and a +0.3 rating moves the thesis to +23.0 (owner decisions 2026-11-10, S-15)
 * test: tests/e2e/unrated-walk.spec.ts (desktop)
 * red-against: a new neutral reason that makes the thesis incomplete, "no effect" still asking for a credence, the
 *              fine scale rounding to 0.5
 */
import { expect, test } from '@playwright/test';
import { addNamed, reviewSelected, selectRoot, startBlank } from './helpers.ts';

test('an unrated note, a "no effect" review and the fine scale', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  await startBlank(page, 'argument');
  await page.locator('#btnWorkflowEvaluate').click();
  await addNamed(page, '#btnSupport', 'Haastattelu meni hyvin');
  await reviewSelected(page, '100', '2');
  await selectRoot(page);
  await addNamed(page, '#btnNeutral', 'Asui ennen Tampereella');
  const note = page.locator('#nodesLayer .node', { hasText: 'Asui ennen Tampereella' });
  await expect(note).toHaveClass(/unrated-node/);
  await expect(note.locator('.node-unrated-mark')).toHaveText('Ei arvioida');
  await expect(page.getByTestId('node-unrated')).toBeChecked();
  await expect(page.getByTestId('unrated-note')).toBeVisible();
  await expect(page.getByTestId('review-credence')).toHaveCount(0);
  await selectRoot(page);
  await expect(page.getByTestId('score-balance')).toContainText(/^\+20\.0Perustelu/);

  await note.locator('.node-title').click();
  await page.getByTestId('node-unrated').uncheck();
  await expect(note).not.toHaveClass(/unrated-node/);
  await expect(page.getByTestId('review-credence')).toBeVisible();
  await page.getByTestId('review-no-effect').click();
  await expect(page.locator('#inspector')).toContainText('uskottavuutta ei tarvita');
  await expect(page.getByTestId('no-effect-state')).toContainText('Oma arviosi: ei vaikutusta');
  await expect(page.getByTestId('review-no-effect')).toHaveCount(0);
  // The person's own branch below a "no effect" is dimmed in their view and does not count.
  await addNamed(page, '#btnSupport', 'Muutti pois 2019');
  const child = page.locator('#nodesLayer .node', { hasText: 'Muutti pois 2019' });
  await expect(child).toHaveClass(/under-unrated/);
  await expect(page.getByTestId('no-effect-branch')).toBeVisible();
  await selectRoot(page);
  await expect(page.getByTestId('score-balance')).toContainText(/^\+20\.0Perustelu/);
  await page.locator('[data-testid^="outline-"]', { hasText: 'Muutti pois 2019' }).click();
  await page.locator('#viewport').focus();
  await page.keyboard.press('Delete');
  await expect(child).toHaveCount(0);

  await page.locator('[data-testid^="outline-"]', { hasText: 'Asui ennen Tampereella' }).click();
  await page.getByTestId('review-no-effect-undo').click();
  await expect(page.getByTestId('review-no-effect')).toBeVisible();
  await page.getByTestId('node-fine-influence').check();
  const influence = page.getByTestId('review-influence');
  await expect(influence).toHaveAttribute('step', '0.1');
  await influence.fill('0.3');
  await influence.blur();
  await expect(page.locator('#inspector')).toContainText('+0.3 / 5');
  await selectRoot(page);
  await expect(page.getByTestId('score-balance')).toContainText(/^\+23\.0Perustelu/);
});
