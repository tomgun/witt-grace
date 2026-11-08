/**
 * must: from the home screen "Kokeile esimerkkiä" lists the five synthetic three-assessor debates with their claim and
 *       assessor counts; opening one while work is saved passes the replacement dialog (Peruuta keeps the current work,
 *       "Hylkää nykyinen ja jatka" loads the example in Punnitse); "Opastettu harjoitus" passes the same dialog, creates
 *       the practice document and the panel advances only when the person does what a step asks (+ reason, name it,
 *       − reason), "Ohita vaihe" moves on, × closes and clears every highlight (UX_AND_WORKFLOWS, UI_INVENTORY S-01)
 * test: tests/e2e/onboarding-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: an example or the practice replacing saved work without asking, a step advancing before its condition
 *              holds in the document, a highlight left behind after the panel closes
 */
import { expect, test } from '@playwright/test';
import { startBlank } from './helpers.ts';

const DEMO_CONFIRM =
  'Esimerkin avaaminen korvaa nykyisen aktiivisen työn. Haluatko tallentaa nykyisen työn kirjastoon ensin?';

test('an example and the practice open through the replacement dialog; the practice follows the person', async ({
  page,
}, testInfo) => {
  // Saved work first, so that replacing it is a conscious choice.
  await startBlank(page, 'argument');
  await page.reload();
  await expect(page.locator('#btnHomeContinue')).toBeVisible();

  await page.locator('#btnHomeDemo').click();
  const examples = page.locator('#examplesDialog');
  await expect(examples).toBeVisible();
  await expect(examples.locator('.example-card')).toHaveCount(5);
  const card = examples.locator('.example-card[data-example="painonhallinta"]');
  await expect(card).toContainText('Painonhallinta: mikä on kestävä tapa?');
  await expect(card).toContainText('13 väitettä · 3 arvioijaa');

  await card.click();
  const replace = page.locator('#replaceDialog');
  await expect(replace).toBeVisible();
  await expect(page.locator('#replaceCurrentInfo')).toHaveText('Argumentointi · Solmuja: 1');
  await expect(page.locator('#replaceDescription')).toHaveText(DEMO_CONFIRM);
  await page.locator('#replaceCancel').click();
  await expect(replace).toBeHidden();
  await expect(examples).toBeVisible();
  await expect(page.getByTestId('home')).toBeVisible();

  await card.click();
  await page.locator('#replaceForget').click();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(examples).toBeHidden();
  await expect(page.getByTestId('node-count')).toHaveText('13');
  await expect(page.locator('#btnWorkflowEvaluate')).toHaveClass(/active/);
  await expect(page.locator('#tutorialPanel')).toBeHidden();

  // The practice replaces the example the same way.
  await page.reload();
  await page.locator('#btnHomeTutorial').click();
  await expect(replace).toBeVisible();
  await expect(page.locator('#replaceCurrentInfo')).toHaveText('Argumentointi · Solmuja: 13');
  await page.locator('#replaceForget').click();
  await expect(page.getByTestId('app')).toBeVisible();
  const panel = page.locator('#tutorialPanel');
  await expect(panel).toBeVisible();
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 1/7');
  await expect(page.locator('#tutorialHeading')).toHaveText('Harjoitellaan yhdessä');
  await expect(page.locator('#tutorialText')).toContainText('Valitse pääväite ja paina + Puoltava');
  await expect(page.locator('.node.is-root .node-title')).toContainText('Nelipäiväinen työviikko');
  await expect(page.getByTestId('node-count')).toHaveText('1');
  await expect(page.locator('.node.is-root .node-add[data-relation="support"]')).toHaveClass(
    /tutorial-highlight/
  );

  // Step 1: a supporting reason exists → step 2 asks for its wording.
  await page.locator('#viewport').focus();
  await page.keyboard.press('+');
  const editor = page.locator('.node-inline-editor');
  await expect(editor).toBeFocused();
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 2/7');
  await expect(page.locator('.node[data-relation="support"]')).toHaveClass(/tutorial-highlight/);
  // Step 2: the default title is not a wording; naming it is.
  await editor.fill('Työmatkat vähenevät');
  await editor.press('Enter');
  await expect(page.locator('.node-title', { hasText: 'Työmatkat vähenevät' })).toBeVisible();
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 3/7');
  await expect(page.locator('.node.is-root .node-add[data-relation="oppose"]')).toHaveClass(
    /tutorial-highlight/
  );
  // Step 3: an opposing reason under the thesis. "Näytä kohde" selects the thesis and focuses its − button; on a
  // narrow screen, where the panel covers the canvas, it adds the reason directly (the prototype's rule).
  await page.locator('#tutorialTarget').click();
  if (testInfo.project.name !== 'mobile') {
    await expect(page.locator('.node.is-root')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.node.is-root .node-add[data-relation="oppose"]')).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(editor).toBeFocused();
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 4/7');
  await editor.press('Escape');
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 4/7');
  // Skip the wording step; the next one points at Punnitse.
  await page.locator('#tutorialNext').click();
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 5/7');
  await expect(page.locator('#btnWorkflowEvaluate')).toHaveClass(/tutorial-highlight/);
  await page.locator('#tutorialClose').click();
  await expect(panel).toBeHidden();
  await expect(page.locator('.tutorial-highlight')).toHaveCount(0);
  await expect(page.getByTestId('node-count')).toHaveText('3');
});
