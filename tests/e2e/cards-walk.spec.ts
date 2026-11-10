/**
 * must: a card's title uses the room the card has (four lines on a card with chips, three on the compact one); the reading view (Näkymäasetukset →
 *       Näytä kaikki tekstit) grows a long card so its whole title shows unclipped and is stored per browser; a
 *       selected card's corner drags it to its own size, kept in the document, and a double click on the corner
 *       restores the default (owner request 2026-11-10, UI_INVENTORY S-15)
 * test: tests/e2e/cards-walk.spec.ts (desktop)
 * red-against: a two-line title in an empty card, a reading view that still clips the text, a resize that is lost
 */
import { expect, test } from '@playwright/test';
import { addNamed, startBlank } from './helpers.ts';

const LONG =
  'Ruuhkamaksu vähentää autoliikennettä keskustassa, koska suurin osa ruuhka-ajan matkoista on lyhyitä ja ne voi korvata joukkoliikenteellä, pyörällä tai kävellen, kuten muissa kaupungeissa.';

test('text fills the card, the reading view shows it all, and a card can be resized', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  await startBlank(page, 'argument');
  await addNamed(page, '#btnSupport', LONG);
  const card = page.locator('#nodesLayer .node', { hasText: 'Ruuhkamaksu vähentää' });
  const title = card.locator('.node-title');
  // The compact preset's text-only card shows three lines; a card with chips now uses its room for four.
  await expect(title).toHaveCSS('-webkit-line-clamp', '3');
  await page.locator('#viewport').focus();
  await page.keyboard.press('Alt+V');
  await page.locator('#viewPreset').selectOption('analysis');
  await expect(title).toHaveCSS('-webkit-line-clamp', '4');
  await page.locator('#btnDockClose').click();
  await title.click();

  // Resize by the corner, then restore with a double click.
  const before = (await card.boundingBox())!;
  const handle = card.getByTestId('node-resize');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 80, { steps: 5 });
  await page.mouse.up();
  await expect(card).toHaveClass(/sized-card/);
  const after = (await card.boundingBox())!;
  expect(after.width).toBeGreaterThan(before.width + 60);
  expect(after.height).toBeGreaterThan(before.height + 40);
  await page.reload();
  await page.locator('#btnHomeContinue').click();
  await expect(card).toHaveClass(/sized-card/);
  await card.locator('.node-title').click();
  await card.getByTestId('node-resize').dblclick();
  await expect(card).not.toHaveClass(/sized-card/);

  // The reading view: the whole title shows.
  await page.locator('#viewport').focus();
  await page.keyboard.press('Alt+V');
  await page.getByTestId('reading-mode').check();
  await expect(card).toHaveClass(/reading-card/);
  const clipped = await title.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(clipped).toBeLessThanOrEqual(1);
  expect((await card.boundingBox())!.height).toBeGreaterThan(before.height);
  await page.reload();
  await page.locator('#btnHomeContinue').click();
  await expect(card).toHaveClass(/reading-card/);
});
