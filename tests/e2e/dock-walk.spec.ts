/**
 * must: the view settings dock is five titled sections in the order of use (what the cards show, the tree's layout,
 *       limiting what is shown, the reading view, one assessor's traces); every heading says what is set in its
 *       section, so a closed section answers without being opened; the first two start open and a section whose
 *       setting differs from the default is open; the layer checkboxes are in sight without a second button;
 *       "Järjestä puu" stands apart with a line saying it changes the document and can be undone; "Palauta
 *       oletusnäkymä" is disabled at the defaults and brings them back; a new document's tree is drawn from the
 *       top down, and an example opens as a tidy tree with its main claim above the mean of its reasons
 *       (S-15, owner's notes 2026-11-19)
 * test: tests/e2e/dock-walk.spec.ts (desktop 1440×900; the dock is opened from the desktop toolbar)
 * red-against: a heading that does not follow its setting, every section open at once, the reset leaving the depth
 *              limit or the highlight on, the reset enabled when nothing is changed, the default left at left to
 *              right, an example opened with its file's staircase of positions
 */
import { expect, test } from '@playwright/test';
import { openDockSection } from './helpers.ts';

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the dock is opened from the desktop toolbar');
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#btnHomeDemo').click();
  await page.locator('.example-card[data-example="painonhallinta"]').click();
  await expect(page.getByTestId('app')).toBeVisible();
});

test('sections say their state; the reset brings the defaults back', async ({ page }) => {
  await page.locator('#btnViewSettings').click();
  const dock = page.locator('#viewDock');
  await expect(dock.locator('.dock-section-title')).toHaveText([
    'Korttien sisältö',
    'Puun asettelu',
    'Rajaa näkyvää',
    'Lukunäkymä',
    'Korosta arvioijan jäljet',
  ]);
  const open = () =>
    dock
      .locator('details.dock-section')
      .evaluateAll((els) => els.filter((d) => (d as HTMLDetailsElement).open).map((d) => d.id));
  expect(await open()).toEqual(['dockSection-cards', 'dockSection-tree']);
  await expect(page.locator('#layersPanel input[data-layer]').first()).toBeVisible();
  await expect(page.locator('#btnLayers')).toHaveCount(0);
  await expect(page.getByTestId('dock-state-tree')).toHaveText('Ylhäältä alas');
  await expect(page.getByTestId('dock-state-limit')).toHaveText('koko puu');
  await expect(page.getByTestId('dock-state-reading')).toHaveText('pois');
  await expect(page.getByTestId('dock-state-person')).toHaveText('Ei korostusta');
  await expect(page.locator('.dock-arrange')).toContainText('Muuttaa asiakirjaa; voit kumota sen.');

  // An example with several assessors opens in Punnitse with the analysis preset: not the default, so the reset is on.
  const reset = page.locator('#btnViewReset');
  await page.locator('#viewPreset').selectOption('text');
  await expect(page.getByTestId('dock-state-cards')).toHaveText('Tiivis');
  await expect(reset).toBeDisabled();

  await openDockSection(page, 'limit');
  await page.locator('#treeDepthSlider').fill('1');
  await page.locator('#focusSupport').click();
  await expect(page.getByTestId('dock-state-limit')).toHaveText('tasot 0–1 · + Puoltavat');
  await expect(page.getByTestId('node-count')).toHaveText('13');
  await expect(page.locator('#nodesLayer .node')).toHaveCount(7);
  await openDockSection(page, 'reading');
  await page.getByTestId('reading-mode').check();
  await expect(page.getByTestId('dock-state-reading')).toHaveText('päällä');
  await openDockSection(page, 'person');
  await page.getByTestId('highlight-user').selectOption({ index: 1 });
  await expect(page.getByTestId('dock-state-person')).not.toHaveText('Ei korostusta');

  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(page.getByTestId('dock-state-limit')).toHaveText('koko puu');
  await expect(page.getByTestId('dock-state-reading')).toHaveText('pois');
  await expect(page.getByTestId('dock-state-person')).toHaveText('Ei korostusta');
  await expect(page.locator('#nodesLayer .node')).toHaveCount(13);
  await expect(reset).toBeDisabled();
  // The header with the way to move and close the dock is in sight however far the sections are scrolled.
  await dock.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.locator('#btnDockClose')).toBeInViewport();
});

test('a tree is drawn from the top down; an example opens tidy', async ({ page }) => {
  const centre = async (selector: string) => {
    const boxes = await page
      .locator(selector)
      .evaluateAll((els) =>
        els.map((e) => e.getBoundingClientRect()).map((r) => [r.left + r.width / 2, r.top])
      );
    return boxes as [number, number][];
  };
  await page.getByTestId('fit').click();
  const [root] = await centre('.node.is-root');
  const firstLevel = await centre('.node[aria-level="2"]');
  expect(firstLevel.length).toBe(6);
  // Every first-level reason is below the main claim, all on one row, and the main claim is above them.
  for (const [, y] of firstLevel) expect(y).toBeGreaterThan(root![1]);
  expect(new Set(firstLevel.map(([, y]) => Math.round(y))).size).toBe(1);
  const xs = firstLevel.map(([x]) => x);
  // The tidy tree puts a parent over the mean of its children.
  expect(Math.abs(root![0] - xs.reduce((sum, x) => sum + x, 0) / xs.length)).toBeLessThan(2);
});
