/**
 * must: the four review dialogs behave like the prototype's: the assessment round walks the queue one claim at a
 *       time (Punnitse forced on, credence and influence saved as the actor's own review, a skipped item left
 *       unreviewed, cursor and done marks kept per document and person in this browser, so reopening resumes where
 *       the person left off); the review lens filters whose reviews the views show and the quick-bar button carries
 *       the selected/total count; the people dialog adds a person through the text prompt without selecting them,
 *       renames and refuses a duplicate name with the prototype's notice, changes shares and switches the actor;
 *       the vote dialog opens a round, keeps unsaved drafts apart from saved ballots, seals results while the round
 *       is open, and after closing shows the weighted preference per option, the audit rows and the ballots by
 *       person; the round's questions and guidance sit behind its ? button, its ⋮ button lists the ancestors up to the
 *       root, and the buttons stay in view
 *       (UX_AND_WORKFLOWS §Arviointikierros, §Arvioijat, §Päätösäänestys; UI_INVENTORY S-05, S-09, S-10, S-15)
 * test: tests/e2e/review-walk.spec.ts (desktop)
 * red-against: a skipped item counted as reviewed, the round restarting from the first item on reopen, a review
 *              written under the wrong person, an unsaved slider draft counted as a ballot, results shown while
 *              hidden, the new person silently becoming the actor
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startWith } from './helpers.ts';

const EXAMPLE = readFileSync('witt-grace-gpt-proto/examples/painotettu-arviointi-dev20.witt.json', 'utf8');
const PROJECT_ID = 'b1e6836e-dd9b-4b59-9f94-55e8f4e382c4';
const OWNER_ID = 'ef421d3b-6bb3-4ed9-90fb-370be69c6de7';
const SWIM = '8ede14a8-1f8c-4fe1-876c-aee515fefe1d'; // "Uiminen virkistää", under the option "Uimahalliin"
const MOVE = 'd4645e64-ced1-4744-a910-69f62eeda727'; // "Liike parantaa oloa", under "Uiminen virkistää"
const TIRED = '943ae284-6c43-4366-adf4-b95cbfcc900e'; // "Voi väsyttää", under "Uimahalliin"

const storedJson = (page: Page, key: string) =>
  page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) ?? 'null') as unknown, key);

/** The toolbar's Arviointi menu is a <details> popover; a click inside closes it again. */
const fromAssessMenu = async (page: Page, id: string) => {
  await page.locator('#assessmentMenu summary').click();
  await page.locator(id).click();
};

test.beforeEach(async ({ page }) => {
  await startWith(page, EXAMPLE);
});

