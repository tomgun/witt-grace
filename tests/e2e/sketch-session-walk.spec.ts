/**
 * must: in a collaboration the sketchpads are the project's (owner 2026-11-23 “lehtiö on osa projektia… ei sessio
 *       tarvitse omaa”, WG-063 part 4, S-15): what the host drew before the session is on the participant's sheet,
 *       and the start form says so; a stroke the host draws shows on the participant's sheet and a node the
 *       participant writes can be read on the host's; each person starts with a pen colour of their own and the
 *       names are listed with their colours; Kumoa is off during the session; only the host opens a file onto a
 *       sketchpad, names it or removes it; a participant adds a new sketchpad and both have it; there is no
 *       sketchpad apart from the project's; when the collaboration ends the sketchpads stay in the participant's
 *       copy of the project, over a reload too
 * test: tests/e2e/sketch-session-walk.spec.ts (desktop; two Chromium contexts over the local relay on 8787)
 * red-against: a stroke that reaches the other browser only after a reload, a stroke landing on another sketchpad
 *              than the one it was drawn on, both people starting with the same pen colour, a participant's new
 *              sketchpad that only they have, the drawings gone when the session ends
 */
import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { startBlank } from './helpers.ts';

test.use({ launchOptions: { args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] } });

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ bypassCSP: true, locale: 'fi-FI' });
  return context.newPage();
}
async function openSketchpad(page: Page) {
  await page.locator('#viewMenu > summary').click();
  await page.locator('#btnSketchMenu').click();
  await expect(page.getByTestId('sketchpad')).toBeVisible();
}
async function stroke(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.locator('#sketchCanvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 4 });
  await page.mouse.up();
}
const items = (page: Page, count: number) =>
  expect(page.locator('#sketchCanvas')).toHaveAttribute('aria-label', `Piirtoalue, ${count} kohdetta`);

test('two people draw on the project’s sketchpads in a session; they stay when the session ends', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  const host = await newPage(browser);
  await startBlank(host, 'argument');
  // Drawn by the host before the collaboration, on the project's sketchpad: the session shares it.
  await openSketchpad(host);
  const sheets = (page: Page) => page.locator('.sketch-which .sketch-sheet');
  await expect(sheets(host)).toHaveText(['Lehtiö 1']);
  await stroke(host, [0.1, 0.1], [0.2, 0.2]);
  await items(host, 1);
  await host.locator('#btnSketchBack').click();

  await host.locator('#fileMenu > summary').click();
  await host.locator('#btnCollab').click();
  await expect(host.locator('#collabPrivacy')).toContainText('projektin luonnoslehtiöt piirroksineen');
  await host.locator('.collab-advanced > summary').click();
  await host.locator('#collabSignalRelay').check();
  await host.locator('#collabRelayUrl').fill('ws://127.0.0.1:8787');
  await host.locator('#btnCollabStart').click();
  const link = (await host.locator('#collabLink').textContent()) ?? '';
  const guest = await newPage(browser);
  await guest.goto(link);
  await guest.locator('#joinName').fill('Aino');
  await guest.locator('#btnJoin').click();
  await expect(guest.getByTestId('app')).toBeVisible({ timeout: 20_000 });
  await expect(host.locator('#collabPeople')).toContainText('Aino');
  await host.keyboard.press('Escape');

  // Both open the sketchpad: the project's sheet with the host's stroke, and a pen colour for each.
  await openSketchpad(host);
  await openSketchpad(guest);
  for (const page of [host, guest]) {
    await expect(sheets(page)).toHaveText(['Lehtiö 1']);
    await expect(sheets(page).first()).toHaveAttribute('aria-pressed', 'true');
    await items(page, 1);
    await expect(page.locator('#sketchHint')).toContainText('projektin lehtiöt ovat yhteisiä');
    await expect(page.locator('#sketchPeople li')).toHaveCount(2);
    await expect(page.locator('#sketchPeople li').nth(1)).toHaveText('Aino');
    await expect(page.locator('#btnSketchUndo')).toBeDisabled();
  }
  await expect(host.locator('.sketch-swatch[data-color="0"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(guest.locator('.sketch-swatch[data-color="1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(host.locator('#btnSketchOpen')).toBeEnabled();
  await expect(guest.locator('#btnSketchOpen')).toBeDisabled();
  await expect(host.locator('#btnSketchRemove')).toBeVisible();
  await expect(guest.locator('#btnSketchRemove')).toHaveCount(0);
  await expect(guest.locator('#btnSketchRename')).toHaveCount(0);

  // The host draws, the participant sees it; the participant writes a node, the host can read it.
  await stroke(host, [0.3, 0.3], [0.5, 0.4]);
  await items(host, 2);
  await items(guest, 2);
  await guest.locator('.sketch-tool[data-tool="node"]').click();
  const box = (await guest.locator('#sketchCanvas').boundingBox())!;
  await guest.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await guest.locator('#sketchTextEditor').fill('Ainon idea');
  await guest.locator('#sketchTextEditor').press('Enter');
  await expect(host.locator('#sketchTexts > li')).toHaveText(['Ainon idea']);
  await items(host, 3);
  await items(guest, 3);
  // Drawn at the same moment by both: both strokes stay on both sheets.
  await guest.locator('.sketch-tool[data-tool="pen"]').click();
  await Promise.all([stroke(host, [0.1, 0.8], [0.2, 0.9]), stroke(guest, [0.8, 0.1], [0.9, 0.2])]);
  await items(host, 5);
  await items(guest, 5);

  // The participant adds a sketchpad: the host makes it, both have it, and the one who asked is on it.
  await guest.locator('#btnSketchNew').click();
  await expect(sheets(guest)).toHaveText(['Lehtiö 1', 'Lehtiö 2']);
  await expect(sheets(host)).toHaveText(['Lehtiö 1', 'Lehtiö 2']);
  await expect(sheets(guest).nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(sheets(host).nth(0)).toHaveAttribute('aria-pressed', 'true');
  await items(guest, 0);
  await stroke(guest, [0.4, 0.4], [0.5, 0.5]);
  await items(guest, 1);
  // It landed on the second sketchpad and not on the one the host has in hand.
  await items(host, 5);
  await sheets(host).nth(1).click();
  await items(host, 1);

  // The host ends the collaboration: the sketchpads stay in the participant's copy of the project.
  await host.locator('#btnSketchBack').click();
  await host.locator('#fileMenu > summary').click();
  await host.locator('#btnCollab').click();
  await host.locator('#btnCollabEnd').click();
  await host.locator('#confirmAccept').click();
  await expect(guest.locator('#sketchPeople')).toHaveCount(0);
  await expect(guest.locator('#sketchHint')).toContainText('Lehtiö kuuluu projektiin');
  await expect(sheets(guest)).toHaveText(['Lehtiö 1', 'Lehtiö 2']);
  await items(guest, 1);
  await guest.reload();
  if (await guest.getByTestId('home').count()) await guest.locator('#btnHomeContinue').click();
  if (await guest.locator('#collabEndedDialog').count()) await guest.locator('#btnCollabEndedOk').click();
  await openSketchpad(guest);
  await expect(sheets(guest)).toHaveText(['Lehtiö 1', 'Lehtiö 2']);
  await items(guest, 5);
  await expect(guest.locator('#sketchTexts > li')).toHaveText(['Ainon idea']);
  await expect(guest.locator('#btnSketchRemove')).toBeVisible();
});
