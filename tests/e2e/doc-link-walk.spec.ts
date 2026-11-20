/**
 * must: File → "Kopioi linkki asiakirjaan" copies a link that carries the open document and says so; opening the
 *       link in a browser with no work opens that document, in a browser with work it asks through the replacement
 *       dialog first; the fragment leaves the address bar; a cut link says it is broken and changes nothing (S-15,
 *       owner 2026-11-20)
 * test: tests/e2e/doc-link-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: the link pointing at an empty app, the document replaced without asking, the fragment left in the
 *              address so a reload asks again, a cut link opening a blank or half document
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { startWith } from './helpers.ts';

const EXAMPLE = readFileSync('public/examples/debate-etatyomalli.witt.json', 'utf8');
const TITLE = (JSON.parse(EXAMPLE) as { title: string }).title;

test('a copied document link opens the document elsewhere', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await startWith(page, EXAMPLE);
  const nodes = await page.getByTestId('node-count').textContent();
  await page.locator('#fileMenu summary').click();
  await page.locator('#btnCopyLink').click();
  await expect(page.getByText(/^Linkki kopioitu \(\d+ merkkiä\)/)).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/^http:\/\/127\.0\.0\.1:4173\/#doc=z\.[A-Za-z0-9_-]+$/);
  expect(link.length).toBeLessThan(30000);

  // A browser with no work: the document opens.
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/');
  await page.goto(link);
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.locator('#projectTitle')).toHaveValue(TITLE);
  await expect(page.getByTestId('node-count')).toHaveText(nodes!);
  expect(new URL(page.url()).hash).toBe('');

  // A browser with work: the replacement dialog asks first.
  await page.goto('/');
  await page.goto(link);
  await expect(page.locator('#replaceDialog')).toBeVisible();

  // A cut link changes nothing and says so.
  await page.goto('/');
  await page.goto(link.slice(0, link.indexOf('#') + 40));
  await expect(page.getByText(/^Linkin sisältöä ei voitu avata/)).toBeVisible();
  await expect(page.locator('#replaceDialog')).toBeHidden();
});
