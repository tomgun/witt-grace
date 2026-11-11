/**
 * must: the host starts a collaboration from the open document and copies the general link; a second browser opens it,
 *       types a name and sees the tree; the participant's new reason reaches the host and the host's title edit
 *       reaches the participant; undo is off while collaborating; a personal invite needs no name and shows the
 *       host-given one; the invite's link and password show together in full; after a reload the password is no
 *       longer shown and can be changed; a name already in the session is refused when joining and when inviting;
 *       ending tells the participant and keeps the document; a broken link says so (WG-030)
 * test: tests/e2e/session-walk.spec.ts (desktop; two and three Chromium contexts over the local relay on 8787)
 * red-against: a name prompt for a personal invite; a commit applied to the store without a re-render; the joiner's
 *              work replaced before the host answered; undo replacing the shared document locally; a second "Aino"
 *              let in silently
 */
import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { addNamed, startBlank } from './helpers.ts';

// Two browsers on one machine meet over loopback: keep the real local addresses instead of mDNS names.
test.use({ launchOptions: { args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] } });

/** The built page allows wss: only; the test relay is plain ws:// on this machine. */
async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ bypassCSP: true, locale: 'fi-FI' });
  return context.newPage();
}
async function openCollab(page: Page) {
  await page.locator('#fileMenu > summary').click();
  await page.locator('#btnCollab').click();
  await expect(page.locator('#collabDialog')).toBeVisible();
}

test('two people edit one document, a personal invite joins by the host’s name, ending keeps the copy', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  const host = await newPage(browser);
  await startBlank(host, 'argument');
  await host.locator('#projectTitle').fill('Yhteinen pohdinta');
  await host.locator('#projectTitle').press('Enter');

  await openCollab(host);
  await host.locator('.collab-advanced > summary').click();
  await host.locator('#collabSignalRelay').check();
  await host.locator('#collabRelayUrl').fill('ws://127.0.0.1:8787');
  await host.locator('#btnCollabStart').click();
  const general = (await host.locator('#collabLink').textContent()) ?? '';
  expect(general).toMatch(
    /#join=1\.r~[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}\.g[A-Za-z0-9_-]{22}$/
  );
  await expect(host.locator('#collabChip')).toHaveText(/Yhteistyössä · 1/);

  const guest = await newPage(browser);
  await guest.goto(general);
  await expect(guest.locator('#joinDialog')).toBeVisible();
  expect(guest.url()).not.toContain('#join=');
  await guest.locator('#joinName').fill('Aino');
  await guest.locator('#btnJoin').click();
  await expect(guest.getByTestId('app')).toBeVisible({ timeout: 20_000 });
  await expect(guest.locator('#projectTitle')).toHaveValue('Yhteinen pohdinta');
  await expect(guest.locator('#collabChip')).toHaveText(/Yhteistyössä · 2/);
  await expect(host.locator('#collabPeople')).toContainText('Aino');
  // A second person with the same name is asked for another one.
  const twin = await newPage(browser);
  await twin.goto(general);
  await twin.locator('#joinName').fill('aino');
  await twin.locator('#btnJoin').click();
  await expect(twin.locator('#joinDialog')).toContainText('Tällä nimellä on jo joku', { timeout: 20_000 });
  await expect(twin.locator('#joinName')).toHaveValue('aino');
  await twin.close();
  await expect(guest.locator('#actorSelect')).toBeDisabled();
  await expect(guest.locator('#actorSelect option:checked')).toHaveText('Aino');
  await expect(guest.locator('#btnUndoTop')).toBeDisabled();
  await expect(guest.locator('#btnUndoTop')).toHaveAttribute(
    'title',
    'Kumoaminen ei ole käytössä yhteistyön aikana'
  );

  // The participant proposes, the host commits, both see it.
  await addNamed(guest, '#btnSupport', 'Ainon perustelu');
  await expect(host.locator('.node-title', { hasText: 'Ainon perustelu' })).toBeVisible();
  await expect(host.getByTestId('node-count')).toHaveText('2');
  // The host's edit reaches the participant.
  await host.keyboard.press('Escape');
  await host.locator('#projectTitle').fill('Yhteinen pohdinta 2');
  await host.locator('#projectTitle').press('Enter');
  await expect(guest.locator('#projectTitle')).toHaveValue('Yhteinen pohdinta 2');
  await expect(host.locator('#btnUndoTop')).toBeDisabled();

  // A personal invite: no name prompt, the host's name.
  await openCollab(host);
  await host.locator('#collabWhoNamed').check();
  await host.locator('#collabInviteName').fill('AINO');
  await expect(host.locator('#collabInviteNameTaken')).toBeVisible();
  await expect(host.locator('#btnCollabInvite')).toBeDisabled();
  await host.locator('#collabInviteName').fill('Kalle');
  await host.locator('#btnCollabInvite').click();
  const personal = (await host.locator('#collabInviteResult code[id^="collabInvite-"]').textContent()) ?? '';
  const kalle = await newPage(browser);
  await kalle.goto(personal);
  await expect(kalle.locator('#joinName')).toHaveCount(0);
  await expect(kalle.getByTestId('app')).toBeVisible({ timeout: 20_000 });
  await expect(kalle.locator('#actorSelect option:checked')).toHaveText('Kalle');
  await expect(host.locator('#collabPeople')).toContainText('Kalle');
  await expect(host.locator('#collabInviteResult')).toContainText('käytössä');

  // The host ends; the participants are told and keep the document.
  await host.locator('#btnCollabEnd').click();
  await host.locator('#confirmAccept').click();
  await expect(guest.locator('#collabEndedDialog')).toContainText('Kutsuja lopetti yhteistyön.');
  await guest.locator('#btnCollabEndedOk').click();
  await expect(guest.locator('#projectTitle')).toHaveValue('Yhteinen pohdinta 2');
  await expect(guest.locator('#collabChip')).toHaveCount(0);
  await expect(guest.locator('#btnUndoTop')).toHaveAttribute('title', /Kumoa|Ctrl/);
});

