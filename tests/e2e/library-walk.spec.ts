/**
 * must: the document library says where the open document stands (not in the library, there as it is, changed
 *       since), saves it on request, and its backup really brings documents back: the downloaded file holds every
 *       document of the library, a deleted document returns from it with its claims, and restoring a document that
 *       is still in the library adds a copy and replaces nothing; the list needs no "Päivitä" (owner's question
 *       2026-11-19, UI_INVENTORY S-11.23, S-15)
 * test: tests/e2e/library-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: a backup that holds titles but not the documents, a restore that overwrites the library's newer
 *              copy, a restored document that opens empty, the open document shown as saved after it was changed
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { addNamed, startBlank } from './helpers.ts';

test('save, back up, delete, restore: the document comes back whole', async ({ page }) => {
  await startBlank(page, 'argument');
  await page.locator('#projectTitle').fill('Ensimmäinen työ');
  await page.locator('#projectTitle').press('Enter');
  await addNamed(page, '#btnSupport', 'Säästää aikaa');
  const openLibrary = async () => {
    await page.locator('#fileMenu > summary').click();
    await page.locator('#btnLibrary').click();
    await expect(page.locator('#libraryDialog')).toBeVisible();
  };
  const entries = page.getByTestId('library-entry');
  const stateLine = page.locator('#libraryCurrentState');

  await openLibrary();
  await expect(page.locator('#libraryCurrentTitle')).toHaveText('Ensimmäinen työ');
  await expect(stateLine).toHaveText('Ei vielä kirjastossa.');
  await expect(page.locator('#libraryList')).toContainText('Kirjastossa ei ole vielä asiakirjoja');
  await expect(page.locator('#btnLibraryBackup')).toBeDisabled();
  await expect(page.locator('#btnLibraryRefresh')).toHaveCount(0);
  await page.locator('#btnLibrarySaveCurrent').click();
  await expect(stateLine).toHaveText('Kirjastossa on tämä versio.');
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText('Ensimmäinen työ');
  await expect(entries.first()).toContainText('avoinna');
  await expect(entries.first()).toContainText('2 väitettä');
  // The open document cannot be deleted from under itself, nor opened over itself.
  await expect(entries.first().locator('[data-action="delete"]')).toHaveCount(0);
  await expect(entries.first().locator('[data-action="open"]')).toHaveCount(0);
  await page.locator('#btnLibraryClose').click();

  // A change after saving shows as such.
  await addNamed(page, '#btnOppose', 'Maksaa liikaa');
  await openLibrary();
  await expect(stateLine).toHaveText('Muutettu sen jälkeen, kun se tallennettiin kirjastoon.');
  await expect(entries.first()).toContainText('muutoksia tallentamatta');
  await page.locator('#btnLibrarySaveCurrent').click();
  await expect(stateLine).toHaveText('Kirjastossa on tämä versio.');
  await expect(entries.first()).toContainText('3 väitettä');

  // The backup is one dated file with the whole document in it.
  const download = page.waitForEvent('download');
  await page.locator('#btnLibraryBackup').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^witt-library-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backupPath = await file.path();
  const bundle = JSON.parse(readFileSync(backupPath, 'utf8')) as {
    documents: { title: string; nodes: { title: string }[] }[];
  };
  expect(bundle.documents).toHaveLength(1);
  expect(bundle.documents[0]?.title).toBe('Ensimmäinen työ');
  expect(bundle.documents[0]?.nodes.map((n) => n.title)).toContain('Maksaa liikaa');
  await expect(page.locator('#libraryStatus')).toHaveText('1 asiakirjan varmuuskopio ladattu.');
  await page.locator('#btnLibraryClose').click();

  // A second document, so that the first can be deleted from the library.
  await page.locator('#fileMenu > summary').click();
  await page.locator('#btnNew').click();
  await page.locator('#btnNewWorkArgument').click();
  await page.locator('#confirmAccept').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('node-count')).toHaveText('1');
  await openLibrary();
  await expect(stateLine).toHaveText('Ei vielä kirjastossa.');
  await expect(entries).toHaveCount(1);
  await entries.first().locator('[data-action="delete"]').click();
  await page.locator('#confirmAccept').click();
  await expect(entries).toHaveCount(0);

  // Restore: the deleted document is back, whole.
  await page.locator('#libraryBackupInput').setInputFiles(backupPath);
  await page.locator('#confirmAccept').click();
  await expect(page.locator('#libraryStatus')).toHaveText('Tuotiin 1 asiakirjaa, joista 0 kopiona.');
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText('Ensimmäinen työ');
  await expect(entries.first()).toContainText('3 väitettä');

  // Restoring again replaces nothing: the document that is already there gets a copy beside it.
  await page.locator('#libraryBackupInput').setInputFiles(backupPath);
  await page.locator('#confirmAccept').click();
  await expect(page.locator('#libraryStatus')).toHaveText('Tuotiin 1 asiakirjaa, joista 1 kopiona.');
  await expect(entries).toHaveCount(2);

  // And it opens with its claims.
  await entries.first().locator('[data-action="open"]').click();
  await page.locator('#replaceForget').click();
  await expect(page.locator('#libraryDialog')).toBeHidden();
  await expect(page.getByTestId('node-count')).toHaveText('3');
  await expect(page.locator('#projectTitle')).toHaveValue(/Ensimmäinen työ/);
});
