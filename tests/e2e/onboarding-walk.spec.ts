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
  // Every example says which type of document it is.
  await expect(card.locator('.example-type')).toHaveText('Argumentointi');
  await expect(examples.locator('.example-card[data-example="pilvialusta"] .example-type')).toHaveText(
    'Päätös'
  );

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
  const progress = page.locator('#tutorialProgress');
  const text = page.locator('#tutorialText');
  const next = page.locator('#tutorialNext');
  const phase = page.locator('#tutorialPhases li[aria-current="step"]');
  const wide = testInfo.project.name !== 'mobile';

  // It begins with the tree itself and with doing: the list and the panels wait until there is something in them.
  await expect(progress).toHaveText('Vaihe 1/16');
  await expect(phase).toHaveText('Kartoita');
  await expect(page.locator('#tutorialHeading')).toHaveText('Harjoitellaan yhdessä');
  await expect(text).toContainText('Ylimpänä on pääväite');
  await expect(page.locator('.node.is-root')).toHaveClass(/tutorial-highlight/);
  await expect(next).toHaveText('Seuraava');
  await expect(page.locator('#tutorialBack')).toBeDisabled();
  if (wide) {
    // Every panel is shown when a walkthrough starts, and the callout stands beside what it talks about.
    await expect(page.locator('.leftpanel')).toBeVisible();
    await expect(page.locator('.inspector-panel')).toBeVisible();
    await expect(panel).not.toHaveAttribute('data-side', 'free');
  }
  await next.click();

  // Step 2: a supporting reason with the card's own + button; the step names the key.
  await expect(progress).toHaveText('Vaihe 2/16');
  await expect(text).toContainText('paina sen kortin +-painiketta');
  await expect(text).toContainText('Pikanäppäin: +.');
  await expect(page.locator('.node.is-root .node-title')).toContainText('Nelipäiväinen työviikko');
  await expect(page.getByTestId('node-count')).toHaveText('1');
  await expect(page.locator('.node.is-root .node-add[data-relation="support"]')).toHaveClass(
    /tutorial-highlight/
  );
  await page.locator('#viewport').focus();
  await page.keyboard.press('+');
  const editor = page.locator('.node-inline-editor');
  await expect(editor).toBeFocused();
  await expect(progress).toHaveText('Vaihe 3/16');
  await expect(page.locator('.node[data-relation="support"]')).toHaveClass(/tutorial-highlight/);
  // Step 3: the default title is not a wording; naming it is.
  await editor.fill('Työmatkat vähenevät');
  await editor.press('Enter');
  await expect(page.locator('.node-title', { hasText: 'Työmatkat vähenevät' })).toBeVisible();
  await expect(progress).toHaveText('Vaihe 4/16');
  await expect(text).toContainText('Pikanäppäin: -.');
  await expect(page.locator('.node.is-root .node-add[data-relation="oppose"]')).toHaveClass(
    /tutorial-highlight/
  );
  // Step 4: "Näytä kohde" selects the thesis and focuses its − button; on a narrow screen, where the panel covers
  // the canvas, it adds the reason directly (the prototype's rule).
  await page.locator('#tutorialTarget').click();
  if (wide) {
    await expect(page.locator('.node.is-root')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.node.is-root .node-add[data-relation="oppose"]')).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(editor).toBeFocused();
  await expect(progress).toHaveText('Vaihe 5/16');
  await editor.press('Escape');
  await expect(progress).toHaveText('Vaihe 5/16');

  // Going back looks at a step again: it does not bounce forward although its condition holds, and Seuraava
  // returns. The phase chips do the same.
  await page.locator('#tutorialBack').click();
  await expect(progress).toHaveText('Vaihe 4/16');
  await page.locator('#tutorialBack').click();
  await expect(progress).toHaveText('Vaihe 3/16');
  await expect(next).toHaveText('Seuraava');
  await next.click();
  await next.click();
  await expect(progress).toHaveText('Vaihe 5/16');

  // The wording step can be passed with Seuraava; then, on a wide window, the look around: the list (now with two
  // reasons in it), the inspector and the panel toggles.
  await next.click();
  if (wide) {
    await expect(progress).toHaveText('Vaihe 6/16');
    await expect(phase).toHaveText('Tutustu');
    await expect(text).toContainText('Vasemmalla näet saman puun listana');
    await expect(page.locator('.leftpanel')).toHaveClass(/tutorial-highlight/);
    await expect(panel).toHaveAttribute('data-side', 'right');
    await next.click();
    await expect(text).toContainText('Oikealla ovat valitun kortin tiedot');
    await expect(page.locator('.inspector-panel')).toHaveClass(/tutorial-highlight/);
    await expect(panel).toHaveAttribute('data-side', 'left');
    await next.click();
    await expect(text).toContainText('piilottavat ja näyttävät paneelit');
    await expect(page.locator('#btnZoneLeft').locator('..')).toHaveClass(/tutorial-highlight/);
    await expect(panel).toHaveAttribute('data-side', 'below');
    await next.click();
  }
  await expect(progress).toHaveText('Vaihe 9/16');
  await expect(phase).toHaveText('Punnitse');
  await expect(text).toContainText('Vaihda työkalurivistä vaiheeseen Punnitse');
  await expect(page.locator('#btnWorkflowEvaluate')).toHaveClass(/tutorial-highlight/);
  // Switching the stage is its own step; the next one says what the two sliders mean.
  await page.locator('#btnWorkflowEvaluate').click();
  await expect(progress).toHaveText('Vaihe 10/16');
  await expect(text).toContainText('Uskottavuus (0–100 %): kuinka varmasti väite pitää paikkansa');
  await expect(text).toContainText('kuinka paljon se tukee (+) tai heikentää (−)');
  // Rating the supporting reason moves on to the opposing one.
  await page.locator('#tutorialTarget').click();
  await reviewSelected(page, '80', '4');
  await expect(progress).toHaveText('Vaihe 11/16');
  await expect(text).toContainText('Arvioi nyt myös vastaväite');
  await page.locator('#tutorialTarget').click();
  await reviewSelected(page, '60', '-2');
  // Both rated: the assessment round is explained, with where it starts and its key; then the result.
  await expect(progress).toHaveText('Vaihe 12/16');
  await expect(text).toContainText('arviointikierrosta');
  await expect(text).toContainText('Arviointi → Arviointikierros');
  await expect(text).toContainText('Pikanäppäin: R.');
  if (wide) await expect(page.locator('#assessmentMenu')).toHaveClass(/tutorial-highlight/);
  await next.click();
  await expect(progress).toHaveText('Vaihe 13/16');
  await expect(phase).toHaveText('Tulos');
  await expect(text).toContainText('Plussalla perustelut kallistuvat puolesta');
  // The objection is still the selected card: its result box is not the one the step is about, so the main claim's
  // card is pointed at until it is selected. Nothing in the document completes this step.
  await expect(page.locator('.node.is-root')).toHaveClass(/tutorial-highlight/);
  await expect(page.locator('#inspector .score-hero')).not.toHaveClass(/tutorial-highlight/);
  await page.locator('#tutorialTarget').click();
  await expect(page.locator('.node.is-root')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('score-reading')).toHaveText('kallistuu puolesta');
  await expect(page.locator('#inspector .score-hero')).toHaveClass(/tutorial-highlight/);
  await expect(progress).toHaveText('Vaihe 13/16');
  await next.click();

  // The table is opened, stays open to be looked at, and is left; only then is the tree untidied for arranging.
  await expect(progress).toHaveText('Vaihe 14/16');
  await expect(phase).toHaveText('Näkymät');
  await expect(page.locator('#btnTableView')).toHaveClass(/tutorial-highlight/);
  await page.locator('#btnTableView').click();
  await expect(progress).toHaveText('Vaihe 15/16');
  await expect(page.locator('#btnTableView')).toHaveClass(/active/);
  await expect(text).toContainText('palaa puuhun painikkeesta Puu');
  await expect(page.locator('#btnTreeView')).toHaveClass(/tutorial-highlight/);
  await page.locator('#btnTreeView').click();
  await expect(progress).toHaveText('Vaihe 16/16');
  await expect(text).toContainText('tarkoituksella epäjärjestyksessä');
  await expect(text).toContainText('Pikanäppäin: Alt+A.');
  await expect(page.locator('#viewport')).toBeVisible();
  // The untidy tree is what the step is about, so it is in plain sight: the view settings are not opened over it,
  // and the two reasons really lie on top of each other.
  await expect(page.locator('#viewDock')).toBeHidden();
  await expect(page.locator('#btnViewSettings')).toHaveClass(/tutorial-highlight/);
  const overlap = async () => {
    const [a, b] = await page
      .locator('#nodesLayer .node:not(.is-root)')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
    return !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  };
  expect(await overlap()).toBe(true);
  if (wide) {
    // With the view settings open the callout stands beside them, not behind them, and can still be used.
    await page.locator('#btnViewSettings').click();
    await expect(page.locator('#btnLayout')).toHaveClass(/tutorial-highlight/);
    const dock = (await page.locator('#viewDock').boundingBox())!;
    await expect
      .poll(async () => {
        const box = (await panel.boundingBox())!;
        return box.x >= dock.x + dock.width || box.x + box.width <= dock.x;
      })
      .toBe(true);
    await page.locator('#btnLayout').click();
    await page.locator('#btnDockClose').click();
  } else await page.locator('#tutorialTarget').click();
  expect(await overlap()).toBe(false);
  await expect(progress).toHaveText('Harjoitus valmis');
  await expect(page.locator('#tutorialContinue')).toHaveText('Seuraavaksi: päätös vaihtoehtojen välillä');

  // Finished, every earlier step can still be looked at: one step back, or a phase at a time.
  await page.locator('#tutorialBack').click();
  await expect(progress).toHaveText('Vaihe 16/16');
  await page.locator('#tutorialPhases button', { hasText: 'Punnitse' }).click();
  await expect(progress).toHaveText('Vaihe 9/16');
  await expect(next).toHaveText('Seuraava');
  await page.locator('#tutorialPhases button', { hasText: 'Kartoita' }).click();
  await expect(progress).toHaveText('Vaihe 1/16');

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
  await expect(page.locator('#btnTutorialDecision')).toHaveText('Opastus: päätös vaihtoehtojen välillä');
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

/**
 * must: the walkthrough for a decision starts from an argument document, has its type changed from the chip beside
 *       the title, two options added, a reason put under one and rated, and then shows where the options are
 *       compared and where the vote is; each step is passed only by what it asks for (owner 2026-11-19, S-15)
 * red-against: the type step passed without the type changing, one option counted as a choice, the comparison
 *              pointed at while another card is selected
 */
test('the walkthrough for a decision follows what is done', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile',
    'the chip, the toolbar and the side panels are a desktop walk'
  );
  await startBlank(page, 'argument');
  await page.locator('#helpMenu > summary').click();
  await page.locator('#btnTutorialDecision').click();
  await page.locator('#replaceForget').click();
  const panel = page.locator('#tutorialPanel');
  const progress = page.locator('#tutorialProgress');
  await expect(panel).toHaveAttribute('data-tutorial', 'decision');
  await expect(progress).toHaveText('Vaihe 1/7');
  await expect(page.locator('#docTypeChip')).toHaveText('Argumentointi');
  await expect(page.locator('#docTypeMenu')).toHaveClass(/tutorial-highlight/);
  await page.locator('#tutorialNext').click();
  await expect(progress).toHaveText('Vaihe 2/7');

  await page.locator('#docTypeChip').click();
  await page.locator('#modeDecision').click();
  await expect(page.locator('#docTypeChip')).toHaveText('Päätös');
  await expect(progress).toHaveText('Vaihe 3/7');
  await expect(page.locator('#btnOption')).toHaveClass(/tutorial-highlight/);
  await addNamed(page, '#btnOption', 'Neljä päivää');
  await expect(progress).toHaveText('Vaihe 3/7');
  await page.locator('.node.is-root .node-title').click();
  await addNamed(page, '#btnOption', 'Viisi päivää');
  await expect(progress).toHaveText('Vaihe 4/7');

  await page.locator('#tutorialTarget').click();
  await addNamed(page, '#btnSupport', 'Palautuminen paranee');
  await expect(progress).toHaveText('Vaihe 5/7');
  await expect(page.locator('#tutorialText')).toContainText('merkitystä juuri tälle vaihtoehdolle');
  await page.locator('#tutorialTarget').click();
  await reviewSelected(page, '80', '4');
  await expect(progress).toHaveText('Vaihe 6/7');

  // The comparison belongs to the decision question: its card is pointed at until it is the selected one.
  await expect(page.locator('.node.is-root')).toHaveClass(/tutorial-highlight/);
  await page.locator('#tutorialTarget').click();
  await expect(page.getByTestId('decision-overview')).toHaveClass(/tutorial-highlight/);
  await page.locator('#tutorialNext').click();
  await expect(progress).toHaveText('Vaihe 7/7');
  await expect(page.locator('#btnVoting')).toHaveClass(/tutorial-highlight/);
  await page.locator('#tutorialNext').click();
  await expect(progress).toHaveText('Harjoitus valmis');
  await expect(page.locator('#tutorialContinue')).toHaveText('Seuraavaksi: useampi arvioija');
});
