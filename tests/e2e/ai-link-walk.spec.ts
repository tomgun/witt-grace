/**
 * must: the site serves `ai.txt`, the brief an AI fetches; the draft dialog offers a short request that names that
 *       address and the topic; a link `#draft=<JSON>` opens the draft's preview (nothing is installed before
 *       "Avaa"), a broken one opens the import report, `#ai-import` opens the paste step, and in each case the
 *       fragment leaves the address bar; a reply pasted with its Markdown fence is previewed (S-15, owner
 *       2026-11-20)
 * test: tests/e2e/ai-link-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: ai.txt missing from the build, the short request without the address, a draft link installing the
 *              document without the preview, the fragment left in the address so a reload imports again, a fenced
 *              paste refused as Markdown
 */
import { expect, test } from '@playwright/test';
import { DRAFT_EXAMPLE } from '../../src/domain/index.ts';

const DRAFT = JSON.stringify({ ...DRAFT_EXAMPLE, title: 'Linkistä tuotu päätös' });

test('the brief is served and the short request names it', async ({ page, request }) => {
  const brief = await request.get('/ai.txt');
  expect(brief.ok()).toBe(true);
  const text = await brief.text();
  expect(text).toContain('witt-ai-draft-v3');
  expect(text).toContain('#draft=');
  await page.goto('/#ai-import');
  await expect(page.locator('#aiDraftPaste')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await page.locator('#btnAIToPrompt').click();
  await page.locator('#aiMode').selectOption('decision');
  await page.locator('#aiTopic').fill('Kesäloman kohde');
  await expect(page.locator('#aiShortRequest')).toHaveText(
    'Luo minulle päätöspuu aiheesta ”Kesäloman kohde” näiden ohjeiden mukaan: http://127.0.0.1:4173/ai.txt'
  );
});

test('a draft link opens the preview, and only "Avaa" installs it', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/#draft=' + encodeURIComponent(DRAFT));
  await page.reload();
  // The reload has no fragment left: the preview came from the first load only.
  await expect(page.getByTestId('ai-draft-preview-dialog')).toHaveCount(0);
  await page.goto('/#draft=' + encodeURIComponent(DRAFT));
  await expect(page.getByTestId('ai-draft-preview-dialog')).toBeVisible();
  await expect(page.locator('#aiDraftPreview')).toContainText('Linkistä tuotu päätös');
  expect(new URL(page.url()).hash).toBe('');
  expect(await page.evaluate(() => window.localStorage.getItem('witt-project-v3'))).toBeNull();
  await page.locator('#btnDraftApply').click();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.locator('#projectTitle')).toHaveValue('Linkistä tuotu päätös');
});

test('a broken draft link says what is wrong; a fenced paste is previewed', async ({ page }) => {
  await page.goto('/#draft=' + encodeURIComponent('{"format":"witt-ai-draft-v3",'));
  await expect(page.getByTestId('import-report-dialog')).toBeVisible();
  await expect(page.getByTestId('ai-draft-preview-dialog')).toHaveCount(0);
  await page.goto('/');
  await page.goto('/#ai-import');
  await page.locator('#aiDraftPaste').fill('```json\n' + DRAFT + '\n```');
  await page.locator('#btnAIShowPreview').click();
  await expect(page.locator('#aiDraftPreview')).toContainText('Linkistä tuotu päätös');
});
