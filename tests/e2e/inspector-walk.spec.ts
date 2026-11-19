/**
 * must: in Punnitse a selected reason's two sliders are on the first screen of the inspector; what is needed now
 *       and then (what is counted, the type name, the place in the tree, reuse) waits under "Lisää valintoja" and
 *       each help text behind its ? button; the result box says whose result it is, reads a balance in words,
 *       switches between the shared and the own result on the spot and keeps the breakdown behind "Näin tulos
 *       muodostuu"; Kartoita keeps the structure fields in the open (owner 2026-11-19, UI_INVENTORY S-15)
 * test: tests/e2e/inspector-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: the sliders below five help boxes (700 px of scrolling), a help text always open, the shared figure
 *              shown without saying it is the shared one, the mute toggle unreachable once it is on
 */
import { expect, test } from '@playwright/test';
import { addNamed, openMore, reviewSelected, selectRoot, startBlank } from './helpers.ts';

test('Punnitse: ratings first, the rest on request, a result that says whose it is', async ({
  page,
}, testInfo) => {
  await startBlank(page, 'argument');
  await addNamed(page, '#btnSupport', 'Säästää aikaa');

  // Kartoita builds the tree: the structure fields are in the open, no "Lisää valintoja".
  await expect(page.locator('#nodeRelation')).toBeVisible();
  await expect(page.locator('#inspectorMore')).toHaveCount(0);

  await page.locator('#btnWorkflowEvaluate').click();
  const credence = page.getByTestId('review-credence');
  const influence = page.getByTestId('review-influence');
  await expect(credence).toBeVisible();
  await expect(influence).toBeVisible();
  if (testInfo.project.name === 'desktop') {
    // On the first screen: no scrolling between selecting a reason and rating it.
    expect(await page.locator('#inspector').evaluate((el) => el.scrollTop)).toBe(0);
    const box = (await influence.boundingBox())!;
    expect(box.y + box.height).toBeLessThan(900 - 40);
  }

  // The rest waits, closed, and each help text behind its ?.
  const more = page.locator('#inspectorMore');
  await expect(more.locator('> summary')).toHaveText('Lisää valintoja');
  await expect(page.locator('#nodeRelation')).toBeHidden();
  await expect(page.getByTestId('node-mute')).toBeHidden();
  await openMore(page);
  await expect(page.getByTestId('counted-options').locator('legend')).toHaveText('Mukana laskennassa');
  await expect(page.locator('#nodeUnrated')).toBeVisible();
  await expect(page.locator('#nodeAbstain')).toBeVisible();
  await expect(page.locator('#nodeRelation')).toBeVisible();
  await expect(page.locator('#nodeTypeLabel')).toBeVisible();
  const muteHelp = page.locator('#muteHelp');
  await expect(muteHelp.locator('.inspector-note')).toBeHidden();
  await muteHelp.locator('summary').click();
  await expect(muteHelp.locator('.inspector-note')).toContainText('Näet, miltä tulokset näyttäisivät');
  await muteHelp.locator('summary').click();
  await more.locator('> summary').click();
  await expect(page.getByTestId('node-mute')).toBeHidden();

  // A toggle that is on keeps the section open, so it can always be found and turned off.
  await openMore(page);
  await page.getByTestId('node-mute').check();
  await selectRoot(page);
  await page.locator('#nodesLayer .node', { hasText: 'Säästää aikaa' }).locator('.node-title').click();
  await expect(page.getByTestId('node-mute')).toBeVisible();
  await page.getByTestId('node-mute').uncheck();

  await reviewSelected(page, '100', '5');
  await selectRoot(page);
  // Rating switched to the person's own view; the box says so and reads the balance.
  await expect(page.getByTestId('score-whose')).toHaveText('Oma tulos · Minä');
  await expect(page.getByTestId('score-balance')).toContainText('+50,0');
  await expect(page.getByTestId('score-reading')).toHaveText('kallistuu puolesta');
  await expect(page.locator('#btnResultPersonal')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#btnResultShared').click();
  await expect(page.getByTestId('score-whose')).toHaveText('Yhteinen tulos · arvioijia 1');
  await expect(page.locator('#btnResultShared')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#indexModeSelect')).toHaveValue('shared');

  const formation = page.getByTestId('score-formation');
  await expect(formation.locator('.score-line').first()).toBeHidden();
  await formation.locator('summary').click();
  await expect(formation.locator('.score-line').first()).toContainText('Uskottavuuden perusarvio');

  // An opposing reason left unrated: the result is incomplete, said in words beside the †.
  await addNamed(page, '#btnOppose', 'Maksaa liikaa');
  await selectRoot(page);
  await expect(page.getByTestId('score-balance')).toContainText('+50,0 †');
  await expect(page.getByTestId('score-reading')).toHaveText('kallistuu puolesta · keskeneräinen');
});
