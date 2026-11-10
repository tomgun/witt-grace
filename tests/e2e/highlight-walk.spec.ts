/**
 * must: with two local people, Näkymäasetukset → Korosta käyttäjän jäljet picks either one regardless of the active
 *       profile; that person's created nodes get a ring and a "Luonut" mark, the others fade, the summary counts them,
 *       "Näytä myös hänen arvionsa" switches the result to that person's viewpoint, and "Ei korostusta" clears it
 *       (owner request 2026-11-10, UI_INVENTORY S-15)
 * test: tests/e2e/highlight-walk.spec.ts (desktop)
 * red-against: the highlight tied to the active profile, another person's node marked as theirs
 */
import { expect, test } from '@playwright/test';
import { addNamed, selectRoot, startBlank } from './helpers.ts';

test("one person's traces stand out in the tree", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  await startBlank(page, 'argument');
  await addNamed(page, '#btnSupport', 'Ensimmäisen perustelu');
  await page.locator('#actorSelect').selectOption('__add_local_user__');
  await page.locator('#textValue').fill('Bea');
  await page.locator('#textAccept').click();
  await expect(page.locator('#actorSelect option:checked')).toHaveText('Bea');
  await selectRoot(page);
  await addNamed(page, '#btnOppose', 'Bean vastaväite');
  // The active profile goes back to the first person; the highlight still picks Bea.
  await page.locator('#actorSelect').selectOption({ index: 0 });
  await page.locator('#viewport').focus();
  await page.keyboard.press('Alt+V');
  const select = page.getByTestId('highlight-user');
  await select.selectOption({ label: 'Bea' });
  const bea = page.locator('#nodesLayer .node', { hasText: 'Bean vastaväite' });
  const first = page.locator('#nodesLayer .node', { hasText: 'Ensimmäisen perustelu' });
  await expect(bea).toHaveClass(/user-created/);
  await expect(bea.getByTestId('trace-mark')).toHaveText('Luonut');
  await expect(first).toHaveClass(/user-other/);
  await expect(page.locator('#highlightSummary')).toContainText('Luonut 1, muokannut 0, kommentoinut 0');
  await page.locator('#btnHighlightRatings').click();
  await expect(page.locator('#indexModeSelect')).toHaveValue(/^assessor:/);
  await select.selectOption({ label: 'Ei korostusta' });
  await expect(first).not.toHaveClass(/user-other/);
  await expect(bea).not.toHaveClass(/user-created/);
});