test('a password invite asks the password; the host reloads and the collaboration continues', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  const host = await newPage(browser);
  await startBlank(host, 'argument');
  await openCollab(host);
  await host.locator('.collab-advanced > summary').click();
  await host.locator('#collabSignalRelay').check();
  await host.locator('#collabRelayUrl').fill('ws://127.0.0.1:8787');
  await host.locator('#btnCollabStart').click();
  await host.locator('#collabWhoNamed').check();
  await host.locator('#collabInviteName').fill('Kalle');
  await host.locator('#collabModePassword').check();
  const password = await host.locator('#collabInvitePassword').inputValue();
  expect(password.split('-')).toHaveLength(4);
  await host.locator('#btnCollabInvite').click();
  const link = (await host.locator('#collabInviteResult code[id^="collabInvite-"]').textContent()) ?? '';
  expect(link).toMatch(/\.k[A-Za-z0-9_-]{22}$/);
  await expect(host.locator('#collabInviteResult code[id^="collabInvitePw-"]')).toHaveText(password);

  const kalle = await newPage(browser);
  await kalle.goto(link);
  await expect(kalle.locator('#joinName')).toHaveCount(0);
  await kalle.locator('#joinPassword').fill('väärä salasana');
  await kalle.locator('#btnJoin').click();
  await expect(kalle.locator('#joinDialog')).toContainText('Salasana ei kelpaa', { timeout: 20_000 });
  await kalle.locator('#joinPassword').fill(password.toUpperCase().replaceAll('-', ' '));
  await kalle.locator('#btnJoin').click();
  await expect(kalle.getByTestId('app')).toBeVisible({ timeout: 20_000 });
  await expect(kalle.locator('#actorSelect option:checked')).toHaveText('Kalle');

  // The host reloads: the same session continues and Kalle reconnects by himself.
  await host.keyboard.press('Escape');
  await host.reload();
  await host.locator('#btnHomeContinue').click();
  await expect(host.locator('#collabChip')).toHaveText(/Yhteistyössä · 2/, { timeout: 20_000 });
  await expect(kalle.locator('#collabChip')).toHaveText(/Yhteistyössä · 2/, { timeout: 20_000 });
  // The reloaded host no longer knows the password; it keeps the same link and can set a new password.
  await host.locator('#collabChip').click();
  const card = host.locator('#collabInvites .collab-invite-card').first();
  await expect(card).toContainText('Salasana ei ole enää näkyvissä');
  await expect(card.locator('code[id^="collabInvite-"]')).toHaveText(link);
  await expect(card.getByRole('button', { name: 'Vaihda salasana' })).toBeVisible();
  await host.keyboard.press('Escape');
  await addNamed(kalle, '#btnSupport', 'Kallen perustelu');
  await expect(host.locator('.node-title', { hasText: 'Kallen perustelu' })).toBeVisible();

  // Kalle closes his tab and opens the same link again in the same browser: no password asked, same person.
  const context = kalle.context();
  await kalle.close();
  const again = await context.newPage();
  await again.goto(link);
  await expect(again.locator('#joinPassword')).toHaveCount(0);
  await expect(again.getByTestId('app')).toBeVisible({ timeout: 20_000 });
  await expect(again.locator('#actorSelect option:checked')).toHaveText('Kalle');
  await expect(again.locator('.node-title', { hasText: 'Kallen perustelu' })).toBeVisible();
});

test('a broken invite link says so and leaves WITT usable', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  const page = await newPage(browser);
  await page.goto('/#join=1.n.tooShort.alsoShort');
  await expect(page.locator('#joinDialog')).toContainText('Kutsulinkki on viallinen');
  await page.getByRole('button', { name: 'Avaa WITT ilman kutsua' }).click();
  await expect(page.locator('#joinDialog')).toHaveCount(0);
  await expect(page.locator('#btnHomeNew')).toBeVisible();
});
