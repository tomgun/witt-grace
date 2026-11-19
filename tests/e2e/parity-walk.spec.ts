/**
 * must: the same steps, driven through the same element ids, produce the same visible texts in the frozen prototype
 *       (served at 4174) and in the app (4173): outline, kicker, relation line, card chips, table summary, lens
 *       button, dock summary, people rows — for the Kaupunkiliikenne example in Punnitse (WG-025, UI_INVENTORY).
 *       The computed results are left out of the comparison: the app opens the prototype's file under its own
 *       default calculation method (owner 2026-11-18, S-15), so those figures differ by decision; the ratings
 *       people gave, which do not depend on the method, are still compared. Texts the owner has decided to show
 *       differently (S-15) are compared after the prototype's text is brought to the decided form, one rule per
 *       decision (`asDecided`), so any other difference still fails
 * test: tests/e2e/parity-walk.spec.ts (desktop)
 * red-against: a number formatted differently, a label from another key, a section missing in one app, a different
 *              row order
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { numberStyleOf, withNumberStyle } from '../../src/app/numberFormat.ts';

const PROTO = 'http://127.0.0.1:4174/';
const APP = 'http://127.0.0.1:4173/';
const example = readFileSync(
  path.join(process.cwd(), 'witt-grace-gpt-proto', 'examples', 'debate-kaupunkiliikenne.witt.json'),
  'utf8'
);
const SELECTED = 'Vähemmän läpiajoliikennettä voi parantaa turvallisuutta';

const texts = async (page: Page, selector: string) =>
  (await page.locator(selector).allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());

async function digest(page: Page, base: string) {
  await page.goto(base);
  await page.evaluate((d) => {
    localStorage.clear();
    localStorage.setItem('witt-project-v3', d);
    localStorage.setItem('witt-locale-v1', 'fi');
  }, example);
  await page.reload();
  await page.locator('#btnHomeContinue').click();
  await expect(page.locator('#viewport')).toBeVisible();
  await page.locator('#btnWorkflowEvaluate').click();
  const outline = await texts(page, '#treeOutline .outline-item');
  await page.locator('#treeOutline .outline-item', { hasText: SELECTED }).click();
  const kicker = (await texts(page, '#inspector > .inspector-note'))[0];
  const relationLine = (await texts(page, '#inspector .relation-effective'))[0];
  const scoreValue = (await texts(page, '#inspector .score-value'))[0];
  const scoreLines = await texts(page, '#inspector .score-line');
  const compare = (await texts(page, '#inspector .profile-review-list summary'))[0];
  const chips = await texts(page, `.node:has(.node-title:text-is("${SELECTED}")) .meta-chip`);
  const cardTags = await texts(page, '.node .node-tag');
  await page.locator('#btnViewSettings').click();
  // 2026-11-19: the app's dock is in sections, and the one that limits what is shown starts closed.
  const limit = page.locator('#dockSection-limit:not([open]) > summary');
  if (await limit.count()) await limit.click();
  const dockSummary = (await texts(page, '#focusSummary'))[0];
  const depth = (await texts(page, '#treeDepthValue'))[0];
  await page.locator('#btnDockClose').click();
  await page.locator('#btnTableView').click();
  const tableSummary = (await texts(page, '#tableSummary'))[0];
  const tableRows = await texts(page, '#argumentTableBody tr.table-argument-row');
  await page.locator('#btnTreeView').click();
  await page.locator('#assessmentMenu summary').click();
  const lensButton = (await texts(page, '#btnReviewLens'))[0];
  await page.locator('#btnPeople').click();
  const people = await texts(page, '#peopleList .person-row small');
  await page.keyboard.press('Escape');
  return {
    outline,
    kicker,
    relationLine,
    scoreValue,
    scoreLines,
    compare,
    chips,
    cardTags,
    dockSummary,
    depth,
    tableSummary,
    tableRows,
    lensButton,
    people,
  };
}

type Digest = Awaited<ReturnType<typeof digest>>;
/** The digest without what the calculation method decides: the score hero and its lines, the result chip and the
 * result column of the table. */
function withoutResults(d: Digest) {
  return {
    ...d,
    scoreValue: null,
    scoreLines: null,
    chips: d.chips.filter((chip) => !/ (netto|tulos|laskettu)$/.test(chip)),
    tableRows: d.tableRows.map((row) => row.replace(/ (?:[+−-]?\d+[.,]\d(?: %)?|—)(?: †)? ▾/, ' ▾')),
  };
}

/** 2026-11-19: figures as Finnish writes them, a decimal comma and a true minus, in every compared text. */
const figures = <T>(value: T): T =>
  (typeof value === 'string'
    ? withNumberStyle(value, numberStyleOf('fi'))
    : Array.isArray(value)
      ? value.map((item) => figures(item))
      : value) as T;

/** The prototype's digest in the form the owner decided for the app (UI_INVENTORY S-15), one rule per decision. */
function asDecided(raw: Digest): Digest {
  const d = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, figures(value)])) as Digest;
  return {
    ...d,
    // 2026-11-19: "Arvioinnin mukaan" shows one decimal (the prototype prints +3.6666666666666665).
    relationLine: figures(
      (raw.relationLine ?? '').replace(/[+-]?\d+\.\d{2,}/, (figure) => {
        const rounded = Number(Number(figure).toFixed(1));
        return (rounded > 0 ? '+' : '') + String(rounded);
      })
    ),
    // 2026-11-19: one word for the person who rates (arvioija), where the prototype also says käyttäjä or henkilö.
    compare: (d.compare ?? '').replace('Arviot henkilöittäin', 'Arviot arvioijittain'),
    lensButton: (d.lensButton ?? '').replace('Käyttäjien arvioiden näkyminen', 'Kenen arviot näkyvät'),
    // 2026-11-19: the branch highlight says what choosing does; changing the branch has its own button and line.
    dockSummary: (d.dockSummary ?? '').replace(
      'Valitse puoltavat tai vastustavat. Valitun haaran voi vaihtaa.',
      'Valitse puoltavat tai vastustavat, niin muut himmenevät.'
    ),
  };
}

test('the prototype and the app agree on every visible text of the walk', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk compares the full layout');
  const proto = await digest(page, PROTO);
  // The digest must actually see the document (11 claims, chips on the selected card, 11 table rows).
  expect(proto.outline).toHaveLength(11);
  expect(proto.chips.length).toBeGreaterThan(0);
  expect(proto.tableRows).toHaveLength(11);
  expect(proto.scoreValue).toContain('+100.0');
  const app = await digest(page, APP);
  expect(app.scoreValue).toContain('94,4 %');
  expect(proto.relationLine).toBe('Arvioinnin mukaan: Puoltava (+3.6666666666666665/5)');
  expect(asDecided(proto).relationLine).toBe('Arvioinnin mukaan: Puoltava (+3,7/5)');
  expect(withoutResults(app)).toEqual(withoutResults(asDecided(proto)));
});
