/**
 * must: the same steps, driven through the same element ids, produce the same visible texts in the frozen prototype
 *       (served at 4174) and in the app (4173): outline, kicker, relation line, score hero, card chips, table summary,
 *       lens button, dock summary, people rows — for the Kaupunkiliikenne example in Punnitse (WG-025, UI_INVENTORY)
 * test: tests/e2e/parity-walk.spec.ts (desktop)
 * red-against: a number formatted differently, a label from another key, a section missing in one app, a different
 *              row order
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

test('the prototype and the app agree on every visible text of the walk', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk compares the full layout');
  const proto = await digest(page, PROTO);
  // The digest must actually see the document (11 claims, chips on the selected card, 11 table rows).
  expect(proto.outline).toHaveLength(11);
  expect(proto.chips.length).toBeGreaterThan(0);
  expect(proto.tableRows).toHaveLength(11);
  expect(proto.scoreValue).toContain('+100.0');
  const app = await digest(page, APP);
  expect(app).toEqual(proto);
});
