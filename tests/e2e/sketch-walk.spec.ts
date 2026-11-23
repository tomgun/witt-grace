/**
 * must: Luonnoslehtiö opens from the tool's Näkymä menu as a screen of its own and is not offered on the home
 *       screen (owner 2026-11-20 and 2026-11-21, S-15); a text is written into a rectangle by a double-click and
 *       stays the rectangle's own, a double-click on the bare sheet writes a free text, and a press on the sheet
 *       takes what was being written; a stroke drawn
 *       with the pen is an item of the frame and Kumoa takes it away; a mind map node is written, Tab adds a child
 *       and Enter a sibling, each opened for writing, and their texts can be read without seeing the canvas; a
 *       node carries comments; a copied frame keeps the drawing, an empty one does not, Toista runs through the
 *       frames (gliding when asked), a frame has a tab that can be named and the faint previous frame can be
 *       switched off; the sketch is
 *       there after a reload; it is kept with the project (`witt-workbook-v1`, owner 2026-11-23 “lehtiö on osa
 *       projektia”) and nothing of it is in the diagram's own autosave; ← returns to the workspace
 * test: tests/e2e/sketch-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: a double-click inside an empty rectangle doing nothing (its middle is not a hit), a press on the
 *              sheet leaving the editor open, the box deleted when its text is emptied, a stroke lost when the pointer is released, the editor's blur writing the text twice, Tab leaving
 *              the canvas instead of adding a child, the sketch stored in the argument document's key, a reload
 *              opening an empty sheet
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startBlank } from './helpers.ts';

async function openSketchpad(page: Page): Promise<void> {
  await page.locator('#viewMenu > summary').click();
  await page.locator('#btnSketchMenu').click();
  await expect(page.getByTestId('sketchpad')).toBeVisible();
}

test('drawing, a mind map by the keyboard, frames, and the sketch kept over a reload', async ({ page }) => {
  await startBlank(page, 'argument');
  const projectBefore = await page.evaluate(() => JSON.stringify(Object.keys(window.localStorage).sort()));
  await openSketchpad(page);
  const pad = page.getByTestId('sketchpad');
  await expect(pad).toBeVisible();
  await expect(pad.locator('h1')).toHaveText('Luonnoslehtiö');
  const canvas = page.locator('#sketchCanvas');
  await expect(canvas).toHaveAttribute('aria-label', 'Piirtoalue, 0 kohdetta');
  const box = (await canvas.boundingBox())!;
  const at = (fx: number, fy: number) => [box.x + box.width * fx, box.y + box.height * fy] as const;

  // The pen is the tool at hand: a stroke is one item, and Kumoa takes it away.
  await expect(pad.locator('.sketch-tool[data-tool="pen"]')).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(...at(0.2, 0.7));
  await page.mouse.down();
  await page.mouse.move(...at(0.3, 0.8), { steps: 5 });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('aria-label', 'Piirtoalue, 1 kohdetta');
  await page.locator('#btnSketchUndo').click();
  await expect(canvas).toHaveAttribute('aria-label', 'Piirtoalue, 0 kohdetta');
  await page.locator('#btnSketchRedo').click();
  await expect(canvas).toHaveAttribute('aria-label', 'Piirtoalue, 1 kohdetta');

  // A mind map: a node is written, Tab adds a child, Enter a sibling.
  await pad.locator('.sketch-tool[data-tool="node"]').click();
  await page.mouse.click(...at(0.1, 0.2));
  const editor = page.locator('#sketchTextEditor');
  await expect(editor).toBeFocused();
  await editor.fill('Kesäloma');
  await editor.press('Tab');
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('');
  await editor.fill('Mökki');
  await editor.press('Enter');
  await expect(editor).toHaveCount(0);
  await expect(canvas).toBeFocused();
  await expect(page.locator('#sketchHint')).toContainText('Sarkain lisää alisolmun');
  await page.keyboard.press('Enter');
  await expect(editor).toBeFocused();
  await editor.fill('Kaupunki');
  await editor.press('Enter');
  // The stroke, three nodes and two links; the texts are readable without the canvas.
  await expect(canvas).toHaveAttribute('aria-label', 'Piirtoalue, 6 kohdetta');
  await expect(page.locator('#sketchTexts li')).toHaveText(['Kesäloma', 'Mökki', 'Kaupunki']);
  // An editor left empty leaves nothing behind.
  await page.keyboard.press('Tab');
  await expect(editor).toBeFocused();
  await editor.press('Escape');
  await expect(canvas).toHaveAttribute('aria-label', 'Piirtoalue, 6 kohdetta');

  // A node carries comments, as a card of the tree does: the selected node's are listed under the sheet.
  const comments = page.locator('#sketchComments');
  await expect(comments.locator('h2')).toHaveText('Solmun kommentit: Kaupunki');
  await expect(comments).toContainText('Ei vielä kommentteja.');
  await expect(page.locator('#btnSketchComment')).toBeDisabled();
  await page.locator('#sketchCommentInput').fill('Mikä kaupunki?');
  await page.locator('#sketchCommentInput').press('Enter');
  await expect(comments.locator('li')).toHaveText(['Mikä kaupunki?×']);
  await expect(page.locator('#sketchCommentInput')).toHaveValue('');
  await expect(page.locator('#sketchTexts > li').nth(2)).toContainText('Mikä kaupunki?');

  // Frames: a copy keeps the drawing, an empty one does not; playing runs through them.
  await expect(page.locator('#sketchFrameOf')).toHaveText('Ruutu 1/1');
  await expect(page.locator('#btnSketchPlay')).toBeDisabled();
  await page.locator('#btnSketchFrameCopy').click();
  await expect(page.locator('#sketchFrameOf')).toHaveText('Ruutu 2/2');
  await expect(canvas).toHaveAttribute('aria-label', 'Piirtoalue, 6 kohdetta');
  await page.locator('#btnSketchFrameAdd').click();
  await expect(page.locator('#sketchFrameOf')).toHaveText('Ruutu 3/3');
  await expect(canvas).toHaveAttribute('aria-label', 'Piirtoalue, 0 kohdetta');
  await page.locator('#btnSketchPlay').click();
  await expect(page.locator('#btnSketchPlay')).toHaveText('Pysäytä');
  await expect(page.locator('#sketchFrameOf')).toHaveText('Ruutu 1/3');
  await page.locator('#btnSketchPlay').click();
  await expect(page.locator('#btnSketchPlay')).toHaveText('Toista');

  // Frames as pages: each has a tab, a tab can be named, and a press on it goes there. The faint previous frame
  // and the gliding are switches under the sheet.
  const tabs = page.locator('#sketchFrameTabs .sketch-frame-tab');
  await expect(tabs).toHaveCount(3);
  await tabs.nth(0).click();
  await expect(page.locator('#sketchFrameOf')).toHaveText('Ruutu 1/3');
  await page.locator('#sketchFrameName').fill('Ideat');
  await page.locator('#sketchFrameName').press('Enter');
  await expect(tabs).toHaveText(['Ideat', '2', '3']);
  await expect(tabs.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sketchOnion')).toBeChecked();
  await page.locator('#sketchOnion').uncheck();
  await page.locator('#sketchTween').check();
  await page.locator('#btnSketchPlay').click();
  await expect(page.locator('#sketchFrameOf')).toHaveText('Ruutu 2/3');
  await page.locator('#btnSketchPlay').click();
  await tabs.nth(0).click();

  // Kept with the project in this browser; the diagram's own autosave holds nothing of it, and there is no
  // sketchpad key apart from the project.
  const keys = await page.evaluate(() => Object.keys(window.localStorage).sort());
  expect(keys).toContain('witt-workbook-v1');
  expect(keys).not.toContain('witt-sketch-v1');
  expect(JSON.stringify(keys.filter((k) => k !== 'witt-workbook-v1'))).toBe(projectBefore);
  expect(await page.evaluate(() => window.localStorage.getItem('witt-project-v3'))).not.toContain('Kesäloma');
  await page.reload();
  if (await page.getByTestId('home').count()) await page.locator('#btnHomeContinue').click();
  await openSketchpad(page);
  await expect(page.locator('#sketchFrameOf')).toHaveText('Ruutu 1/3');
  await expect(page.locator('#sketchTexts > li')).toHaveText(['Kesäloma', 'Mökki', 'KaupunkiMikä kaupunki?']);
  await expect(page.locator('#sketchFrameTabs .sketch-frame-tab').first()).toHaveText('Ideat');
  await expect(page.locator('#sketchTween')).toBeChecked();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  ).toBe(true);
  await page.locator('#btnSketchBack').click();
  await expect(page.getByTestId('app')).toBeVisible();
});

test('writing: into a box, freely on the sheet, and a press on the sheet takes the text', async ({
  page,
}) => {
  await startBlank(page, 'argument');
  await page.locator('#btnBackHome').click();
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.locator('#btnHomeSketch')).toHaveCount(0);
  await page.locator('#btnHomeContinue').click();
  await openSketchpad(page);
  const pad = page.getByTestId('sketchpad');
  const canvas = page.locator('#sketchCanvas');
  const editor = page.locator('#sketchTextEditor');
  const texts = page.locator('#sketchTexts > li');
  const box = (await canvas.boundingBox())!;
  const at = (fx: number, fy: number) => [box.x + box.width * fx, box.y + box.height * fy] as const;

  await pad.locator('.sketch-tool[data-tool="rect"]').click();
  await page.mouse.move(...at(0.2, 0.2));
  await page.mouse.down();
  await page.mouse.move(...at(0.5, 0.5), { steps: 4 });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('aria-label', 'Piirtoalue, 1 kohdetta');

  // The middle of an empty rectangle: a double-click writes into it, and the text is the rectangle's own.
  await pad.locator('.sketch-tool[data-tool="select"]').click();
  await page.mouse.dblclick(...at(0.35, 0.35));
  await expect(editor).toBeFocused();
  await editor.fill('Asiakas');
  // A press elsewhere on the sheet takes the text and starts nothing new.
  await page.mouse.click(...at(0.8, 0.8));
  await expect(editor).toHaveCount(0);
  await expect(texts).toHaveText(['Asiakas']);
  await expect(canvas).toHaveAttribute('aria-label', 'Piirtoalue, 1 kohdetta');

  // The text tool pressed inside the box edits the same text; emptied, the box stays.
  await pad.locator('.sketch-tool[data-tool="text"]').click();
  await page.mouse.click(...at(0.3, 0.3));
  await expect(editor).toHaveValue('Asiakas');
  await editor.fill('');
  await editor.press('Control+Enter');
  await expect(texts).toHaveCount(0);
  await expect(canvas).toHaveAttribute('aria-label', 'Piirtoalue, 1 kohdetta');
  // Enter on the selected box writes into it from the keyboard.
  await expect(canvas).toBeFocused();
  await page.keyboard.press('Enter');
  await editor.fill('Tilaus');
  await editor.press('Control+Enter');
  await expect(texts).toHaveText(['Tilaus']);

  // A double-click on the bare sheet with the selection tool: a free text of its own.
  await pad.locator('.sketch-tool[data-tool="select"]').click();
  await page.mouse.dblclick(...at(0.7, 0.3));
  await expect(editor).toBeFocused();
  await editor.fill('Huomio');
  await page.mouse.click(...at(0.8, 0.8));
  await expect(texts).toHaveText(['Tilaus', 'Huomio']);
  await expect(canvas).toHaveAttribute('aria-label', 'Piirtoalue, 2 kohdetta');
  await page.locator('#btnSketchUndo').click();
  await expect(texts).toHaveText(['Tilaus']);
});
