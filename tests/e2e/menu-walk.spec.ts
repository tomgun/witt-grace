/**
 * must: a toolbar menu (Tiedosto, Muokkaa, Arviointi, Näkymä, Apua) closes on Escape with the focus back on its
 *       title, on a press outside it and when another menu opens, so at most one is open; a press inside the menu
 *       (its selects and checkboxes) leaves it open (UI_INVENTORY S-03, S-15 2026-11-19; the prototype closes on an
 *       outside press)
 * test: tests/e2e/menu-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: no outside-press listener (every menu stays open over the canvas), a listener that also closes the
 *              menu on a press inside it (Laskentatapa could not be chosen), Escape leaving the focus nowhere
 */
import { expect, test } from '@playwright/test';
import { startBlank } from './helpers.ts';

test('one menu at a time; Escape and a press outside close it', async ({ page }) => {
  await startBlank(page, 'argument');
  const file = page.locator('#fileMenu');
  const edit = page.locator('#editMenu');
  const assess = page.locator('#assessmentMenu');
  const isOpen = (menu: typeof file) => menu.evaluate((d) => (d as HTMLDetailsElement).open);

  await file.locator('summary').click();
  expect(await isOpen(file)).toBe(true);
  await page.keyboard.press('Escape');
  expect(await isOpen(file)).toBe(false);
  await expect(file.locator('summary')).toBeFocused();

  // Opened from the keyboard as well: the second menu closes the first.
  await page.keyboard.press('Enter');
  expect(await isOpen(file)).toBe(true);
  await edit.locator('summary').focus();
  await page.keyboard.press('Enter');
  expect(await isOpen(edit)).toBe(true);
  expect(await isOpen(file)).toBe(false);

  await assess.locator('summary').click();
  expect(await isOpen(edit)).toBe(false);
  // A press inside the menu keeps it open: the calculation method is chosen there.
  await page.locator('#scoringSelect').selectOption('direct-reasons-v1');
  await page.locator('#scoringNote').click();
  expect(await isOpen(assess)).toBe(true);
  await expect(page.locator('#scoringSelect')).toHaveValue('direct-reasons-v1');

  await page.locator('#projectTitle').click();
  expect(await isOpen(assess)).toBe(false);
});

/**
 * must: both document types, Argumentointi and Päätös, lie inside the frame of the switch beside the title,
 *       in Finnish and in a language with longer words (owner's report 2026-11-19)
 * red-against: the switch laid in the first column of the menu's grid, where the second choice ran out of its frame
 */
test('the document type switch holds both choices', async ({ page }) => {
  for (const language of ['fi', 'de']) {
    await page.goto('/');
    await page.evaluate((l) => {
      window.localStorage.clear();
      window.localStorage.setItem('witt-locale-v1', l);
    }, language);
    await page.reload();
    await page.locator('#btnHomeNew').click();
    await page.locator('#btnNewWorkArgument').click();
    await expect(page.getByTestId('app')).toBeVisible();
    await page.keyboard.press('Escape');
    const inside = await page.locator('#docTypeMenu').evaluate((frame) => {
      const outer = frame.getBoundingClientRect();
      return [...frame.querySelectorAll('button')].map((button) => {
        const r = button.getBoundingClientRect();
        return (
          r.left >= outer.left - 0.5 &&
          r.right <= outer.right + 0.5 &&
          r.top >= outer.top - 0.5 &&
          r.bottom <= outer.bottom + 0.5
        );
      });
    });
    expect(inside, language).toEqual([true, true]);
  }
});
