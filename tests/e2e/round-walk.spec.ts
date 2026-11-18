/**
 * must: under the default method the assessment round asks a claim after its reasons; for a claim with reasons it
 *       shows the person's earlier rating, what their own ratings of the reasons make of it (70 % with one
 *       100 % / +2 reason: 85 %) and the weightiest reasons; the group's computed result appears only when asked
 *       for; a rating given before a reason was added is marked "perustelut ovat muuttuneet" in the inspector and
 *       in the round, and saving the same figure clears the mark (owner 2026-11-18, WG-031, S-15)
 * test: tests/e2e/round-walk.spec.ts (desktop)
 * red-against: the root asked first, the group's figure shown by default, the mark left on after an unchanged save,
 *              the slider's figure ignored in the computed line
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addNamed, reviewSelected, startBlank } from './helpers.ts';

/** The toolbar's Arviointi menu is a <details> popover; a click inside closes it again. */
const fromAssessMenu = async (page: Page, id: string) => {
  await page.locator('#assessmentMenu summary').click();
  await page.locator(id).click();
};

test('the round goes from the reasons to the claim and marks a rating whose reasons changed', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  await startBlank(page, 'argument');
  await page.locator('#btnWorkflowEvaluate').click();
  await addNamed(page, '#btnSupport', 'Kokeilu kannattaa');
  await reviewSelected(page, '70', '2');
  await expect(page.getByTestId('subtree-changed')).toHaveCount(0);
  await addNamed(page, '#btnSupport', 'Pilotti onnistui');
  await reviewSelected(page, '100', '2');

  await page.locator('[data-testid^="outline-"]', { hasText: 'Kokeilu kannattaa' }).click();
  await expect(page.getByTestId('subtree-changed')).toContainText('perustelut ovat muuttuneet');

  await fromAssessMenu(page, '#btnAssess');
  await expect(page.locator('#assessmentStep')).toHaveText('Kohta 1/3');
  await expect(page.locator('#assessmentClaim')).toHaveText('Pilotti onnistui');
  await expect(page.locator('#assessmentReasons')).toHaveCount(0);
  await page.locator('#btnAssessNext').click();

  await expect(page.locator('#assessmentClaim')).toHaveText('Kokeilu kannattaa');
  await expect(page.locator('#assessmentSubtreeChanged')).toBeVisible();
  await expect(page.locator('#assessmentEarlier')).toHaveText('Aiempi arviosi: 70 %');
  await expect(page.locator('#assessmentWithReasons')).toHaveText('Perustelujesi kanssa laskettuna: 85 %');
  await expect(page.locator('#assessmentTopReasons li')).toHaveText(['+ Pilotti onnistui (2.0)']);
  await expect(page.locator('#assessmentGroupResult')).toHaveCount(0);
  await page.locator('#assessmentShowGroup').check();
  await expect(page.locator('#assessmentGroupResult')).toHaveText('Ryhmän laskettu tulos: 85 %');
  // The line follows the slider: 50 % with the same reason is (2·0.5 + 2)/(2 + 2) = 75 %.
  await page.locator('#assessmentCredenceNumber').fill('50');
  await expect(page.locator('#assessmentWithReasons')).toHaveText('Perustelujesi kanssa laskettuna: 75 %');
  await page.locator('#assessmentCredenceNumber').fill('70');
  await page.locator('#btnAssessNext').click();

  await expect(page.locator('#assessmentClaim')).not.toHaveText('Kokeilu kannattaa');
  await page.locator('#btnAssessPrev').click();
  await expect(page.locator('#assessmentSubtreeChanged')).toHaveCount(0);
  await page.locator('#btnAssessClose').click();
  await expect(page.getByTestId('subtree-changed')).toHaveCount(0);
});
