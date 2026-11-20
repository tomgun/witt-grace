/**
 * must: a supporter package's `witt.html`, opened from the disk with no server, starts; shows its edition's name
 *       beside the logo on the home screen and in the workspace; opens an example carried inside it; keeps the
 *       work over a reload; loads nothing from the network or from beside the file and breaks no content security
 *       rule; and does not offer the document link, which a file on a disk cannot give (owner 2026-11-20, S-15)
 * test: tests/e2e/static-walk.spec.ts (desktop 1440×900 and mobile 390×844); needs `npm run build:static` first
 * red-against: the script still loaded as a module file (blank page from disk), examples fetched (the dialog
 *              fails from disk), the policy hash not matching the inlined script, the badge missing or shown on
 *              the hosted site
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { ensureTree } from './helpers.ts';

const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
const file = resolve(`dist-static/witt-grace-${version}-professional/witt.html`);

test('the package opens from disk, with its badge and its examples', async ({ page }) => {
  expect(existsSync(file), 'run `npm run build:static` before the browser walks').toBe(true);
  const problems: string[] = [];
  const requests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(pathToFileURL(file).href);
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.getByTestId('edition-badge')).toHaveText('♥ Ammattilainen');
  // The About dialog says which version the file is and where the newest one's number is found.
  await page.locator('#btnHomeLogo').click();
  await expect(page.locator('#aboutVersion')).toContainText(`Versio ${version} · koottu 20`);
  await expect(page.locator('#aboutVersion')).toContainText('Ammattilainen');
  await expect(page.locator('#aboutDialog')).toContainText('Uusimman version numeron näet verkkosivuston');
  await page.locator('#btnAboutDone').click();
  await page.locator('#btnHomeDemo').click();
  await page.locator('#examplesDialog button[data-example], #examplesDialog .example-card').first().click();
  await expect(page.getByTestId('app')).toBeVisible();
  expect(Number(await page.getByTestId('node-count').textContent())).toBeGreaterThan(5);
  const title = await page.locator('#projectTitle').inputValue();
  if ((page.viewportSize()?.width ?? 0) > 600) await expect(page.getByTestId('edition-badge')).toBeVisible();
  await ensureTree(page);
  await page.locator('#fileMenu summary').click();
  await expect(page.locator('#btnSave')).toBeVisible();
  await expect(page.locator('#btnCopyLink')).toHaveCount(0);
  // The browser's own storage works from a file: the work is there after a reload.
  await page.reload();
  await page.locator('#btnHomeContinue').click();
  await expect(page.locator('#projectTitle')).toHaveValue(title);
  expect(problems).toEqual([]);
  expect(requests.filter((url) => !url.startsWith('data:') && !url.startsWith('blob:'))).toEqual([
    pathToFileURL(file).href,
    pathToFileURL(file).href,
  ]);
});

test('the hosted site shows no edition badge', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.getByTestId('edition-badge')).toHaveCount(0);
});
