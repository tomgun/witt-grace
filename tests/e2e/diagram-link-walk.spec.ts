/**
 * must: a card can link to another diagram of the same project (WG-060, UI_INVENTORY S-15): with one diagram the
 *       inspector offers no link; with two, Linkki toiseen kaavioon lists the other diagram; the linked card
 *       shows ↗, a press on it shows that diagram's tab, where ← in the tab row and the list under the main
 *       claim lead back to the card the link was followed from; Tallenna tämä kaavio erikseen then downloads
 *       one `.witt-project.json` with the diagram and the one it links to; attaching that file adds both as
 *       copies whose link leads to the copy; when the linked diagram is removed the card's ↗ stays, dashed, and
 *       a press says the diagram is not in the project
 * test: tests/e2e/diagram-link-walk.spec.ts (desktop 1440×900)
 * red-against: a link offered to the diagram itself, ↗ showing the wrong tab, a way back that lands on the main
 *              claim instead of the linked card, a linked diagram saved alone (its link then leads nowhere when
 *              opened), an attached copy whose ↗ opens the original diagram, a removed diagram's link jumping
 *              to whatever tab took its place
 */
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Download, Page } from '@playwright/test';
import { addNamed, startBlank } from './helpers.ts';

test.skip(({ viewport }) => (viewport?.width ?? 1440) < 1000, 'the link walk drives the desktop toolbar');

const fromFileMenu = async (page: Page, selector: string) => {
  await page.locator('#fileMenu summary').click();
  await page.locator(selector).click();
};
const textOf = async (download: Download): Promise<string> =>
  (await download.createReadStream())
    .toArray()
    .then((chunks) => Buffer.concat(chunks as Buffer[]).toString('utf8'));
const card = (page: Page, title: string) => page.locator('#nodesLayer .node', { hasText: title });

test('a card links to another diagram: set, follow, back, save as a set, attach, remove', async ({
  page,
}, testInfo) => {
  await startBlank(page, 'argument');
  await addNamed(page, '#btnSupport', 'Peruste A');
  // One diagram: nothing to link to.
  await expect(page.locator('#nodeDiagramLink')).toHaveCount(0);

  await fromFileMenu(page, '#btnAddDiagram');
  const editor = page.locator('.node-inline-editor');
  await expect(editor).toBeFocused();
  await editor.fill('Alapäätös');
  await editor.press('Enter');
  await page.locator('#docTab-0').click();
  await card(page, 'Peruste A').locator('.node-title').click();
  await expect(card(page, 'Peruste A')).toHaveClass(/selected/);

  // The other diagram is offered, this one is not.
  const link = page.locator('#nodeDiagramLink');
  await expect(link.locator('option')).toHaveText(['Ei linkkiä', 'Argumentointi: Alapäätös']);
  await link.selectOption({ index: 1 });
  const arrow = card(page, 'Peruste A').getByTestId('node-link');
  await expect(arrow).toHaveAttribute('title', 'Avaa linkitetty kaavio: Alapäätös');
  await expect(page.locator('#btnLinkBack')).toHaveCount(0);

  // Follow it: the other tab is shown, and two ways lead back to the card.
  await arrow.click();
  await expect(page.locator('#docTab-1')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('diagram-links-into').locator('button')).toHaveText([
    '← Mikä on tarkasteltava väite? › Peruste A',
  ]);
  await page.locator('#btnLinkBack').click();
  await expect(page.locator('#docTab-0')).toHaveAttribute('aria-selected', 'true');
  await expect(card(page, 'Peruste A')).toHaveClass(/selected/);
  await expect(page.locator('#btnLinkBack')).toHaveCount(0);
  await arrow.click();
  await page.getByTestId('diagram-links-into').locator('button').click();
  await expect(page.locator('#docTab-0')).toHaveAttribute('aria-selected', 'true');
  await expect(card(page, 'Peruste A')).toHaveClass(/selected/);

  // Saved "alone", the diagram takes the one it links to with it.
  const saving = page.waitForEvent('download');
  await fromFileMenu(page, '#btnSaveDiagram');
  const download = await saving;
  expect(download.suggestedFilename()).toMatch(/\.witt-project\.json$/);
  const text = await textOf(download);
  const file = JSON.parse(text) as { documents: { id: string; nodes: { linkedDiagramId?: string }[] }[] };
  expect(file.documents).toHaveLength(2);
  expect(file.documents[0]!.nodes.map((n) => n.linkedDiagramId).filter(Boolean)).toEqual([
    file.documents[1]!.id,
  ]);
  await expect(page.getByTestId('notice')).toContainText('Kaavioita: 2.');

  // Attached, the set comes in as copies and the copy's link leads to the copy.
  const path = testInfo.outputPath('linkit.witt-project.json');
  writeFileSync(path, text);
  const chooser = page.waitForEvent('filechooser');
  await fromFileMenu(page, '#btnAttach');
  await (await chooser).setFiles(path);
  await expect(page.locator('#docTabs [role="tab"]')).toHaveCount(4);
  await expect(page.locator('#docTab-2')).toHaveAttribute('aria-selected', 'true');
  await card(page, 'Peruste A').getByTestId('node-link').click();
  await expect(page.locator('#docTab-3')).toHaveAttribute('aria-selected', 'true');

  // The linked diagram removed: the link stays on the card and leads nowhere.
  await page.locator('#docTab-1').click();
  await page.locator('#btnTabClose').click();
  await page.locator('#confirmAccept').click();
  await page.locator('#docTab-0').click();
  const broken = card(page, 'Peruste A').getByTestId('node-link');
  await expect(broken).toHaveClass(/missing/);
  await broken.click();
  await expect(page.locator('#docTab-0')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('notice')).toContainText('Linkitetty kaavio ei ole tässä projektissa.');
  await card(page, 'Peruste A').locator('.node-title').click();
  await expect(page.getByTestId('diagram-link-missing')).toBeVisible();
  await expect(page.locator('#nodeDiagramLink option')).toHaveCount(4);
});
