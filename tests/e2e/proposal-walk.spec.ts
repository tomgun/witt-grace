/**
 * must: the home screen offers one main action and five others in three captioned groups (Avaa, Opettele,
 *       Yhdessä); it has no action that needs an open document (importing or exporting additions) and no box of
 *       save times. The dialog for importing and exporting additions asks what the person wants to do and shows
 *       one of three goals at a time: asking an AI, importing what was received, exporting one's own; the choice
 *       is a tab list that the arrow keys move in, the dialog has one Sulje, and the last goal is remembered while
 *       the page is open (S-15, owner's notes 2026-11-19)
 * test: tests/e2e/proposal-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: the import-or-export action left on the home screen, the saved-work box left in, two goals' panels
 *              shown at once, the arrow keys not moving the choice, the dialog reopening on the first goal, the
 *              three choices overflowing the dialog on a phone
 */
import { expect, test } from '@playwright/test';
import { startBlank } from './helpers.ts';

test('the home screen: one main action, three groups, nothing that needs an open document', async ({
  page,
}) => {
  await startBlank(page, 'argument');
  await page.keyboard.press('Escape');
  await page.locator('#btnBackHome').click();
  const home = page.getByTestId('home');
  await expect(home).toBeVisible();
  await expect(page.locator('#btnHomeContinue')).toBeVisible();
  const groups = page.locator('.home-groups .home-group');
  // The sketchpad is opened from the tool's Näkymä menu, not from here (owner 2026-11-21).
  await expect(groups).toHaveCount(3);
  await expect(groups.nth(0)).toHaveAccessibleName('Avaa');
  await expect(groups.nth(1)).toHaveAccessibleName('Opettele');
  await expect(groups.nth(2)).toHaveAccessibleName('Yhdessä');
  expect(
    await groups
      .nth(0)
      .locator('button')
      .evaluateAll((els) => els.map((e) => e.id))
  ).toEqual(['btnHomeOpen', 'btnHomeLibrary']);
  expect(
    await groups
      .nth(1)
      .locator('button')
      .evaluateAll((els) => els.map((e) => e.id))
  ).toEqual(['btnHomeTutorial', 'btnHomeDemo']);
  expect(
    await groups
      .nth(2)
      .locator('button')
      .evaluateAll((els) => els.map((e) => e.id))
  ).toEqual(['btnHomeCollab']);
  await expect(page.locator('#btnHomeAIReview')).toHaveCount(0);
  await expect(page.locator('#homeCurrentWork')).toHaveCount(0);
  await expect(home.locator('details')).toHaveCount(0);
  // Nothing on the page is wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('importing and exporting additions: one goal at a time', async ({ page }) => {
  await startBlank(page, 'argument');
  await page.keyboard.press('Escape');
  const open = () => page.evaluate(() => document.getElementById('btnAIReview')!.click());
  await open();
  const dialog = page.locator('#aiReviewDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('tablist')).toHaveAccessibleName('Mitä haluat tehdä?');
  const tabs = dialog.getByRole('tab');
  await expect(tabs).toHaveText(['Pyydä AI:lta lisäyksiä', 'Tuo saamani lisäykset', 'Vie omat lisäykseni']);
  const shown = () =>
    dialog
      .locator('.proposal-panel')
      .evaluateAll((els) => els.filter((e) => !e.hasAttribute('hidden')).map((e) => e.id));
  expect(await shown()).toEqual(['proposalPanel-ai']);
  await expect(page.locator('#btnAIReviewCopy')).toBeVisible();
  await expect(page.locator('#aiReviewPaste')).toBeHidden();
  await expect(page.locator('#btnWITTExport')).toBeHidden();

  // The arrow keys move the choice, and it wraps.
  await page.locator('#tabProposalAI').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tabProposalImport')).toBeFocused();
  expect(await shown()).toEqual(['proposalPanel-import']);
  await expect(page.locator('#aiReviewPaste')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  expect(await shown()).toEqual(['proposalPanel-export']);
  await expect(page.locator('#btnWITTExport')).toHaveText('Valitse alkuperäinen tiedosto ja vie');
  await expect(page.locator('#contributionExporterList')).toHaveAccessibleName('Keiden lisäykset viedään');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tabProposalAI')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  expect(await shown()).toEqual(['proposalPanel-export']);

  // The three choices and the panel fit the dialog.
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  // One way out, and the goal is where it was left.
  await expect(dialog.locator('.proposal-panel button', { hasText: 'Sulje' })).toHaveCount(0);
  await expect(page.locator('#btnAIReviewClose')).toBeVisible();
  await page.locator('#btnAIReviewClose').click();
  await expect(dialog).toHaveCount(0);
  await open();
  await expect(page.locator('#tabProposalExport')).toHaveAttribute('aria-selected', 'true');
  expect(await shown()).toEqual(['proposalPanel-export']);
});

/**
 * must: the method is told on the home screen itself (owner 2026-11-20, S-15): "Tutustu menetelmään" under the
 *       lead and "Tietoa menetelmästä" in the top row take the reader to the section and its heading gets the
 *       focus; the section tells benefits first, then how it works, what it suits and what it does not promise,
 *       without keyboard shortcuts; the lead says whom the tool is for, alone or together; the page does not spill
 *       sideways; the section's first button starts the walkthrough
 * red-against: the link opening a dialog (or the help with its shortcut table) instead of the page's own text, the
 *              introduction without a way to start, the text spilling sideways on a phone, the brand lines without
 *              working together
 */
test('the home screen tells the method itself and leads to the walkthrough', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.home-audience')).toHaveText(
    'Yksin tai yhdessä: yksilöille, perheille, tiimeille, yhteisöille ja organisaatioille.'
  );
  const method = page.locator('#homeMethod');
  const heading = page.locator('#homeMethodTitle');
  for (const link of ['#btnHomeAbout', '#btnHomeHelp']) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator(link).click();
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  }
  await expect(heading).toHaveText('GRACE-menetelmä: tee ajattelusta näkyvää');
  await expect(method.locator('h3')).toHaveText([
    'Mitä saat',
    'Näin se toimii',
    'Mihin se sopii',
    'Mitä se ei lupaa',
  ]);
  // The benefits come first, in the reader's words: one claim at a time, where the disagreement is, a result
  // that can be explained, everyone's own assessment.
  await expect(method.locator('.method-gains li strong')).toHaveText([
    'Yksi väite kerrallaan',
    'Näet, mistä olette eri mieltä',
    'Tulos, jonka voi selittää',
    'Jokaisen arvio itsenäisesti',
  ]);
  // One need not rate to use the tool: the first stage says so.
  await expect(method.locator('.home-features li').first()).toContainText('Voit pysähtyä tähän');
  // The example beside the lead takes turns between seven small trees: five walks of life, a decision, risks.
  const visual = page.locator('.home-visual');
  await expect(visual.locator('.visual-dots button')).toHaveCount(7);
  await visual.locator('.visual-dots button').nth(4).click();
  await expect(page.locator('#homeScenarioName')).toHaveText('Perhe');
  await expect(visual.locator('.visual-root')).toContainText('Hankitaanko perheeseen koira?');
  // A reason's own reason is about that reason, and sits under it: each branch holds its card and its children.
  const branches = visual.locator('.visual-branch');
  await expect(branches).toHaveCount(2);
  await expect(branches.nth(0).locator('> .visual-node strong')).toHaveText('Lapset oppivat vastuuta');
  await expect(branches.nth(0).locator('.visual-children .visual-node strong')).toHaveText([
    'Hoitovuorot jaetaan lasten kesken',
  ]);
  await expect(branches.nth(1).locator('.visual-children .visual-node strong')).toHaveText([
    'Isovanhemmat voivat hoitaa lomilla',
  ]);
  // A picture, not content: hidden from a screen reader and out of the tab order.
  await expect(visual).toHaveAttribute('aria-hidden', 'true');
  expect(await visual.locator('button:not([tabindex="-1"])').count()).toBe(0);
  await visual.locator('.visual-dots button').nth(0).click();
  await expect(page.locator('#homeScenarioName')).toHaveText('Yritys');
  await expect(visual.locator('.visual-children .visual-node strong')).toHaveText([
    'Varhainen palaute auttaa parantamaan tuotetta',
    'Testataan tärkeimmät oletukset ensin',
  ]);
  // The arrows at the sides go round: back from the first example is the last one, the risks.
  await visual.hover();
  await page.locator('#btnScenarioPrev').click();
  await expect(page.locator('#homeScenarioName')).toHaveText('Riskit');
  // The goal is named as the goal, and under it are two risks to it, each with its cause and what is done about it.
  await expect(visual.locator('.visual-root')).toContainText('Tavoite: verkkokauppa aukeaa marraskuussa');
  for (const index of [0, 1]) {
    await expect(branches.nth(index).locator('> .visual-node small')).toHaveText('! RISKI');
    await expect(branches.nth(index).locator('.visual-children .visual-node small')).toHaveText([
      'SYY',
      'TORJUNTA',
    ]);
  }
  await expect(branches.nth(1).locator('.visual-children .visual-node strong')).toHaveText([
    'Aikataulussa ei ole joustovaraa',
    'Viikoittainen katsaus paljastaa viiveet ajoissa',
  ]);
  await page.locator('#btnScenarioPrev').click();
  await expect(page.locator('#homeScenarioName')).toHaveText('Päätös');
  await expect(visual.locator('.visual-branch > .visual-node.option strong')).toHaveText([
    'Toimisto keskustassa',
    'Etätyö ja pieni tila',
  ]);
  await expect(branches.nth(1).locator('.visual-children .visual-node small')).toHaveText([
    '+ PUOLTAA',
    '− VASTUSTAA',
  ]);
  await page.locator('#btnScenarioNext').click();
  await page.locator('#btnScenarioNext').click();
  await expect(page.locator('#homeScenarioName')).toHaveText('Yritys');
  await expect(method.locator('.method-gains li')).toHaveCount(4);
  await expect(method.locator('.home-features li h4')).toHaveText(['Kartoita', 'Punnitse', 'Päätä yhdessä']);
  // What it does not promise is said in plain words, without the tool's inner rules.
  await expect(method).toContainText('Se ei kerro, onko väite tosi');
  // Risks are a side thread of the same tool (owner 2026-11-24).
  await expect(method).toContainText('Samalla tavalla voi jäsentää riskit');
  await expect(method).not.toContainText('Puuttuva arvio ei ole nolla');
  await expect(method.locator('kbd')).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  ).toBe(true);
  await page.locator('#btnMethodTutorial').click();
  await expect(page.locator('#tutorialPanel')).toBeVisible();
});
