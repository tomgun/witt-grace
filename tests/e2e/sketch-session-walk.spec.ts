/**
 * must: in a collaboration the sketchpad opens on a shared sheet that starts empty (the host's own sketch stays
 *       the host's and is not sent); a stroke the host draws shows on the participant's sheet and a node the
 *       participant writes can be read on the host's; each person starts with a pen colour of their own and the
 *       names are listed with their colours; Kumoa is off on the shared sheet and only the host may open a file
 *       onto it; each can still go to their own sketchpad; when the collaboration ends the shared sheet stays in
 *       each browser as a copy beside the person's own (owner 2026-11-21, WG-056, S-15)
 * test: tests/e2e/sketch-session-walk.spec.ts (desktop; two Chromium contexts over the local relay on 8787)
 * red-against: the host's private sketch becoming the shared one, a stroke that reaches the other browser only
 *              after a reload, both people starting with the same pen colour, the shared sheet gone when the
 *              session ends, the copy overwriting the person's own sketchpad
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

test('two people draw on the session’s shared sketchpad; the copy stays when the session ends', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  const host = await newPage(browser);
  await startBlank(host, 'argument');
  // The host's own sketch, drawn before the collaboration: it is never sent.
  await openSketchpad(host);
  await expect(host.locator('#btnSketchShared')).toHaveCount(0);
  await stroke(host, [0.1, 0.1], [0.2, 0.2]);
  await items(host, 1);
  await host.locator('#btnSketchBack').click();

  await host.locator('#fileMenu > summary').click();
  await host.locator('#btnCollab').click();
  await expect(host.locator('#collabPrivacy')).toContainText('yhteinen luonnoslehtiö');
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

  // Both open the sketchpad: the shared sheet, empty, with a pen colour for each.
  await openSketchpad(host);
  await openSketchpad(guest);
  for (const page of [host, guest]) {
    await expect(page.locator('#btnSketchShared')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#btnSketchShared')).toHaveText('Yhteinen lehtiö');
    await items(page, 0);
    await expect(page.locator('#sketchPeople li')).toHaveCount(2);
    await expect(page.locator('#sketchPeople li').nth(1)).toHaveText('Aino');
    await expect(page.locator('#btnSketchUndo')).toBeDisabled();
  }
  await expect(host.locator('.sketch-swatch[data-color="0"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(guest.locator('.sketch-swatch[data-color="1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(host.locator('#btnSketchOpen')).toBeEnabled();
  await expect(guest.locator('#btnSketchOpen')).toBeDisabled();

  // The host draws, the participant sees it; the participant writes a node, the host can read it.
  await stroke(host, [0.3, 0.3], [0.5, 0.4]);
  await items(host, 1);
  await items(guest, 1);
  await guest.locator('.sketch-tool[data-tool="node"]').click();
  const box = (await guest.locator('#sketchCanvas').boundingBox())!;
  await guest.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await guest.locator('#sketchTextEditor').fill('Ainon idea');
  await guest.locator('#sketchTextEditor').press('Enter');
  await expect(host.locator('#sketchTexts > li')).toHaveText(['Ainon idea']);
  await items(host, 2);
  await items(guest, 2);
  // Drawn at the same moment by both: both strokes stay on both sheets.
  await guest.locator('.sketch-tool[data-tool="pen"]').click();
  await Promise.all([stroke(host, [0.1, 0.8], [0.2, 0.9]), stroke(guest, [0.8, 0.1], [0.9, 0.2])]);
  await items(host, 4);
  await items(guest, 4);

  // Each still has a sketchpad of their own: the host's old stroke, the participant's empty sheet.
  await host.locator('#btnSketchOwn').click();
  await items(host, 1);
  await expect(host.locator('#sketchPeople')).toHaveCount(0);
  await guest.locator('#btnSketchOwn').click();
  await items(guest, 0);
  await guest.locator('#btnSketchShared').click();
  await items(guest, 4);

  // The host ends the collaboration: the shared sheet stays in both browsers as a copy, beside the own one.
  await host.locator('#btnSketchBack').click();
  await host.locator('#fileMenu > summary').click();
  await host.locator('#btnCollab').click();
  await host.locator('#btnCollabEnd').click();
  await host.locator('#confirmAccept').click();
  await expect(guest.locator('#btnSketchShared')).toHaveText('Yhteinen lehtiö (kopio)');
  await items(guest, 4);
  await expect(guest.locator('#sketchHint')).toContainText('Kopio viimeisimmän yhteistyön');
  await expect(guest.locator('#sketchPeople')).toHaveCount(0);
  await guest.reload();
  if (await guest.getByTestId('home').count()) await guest.locator('#btnHomeContinue').click();
  if (await guest.locator('#collabEndedDialog').count()) await guest.locator('#btnCollabEndedOk').click();
  await openSketchpad(guest);
  await expect(guest.locator('#btnSketchOwn')).toHaveAttribute('aria-pressed', 'true');
  await items(guest, 0);
  await guest.locator('#btnSketchShared').click();
  await items(guest, 4);
  await expect(guest.locator('#sketchTexts > li')).toHaveText(['Ainon idea']);
});
