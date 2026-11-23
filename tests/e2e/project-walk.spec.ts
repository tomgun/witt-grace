/**
 * must: a project of one diagram shows no tab row (the workspace is as it was before tabs); Tiedosto → Uusi kaavio
 *       projektiin adds a second diagram in a tab of its own and the row `#docTabs` appears; each tab keeps its
 *       own tree; the diagram and the project can be named; Tallenna tiedosto then downloads one
 *       `.witt-project.json` holding both diagrams and Tallenna tämä kaavio erikseen one `.witt.json`; a reload
 *       brings back both tabs and the project's name; removing a tab asks first and undo brings it back; opening
 *       the project file replaces the project after a question; Liitä projektiin… adds the file's diagrams as new
 *       tabs without replacing anything; in a project a single diagram's file opens in a new tab without the
 *       replace question; the tabs are reachable by keyboard (arrows, Delete, Alt+arrows) and the focus follows
 *       the shown tab; a project has sketchpads of its own beside the person's: several, named, removable; the
 *       drawn ones are saved in the project file and come back after a reload, an empty one is not saved, and the
 *       person's own sketchpad is not touched; undo stays in the shown tab (a card added in another tab later is
 *       not taken back), and Muutoshistoria lists the shown diagram's and the project's changes and goes back and
 *       forward by a press on a row (WG-059, UI_INVENTORY S-15)
 * test: tests/e2e/project-walk.spec.ts (desktop 1440×900)
 * red-against: a tab switch showing the other diagram's cards, a save that writes only the shown diagram while
 *              the menu says project, tabs lost on reload, a removed diagram gone for good, attach overwriting the
 *              diagram with the same id, a tab row on a one-diagram project, a project drawing written onto the
 *              person's own sketchpad, a saved project file without its drawings, undo in tab A removing the
 *              card just added in tab B, a history row that does nothing or lists another tab's changes
 */
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Download, Page } from '@playwright/test';
import { addNamed, startBlank } from './helpers.ts';

test.skip(({ viewport }) => (viewport?.width ?? 1440) < 1000, 'the tab walk drives the desktop toolbar');

const fromFileMenu = async (page: Page, selector: string) => {
  await page.locator('#fileMenu summary').click();
  await page.locator(selector).click();
};
const textOf = async (download: Download): Promise<string> =>
  (await download.createReadStream())
    .toArray()
    .then((chunks) => Buffer.concat(chunks as Buffer[]).toString('utf8'));
const tabTitles = (page: Page) => page.locator('#docTabs [role="tab"] .doc-tab-title');

