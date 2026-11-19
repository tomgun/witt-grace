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
import { addNamed, reviewSelected, startBlank } from './helpers.ts';

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
  // A wide window starts with a look around: the tree, the left panel and the inspector, each with the callout
  // beside it and its arrow pointing at it; a phone has no side panels and starts from the first thing to do.
  if (testInfo.project.name !== 'mobile') {
    await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 1/13');
    await expect(page.locator('#tutorialPhases li[aria-current="step"]')).toHaveText('Tutustu');
    await expect(page.locator('#tutorialText')).toContainText('Ylimpänä on pääväite');
    await expect(page.locator('.node.is-root')).toHaveClass(/tutorial-highlight/);
    await expect(panel).not.toHaveAttribute('data-side', 'free');
    await expect(page.locator('#tutorialNext')).toHaveText('Seuraava');
    await page.locator('#tutorialNext').click();
    await expect(page.locator('#tutorialText')).toContainText('Vasemmalla näet saman puun listana');
    await expect(page.locator('.leftpanel')).toHaveClass(/tutorial-highlight/);
    await expect(panel).toHaveAttribute('data-side', 'right');
    await page.locator('#tutorialNext').click();
    await expect(page.locator('#tutorialText')).toContainText('Oikealla ovat valitun kortin tiedot');
    await expect(page.locator('.inspector-panel')).toHaveClass(/tutorial-highlight/);
    await expect(panel).toHaveAttribute('data-side', 'left');
    await page.locator('#tutorialNext').click();
    // The panel toggles of the top bar are taught too, pointed at from below.
    await expect(page.locator('#tutorialText')).toContainText('piilottavat ja näyttävät paneelit');
    await expect(page.locator('#btnZoneLeft').locator('..')).toHaveClass(/tutorial-highlight/);
    await expect(panel).toHaveAttribute('data-side', 'below');
    await page.locator('#tutorialNext').click();
  }
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 5/13');
  await expect(page.locator('#tutorialPhases li[aria-current="step"]')).toHaveText('Kartoita');
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
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 6/13');
  await expect(page.locator('.node[data-relation="support"]')).toHaveClass(/tutorial-highlight/);
  // Step 2: the default title is not a wording; naming it is.
  await editor.fill('Työmatkat vähenevät');
  await editor.press('Enter');
  await expect(page.locator('.node-title', { hasText: 'Työmatkat vähenevät' })).toBeVisible();
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 7/13');
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
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 8/13');
  await editor.press('Escape');
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 8/13');
  // Skip the wording step; the next one points at Punnitse.
  await page.locator('#tutorialNext').click();
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 9/13');
  await expect(page.locator('#btnWorkflowEvaluate')).toHaveClass(/tutorial-highlight/);
  // Rating the supporting reason moves on to the opposing one; rating that one leads to reading the result.
  await page.locator('#tutorialTarget').click();
  await expect(page.locator('#btnWorkflowEvaluate')).toHaveClass(/active/);
  await reviewSelected(page, '80', '4');
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 10/13');
  await expect(page.locator('#tutorialText')).toContainText('Arvioi nyt myös vastaväite');
  await page.locator('#tutorialTarget').click();
  await reviewSelected(page, '60', '-2');
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 11/13');
  await expect(page.locator('#tutorialText')).toContainText('Plussalla perustelut kallistuvat puolesta');
  // Nothing in the document completes this step: it waits for the person, and its button reads Seuraava.
  await page.locator('#tutorialTarget').click();
  await expect(page.locator('.node.is-root')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('score-reading')).toHaveText('kallistuu puolesta');
  await expect(page.locator('#inspector .score-hero')).toHaveClass(/tutorial-highlight/);
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 11/13');
  await expect(page.locator('#tutorialNext')).toHaveText('Seuraava');
  await page.locator('#tutorialNext').click();
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 12/13');
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

/**
 * must: the home screen asks once per visit whether to take the walkthrough: "Ei nyt" hides the question until the
 *       next visit, "Älä kysy enää" for good in this browser, "Aloita opastus" starts it; it is a card on the page
 *       and never stands in the way of the other buttons; the walkthroughs stay in the Apua menu (owner 2026-11-19,
 *       UI_INVENTORY S-01, S-12, S-15)
 * red-against: a question that comes back after "Älä kysy enää", a question that blocks "Luo uusi asiakirja", the
 *              walkthroughs unreachable once the question is gone
 */
