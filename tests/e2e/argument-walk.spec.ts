/**
 * must: from the home screen a person starts a blank argument document, adds a supporting reason with `+`, names it in
 *       the card's inline editor, switches to Punnitse, reviews it 100 % / +5 and reads +50.0 as the thesis balance;
 *       a thesis without reasons shows "—", never 0; a second unreviewed reason shows "—/—" and marks the balance
 *       incomplete with †; the work survives a reload; Alt+1..4 and Alt+V toggle the zones and the dock; the file menu
 *       exports v8 JSON; decision mode adds options; themes and languages switch; the top bar's ↶/↷ undo and redo an
 *       added card (UI_INVENTORY S-01, S-02, S-03, S-07, S-08, S-15)
 * test: tests/e2e/argument-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: a leaf thesis shown as 0, a review saved under the wrong node, the autosave skipped, the incomplete
 *              marker rendered as "*", undo/redo buttons wired to nothing, redo enabled with nothing to redo
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addNamed, reviewSelected as review, selectRoot, startBlank } from './helpers.ts';

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
  expect(parsed.settings.scoring).toBe('evidence-v3-links');
});

test('switching to decision mode offers options; Yövärit (bitberg) theme applies', async ({ page }) => {
  await page.locator('#modeDecision').click();
  await expect(page.locator('#modeDecision')).toHaveClass(/active/);
  await page.locator('#editMenu summary').click();
  await page.locator('#btnEditMenuOption').click();
  await expect(page.getByTestId('node-count')).toHaveText('2');
  await expect(page.locator('.node[data-relation="option"]')).toHaveCount(1);
  await page.locator('#themeSelect').selectOption('bitberg');
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'bitberg');
  await expect(page.locator('#themeSelect option:checked')).toHaveText('◆ Yövärit');
});

test('switching the language loads its messages on demand', async ({ page }) => {
  await expect(page.locator('#fileMenu summary')).toHaveText('Tiedosto');
  await page.locator('#localeSelect').selectOption('en');
  await expect(page.locator('#fileMenu summary')).toHaveText('File');
  await page.reload();
  await page.locator('#btnHomeContinue').click();
  await expect(page.locator('#fileMenu summary')).toHaveText('File');
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
