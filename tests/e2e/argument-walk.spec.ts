/**
 * must: from the home screen a person starts a blank argument document, adds a supporting reason with `+`, names it in
 *       the card's inline editor, switches to Punnitse, reviews it 100 % / +5 and reads +50.0 as the thesis balance;
 *       a thesis without reasons shows "—", never 0; a second unreviewed reason shows "—/—" and marks the balance
 *       incomplete with †; the work survives a reload; Alt+1..4 and Alt+V toggle the zones and the dock; the file menu
 *       exports v8 JSON; decision mode adds options; themes and languages switch; the top bar's ↶/↷ undo and redo an
 *       added card and its ? opens help without widening the page; × or Delete removes a leaf without asking (a
 *       fading copy stays a second), a subtree asks first, and undo restores it; the added Terminaali, ASCII,
 *       Sarjakuva and Lehto themes apply and persist, and ASCII draws the edges as characters; an unassessed slider reads "—" and
 *       saving one axis saves the other as shown in one undo step; the dock has seven layers and no drag-from-text
 *       option; a new document uses Laskenta koko puusta (a claim's rating counts and its result reads as a
 *       percentage; an unrated claim reads the net of its reasons), the Arviointi menu offers that and Laskenta
 *       suorista perusteluista only, and a document stored with an archived method opens under the default
 *       (owner 2026-11-18) (UI_INVENTORY S-01, S-02, S-03, S-07, S-07.1, S-08, S-15)
 * test: tests/e2e/argument-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: a leaf thesis shown as 0, a review saved under the wrong node, the autosave skipped, the incomplete
 *              marker rendered as "*", undo/redo buttons wired to nothing, redo enabled with nothing to redo, the
 *              document's starting value shown as if assessed, a one-axis save leaving the pair half missing, a
 *              rated claim's credence shown on the −100…+100 scale, a new method falling through to another's label
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addNamed, openSettings, reviewSelected as review, selectRoot, startBlank } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await startBlank(page, 'argument');
});

async function addReason(page: Page, key: '+' | '-', title: string) {
  await page.locator('#viewport').focus();
  await page.keyboard.press(key);
  const editor = page.locator('.node-inline-editor');
  await expect(editor).toBeFocused();
  await editor.fill(title);
  await editor.press('Enter');
  await expect(page.locator('.node-title', { hasText: title })).toBeVisible();
}

test('start, add a reason with +, review it in Punnitse and read the balance', async ({ page }) => {
  await expect(page.getByTestId('node-count')).toHaveText('1');
  await page.locator('#btnWorkflowEvaluate').click();
  // A thesis without reasons has no derived result: "—", not 0 (inv-inspector §F).
  await expect(page.getByTestId('score-balance')).toContainText('—');
  await addReason(page, '+', 'Hinta on alhainen');
  await expect(page.getByTestId('node-count')).toHaveText('2');
  await review(page, '100', '5');
  const chip = page
    .locator('.node', { hasText: 'Hinta on alhainen' })
    .locator('.meta-assessment .meta-value');
  await expect(chip).toHaveText('100%/+5');
  await selectRoot(page);
  await expect(page.getByTestId('score-balance')).toContainText('+50.0');
  await expect(page.locator('.node.is-root .meta-index .meta-value')).toHaveText('+50');
  await page.reload();
  await page.locator('#btnHomeContinue').click();
  await expect(page.getByTestId('node-count')).toHaveText('2');
  await expect(page.locator('.node.is-root .meta-index .meta-value')).toHaveText('+50');
});

test('a second unreviewed reason makes the balance incomplete (†), not zero', async ({ page }) => {
  await page.locator('#btnWorkflowEvaluate').click();
  await addReason(page, '+', 'Hinta on alhainen');
  await review(page, '100', '5');
  await selectRoot(page);
  await addReason(page, '-', 'Laatu on heikko');
  await expect(page.getByTestId('node-count')).toHaveText('3');
  const pair = page.locator('.node', { hasText: 'Laatu on heikko' }).locator('.meta-assessment .meta-value');
  await expect(pair).toHaveText('—/—');
  await selectRoot(page);
  await expect(page.getByTestId('score-balance')).toContainText('+50.0 †');
});

test('zones toggle with Alt+1..4, the dock with Alt+V, and the file menu exports JSON', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the pane buttons are desktop controls');
  await expect(page.getByTestId('outline')).toBeVisible();
  await page.locator('#viewport').focus();
  await page.keyboard.press('Alt+1');
  await expect(page.getByTestId('outline')).toBeHidden();
  await page.keyboard.press('Alt+1');
  await expect(page.getByTestId('outline')).toBeVisible();
  await page.keyboard.press('Alt+4');
  await expect(page.locator('#bottomZone')).toBeVisible();
  await page.keyboard.press('Alt+V');
  await expect(page.locator('#viewDock')).toBeVisible();
  await page.locator('#viewport').focus();
  await page.keyboard.press('Alt+V');
  await expect(page.locator('#viewDock')).toHaveCount(0);

  await page.locator('#fileMenu summary').click();
  const download = page.waitForEvent('download');
  await page.locator('#btnSave').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.witt\.json$/);
  const text = await (
    await file.createReadStream()
  )
    .toArray()
    .then((chunks) => Buffer.concat(chunks).toString('utf8'));
  const parsed = JSON.parse(text) as { schemaVersion: number; settings: { scoring: string } };
  expect(parsed.schemaVersion).toBe(8);
  expect(parsed.settings.scoring).toBe('anchored-reasons-v1');
});

test('switching to decision mode offers options; Yövärit (bitberg) theme applies', async ({ page }) => {
  // The document's type is in the Tiedosto menu and shown beside the title.
  await expect(page.locator('#docTypeChip')).toHaveText('Argumentointi');
  await page.locator('#fileMenu > summary').click();
  await page.locator('#modeDecision').click();
  await expect(page.locator('#docTypeChip')).toHaveText('Päätös');
  await expect(page.locator('#modeDecision')).toHaveClass(/active/);
  await page.locator('#editMenu summary').click();
  await page.locator('#btnEditMenuOption').click();
  await expect(page.getByTestId('node-count')).toHaveText('2');
  await expect(page.locator('.node[data-relation="option"]')).toHaveCount(1);
  await openSettings(page);
  await page.locator('#themeSelect').selectOption('bitberg');
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'bitberg');
  await expect(page.locator('#themeSelect option:checked')).toHaveText('◆ Yövärit');
});

test('switching the language loads its messages on demand', async ({ page }) => {
  await expect(page.locator('#fileMenu summary')).toHaveText('Tiedosto');
  await openSettings(page);
  await page.locator('#localeSelect').selectOption('en');
  await expect(page.locator('#fileMenu summary')).toHaveText('File');
  await page.reload();
  await page.locator('#btnHomeContinue').click();
  await expect(page.locator('#fileMenu summary')).toHaveText('File');
  await openSettings(page);
  await page.locator('#localeSelect').selectOption('fi');
  await expect(page.locator('#fileMenu summary')).toHaveText('Tiedosto');
});

test('the top bar undo and redo buttons revert and reapply an edit', async ({ page }) => {
  await startBlank(page, 'argument');
  await expect(page.locator('#btnRedoTop')).toBeDisabled();
  await addNamed(page, '#btnSupport', 'Undo target');
  await expect(page.getByTestId('node-count')).toHaveText('2');
  // Adding and naming may be one or two steps; undo until the card is gone, then redo until it is back.
  await expect(async () => {
    await page.locator('#btnUndoTop').click();
    await expect(page.getByTestId('node-count')).toHaveText('1', { timeout: 500 });
  }).toPass();
  await expect(page.locator('#btnRedoTop')).toBeEnabled();
  await expect(async () => {
    await page.locator('#btnRedoTop').click();
    await expect(page.locator('.node-title', { hasText: 'Undo target' })).toBeVisible({ timeout: 500 });
  }).toPass();
});

test('the top bar ? button opens the help and shortcuts dialog', async ({ page }) => {
  await startBlank(page, 'argument');
  await page.locator('#btnHelpTop').click();
  await expect(page.locator('#helpDialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
});

test('× deletes a leaf at once with a fading copy; a subtree asks first; undo restores', async ({ page }) => {
  await startBlank(page, 'argument');
  await addNamed(page, '#btnSupport', 'Leaf to delete');
  const leaf = page.locator('#nodesLayer .node', { hasText: 'Leaf to delete' });
  await page.locator('#zoomReset').click();
  await leaf.locator('.node-delete').click();
  await expect(page.getByTestId('node-count')).toHaveText('1');
  await expect(page.locator('#nodeGhosts .node-ghost')).toHaveCount(1);
  await expect(page.locator('#nodeGhosts .node-ghost')).toHaveCount(0, { timeout: 3000 });
  await page.locator('#btnUndoTop').click();
  await expect(page.getByTestId('node-count')).toHaveText('2');
  await expect(page.locator('#nodeGhosts .node-ghost')).toHaveCount(0);
  // The root has no ×; a card with children asks before Delete removes it.
  await expect(page.locator('#nodesLayer .node').first().locator('.node-delete')).toHaveCount(0);
  await leaf.locator('.node-title').click();
  await addNamed(page, '#btnSupport', 'Child');
  await leaf.locator('.node-title').click();
  await page.locator('#viewport').focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('.dialog-inner:visible')).toContainText('1');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('node-count')).toHaveText('3');
});

test('the added themes Terminaali, ASCII and Sarjakuva apply, persist per browser and ASCII draws edges as text', async ({
  page,
}) => {
  await startBlank(page, 'argument');
  await addNamed(page, '#btnSupport', 'Theme child');
  for (const [id, label] of [
    ['terminal', '▮ Terminaali'],
    ['ascii', '# ASCII'],
    ['comic', '✎ Sarjakuva'],
    ['grove', '🌳 Lehto'],
  ] as const) {
    await openSettings(page);
    await page.locator('#themeSelect').selectOption(id);
    await expect(page.locator('body')).toHaveAttribute('data-theme', id);
    await expect(page.locator('#themeSelect option:checked')).toHaveText(label);
    expect(await page.evaluate(() => localStorage.getItem('witt-appearance-v1'))).toBe(id);
    await expect(page.locator('#edgePaths .ascii-edge')).toHaveCount(id === 'ascii' ? 1 : 0);
    await expect(page.locator('#edgePaths path.edge')).toHaveCount(id === 'ascii' ? 0 : 1);
  }
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'grove');
  expect(await page.evaluate(() => localStorage.getItem('witt-appearance-v1'))).toBe('grove');
});

test('an unassessed slider reads —; saving one axis saves the other as shown, as one undo step', async ({
  page,
}) => {
  await page.locator('#btnWorkflowEvaluate').click();
  await addReason(page, '+', 'Uusi peruste');
  const chip = page.locator('.node', { hasText: 'Uusi peruste' }).locator('.meta-assessment .meta-value');
  await expect(chip).toHaveText('—/—');
  await expect(page.locator('#nodeConfidence')).toHaveClass(/range-unset/);
  await expect(page.locator('label[for="nodeConfidence"] output')).toHaveText('—');
  await expect(page.locator('label[for="nodeImpact"] output')).toHaveText('—');
  const influence = page.getByTestId('review-influence');
  await influence.fill('4');
  await influence.blur();
  await expect(chip).toHaveText('100%/+4');
  await expect(page.locator('#nodeConfidence')).not.toHaveClass(/range-unset/);
  await page.locator('#btnUndoTop').click();
  await expect(chip).toHaveText('—/—');
  // Pressing a key on the slider accepts the shown value even when it does not move (100 % is the maximum).
  await page.locator('#nodeConfidence').focus();
  await page.keyboard.press('ArrowRight');
  await expect(chip).toHaveText('100%/+3');
});

test('the view dock has no separate credence or impact layer and no drag-from-text option', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the dock is opened from the desktop toolbar');
  await page.locator('#viewport').focus();
  await page.keyboard.press('Alt+V');
  await page.locator('#btnLayers').click();
  await expect(page.locator('#layersPanel input[data-layer]')).toHaveCount(7);
  await expect(
    page.locator('#layersPanel [data-layer="confidence"], #layersPanel [data-layer="impact"]')
  ).toHaveCount(0);
  await expect(page.locator('#dragFromText')).toHaveCount(0);
});

test('a new document computes from the whole tree; the calculation method switches in the Arviointi menu', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the menus are desktop controls');
  await page.locator('#btnWorkflowEvaluate').click();
  await addReason(page, '+', 'Kokemus riittää');
  await addReason(page, '+', 'Viisi vuotta alalla');
  await review(page, '100', '1');
  const claim = page.locator('.node-title', { hasText: 'Kokemus riittää' });
  const claimCard = page.locator('#nodesLayer .node', { hasText: 'Kokemus riittää' });
  // Nobody has rated the claim: it reads the net of its one reason, on the plus side, and says what it passes up.
  await claim.click();
  await expect(page.locator('label[for="nodeConfidence"]')).toContainText('Oma uskottavuusarvio');
  await expect(page.getByTestId('score-balance')).toContainText(/^\+33\.3Perustelutulos/);
  await expect(page.getByTestId('net-note')).toHaveText(
    'Kukaan ei ole arvioinut tämän väitteen uskottavuutta, joten luku on sen perustelujen nettotulos. Väite välittää ylöspäin 33 % merkittävyydestään.'
  );
  await expect(page.locator('#inspector')).toContainText('Ei arvioitu – lasketaan perusteluista');
  // Rated 90 % at +4: the result is a credence, shown as a percentage, and the rating is said to count.
  await review(page, '90', '4');
  await expect(page.getByTestId('credence-note')).toHaveText(
    'Arviosi on lähtötaso, jota tämän väitteen perustelut siirtävät.'
  );
  await expect(page.getByTestId('score-balance')).toContainText(/^93\.3 %Laskettu uskottavuus 0–100 %/);
  await expect(claimCard.locator('.meta-index .meta-value')).toHaveText('93 %');
  await selectRoot(page);
  await expect(page.getByTestId('score-balance')).toContainText(/^\+42\.7Perustelutulos/);

  const openAssessMenu = async () => {
    if (!(await page.locator('#assessmentMenu[open]').count()))
      await page.locator('#assessmentMenu summary').click();
  };
  const outlineClaim = page.locator('[data-testid^="outline-"]', { hasText: 'Kokemus riittää' });
  await openAssessMenu();
  const select = page.getByTestId('scoring-select');
  await expect(select).toHaveValue('anchored-reasons-v1');
  await expect(page.locator('#scoringSelect option')).toHaveText([
    'Laskenta koko puusta (oletus)',
    'Laskenta suorista perusteluista',
  ]);
  await expect(page.locator('#scoringOldGroup')).toHaveCount(0);
  await expect(page.getByTestId('scoring-note')).toHaveText(
    'Väitteen oma arvio on lähtötaso, jota sen perustelut siirtävät. Muutos syvällä puussa näkyy ylös asti.'
  );
  // Direct: the rated claim passes its 90 %; what its reason gives stays beside it, in parentheses on the card.
  await select.selectOption('direct-reasons-v1');
  await expect(page.getByTestId('scoring-note')).toHaveText(
    'Arvioitu väite välittää oman arvionsa sellaisenaan. Perusteluista lasketaan vain arvioimattomat väitteet, vaihtoehdot ja pääväite.'
  );
  await expect(page.getByTestId('score-balance')).toContainText(/^\+41\.9Perustelutulos/);
  await expect(claimCard.locator('.meta-index .meta-value')).toHaveText('(93 %)');
  await expect(claimCard.locator('.meta-index')).toContainText('laskettu');
  await outlineClaim.click();
  await expect(page.getByTestId('score-derived')).toHaveText('Perusteluista laskettuna93.3 %');
  await expect(page.getByTestId('credence-note')).toHaveText(
    'Tässä laskentatavassa arviosi on väitteen tulos sellaisenaan. Perustelut näkyvät erittelyssä, mutta eivät muuta tulosta.'
  );
  // A document stored with an archived method opens under the default one, and the menu offers the two only.
  await page.evaluate(() => {
    const stored = JSON.parse(window.localStorage.getItem('witt-project-v3') ?? '{}') as {
      settings: { scoring: string };
    };
    stored.settings.scoring = 'evidence-v3-links';
    window.localStorage.setItem('witt-project-v3', JSON.stringify(stored));
  });
  await page.reload();
  await page.locator('#btnHomeContinue').click();
  await openAssessMenu();
  await expect(select).toHaveValue('anchored-reasons-v1');
  await expect(page.locator('#scoringSelect option')).toHaveCount(2);
});
