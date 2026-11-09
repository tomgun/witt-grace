/**
 * must: the AI and import dialogs behave like the prototype's: the draft task text is generated locally and copied
 *       (its first line is the prototype's heading), an AI draft pasted into step 2 is preflighted, previewed with
 *       the prototype's Finnish summary lines and opened only through the replacement dialog, its AI profile appears
 *       in the actor select and behind "AI:n arviot", the document opens in that AI's perspective (banner shown), the
 *       AI results dialog lists that AI's own counts and option ranking and shows its perspective in the tree again;
 *       an invalid pasted proposal opens the import report instead of importing; File → Avaa JSON routes a project
 *       file through the replace flow and an AI draft file to the draft preview (UI_INVENTORY S-11.12, S-11.13,
 *       S-11.20, S-11.24, S-11.25, S-13; inv-ai-contrib §0, §A, §B, §D)
 * test: tests/e2e/ai-walk.spec.ts (desktop)
 * red-against: a task sent anywhere instead of copied, an AI rating counted as a human review, a draft opened
 *              without the replacement dialog, an invalid proposal merged or silently ignored, Avaa JSON accepting a
 *              draft as a project or refusing it outright
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startBlank } from './helpers.ts';

const DRAFT_PATH = 'witt-grace-gpt-proto/examples/ai-draft-with-ratings-dev14.witt.json';
const PROJECT_PATH = 'witt-grace-gpt-proto/examples/painotettu-arviointi-dev20.witt.json';
const DRAFT = readFileSync(DRAFT_PATH, 'utf8');

const fromFileMenu = async (page: Page, id: string) => {
  await page.locator('#fileMenu summary').click();
  await page.locator(id).click();
};
/** The replacement dialog appears when there is saved work; "Hylkää nykyinen ja jatka" proceeds. */
const confirmReplace = async (page: Page) => {
  await expect(page.locator('#replaceDialog')).toBeVisible();
  await page.locator('#replaceForget').click();
  await expect(page.locator('#replaceDialog')).toBeHidden();
};

