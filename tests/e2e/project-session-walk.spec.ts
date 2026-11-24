/**
 * must: a collaboration shares the whole project (owner 2026-11-23, WG-063, S-15): a participant gets every
 *       diagram the host shares as tabs, looks at any of them on their own, and an edit lands in the diagram it
 *       was made in, for both; a diagram left out before the start is not sent, and its tab says *ei jaettu* to
 *       the host; in the running session's dialog the host shares it after all (the participant gets it) and
 *       leaves another out (it leaves the participant's project); the participant may ask for a new diagram and
 *       both get it (a reader's refusal is a unit test in store-collab.test.ts)
 * test: tests/e2e/project-session-walk.spec.ts (desktop; two Chromium contexts over the local relay on 8787)
 * red-against: a participant who only gets the shown diagram, an edit in the second tab written into the first,
 *              a diagram left out that is sent anyway, a share list that exists only before the start, a diagram
 *              left out mid-session that stays with the participant, a participant's new diagram that only they
 *              have
 */
import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { addNamed, startBlank } from './helpers.ts';

test.use({ launchOptions: { args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] } });

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ bypassCSP: true, locale: 'fi-FI' });
  return context.newPage();
}
const fromFileMenu = async (page: Page, selector: string) => {
  await page.locator('#fileMenu > summary').click();
  await page.locator(selector).click();
};
const tabTitles = (page: Page) => page.locator('#docTabs [role="tab"] .doc-tab-title');
async function addDiagram(page: Page, question: string) {
  await fromFileMenu(page, '#btnAddDiagram');
  const editor = page.locator('.node-inline-editor');
  await expect(editor).toBeFocused();
  await editor.fill(question);
  await editor.press('Enter');
}

test('a session shares the project: tabs, edits in their own diagram, leaving out and sharing during the session', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  const host = await newPage(browser);
  await startBlank(host, 'argument');
  await addDiagram(host, 'Toinen kysymys');
  await addDiagram(host, 'Kolmas kysymys');
  await host.locator('#docTab-0').click();

  // The start form lists the diagrams; the third is left out.
  await fromFileMenu(host, '#btnCollab');
  const share = host.locator('#collabShareList');
  await expect(share.locator('label')).toHaveCount(3);
  await expect(share.locator('input').nth(0)).toBeDisabled();
  await share.locator('input').nth(2).uncheck();
  await expect(host.locator('#docTab-2')).toContainText('ei jaettu');
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

  // The participant has the two shared diagrams, not the third.
  await expect(tabTitles(guest)).toHaveText(['Mikä on tarkasteltava väite?', 'Toinen kysymys']);

  // In the running session's dialog the host shares the third after all and leaves the second out.
  const live = host.locator('#collabShareList');
  await expect(live.locator('label')).toHaveCount(3);
  await live.locator('input').nth(2).check();
  await expect(tabTitles(guest)).toHaveText([
    'Mikä on tarkasteltava väite?',
    'Toinen kysymys',
    'Kolmas kysymys',
  ]);
  await live.locator('input').nth(1).uncheck();
  await expect(tabTitles(guest)).toHaveText(['Mikä on tarkasteltava väite?', 'Kolmas kysymys']);
  await expect(host.locator('#docTab-1')).toContainText('ei jaettu');
  await host.keyboard.press('Escape');

  // Each looks at a tab of their own; an edit lands in the diagram it was made in, for both.
  await guest.locator('#docTab-1').click();
  await expect(guest.locator('#docTab-1')).toHaveAttribute('aria-selected', 'true');
  await expect(host.locator('#docTab-0')).toHaveAttribute('aria-selected', 'true');
  await guest.locator('#nodesLayer .node').first().locator('.node-title').click();
  await addNamed(guest, '#btnSupport', 'Ainon peruste kolmanteen');
  await expect(host.locator('#nodesLayer .node-title', { hasText: 'Ainon peruste kolmanteen' })).toHaveCount(
    0
  );
  await host.locator('#docTab-2').click();
  await expect(
    host.locator('#nodesLayer .node-title', { hasText: 'Ainon peruste kolmanteen' })
  ).toBeVisible();
  await host.locator('#docTab-0').click();
  await host.locator('#nodesLayer .node').first().locator('.node-title').click();
  await addNamed(host, '#btnSupport', 'Isännän peruste ensimmäiseen');
  await guest.locator('#docTab-0').click();
  await expect(
    guest.locator('#nodesLayer .node-title', { hasText: 'Isännän peruste ensimmäiseen' })
  ).toBeVisible();
  await expect(guest.locator('#nodesLayer .node-title', { hasText: 'Ainon peruste kolmanteen' })).toHaveCount(
    0
  );

  // The participant asks for a new diagram: the host makes it, both have it.
  await fromFileMenu(guest, '#btnAddDiagram');
  await expect(tabTitles(guest)).toHaveCount(3);
  await expect(tabTitles(host)).toHaveCount(4);
});
