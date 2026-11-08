/**
 * must: the argument table shows every claim of an opened document with the prototype's summary line, filters by
 *       authored relation and by a folded search, opens a detail row with Enter, shows the evaluation columns and the
 *       "Arviointi" card only in Punnitse with the shared means and counts, follows the review lens (banner, counts,
 *       index hidden), toggles the comments layer, returns to the tree with the row selected, and at 390 px lists the
 *       same rows as mobile cards with their ratings and an add row (UX-06, inv-review-vote-table §F)
 * test: tests/e2e/table-walk.spec.ts (desktop walk; mobile list in the mobile project)
 * red-against: a filtered-out parent hiding its children, the evaluation cells rendered in Kartoita, a missing
 *              review shown as 0 instead of —, the shared index still shown under a filtered lens, the search
 *              matching case-sensitively, "Näytä puussa" leaving the table open or selecting another node
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { startWith } from './helpers.ts';

const example = readFileSync(
  path.join(process.cwd(), 'witt-grace-gpt-proto', 'examples', 'debate-kaupunkiliikenne.witt.json'),
  'utf8'
);
const CLAIM = 'Jalankulkijoiden ja ajoneuvojen kohtaamisia voi vähentyä';

test.beforeEach(async ({ page }) => {
  await startWith(page, example);
});

test('summary, filters, search, Enter, Punnitse columns, the lens banner and back to the tree', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the mobile project checks the argument list');
  await page.locator('#btnTableView').click();
  const area = page.locator('#tableArea');
  await expect(area).toBeVisible();
  await expect(page.locator('#tableSummary')).toHaveText('Näytetään 11/11 väitettä');
  const rows = page.locator('#argumentTableBody tr.table-argument-row');
  await expect(rows).toHaveCount(11);
  // Kartoita: the three evaluation headers exist but are hidden, and no evaluation cells are rendered.
  await expect(page.locator('.argument-table th.table-evaluation-col')).toHaveCount(3);
  await expect(page.locator('.argument-table th.table-evaluation-col').first()).toBeHidden();
  await expect(page.locator('#argumentTableBody td.table-number')).toHaveCount(0);
  await expect(rows.first().locator('.table-relation')).toHaveText('PÄÄVÄITE');
  await expect(rows.first().locator('.table-no-context')).toHaveText('—');

  // The comments toggle shares the tree's comments layer (off in the text preset).
  const comments = page.locator('#tableComments');
  await expect(comments).not.toBeChecked();
  await comments.check();
  await expect(comments).toBeChecked();

  // Filter by the authored relation: five opposing claims, and a chain hint where the chain pushes the other way.
  await page.locator('#tableFilter').selectOption('oppose');
  await expect(page.locator('#tableSummary')).toHaveText('Näytetään 5/11 väitettä');
  await expect(rows).toHaveCount(5);
  const nested = rows.filter({ hasText: 'Lastauspaikat ja selkeät kulkureitit' });
  await expect(nested.locator('.table-chain')).toHaveText('+ ketjun suunta');
  await expect(nested.locator('.table-parent')).toHaveText(
    'Asiakkaiden autosaavutettavuus saattaa heikentyä'
  );
  await expect(nested.locator('.table-grandparent')).toContainText('↳ Keskustan läpiajoliikennettä');
  await page.locator('#tableFilter').selectOption('all');
  await expect(rows).toHaveCount(11);

  // Search folds case; a hit on the claim itself.
  await page.locator('#tableSearch').fill('jalankulk');
  await expect(page.locator('#tableSummary')).toHaveText('Näytetään 1/11 väitettä');
  await expect(rows).toHaveCount(1);
  const row = rows.first();
  await expect(row.locator('.table-claim-button')).toHaveText(CLAIM);
  await expect(row.locator('.table-indent')).toHaveText('↳');

  // Enter on the focused claim button opens the detail row (Kartoita: notes and stored reviews, no Arviointi card).
  await row.locator('.table-claim-button').focus();
  await page.keyboard.press('Enter');
  const detail = page.locator('#argumentTableBody tr.table-expanded-row');
  await expect(detail).toBeVisible();
  await expect(row.locator('.table-claim-button')).toBeFocused();
  await expect(row.locator('.table-claim-button')).toHaveAttribute('aria-expanded', 'true');
  await expect(row.locator('.table-more')).toHaveText('▴ Sulje tiedot');
  await expect(detail.locator('.table-detail-card h3')).toContainText([
    'Perustelut ja kommentit',
    'Osallistujien arviot tiedostossa',
  ]);
  await expect(detail.locator('.table-detail-card h3', { hasText: 'Arviointi' })).toHaveCount(0);
  await expect(detail.locator('.table-detail-card').nth(1).locator('p').first()).toContainText('uskottavuus');

  // Punnitse: evaluation columns with the shared means and counts, and the Arviointi card.
  await page.locator('#btnWorkflowEvaluate').click();
  await expect(page.locator('.argument-table th.table-evaluation-col').first()).toBeVisible();
  const numbers = row.locator('td.table-number');
  await expect(numbers).toHaveCount(3);
  await expect(numbers.nth(0)).toHaveText('88 % (3)');
  await expect(numbers.nth(1)).toHaveText('+4 (3)');
  // A leaf's score is its credence, not a derived result: the index stays "—", never a number.
  await expect(numbers.nth(2)).toHaveText('—');
  const evaluation = detail.locator('.table-detail-card', { hasText: 'Arviointi' });
  await expect(evaluation.locator('p')).toContainText([
    'Tallennettujen arvioiden keskiarvo: 87.7 %',
    'Vaikutus: +4/5',
    'Perustelutulos: —',
    'Perustelutulos on heuristinen. Lehdellä on vain uskottavuusarvio.',
    'Asiakirjan oma lähtöarvio:',
  ]);

  // "Näytä puussa" leaves the table with the row selected in the tree.
  await detail.locator('.table-open-tree').click();
  await expect(area).toHaveCount(0);
  await expect(page.locator('.node.selected .node-title')).toHaveText(CLAIM);
  await expect(page.locator('#btnTreeView')).toHaveAttribute('aria-pressed', 'true');

  // T toggles the presentation; the table keeps its search and the search box takes focus.
  await page.keyboard.press('t');
  await expect(area).toBeVisible();
  await expect(page.locator('#tableSearch')).toHaveValue('jalankulk');
  await expect(page.locator('#tableSearch')).toBeFocused();

  // The root row carries a derived (incomplete) result; the review lens narrows the shown reviews to the
  // current person and hides the shared index instead of recomputing it.
  await page.locator('#tableSearch').fill('');
  await expect(rows).toHaveCount(11);
  const rootNumbers = rows.first().locator('td.table-number');
  await expect(rootNumbers).toHaveText(['60 % (3)', '—', '+47.5 †']);
  await expect(page.locator('#reviewLensBanner')).toBeHidden();
  await page.locator('#btnReviewLensTable').click();
  await expect(page.locator('#reviewLensDialog')).toBeVisible();
  await page.locator('#btnLensCurrent').click();
  await page.locator('#btnLensDone').click();
  await expect(page.locator('#reviewLensBanner')).toBeVisible();
  await expect(page.locator('#reviewLensBanner')).toContainText('Näytetään 1/3 arvioijan arviot.');
  await expect(page.locator('#btnReviewLensTable')).toContainText('· 1/3');
  await expect(page.locator('#btnReviewLensTable')).toHaveAttribute('aria-pressed', 'true');
  await expect(rootNumbers.nth(0)).toHaveText(/^\d+ % \(1\)$/);
  await expect(rootNumbers.nth(2)).toHaveText('—');
  await rows.first().locator('.table-more').click();
  const rootEvaluation = page.locator('#argumentTableBody tr.table-expanded-row .table-detail-card', {
    hasText: 'Arviointi',
  });
  await expect(rootEvaluation.locator('p').first()).toHaveText(
    /^Tallennettujen arvioiden keskiarvo: \d+\.\d %$/
  );
  await expect(rootEvaluation.locator('p').nth(1)).toHaveText('Ei puolesta/vastaan-vaikutusta vanhempaan.');
  await expect(rootEvaluation.locator('p').nth(2)).toContainText('Argumentti-indeksi on piilotettu');
  await page.locator('#btnReviewLensTable').click();
  await page.locator('#btnLensAll').click();
  await page.locator('#btnLensDone').click();
  await expect(page.locator('#reviewLensBanner')).toBeHidden();
  await expect(rootNumbers.nth(2)).toHaveText('+47.5 †');
  await expect(rootEvaluation.locator('p').nth(2)).toHaveText('Perustelutulos: +47.5 †');
  await page.locator('#tableSummary').click();
  await page.keyboard.press('t');
  await expect(area).toHaveCount(0);
});

test('an empty result and the option filter', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the mobile project checks the argument list');
  await page.locator('#btnTableView').click();
  await page.locator('#tableSearch').fill('ei-osumaa-xyz');
  await expect(page.locator('#tableSummary')).toHaveText('Näytetään 0/11 väitettä');
  await expect(page.locator('#argumentTableBody td.table-empty')).toHaveText(
    'Ei osuvia väitteitä. Kokeile eri hakua tai suodatinta.'
  );
  await page.locator('#tableSearch').fill('');
  await page.locator('#tableFilter').selectOption('option');
  await expect(page.locator('#tableSummary')).toHaveText('Näytetään 0/11 väitettä');
});

test('the mobile argument list at 390 px: cards, ratings, details and the add row', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'the 390 px layout is the mobile project');
  // In the table presentation the table itself gives way to the card list at this width.
  await page.locator('#btnTableView').click();
  const list = page.locator('#mobileArguments');
  await expect(list).toBeVisible();
  await expect(page.locator('#tableScroll')).toBeHidden();
  const cards = list.locator('.mobile-card');
  await expect(cards).toHaveCount(11);
  await expect(cards.first().locator('.mobile-path')).toHaveText('PÄÄVÄITE');
  await expect(cards.first().locator('.mobile-title')).toHaveText(
    'Keskustan läpiajoliikennettä pitäisi vähentää uusilla katujärjestelyillä.'
  );
  const claim = cards.filter({ hasText: CLAIM });
  await expect(claim.locator('.mobile-path')).toHaveText('↳ ↳ Puoltava');
  await expect(claim.locator('.mobile-parent')).toHaveText(
    '↳ Vähemmän läpiajoliikennettä voi parantaa turvallisuutta'
  );
  await expect(list.locator('.mobile-ratings')).toHaveCount(0);

  await claim.locator('.mobile-title').click();
  const details = claim.locator('.mobile-card-details');
  await expect(details).toBeVisible();
  await expect(claim).toHaveClass(/is-selected/);
  // Notes, three stored credence reviews and three current influence reviews.
  await expect(details.locator('p')).toHaveCount(7);
  await expect(details.locator('p').nth(1)).toHaveText(/^.+: Uskottavuus \d+\/100$/);
  await expect(details.locator('p').nth(4)).toHaveText(/^.+: Vaikutus [+-]?\d+(\.\d)?\/5$/);
  await expect(details.locator('.mobile-add-row input')).toHaveAttribute(
    'placeholder',
    'Kirjoita uusi väite tähän'
  );

  // Punnitse adds the rating line: shared mean, index and influence.
  await page.locator('#btnWorkflowEvaluate').click();
  await expect(claim.locator('.mobile-ratings span')).toHaveText([
    'Uskottavuus: 88 %',
    'Perustelutulos: —',
    'Vaikutus: +4/5',
  ]);
  await expect(cards.first().locator('.mobile-ratings span')).toHaveText([
    'Uskottavuus: 60 %',
    'Perustelutulos: +47.5 †',
  ]);

  // The add row creates a supporting child under the card and selects it.
  await details.locator('.support-add').click();
  await expect(details.locator('.mobile-add-row input')).toBeFocused();
  await details.locator('.mobile-add-row input').fill('Uusi mobiiliväite');
  await details.locator('.support-add').click();
  await expect(cards).toHaveCount(12);
  const created = cards.filter({ hasText: 'Uusi mobiiliväite' });
  await expect(created).toHaveClass(/is-selected/);
  await expect(created.locator('.mobile-path')).toHaveText('↳ ↳ ↳ Puoltava');
  await expect(created.locator('.mobile-ratings span').first()).toHaveText('Uskottavuus: —');
  await expect(created.locator('.mobile-card-details')).toBeVisible();
  await expect(page.locator('#tableSummary')).toHaveText('Näytetään 12/12 väitettä');
});
