/**
 * must: from the home screen "Kokeile esimerkkiä" lists the five synthetic three-assessor debates and the two added
 *       recruitment examples (S-15) with their claim and assessor counts; opening one while work is saved passes the replacement dialog (Peruuta keeps the current work,
 *       "Hylkää nykyinen ja jatka" loads the example in Punnitse); "Opastettu harjoitus" passes the same dialog, creates
 *       the practice document and the panel advances only when the person does what a step asks (+ reason, name it,
 *       − reason), "Ohita vaihe" moves on, × closes and clears every highlight (UX_AND_WORKFLOWS, UI_INVENTORY S-01)
 * test: tests/e2e/onboarding-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: an example or the practice replacing saved work without asking, a step advancing before its condition
 *              holds in the document, a highlight left behind after the panel closes
 */
import { expect, test } from '@playwright/test';
import { reviewSelected, startBlank } from './helpers.ts';

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
  await expect(examples.locator('.example-card')).toHaveCount(9);
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
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 1/9');
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
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 2/9');
  await expect(page.locator('.node[data-relation="support"]')).toHaveClass(/tutorial-highlight/);
  // Step 2: the default title is not a wording; naming it is.
  await editor.fill('Työmatkat vähenevät');
  await editor.press('Enter');
  await expect(page.locator('.node-title', { hasText: 'Työmatkat vähenevät' })).toBeVisible();
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 3/9');
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
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 4/9');
  await editor.press('Escape');
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 4/9');
  // Skip the wording step; the next one points at Punnitse.
  await page.locator('#tutorialNext').click();
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 5/9');
  await expect(page.locator('#btnWorkflowEvaluate')).toHaveClass(/tutorial-highlight/);
  // Rating the supporting reason moves on to the opposing one; rating that one leads to reading the result.
  await page.locator('#tutorialTarget').click();
  await expect(page.locator('#btnWorkflowEvaluate')).toHaveClass(/active/);
  await reviewSelected(page, '80', '4');
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 6/9');
  await expect(page.locator('#tutorialText')).toContainText('Arvioi nyt myös vastaväite');
  await page.locator('#tutorialTarget').click();
  await reviewSelected(page, '60', '-2');
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 7/9');
  await expect(page.locator('#tutorialText')).toContainText('Plussalla perustelut kallistuvat puolesta');
  // Nothing in the document completes this step: it waits for the person, and its button reads Jatka.
  await page.locator('#tutorialTarget').click();
  await expect(page.locator('.node.is-root')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('score-reading')).toHaveText('kallistuu puolesta');
  await expect(page.locator('#inspector .score-hero')).toHaveClass(/tutorial-highlight/);
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 7/9');
  await expect(page.locator('#tutorialNext')).toHaveText('Jatka');
  await page.locator('#tutorialNext').click();
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 8/9');
  await expect(page.locator('#btnTableView')).toHaveClass(/tutorial-highlight/);
  await page.locator('#tutorialClose').click();
  await expect(panel).toBeHidden();
  await expect(page.locator('.tutorial-highlight')).toHaveCount(0);
  await expect(page.getByTestId('node-count')).toHaveText('3');
});

/**
 * must: "Uusi työ" offers the blank argument tree as the main choice and the AI route as a secondary one; a new
 *       blank document opens in the tree with its placeholder title selected for editing, so typing names the main
 *       claim at once (owner 2026-11-19, UI_INVENTORY S-11.11, S-15)
 * red-against: the AI route (three steps outside the app) as the highlighted choice, a new document that waits for a
 *              double click before its title can be written
 */
test('a new document starts by writing its main claim', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#btnHomeNew').click();
  await expect(page.locator('#btnNewWorkArgument')).toHaveClass(/primary/);
  await expect(page.locator('#btnAIDraft')).not.toHaveClass(/primary/);
  await page.locator('#btnNewWorkArgument').click();
  await expect(page.getByTestId('app')).toBeVisible();
  test.skip(
    testInfo.project.name === 'mobile',
    'a phone starts in the table, where the title is edited in the list'
  );
  const editor = page.locator('.node-inline-editor');
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('Mikä on tarkasteltava väite?');
  await page.keyboard.type('Etätyö parantaa keskittymistä');
  await page.keyboard.press('Enter');
  await expect(page.locator('.node.is-root .node-title')).toHaveText('Etätyö parantaa keskittymistä');
});
