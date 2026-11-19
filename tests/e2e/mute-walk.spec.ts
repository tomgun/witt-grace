/**
 * must: "Mykistä laskennasta (kokeilu)" in the inspector takes a reason and its branch out of the shown result (a
 *       +2 support and a −2 objection read 0.0; with the objection muted +28.6), marks the card, shows the banner,
 *       and the card's mark, the banner's "Palauta kaikki" or the context menu bring it back; the document is not
 *       changed (owner 2026-11-18, S-15)
 * test: tests/e2e/mute-walk.spec.ts (desktop)
 * red-against: the mute stored in the document (the saved indicator changes), the result left as it was, the mark
 *              without a way back
 */
import { expect, test } from '@playwright/test';
import { addNamed, openMore, reviewSelected, selectRoot, startBlank } from './helpers.ts';

test('a reason is muted for a what-if and brought back', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  await startBlank(page, 'argument');
  await page.locator('#btnWorkflowEvaluate').click();
  await addNamed(page, '#btnSupport', 'Säästää aikaa');
  await reviewSelected(page, '100', '2');
  await selectRoot(page);
  await addNamed(page, '#btnOppose', 'Maksaa liikaa');
  await reviewSelected(page, '100', '-2');
  await selectRoot(page);
  await expect(page.getByTestId('score-balance')).toContainText(/^0,0Perustelu/);
  const stored = await page.evaluate(() => window.localStorage.getItem('witt-project-v3'));

  const card = page.locator('#nodesLayer .node', { hasText: 'Maksaa liikaa' });
  await card.locator('.node-title').click();
  // The toggle waits under "Lisää valintoja"; its help opens from the ? beside it.
  await expect(page.getByTestId('node-mute')).toBeHidden();
  await openMore(page);
  await page.getByTestId('node-mute').check();
  await expect(card).toHaveClass(/muted-node/);
  await expect(page.locator('#muteBannerLabel')).toContainText('mykistettyjä perusteluja 1');
  await selectRoot(page);
  await expect(page.getByTestId('score-balance')).toContainText(/^\+28,6Perustelu/);
  expect(await page.evaluate(() => window.localStorage.getItem('witt-project-v3'))).toBe(stored);

  await card.getByTestId('node-muted').click();
  await expect(card).not.toHaveClass(/muted-node/);
  await expect(page.locator('#muteBanner')).toHaveCount(0);
  await expect(page.getByTestId('score-balance')).toContainText(/^0,0Perustelu/);

  await card.locator('.node-title').click({ button: 'right' });
  await page.locator('#nodeContextMenu button', { hasText: 'Mykistä laskennasta (kokeilu)' }).click();
  await expect(card).toHaveClass(/muted-node/);
  await page.locator('#btnUnmuteAll').click();
  await expect(card).not.toHaveClass(/muted-node/);
});
