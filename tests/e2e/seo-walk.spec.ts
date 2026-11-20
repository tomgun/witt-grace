/**
 * must: an address that names a language (`?lang=en`, the form the sitemap lists) opens the page in that language
 *       with that language's title, description and canonical address, without storing the choice: the bare
 *       address still opens in the person's own language; an unknown code is ignored; robots.txt is served; the
 *       About dialog shows the version and build date that version.json publishes
 *       (owner 2026-11-20, S-15)
 * test: tests/e2e/seo-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: the address's language written over the person's stored choice, the title left Finnish on an
 *              English page, the canonical address of every language pointing at the Finnish page
 */
import { expect, test } from '@playwright/test';

test('?lang= opens the page in that language for this visit', async ({ page, baseURL }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('WITT – argumenttipuu ja päätöstyökalu · GRACE-menetelmä');
  await expect(page.locator('#homeTitle')).toContainText('Ajattele selkeästi.');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${baseURL}/`);

  await page.goto('/?lang=en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#homeTitle')).toContainText('Think with WITT.');
  await expect(page).toHaveTitle('WITT – argument trees and group decisions · GRACE Method');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /^A free browser tool: break a claim or a decision into reasons/
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${baseURL}/?lang=en`);
  await expect(page.locator('.home-audience')).toHaveText(
    'On your own or together: for individuals, families, teams, communities and organisations.'
  );

  // Choosing a language oneself takes the address's language out of the address: a reload keeps the choice.
  await page.locator('#homeLocaleSelect').selectOption('de');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  expect(new URL(page.url()).search).toBe('');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.locator('#homeLocaleSelect').selectOption('fi');
  await page.goto('/?lang=en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // Not stored: the bare address is Finnish again; an unknown code changes nothing.
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fi');
  await page.goto('/?lang=xx');
  await expect(page.locator('#homeTitle')).toContainText('Ajattele selkeästi.');

  // The version: in the About dialog (from the logo and from the Apua menu) and as a file beside the page, so a
  // copy on a disk can be compared with the site.
  const published = (await (await page.request.get('/version.json')).json()) as {
    version: string;
    built: string;
  };
  expect(published.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(published.built).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await page.goto('/');
  await page.locator('#btnHomeLogo').click();
  await expect(page.locator('#aboutVersion')).toHaveText(
    `Versio ${published.version} · koottu ${published.built}`
  );
  await expect(page.locator('#aboutDialog')).not.toContainText('tukipaketti');

  const robots = await page.request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Disallow: /proto/');
});