test('assessment round, review lens, people and a vote round', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the desktop walk covers the flow');

  // --- Assessment round: two claims rated, one skipped, progress kept ---
  await fromAssessMenu(page, '#btnAssess');
  const assessment = page.locator('#assessmentDialog');
  await expect(assessment).toBeVisible();
  await expect(page.locator('#btnWorkflowEvaluate')).toHaveClass(/active/);
  await expect(page.locator('#assessmentProfile')).toHaveText('Käyttäjänä: Omistaja');
  await expect(page.locator('#assessmentStep')).toHaveText('Kohta 1/3');
  await expect(page.locator('#assessmentReviewed')).toHaveText('Arvioitu 0/3');
  await expect(page.locator('#assessmentContext')).toHaveText('Päätösvaihtoehto: Uimahalliin');
  await expect(page.locator('#assessmentClaim')).toHaveText('Uiminen virkistää');
  await expect(page.locator('#assessmentInfluenceLabel')).toHaveText(
    'Kuinka vahvasti peruste puoltaa tai vastustaa tämän vaihtoehdon valitsemista?'
  );
  // The questions and guidance sit behind "?" (owner 2026-11-10); the buttons stay in view.
  await expect(page.locator('#assessmentInfluenceLabel')).toHaveClass(/visually-hidden/);
  await expect(page.locator('#btnAssessNext')).toBeInViewport();
  await page.locator('#btnAssessHelp').click();
  await expect(page.locator('#assessmentInfluenceLabel')).toBeVisible();
  await expect(page.locator('#assessmentImpactReflection')).toBeVisible();
  await page.locator('#btnAssessHelp').click();
  await page.locator('#assessmentCredenceNumber').fill('80');
  await expect(page.locator('#assessmentCredence')).toHaveValue('80');
  await page.locator('#assessmentInfluence').fill('4');
  await expect(page.locator('#assessmentInfluenceValue')).toHaveText('+4');
  await page.locator('#btnAssessNext').click();

  await expect(page.locator('#assessmentStep')).toHaveText('Kohta 2/3');
  await expect(page.locator('#assessmentReviewed')).toHaveText('Arvioitu 1/3');
  await expect(page.locator('#assessmentContext')).toHaveText('Johtopäätös: Uiminen virkistää');
  await expect(page.locator('#assessmentClaim')).toHaveText('Liike parantaa oloa');
  // The ⋮ button lists the whole line of ancestors up to the root (owner 2026-11-11) and stays open between steps.
  await page.locator('#btnAssessChain').click();
  await expect(page.locator('#assessmentChain li')).toHaveText([
    '◎Mihin käytämme vapaa-aikamme?',
    '◇Uimahalliin',
    '+Uiminen virkistää',
  ]);
  await expect(page.locator('#assessmentContext')).toHaveCount(0);
  await page.locator('#btnAssessChain').click();
  await expect(page.locator('#assessmentContext')).toHaveText('Johtopäätös: Uiminen virkistää');
  await expect(page.locator('#assessmentInfluenceLabel')).toHaveText(
    'Kuinka voimakkaasti peruste puoltaa tai vastustaa ylemmän väitteen paikkansapitävyyttä?'
  );
  await page.locator('#assessmentCredenceNumber').fill('60');
  await page.locator('#assessmentInfluence').fill('2');
  await page.locator('#btnAssessNext').click();

  await expect(page.locator('#assessmentStep')).toHaveText('Kohta 3/3');
  await expect(page.locator('#assessmentClaim')).toHaveText('Voi väsyttää');
  await expect(page.locator('#btnAssessNext')).toHaveText('Tallenna ja yhteenveto');
  await expect(page.locator('#btnAssessSkip')).toHaveText('Ohita ja yhteenveto');
  await page.locator('#btnAssessSkip').click();
  await expect(page.locator('#assessmentStep')).toHaveText('Arviointikierroksen yhteenveto');
  await expect(page.locator('#assessmentReviewed')).toHaveText('Arvioitu 2/3');
  await expect(page.locator('#assessmentFinishTitle')).toHaveText('Osa arviointikohdista odottaa');
  await expect(page.locator('#btnAssessUnreviewed')).toBeVisible();
  await page.locator('#btnAssessClose').click();
  await expect(assessment).toBeHidden();

  // The reviews are the owner's own records in the document; the marks and the cursor are in this browser.
  const saved = (await storedJson(page, 'witt-project-v3')) as {
    votes: { nodeId: string; userId: string; confidence: number }[];
    edgeAssessments: { subjectId: string; userId: string; influence: number }[];
  };
  expect(saved.votes.find((v) => v.nodeId === SWIM && v.userId === OWNER_ID)?.confidence).toBe(80);
  expect(saved.votes.find((v) => v.nodeId === MOVE && v.userId === OWNER_ID)?.confidence).toBe(60);
  expect(saved.edgeAssessments.find((a) => a.subjectId === SWIM && a.userId === OWNER_ID)?.influence).toBe(4);
  expect(saved.edgeAssessments.find((a) => a.subjectId === MOVE && a.userId === OWNER_ID)?.influence).toBe(2);
  const pass = (await storedJson(page, `witt-assessment-pass-v2:${PROJECT_ID}:${OWNER_ID}`)) as {
    cursorId: string;
    doneIds: string[];
  };
  expect(pass.cursorId).toBe(TIRED);
  expect(pass.doneIds.sort()).toEqual([SWIM, MOVE].sort());

  // Reopened with the R shortcut, the round resumes at the skipped item and remembers what was reviewed.
  await page.keyboard.press('r');
  await expect(page.locator('#assessmentStep')).toHaveText('Kohta 3/3');
  await expect(page.locator('#assessmentReviewed')).toHaveText('Arvioitu 2/3');
  await expect(page.locator('#assessmentReviewedMarker')).toHaveText(
    'Tätä kohtaa ei ole vielä merkitty arvioiduksi.'
  );
  await page.locator('#btnAssessPrev').click();
  await expect(page.locator('#assessmentStep')).toHaveText('Kohta 2/3');
  await expect(page.locator('#assessmentReviewedMarker')).toHaveText(
    'Tämä kohta on jo arvioitu tällä kierroksella.'
  );
  await expect(page.locator('#assessmentCredenceNumber')).toHaveValue('60');
  await expect(page.locator('#assessmentInfluenceValue')).toHaveText('+2');
  await page.keyboard.press('Escape');
  await expect(assessment).toBeHidden();

  // --- Review lens: deselect one person, the menu and quick-bar buttons carry the count ---
  const lensButton = page.locator('#btnReviewLens');
  await expect(lensButton).toHaveText('Käyttäjien arvioiden näkyminen');
  await fromAssessMenu(page, '#btnReviewLens');
  const lens = page.locator('#reviewLensDialog');
  await expect(lens).toBeVisible();
  await expect(page.locator('#lensPeople .lens-person')).toHaveCount(4);
  await expect(page.locator('#lensPeople input:checked')).toHaveCount(4);
  await expect(page.locator('#lensInsights')).toContainText('Suurimmat arvioerot');
  await page.locator('#lensPeople .lens-person', { hasText: 'Työntekijä 3' }).locator('input').uncheck();
  await expect(page.locator('#lensPeople input:checked')).toHaveCount(3);
  await expect(lensButton).toHaveText('Käyttäjien arvioiden näkyminen · 3/4');
  await expect(page.locator('#btnReviewLensQuick')).toHaveText('Käyttäjien arvioiden näkyminen · 3/4');
  expect(((await storedJson(page, `witt-review-view-v1:${PROJECT_ID}`)) as string[]).length).toBe(3);
  await page.locator('#btnLensAll').click();
  await expect(page.locator('#lensPeople input:checked')).toHaveCount(4);
  await expect(lensButton).toHaveText('Käyttäjien arvioiden näkyminen');
  await page.locator('#btnLensDone').click();
  await expect(lens).toBeHidden();

  // --- People: add through the text prompt (not selected), rename, refuse a duplicate, shares, switch ---
  await page.locator('#btnVoting').click();
  const vote = page.locator('#voteDialog');
  await expect(vote).toBeVisible();
  await page.locator('#btnVotePeople').click();
  await expect(vote).toBeHidden();
  const people = page.locator('#peopleDialog');
  await expect(people).toBeVisible();
  await expect(page.locator('#peopleList .person-row')).toHaveCount(4);
  await page.locator('#btnAddPerson').click();
  await page.locator('#textValue').fill('Neljäs');
  await page.locator('#textAccept').click();
  await expect(page.locator('#peopleList .person-row')).toHaveCount(5);
  // Names live in the inputs, so a row is found through its shares field's label.
  const personRow = (name: string) =>
    page.locator('#peopleList .person-row', { has: page.locator(`input[aria-label="Äänimäärä: ${name}"]`) });
  const newRow = personRow('Neljäs');
  await expect(newRow).toHaveCount(1);
  await expect(newRow).not.toHaveClass(/active-profile/);
  await expect(personRow('Omistaja')).toHaveClass(/active-profile/);
  await expect(newRow.locator('.profile-counter')).toHaveText('0 uskottavuus · 0 vaikutus');

  const nameInput = newRow.locator('input[aria-label="Nimi"]');
  await nameInput.fill('Nelli');
  await nameInput.press('Enter');
  const nelli = personRow('Nelli');
  await expect(nelli.locator('input[aria-label="Nimi"]')).toHaveValue('Nelli');
  await nelli.locator('input[aria-label="Nimi"]').fill('omistaja');
  await nelli.locator('input[aria-label="Nimi"]').press('Enter');
  await expect(page.locator('#noticeText')).toHaveText(
    'Nimen on oltava yksilöllinen ja 1–120 merkkiä pitkä.'
  );
  await page.locator('#noticeClose').click();
  await expect(nelli.locator('input[aria-label="Nimi"]')).toHaveValue('Nelli');

  const shares = nelli.locator('input[aria-label="Äänimäärä: Nelli"]');
  await shares.fill('3');
  await shares.press('Enter');
  await expect(shares).toHaveValue('3');
  const users = ((await storedJson(page, 'witt-project-v3')) as { users: { name: string; shares: number }[] })
    .users;
  expect(users.find((u) => u.name === 'Nelli')?.shares).toBe(3);
  expect(users.filter((u) => u.name === 'Omistaja')).toHaveLength(1);

  await nelli.locator('button', { hasText: 'Vaihda tähän' }).click();
  await expect(nelli).toHaveClass(/active-profile/);
  await expect(page.locator('#currentUserName')).toHaveValue('Nelli');
  await personRow('Omistaja').locator('button', { hasText: 'Vaihda tähän' }).click();
  await expect(page.locator('#currentUserName')).toHaveValue('Omistaja');
  await page.locator('#btnDialogClose').click();
  await expect(people).toBeHidden();

  // --- Vote round: open, ballots for two people, close, read the results ---
  await page.locator('#btnVoting').click();
  await expect(page.locator('#voteRoundStatus')).toHaveText('Äänestys ei ole vielä alkanut');
  await expect(page.locator('#voteBallotList')).toContainText('Arviointivaiheen perustelutulos');
  await page.locator('#btnVoteStart').click();
  await expect(page.locator('#voteRoundStatus')).toHaveText('Äänestyskierros on avoin');
  await expect(page.locator('#voteResults .vote-sealed')).toHaveText(
    'Tulokset on piilotettu kierroksen päättymiseen asti.'
  );
  await expect(page.locator('#btnVoteEnd')).toBeVisible();
  await expect(page.locator('#btnVoteStart')).toBeHidden();

  const castFor = async (title: string, value: string) => {
    const row = page.locator('#voteBallotList .vote-option-row', { hasText: title });
    await row.locator('input[type="range"]').fill(value);
    await expect(row.locator('output')).toHaveText(`${value}/100 · ei tallennettu`);
    await row.locator('button', { hasText: 'Tallenna ääni' }).click();
    await expect(row.locator('output')).toHaveText(`${value}/100`);
  };
  await castFor('Uimahalliin', '80');
  await castFor('Kotona', '20');
  await page.locator('#btnVoteDone').click();
  await expect(vote).toBeHidden();

  await page.locator('#actorSelect').selectOption({ label: 'Nelli' });
  await page.locator('#btnVoting').click();
  await expect(
    page.locator('#voteBallotList .vote-option-row', { hasText: 'Uimahalliin' }).locator('output')
  ).toHaveText('Ei arvioitu');
  await castFor('Uimahalliin', '40');
  await castFor('Kotona', '90');
  await page.locator('#btnVoteDone').click();

  await page.locator('#actorSelect').selectOption({ label: 'Omistaja' });
  await page.locator('#btnVoting').click();
  await page.locator('#btnVoteEnd').click();
  await expect(page.locator('#confirmText')).toHaveText(
    'Suljetaanko kierros? Sen jälkeen ääniä ei voi enää muuttaa.'
  );
  await page.locator('#confirmAccept').click();
  await expect(page.locator('#voteRoundStatus')).toHaveText('Äänestyskierros päättyi');
  const swimResult = page.locator('#voteResults .vote-result-row', { hasText: 'Uimahalliin' });
  await expect(swimResult.locator('span')).toHaveText('60.0/100');
  await expect(swimResult.locator('small')).toHaveText(
    '2 äänestäjää; yhteispaino 2; painotettu summa 120.0.'
  );
  const homeResult = page.locator('#voteResults .vote-result-row', { hasText: 'Kotona' });
  await expect(homeResult.locator('span')).toHaveText('55.0/100');
  await expect(page.locator('#voteResults .vote-by-person')).toContainText('Nelli: Kotona · 90/100');
  await expect(page.locator('#voteAuditRows p')).toHaveCount(6);
  await expect(page.locator('#voteAuditRows p').first()).toContainText('Kierros alkoi · Omistaja');
  await expect(page.locator('#voteAuditRows p').last()).toContainText('Kierros päättyi · Omistaja');
  await expect(page.locator('#voteAuditRows')).toContainText('Ääni annettu · Nelli');
  await expect(page.locator('#btnVoteStart')).toBeVisible();
  await page.locator('#btnVoteClose').click();
  await expect(vote).toBeHidden();
});
