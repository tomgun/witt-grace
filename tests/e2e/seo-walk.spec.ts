/**
 * must: an address that names a language (`?lang=en`, the form the sitemap lists) opens the page in that language
 *       with that language's title, description and canonical address, without storing the choice: the bare
 *       address still opens in the person's own language; an unknown code is ignored; robots.txt is served
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

  // Not stored: the bare address is Finnish again; an unknown code changes nothing.
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fi');
  await page.goto('/?lang=xx');
  await expect(page.locator('#homeTitle')).toContainText('Ajattele selkeästi.');

  const robots = await page.request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Disallow: /proto/');
});
