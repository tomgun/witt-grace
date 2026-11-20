/**
 * must: Luonnoslehtiö opens from the home screen as a screen of its own (owner 2026-11-20, S-15): a stroke drawn
 *       with the pen is an item of the frame and Kumoa takes it away; a mind map node is written, Tab adds a child
 *       and Enter a sibling, each opened for writing, and their texts can be read without seeing the canvas; a
 *       node carries comments; a copied frame keeps the drawing, an empty one does not, Toista runs through the
 *       frames (gliding when asked), a frame has a tab that can be named and the faint previous frame can be
 *       switched off; the sketch is
 *       there after a reload; nothing of it touches the argument document; ⌂ returns to the home screen
 * test: tests/e2e/sketch-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: a stroke lost when the pointer is released, the editor's blur writing the text twice, Tab leaving
 *              the canvas instead of adding a child, the sketch stored in the argument document's key, a reload
 *              opening an empty sheet
 */
import { expect, test } from '@playwright/test';

test('drawing, a mind map by the keyboard, frames, and the sketch kept over a reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  const projectBefore = await page.evaluate(() => JSON.stringify(Object.keys(window.localStorage).sort()));
  await page.locator('#btnHomeSketch').click();
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

  // Kept in this browser under its own key; the argument document's keys are as they were.
  const keys = await page.evaluate(() => Object.keys(window.localStorage).sort());
  expect(keys).toContain('witt-sketch-v1');
  expect(JSON.stringify(keys.filter((k) => k !== 'witt-sketch-v1'))).toBe(projectBefore);
  await page.reload();
  await page.locator('#btnHomeSketch').click();
  await expect(page.locator('#sketchFrameOf')).toHaveText('Ruutu 1/3');
  await expect(page.locator('#sketchTexts > li')).toHaveText(['Kesäloma', 'Mökki', 'KaupunkiMikä kaupunki?']);
  await expect(page.locator('#sketchFrameTabs .sketch-frame-tab').first()).toHaveText('Ideat');
  await expect(page.locator('#sketchTween')).toBeChecked();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  ).toBe(true);
  await page.locator('#btnSketchBack').click();
  await expect(page.getByTestId('home')).toBeVisible();
});