test('the home screen invites to the walkthrough; no, later and never are all respected', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  const invite = page.locator('#tutorialInvite');
  await expect(invite).toContainText('Ensimmäistä kertaa täällä?');
  await expect(invite).toContainText('Opastukset löytyvät aina Apua-valikosta.');
  // The page works with the question open.
  await page.locator('#btnHomeNew').click();
  await expect(page.locator('#newWorkDialog')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.locator('#btnInviteLater').click();
  await expect(invite).toHaveCount(0);
  await page.reload();
  await expect(invite).toBeVisible();
  await page.locator('#btnInviteNever').click();
  await expect(invite).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(invite).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem('witt-tutorial-invite-v1'))).toBe('never');

  // Still there on request: from the home screen and from the Apua menu.
  await page.locator('#btnHomeTutorial').click();
  await expect(page.locator('#tutorialPanel')).toBeVisible();
  await expect(page.locator('#tutorialPanel')).toHaveAttribute('data-tutorial', 'basics');
  await page.locator('#tutorialClose').click();
  await page.locator('#helpMenu > summary').click();
  await expect(page.locator('#btnTutorial')).toHaveText('Opastettu harjoitus');
  await expect(page.locator('#btnTutorialPeople')).toHaveText('Opastus: useampi arvioija');
  await expect(page.locator('#btnTutorialCollab')).toHaveText('Opastus: yhteistyö verkossa');
});

test('"Aloita opastus" on the invite starts the walkthrough', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#btnInviteStart').click();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.locator('#tutorialPanel')).toHaveAttribute('data-tutorial', 'basics');
  await expect(page.locator('#tutorialHeading')).toHaveText('Harjoitellaan yhdessä');
});

/**
 * must: the second walkthrough has a second local assessor added and rate the same reason, then shows where the
 *       two views are compared; it advances when the document shows the step was done; it ends by offering the
 *       third one (owner 2026-11-19, S-15)
 * red-against: the step passed before an assessor exists, the first assessor's ratings counted as the second's
 */
test('the walkthrough for several assessors follows what is done', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the toolbar menus and the side panels are a desktop walk');
  await startBlank(page, 'argument');
  await page.locator('#helpMenu > summary').click();
  await page.locator('#btnTutorialPeople').click();
  await page.locator('#replaceForget').click();
  const panel = page.locator('#tutorialPanel');
  await expect(panel).toHaveAttribute('data-tutorial', 'people');
  await expect(page.getByTestId('node-count')).toHaveText('3');
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 1/5');
  await expect(page.locator('#actorSelect')).toHaveClass(/tutorial-highlight/);
  await page.locator('#tutorialNext').click();
  await expect(page.locator('#tutorialText')).toContainText('Lisää toinen arvioija');

  // Adding the assessor (the select's last choice asks for a name) completes the step.
  await page.locator('#actorSelect').selectOption({ label: '+ Lisää paikallinen arvioija…' });
  await page.locator('#textValue').fill('Bea');
  await page.locator('#textAccept').click();
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 3/5');
  await expect(page.locator('#actorSelect option:checked')).toHaveText('Bea');

  // The first assessor's ratings do not count as Bea's: only her own complete the step.
  await page.locator('#tutorialTarget').click();
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 3/5');
  await reviewSelected(page, '40', '1');
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 4/5');
  await page.locator('#tutorialTarget').click();
  await expect(page.getByTestId('score-whose')).toBeVisible();
  await expect(page.locator('#inspector .score-hero')).toHaveClass(/tutorial-highlight/);
  await page.locator('#tutorialNext').click();
  await expect(page.locator('#assessmentMenu')).toHaveClass(/tutorial-highlight/);
  await page.locator('#tutorialNext').click();
  await expect(page.locator('#tutorialProgress')).toHaveText('Harjoitus valmis');
  await expect(page.locator('#tutorialContinue')).toHaveText('Seuraavaksi: yhteistyö verkossa');
});

/**
 * must: the third walkthrough uses the open document, points at the Tiedosto menu, waits until the collaboration
 *       dialog has been opened and closed, and stays out of the way while a dialog is open (owner 2026-11-19, S-15)
 * red-against: the open work replaced by a practice document, the callout drawn over a dialog it cannot be used with
 */
test('the walkthrough for working together online points at the menu and waits for the dialog', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the toolbar menus are a desktop walk');
  await startBlank(page, 'argument');
  await addNamed(page, '#btnSupport', 'Oma perustelu');
  await page.locator('#helpMenu > summary').click();
  await page.locator('#btnTutorialCollab').click();
  const panel = page.locator('#tutorialPanel');
  await expect(panel).toHaveAttribute('data-tutorial', 'collab');
  // The document is the person's own: nothing was replaced.
  await expect(page.getByTestId('node-count')).toHaveText('2');
  await expect(page.locator('#fileMenu')).toHaveClass(/tutorial-highlight/);
  await page.locator('#tutorialNext').click();
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 2/4');
  await page.locator('#fileMenu > summary').click();
  await page.locator('#btnCollab').click();
  await expect(page.locator('#collabDialog, dialog[open]').first()).toBeVisible();
  await expect(panel).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
  await expect(page.locator('#tutorialProgress')).toHaveText('Vaihe 3/4');
  await expect(page.locator('#tutorialText')).toContainText('Kutsuttu avaa linkin');
});
