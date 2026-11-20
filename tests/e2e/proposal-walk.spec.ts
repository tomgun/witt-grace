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
 * must: the home screen's "Tutustu menetelmään" and "Tietoa menetelmästä" open the method's introduction, not the
 *       tool's help: benefits first, then how it works, what it suits and what it does not promise, no keyboard
 *       shortcuts; it fits the screen's width; its first button starts the walkthrough (S-15, owner 2026-11-20)
 * red-against: the link still opening the help dialog with its shortcut table, the introduction without a way to
 *              start, the text spilling sideways on a phone
 */
test('"Tutustu menetelmään" introduces the method and leads to the walkthrough', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  for (const link of ['#btnHomeAbout', '#btnHomeHelp']) {
    await page.locator(link).click();
    await expect(page.locator('#methodDialog')).toBeVisible();
    await page.locator('#btnMethodClose').click();
    await expect(page.locator('#methodDialog')).toHaveCount(0);
  }
  await page.locator('#btnHomeHelp').click();
  const dialog = page.locator('#methodDialog');
  await expect(dialog.locator('h2')).toHaveText('GRACE-menetelmä: tee ajattelusta näkyvää');
  await expect(dialog.locator('h3')).toHaveText([
    'Mitä saat',
    'Näin se toimii',
    'Mihin se sopii',
    'Mitä se ei lupaa',
  ]);
  await expect(dialog.locator('.method-gains li')).toHaveCount(4);
  await expect(dialog.locator('.method-stages li strong')).toHaveText([
    'Kartoita',
    'Punnitse',
    'Päätä yhdessä',
  ]);
  await expect(dialog).toContainText('Puuttuva arvio ei ole nolla');
  await expect(dialog.locator('kbd')).toHaveCount(0);
  await expect(page.locator('#helpDialog')).toHaveCount(0);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.locator('#btnMethodTutorial').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#tutorialPanel')).toBeVisible();
});