test('two diagrams as tabs: add, name, switch, save, reload, remove and undo, open, attach', async ({
  page,
}, testInfo) => {
  await startBlank(page, 'argument');
  await expect(page.locator('#docTabs')).toHaveCount(0);
  await page.locator('#fileMenu summary').click();
  await expect(page.locator('#btnSaveDiagram')).toBeHidden();
  await page.locator('#fileMenu summary').click();
  await addNamed(page, '#btnSupport', 'Peruste A');
  await expect(page.getByTestId('node-count')).toHaveText('2');

  // A second diagram: its own tab, shown at once, its question open for writing.
  await fromFileMenu(page, '#btnAddDiagram');
  await expect(page.locator('#docTabs [role="tab"]')).toHaveCount(2);
  await expect(page.locator('#docTab-1')).toHaveAttribute('aria-selected', 'true');
  const editor = page.locator('.node-inline-editor');
  await expect(editor).toBeFocused();
  await editor.fill('Toisen kaavion kysymys');
  await editor.press('Enter');
  await expect(page.getByTestId('node-count')).toHaveText('1');

  // Name the diagram and the project.
  await page.locator('#btnTabRename').click();
  await page.locator('#textValue').fill('Riskit');
  await page.locator('#textAccept').click();
  await expect(tabTitles(page).nth(1)).toHaveText('Riskit');
  await page.locator('#projectName').click();
  await page.locator('#textValue').fill('Hanke');
  await page.locator('#textAccept').click();
  await expect(page.locator('#projectName')).toHaveText('Hanke');

  // Each tab keeps its own tree; the tabs answer to the arrow keys.
  await page.locator('#docTab-0').click();
  await expect(page.locator('#docTab-0')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('node-count')).toHaveText('2');
  await expect(page.locator('.node-title', { hasText: 'Peruste A' })).toBeVisible();
  await page.locator('#docTab-0').press('ArrowRight');
  await expect(page.locator('#docTab-1')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#docTab-1')).toBeFocused();
  await expect(page.getByTestId('node-count')).toHaveText('1');
  await expect(page.locator('.node-title', { hasText: 'Peruste A' })).toHaveCount(0);

  // Save: the project in one file, the shown diagram alone in another.
  let download = page.waitForEvent('download');
  await fromFileMenu(page, '#btnSave');
  const projectFile = await download;
  expect(projectFile.suggestedFilename()).toBe('hanke.witt-project.json');
  const projectText = await textOf(projectFile);
  const saved = JSON.parse(projectText) as {
    format: string;
    version: number;
    title: string;
    documents: { title: string; schemaVersion: number; nodes: unknown[] }[];
  };
  expect(saved.format).toBe('witt-project');
  expect(saved.version).toBe(1);
  expect(saved.title).toBe('Hanke');
  expect(saved.documents.map((d) => d.nodes.length)).toEqual([2, 1]);
  expect(saved.documents[1]?.title).toBe('Riskit');
  download = page.waitForEvent('download');
  await fromFileMenu(page, '#btnSaveDiagram');
  const diagramFile = await download;
  expect(diagramFile.suggestedFilename()).toBe('riskit.witt.json');
  const diagramText = await textOf(diagramFile);
  const alone = JSON.parse(diagramText) as {
    schemaVersion: number;
    title: string;
    format?: string;
  };
  expect(alone.schemaVersion).toBe(8);
  expect(alone.title).toBe('Riskit');
  expect(alone.format).toBeUndefined();

  // A reload brings back both tabs, the shown one and the project's name.
  await page.reload();
  await page.locator('#btnHomeContinue').click();
  await expect(page.locator('#docTabs [role="tab"]')).toHaveCount(2);
  await expect(page.locator('#docTab-1')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#projectName')).toHaveText('Hanke');
  await expect(tabTitles(page).nth(1)).toHaveText('Riskit');

  // Removing asks first; cancelled it changes nothing; accepted, undo brings the diagram back.
  await page.locator('#btnTabClose').click();
  await expect(page.locator('#confirmText')).toContainText('Riskit');
  await page.locator('#confirmCancel').click();
  await expect(page.locator('#docTabs [role="tab"]')).toHaveCount(2);
  await page.locator('#btnTabClose').click();
  await page.locator('#confirmAccept').click();
  // A named project keeps its row with one diagram left, and that last diagram cannot be removed.
  await expect(page.locator('#docTabs [role="tab"]')).toHaveCount(1);
  await expect(page.locator('#btnTabClose')).toBeDisabled();
  await expect(page.getByTestId('node-count')).toHaveText('2');
  // Kumoa belongs to the shown diagram, so the removal offers its own way back.
  await expect(page.getByTestId('notice')).toContainText('Kaavio ”Riskit” poistettu projektista.');
  await page.locator('#btnNoticeRestore').click();
  await expect(page.locator('#docTabs [role="tab"]')).toHaveCount(2);
  await expect(tabTitles(page).nth(1)).toHaveText('Riskit');

  // The saved project file opens as a project (after a question) and attaches as new tabs.
  const filePath = testInfo.outputPath('hanke.witt-project.json');
  const diagramPath = testInfo.outputPath('riskit.witt.json');
  writeFileSync(diagramPath, diagramText);
  const otherPath = testInfo.outputPath('muualta.witt.json');
  writeFileSync(
    otherPath,
    JSON.stringify({ ...JSON.parse(diagramText), id: 'walk-other', title: 'Muualta' })
  );
  writeFileSync(filePath, projectText);
  await startBlank(page, 'argument');
  await expect(page.locator('#docTabs')).toHaveCount(0);
  await addNamed(page, '#btnSupport', 'Oma peruste');
  let chooser = page.waitForEvent('filechooser');
  await fromFileMenu(page, '#btnOpen');
  await (await chooser).setFiles(filePath);
  await expect(page.locator('#confirmText')).toContainText('Avataanko projekti ”Hanke” (kaavioita: 2)?');
  // Declined, the person's own work stays; accepted, the project takes its place.
  await page.locator('#confirmCancel').click();
  await expect(page.locator('#docTabs')).toHaveCount(0);
  await expect(page.getByTestId('node-count')).toHaveText('2');
  chooser = page.waitForEvent('filechooser');
  await fromFileMenu(page, '#btnOpen');
  await (await chooser).setFiles(filePath);
  await page.locator('#confirmAccept').click();
  await expect(page.locator('#docTabs [role="tab"]')).toHaveCount(2);
  await expect(page.locator('#projectName')).toHaveText('Hanke');
  await expect(page.locator('#docTab-0')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('node-count')).toHaveText('2');

  chooser = page.waitForEvent('filechooser');
  await fromFileMenu(page, '#btnAttach');
  await (await chooser).setFiles(filePath);
  await expect(page.locator('#docTabs [role="tab"]')).toHaveCount(4);
  await expect(page.locator('#docTab-2')).toHaveAttribute('aria-selected', 'true');
  await expect(tabTitles(page)).toHaveText([
    'Mikä on tarkasteltava väite?',
    'Riskit',
    'Mikä on tarkasteltava väite?',
    'Riskit',
  ]);
  await expect(page.getByTestId('notice')).toContainText('Projektiin liitetty kaavioita: 2.');
  // A diagram that is open in another tab is not opened over the shown one, and nothing is asked.
  chooser = page.waitForEvent('filechooser');
  await fromFileMenu(page, '#btnOpen');
  await (await chooser).setFiles(diagramPath);
  await expect(page.getByTestId('notice')).toContainText('Kaavio ”Riskit” on jo auki toisella välilehdellä.');
  await expect(page.locator('#replaceDescription')).toHaveCount(0);
  await expect(page.locator('#docTabs [role="tab"]')).toHaveCount(4);
  // In a project another diagram's file opens in a new tab without the replace question.
  chooser = page.waitForEvent('filechooser');
  await fromFileMenu(page, '#btnOpen');
  await (await chooser).setFiles(otherPath);
  await expect(page.locator('#docTabs [role="tab"]')).toHaveCount(5);
  await expect(tabTitles(page).nth(4)).toHaveText('Muualta');
  await expect(page.getByTestId('notice')).toContainText('Avattu uudelle välilehdelle: ”Muualta”.');
  await expect(page.locator('#docTab-4')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#replaceDescription')).toHaveCount(0);
  // After a removal the focus is on the shown tab, and Delete on a tab asks like the × button.
  await page.locator('#docTab-4').press('Delete');
  await page.locator('#confirmAccept').click();
  await expect(page.locator('#docTabs [role="tab"]')).toHaveCount(4);
  await expect(page.locator('#docTab-3')).toBeFocused();
  // Alt+← moves the shown tab and keeps it shown and focused.
  await page.locator('#docTab-3').press('Alt+ArrowLeft');
  await expect(page.locator('#docTab-2')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#docTab-2')).toBeFocused();
  await expect(tabTitles(page).nth(2)).toHaveText('Riskit');
  // The copies have ids of their own: no two tabs are one diagram.
  const ids = await page
    .locator('#docTabs [role="tab"]')
    .evaluateAll((tabs) => tabs.map((tab) => (tab as HTMLElement).dataset.docId));
  expect(new Set(ids).size).toBe(4);
});

test('project sketchpads: several, drawn on, saved in the project file, back after a reload', async ({
  page,
}) => {
  await startBlank(page, 'argument');
  await page.locator('#viewMenu > summary').click();
  await page.locator('#btnSketchMenu').click();
  const pad = page.getByTestId('sketchpad');
  await expect(pad).toBeVisible();
  // With no sketchpad in the project the person's own is the one at hand.
  await expect(page.locator('#btnSketchOwn')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#btnSketchNew').click();
  const sheets = page.locator('.sketch-which .sketch-sheet');
  await expect(sheets).toHaveText(['Lehtiö 1']);
  await expect(sheets.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sketchHint')).toContainText('Tämä lehtiö kuuluu projektiin');
  const canvas = page.locator('#sketchCanvas');
  await expect(canvas).toHaveAttribute('aria-label', 'Piirtoalue, 0 kohdetta');
  const box = (await canvas.boundingBox())!;
  const stroke = async (fx: number) => {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * 0.7);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * (fx + 0.1), box.y + box.height * 0.8, { steps: 5 });
    await page.mouse.up();
  };
  await stroke(0.2);
  await expect(canvas).toHaveAttribute('aria-label', 'Piirtoalue, 1 kohdetta');
  // A second sketchpad, named; a third left empty.
  await page.locator('#btnSketchNew').click();
  await expect(canvas).toHaveAttribute('aria-label', 'Piirtoalue, 0 kohdetta');
  await stroke(0.3);
  await stroke(0.5);
  await page.locator('#btnSketchRename').click();
  await page.locator('#textValue').fill('Animaatio');
  await page.locator('#textAccept').click();
  await page.locator('#btnSketchNew').click();
  await expect(sheets).toHaveText(['Lehtiö 1', 'Animaatio', 'Lehtiö 3']);
  // The person's own sketchpad is another sheet and stays empty.
  await page.locator('#btnSketchOwn').click();
  await expect(canvas).toHaveAttribute('aria-label', 'Piirtoalue, 0 kohdetta');
  await page.locator('#btnSketchBack').click();

  // A diagram with sketchpads is a project: the tab row lists them, and the file is the project's.
  await expect(page.locator('#docTabs [role="tab"]')).toHaveCount(1);
  await expect(page.locator('#docTabs .doc-tab-sketch .doc-tab-title')).toHaveText([
    'Lehtiö 1',
    'Animaatio',
    'Lehtiö 3',
  ]);
  const download = page.waitForEvent('download');
  await fromFileMenu(page, '#btnSave');
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.witt-project\.json$/);
  const saved = JSON.parse(await textOf(file)) as {
    documents: unknown[];
    sketches?: { name: string; sketch: { format: string; frames: { elements: unknown[] }[] } }[];
  };
  expect(saved.documents).toHaveLength(1);
  // The empty third sketchpad is not written.
  expect(saved.sketches?.map((s) => [s.name, s.sketch.frames[0]?.elements.length])).toEqual([
    ['Lehtiö 1', 1],
    ['Animaatio', 2],
  ]);
  expect(saved.sketches?.[0]?.sketch.format).toBe('witt-sketch');

  // After a reload the drawn sketchpads are in the tab row, and a press opens that sheet with its drawing.
  await page.reload();
  await page.locator('#btnHomeContinue').click();
  await expect(page.locator('#docTabs .doc-tab-sketch .doc-tab-title')).toHaveText(['Lehtiö 1', 'Animaatio']);
  await page.locator('#docTabs .doc-tab-sketch').nth(1).click();
  await expect(page.locator('.sketch-which .sketch-sheet').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sketchCanvas')).toHaveAttribute('aria-label', 'Piirtoalue, 2 kohdetta');
  // Removed after a question, the sketchpad leaves the project and the person's own sheet is shown.
  await page.locator('#btnSketchRemove').click();
  await expect(page.locator('#confirmText')).toContainText('Animaatio');
  await page.locator('#confirmAccept').click();
  await expect(page.locator('.sketch-which .sketch-sheet')).toHaveText(['Lehtiö 1']);
  await expect(page.locator('#btnSketchOwn')).toHaveAttribute('aria-pressed', 'true');
});

test('undo stays in the shown tab, and the history list goes back and forward', async ({ page }) => {
  await startBlank(page, 'argument');
  await addNamed(page, '#btnSupport', 'A yksi');
  await fromFileMenu(page, '#btnAddDiagram');
  await page.locator('.node-inline-editor').press('Escape');
  await addNamed(page, '#btnSupport', 'B yksi');
  await addNamed(page, '#btnOppose', 'B kaksi');
  await expect(page.getByTestId('node-count')).toHaveText('3');
  // In tab A, undo takes back A's own card, though B's cards were added after it.
  await page.locator('#docTab-0').click();
  await expect(page.getByTestId('node-count')).toHaveText('2');
  // Adding and naming a card are two steps: undo until A's card is gone.
  await expect(async () => {
    await page.locator('#btnUndoTop').click();
    await expect(page.getByTestId('node-count')).toHaveText('1', { timeout: 500 });
  }).toPass();
  // A has nothing left of its own, and Kumoa does not reach into the project's structure or tab B.
  await expect(page.locator('#btnUndoTop')).toBeDisabled();
  await page.locator('#docTab-1').click();
  await expect(page.getByTestId('node-count')).toHaveText('3');

  // The list: B's steps and the project's, newest first, with what they concerned.
  await page.locator('#btnHistoryTop').click();
  const rows = page.locator('#historyList .history-entry');
  // Adding a card and naming it are two rows.
  await expect(rows.nth(0)).toContainText('Muokattu: B kaksi');
  await expect(rows.nth(0)).toHaveAttribute('aria-current', 'step');
  await expect(rows.nth(1)).toContainText('Lisätty');
  await expect(rows.nth(2)).toContainText('Muokattu: B yksi');
  await expect(page.locator('#historyList .history-entry[data-scope="project"]').first()).toContainText(
    'Kaavio lisätty projektiin'
  );
  await expect(page.locator('#historyList')).not.toContainText('A yksi');
  // Back to the state after "B yksi" was named: the later card is gone and its rows are marked undone.
  await rows.nth(2).click();
  await expect(rows.nth(2)).toHaveAttribute('aria-current', 'step');
  await expect(rows.nth(0)).toHaveClass(/undone/);
  await expect(rows.nth(1)).toHaveClass(/undone/);
  await expect(page.getByTestId('node-count')).toHaveText('2');
  // Forward again, since nothing new was changed.
  await rows.nth(0).click();
  await expect(rows.nth(0)).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('node-count')).toHaveText('3');
  await page.locator('#btnHistoryClose').click();
  await expect(page.locator('#historyDialog')).toHaveCount(0);
});
