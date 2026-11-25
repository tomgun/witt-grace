/**
 * must: Uusi työ offers a blank risk tree beside the argument and decision trees, and the document type switch
 *       shows Riskit (WG-058, owner 2026-11-24/25); the new tree's root is tagged TAVOITE; a card says what its + and
 *       − add (under the goal a supporting action and a risk, under a risk a cause and a mitigation), and the added
 *       cards are tagged so; a card is coloured by its side, so a mitigation looks supporting and a cause opposing
 *       although a mitigation opposes its risk; the side panel's add buttons say the same as the card's; a risk's
 *       sliders ask for its probability and its severity; a new card carries a question that says what its role
 *       holds until it is written (owner 2026-11-25: every new card read “Puoltava / Vastustava argumentti”), and a
 *       plain reason under a mitigation the usual text; a person's own type name stands in place of the role word
 *       and the card keeps its side's colour (owner 2026-11-25: can the names be changed where they do not fit);
 *       the risk example is listed as a risk tree and opens with its tags
 * test: tests/e2e/risk-walk.spec.ts (desktop 1440×900)
 * red-against: the risk tree missing from Uusi työ, a mitigation coloured as a risk, a cause tagged PUOLTAA, the
 *              + of a risk still saying “Puoltava”, a risk's sliders asking for credence and influence, the example
 *              listed as an argument, a new risk titled “Vastustava argumentti”, a renamed mitigation tagged
 *              “Vastustava varasuunnitelma”
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureTree } from './helpers.ts';

test.skip(({ viewport }) => (viewport?.width ?? 1440) < 1000, 'the walk drives the desktop tree');

const card = (page: Page, title: string) =>
  page.locator('.node', { has: page.locator('.node-title', { hasText: title }) });
async function addUnder(page: Page, parent: string, sign: 'support' | 'oppose', title: string, asks: string) {
  await card(page, parent).locator(`.node-add[data-relation="${sign}"]`).click();
  const editor = page.locator('.node-inline-editor');
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue(asks);
  await editor.fill(title);
  await editor.press('Enter');
  await expect(card(page, title)).toBeVisible();
}

test('a risk tree: a goal, a supporting action, a risk with its cause and mitigation; the example', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#btnHomeNew').click();
  await expect(page.locator('#btnNewWorkRisk')).toHaveText('Tyhjä riskipuu');
  await page.locator('#btnNewWorkRisk').click();
  const editor = page.locator('.node-inline-editor');
  await expect(editor).toBeFocused();
  await editor.fill('Verkkokauppa aukeaa marraskuussa');
  await editor.press('Enter');
  await ensureTree(page);
  await expect(page.locator('#modeRisk')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#modeRisk')).toHaveText('Riskit');

  const goal = card(page, 'Verkkokauppa aukeaa marraskuussa');
  await expect(goal.locator('.node-tag')).toHaveText('TAVOITE');
  await expect(goal.locator('.node-add[data-relation="support"]')).toHaveAttribute(
    'title',
    /^\+ Tukeva toimi/
  );
  await expect(goal.locator('.node-add[data-relation="oppose"]')).toHaveAttribute('title', /^− Riski/);

  await addUnder(
    page,
    'Verkkokauppa aukeaa marraskuussa',
    'support',
    'Valmis kauppa-alusta',
    'Mikä auttaa saavuttamaan tavoitteen?'
  );
  await addUnder(
    page,
    'Verkkokauppa aukeaa marraskuussa',
    'oppose',
    'Testaus jää kesken',
    'Mikä voi mennä pieleen?'
  );
  const risk = card(page, 'Testaus jää kesken');
  await expect(card(page, 'Valmis kauppa-alusta').locator('.node-tag')).toHaveText('TUKEVA TOIMI');
  await expect(risk.locator('.node-tag')).toHaveText('RISKI');
  await expect(risk.locator('.node-add[data-relation="support"]')).toHaveAttribute('title', /^\+ Syy/);
  await expect(risk.locator('.node-add[data-relation="oppose"]')).toHaveAttribute('title', /^− Torjunta/);
  await addUnder(page, 'Testaus jää kesken', 'support', 'Kehitystyö venyy', 'Mikä voi aiheuttaa tämän?');
  await addUnder(
    page,
    'Testaus jää kesken',
    'oppose',
    'Viikoittainen katsaus',
    'Miten tätä voi ehkäistä tai lieventää?'
  );
  const cause = card(page, 'Kehitystyö venyy');
  const mitigation = card(page, 'Viikoittainen katsaus');
  await expect(cause.locator('.node-tag')).toHaveText('SYY');
  await expect(mitigation.locator('.node-tag')).toHaveText('TORJUNTA');
  // Coloured by side: what is good for the goal looks supporting, what is bad looks opposing.
  await expect(card(page, 'Valmis kauppa-alusta')).toHaveAttribute('data-relation', 'support');
  await expect(risk).toHaveAttribute('data-relation', 'oppose');
  await expect(cause).toHaveAttribute('data-relation', 'oppose');
  await expect(mitigation).toHaveAttribute('data-relation', 'support');
  await expect(mitigation).toHaveAttribute('data-risk-role', 'mitigation');

  // A plain reason under a mitigation starts with the usual text.
  await addUnder(
    page,
    'Viikoittainen katsaus',
    'support',
    'Katsaus on jo kalenterissa',
    'Puoltava argumentti'
  );
  await expect(card(page, 'Katsaus on jo kalenterissa').locator('.node-tag')).toHaveText('PUOLTAA');

  // The person's own type name stands in place of the role word; the side's colour stays.
  await mitigation.locator('.node-title').click();
  await page.locator('#nodeTypeLabel').fill('Varasuunnitelma');
  await page.locator('#nodeTypeLabel').press('Enter');
  await expect(mitigation.locator('.node-tag')).toHaveText('Varasuunnitelma');
  await expect(mitigation).toHaveAttribute('data-relation', 'support');
  await page.locator('#nodeTypeLabel').fill('');
  await page.locator('#nodeTypeLabel').press('Enter');
  await expect(mitigation.locator('.node-tag')).toHaveText('TORJUNTA');

  // A risk's two ratings are its probability and its severity.
  await page.locator('#btnWorkflowEvaluate').click();
  await risk.locator('.node-title').click();
  await expect(page.getByTestId('inspector')).toContainText('Oma arvio todennäköisyydestä');
  await expect(page.getByTestId('inspector')).toContainText('Oma arvio vakavuudesta (−5…+5)');
  await expect(page.locator('#btnSupport')).toHaveText('+ Syy');
  await expect(page.locator('#btnOppose')).toHaveText('− Torjunta');
  await mitigation.locator('.node-title').click();
  await expect(page.getByTestId('inspector')).toContainText('Oma uskottavuusarvio');
  // Under a mitigation a supporting reason is a plain reason, an opposing one a risk that it fails.
  await expect(page.locator('#btnSupport')).toHaveText('+ Puoltava');
  await expect(page.locator('#btnOppose')).toHaveText('− Riski');

  // The example is listed as a risk tree and opens with its tags.
  await page.locator('#helpMenu summary').click();
  await page.locator('#btnDemo').click();
  const example = page.locator('#examplesDialog .example-card[data-example="riskit-verkkokauppa"]');
  await expect(example.locator('.example-type')).toHaveText('Riskit');
  await example.click();
  await page.locator('#replaceForget').click();
  await expect(page.getByTestId('node-count')).toHaveText('12');
  await expect(card(page, 'Verkkokauppa aukeaa marraskuussa').locator('.node-tag')).toHaveText('TAVOITE');
  await expect(card(page, 'Katsaus jää kiireessä pitämättä').locator('.node-tag')).toHaveText('RISKI');
  await expect(card(page, 'Varamaksupalvelu on valmiina').locator('.node-tag')).toHaveText('TORJUNTA');
});