test('AI draft, AI results, proposal report and File → Avaa JSON routing', async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await startBlank(page, 'argument');

  // --- Step 1: the task text is generated here and copied, nothing is sent ---
  await fromFileMenu(page, '#btnNew');
  await page.locator('#btnAIDraft').click();
  const draftDialog = page.locator('#aiDialog');
  await expect(draftDialog).toBeVisible();
  await expect(page.locator('#aiTopic')).toBeFocused();
  await expect(page.locator('#aiMode')).toHaveValue('argument');
  await page.locator('#aiMode').selectOption('decision');
  await page.locator('#aiTopic').fill('Mitä tekisin lauantaina?');
  await page.locator('#btnAICopy').click();
  await expect(page.locator('#aiDraftTaskStatus')).toHaveText(
    'AI-tehtävä kopioitu. Liitä se tekoälykeskusteluun.'
  );
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split('\n')[0]).toBe('# WITT / GRACE AI creation task (one portable file)');
  expect(copied).toContain('Return the document in language fi.');
  expect(copied).toContain('TASK MODE: decision. TOPIC: Mitä tekisin lauantaina?');
  await page.locator('#aiDraftPromptPreviewDetails summary').click();
  await expect(page.locator('#aiPromptPreview')).toHaveValue(copied);

  // --- Step 2: the AI's reply is pasted, previewed and opened through the replacement dialog ---
  await page.locator('#btnAIToImport').click();
  await expect(page.locator('#aiDraftImportStep')).toBeVisible();
  await expect(page.locator('#aiDraftPromptStep')).toBeHidden();
  await expect(page.locator('#btnAIFlowImport')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#aiDraftPaste').fill(DRAFT);
  await page.locator('#btnAIShowPreview').click();
  const preview = page.locator('#aiDraftPreviewDialog');
  await expect(preview).toBeVisible();
  await expect(draftDialog).toHaveCount(0);
  const lines = (await page.locator('#aiDraftPreview').innerText()).split('\n');
  expect(lines.slice(0, 5)).toEqual([
    'Mitä tekisin lauantaina? (decision)',
    'AI: Esimerkki-AI',
    '6 solmua · 1 yhteisperustetta · 0 lisäyhteyttä',
    '3 uskottavuusarviota · 3 vaikutusarviota',
    '• Uimahalliin lasten kanssa (option) · –% · –/5',
  ]);
  expect(lines).toContain('• Voimme saada perheen yhteistä aikaa (support) · 70% · 4/5');
  // Leaving the ratings out also leaves the locked shared reasons out.
  await page.locator('#draftIncludeRatings').uncheck();
  await expect(page.locator('#draftIncludeShared')).not.toBeChecked();
  await expect(page.locator('#draftIncludeShared')).toBeDisabled();
  await page.locator('#draftIncludeRatings').check();
  await expect(page.locator('#draftIncludeShared')).toBeEnabled();
  await page.locator('#draftIncludeShared').check();
  await page.locator('#btnDraftApply').click();
  await confirmReplace(page);
  await expect(preview).toHaveCount(0);
  await expect(page.getByTestId('project-title')).toHaveValue('Mitä tekisin lauantaina?');
  await expect(page.getByTestId('node-count')).toHaveText('9');

  // The AI is a separate profile: listed in the actor select and behind the AI results button; the editor stays.
  await expect(
    page.getByTestId('actor-select').locator('option', { hasText: 'AI · Esimerkki-AI · AI' })
  ).toHaveCount(1);
  await expect(page.getByTestId('actor-select').locator('option:checked')).toHaveText('Minä');
  await expect(page.locator('#btnAIResults')).toHaveText('AI:n arviot');
  // A draft with ratings opens in the AI's perspective, like the prototype.
  const banner = page.locator('#analysisPerspectiveBanner');
  await expect(banner).toBeVisible();
  await expect(page.locator('#analysisPerspectiveLabel')).toContainText(
    'Näytetään arvioijan AI · Esimerkki-AI tulokset'
  );
  await page.locator('#btnPerspectiveOwn').click();
  await expect(banner).toBeHidden();

  // --- AI results: the AI's own counts and ranking; the perspective returns to the tree ---
  await page.locator('#btnAIResults').click();
  const results = page.locator('#aiResultsDialog');
  await expect(results).toBeVisible();
  await expect(page.locator('#aiResultsAssessorSelect')).toHaveValue(/.+/);
  await expect(page.locator('#aiResultsCounts')).toHaveText(
    'Uskottavuusarvioita 3 · suhdearvioita 3 · lisäyhteyksiä 0'
  );
  await expect(page.locator('#aiResultsEmpty')).toBeHidden();
  await expect(page.locator('.ai-assessor-option')).toHaveCount(3);
  await expect(page.locator('.ai-assessor-option.ai-leading-option strong')).toHaveText('Siivoamaan');
  await expect(page.locator('#aiResultsRankingHint')).toHaveText(
    'Korostetaan korkein valmis ja hyväksyttävä indeksitulos. Tämä ei ole AI:n päätösääni eikä automaattinen suositus.'
  );
  await page.locator('#btnAIResultsShow').click();
  await expect(results).toHaveCount(0);
  await expect(banner).toBeVisible();
  await expect(page.locator('#analysisPerspectiveLabel')).toContainText('AI · Esimerkki-AI');

  // --- Proposal: an invalid pasted JSON opens the import report, nothing is imported ---
  await fromFileMenu(page, '#btnAIReview');
  const review = page.locator('#aiReviewDialog');
  await expect(review).toBeVisible();
  await page.locator('#aiReviewMode').selectOption('assess');
  await page.locator('#aiReviewPromptPreviewDetails summary').click();
  await expect(page.locator('#aiReviewPromptPreview')).toHaveValue(
    /^# WITT \/ GRACE: existing-document contribution request/
  );
  await expect(page.locator('#aiReviewPromptPreview')).toHaveValue(/ASSESS ONLY:/);
  await expect(page.locator('#contributionExporterList .contribution-exporter')).toHaveCount(1);
  await page.locator('#aiReviewDialog summary', { hasText: '2. Tarkista ja tuo' }).click();
  await page.locator('#aiReviewPaste').fill('{ "format": "witt-contribution-v2", ');
  await page.locator('#btnAIReviewImport').click();
  const report = page.locator('#importReportDialog');
  await expect(report).toBeVisible();
  await expect(page.locator('#importReportSummary')).toHaveText(
    'Muutosehdotus · JSON-syntaksi · 1 virhettä. Tuontia ei tehty.'
  );
  await expect(page.locator('.import-report-entry .import-report-code')).toHaveText('JSON_SYNTAX');
  await expect(page.locator('.import-report-entry .import-report-location')).toHaveText(
    '$ · rivi 1, sarake 37'
  );
  await page.locator('#btnImportReportCopy').click();
  await expect(page.locator('#importReportStatus')).toHaveText('Korjausraportti kopioitu.');
  expect((await page.evaluate(() => navigator.clipboard.readText())).split('\n').slice(0, 4)).toEqual([
    'WITT JSON -tarkistusraportti',
    'Tiedosto: Muutosehdotus',
    'Muoto: JSON-syntaksi',
    'Tulos: hylätty (1 virhettä)',
  ]);
  await page.locator('#btnImportReportClose').click();
  await expect(report).toHaveCount(0);
  await page.locator('#btnAIReviewClose').click();
  await expect(review).toHaveCount(0);
  await expect(page.getByTestId('node-count')).toHaveText('9');

  // --- File → Avaa JSON: an AI draft file goes to the draft preview, a project file to the replace flow ---
  let chooser = page.waitForEvent('filechooser');
  await fromFileMenu(page, '#btnOpen');
  await (await chooser).setFiles(DRAFT_PATH);
  await expect(preview).toBeVisible();
  await expect(page.locator('#aiDraftPreview')).toContainText('AI: Esimerkki-AI');
  await page.locator('#btnDraftCancel').click();
  await expect(preview).toHaveCount(0);

  chooser = page.waitForEvent('filechooser');
  await fromFileMenu(page, '#btnOpen');
  await (await chooser).setFiles(PROJECT_PATH);
  await expect(page.locator('#replaceDescription')).toContainText('JSON tarkistettu: WITT-dokumentti v5.');
  await confirmReplace(page);
  await expect(page.getByTestId('project-title')).toHaveValue(
    'Esimerkki: äänimäärillä painotettu yhteisarvio'
  );
  await expect(page.getByTestId('node-count')).toHaveText('6');
  await expect(page.locator('#btnAIResults')).toHaveCount(0);
});
