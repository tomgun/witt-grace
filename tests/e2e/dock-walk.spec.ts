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
 *       "Omat valinnat" is listed only while it is the state; the compacting button names what it does now;
 *       in the table only the layer that reaches the table is offered
 * red-against: a heading that does not follow its setting, a compacting button that reads the same on and off, every section open at once, the reset leaving the depth
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

  // "Omat valinnat" is a state, not a choice: it is listed only while the choices match no preset.
  await expect(page.locator('#viewPreset option')).toHaveCount(3);
  await page.locator('#layersPanel input[data-layer="links"]').check();
  await expect(page.locator('#viewPreset option')).toHaveCount(4);
  await expect(page.getByTestId('dock-state-cards')).toHaveText('Omat valinnat');
  // The compacting button says what pressing it does now, and the heading says the tree is compacted.
  await page.locator('#btnDepthReset').click();
  const compact = page.locator('#btnCompactTree');
  await expect(compact).toHaveText('Tiivistä näkyvä puu');
  await compact.click();
  await expect(compact).toHaveText('Palauta solmujen omat sijainnit');
  await expect(page.getByTestId('dock-state-tree')).toHaveText('Ylhäältä alas · tiivistetty');
  // In the table only the choice that reaches the table is offered.
  await page.locator('#btnTableView').click();
  await expect(page.locator('#layersPanel input')).toHaveCount(1);
  await expect(page.locator('#layersPanel input[data-layer="comments"]')).toBeVisible();
  await page.locator('#btnTreeView').click();
  await expect(page.locator('#layersPanel input[data-layer]')).toHaveCount(7);

  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(compact).toHaveText('Tiivistä näkyvä puu');
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

/**
 * must: in the reading view a branch that is closed or opened leaves the pressed card where it is on screen, and
 *       "Neljä suuntaa" spreads the main claim's reasons to all four sides without two cards overlapping
 *       (owner's report and request 2026-11-19, S-15)
 * red-against: the camera left alone while the tidy layout moves every card (the main claim slides to the left
 *              edge), the reading view drawing four directions as left to right
 */
test('the reading view: a closed branch keeps its card in place; four directions works', async ({ page }) => {
  await page.locator('#btnViewSettings').click();
  await openDockSection(page, 'reading');
  await page.getByTestId('reading-mode').check();
  await page.locator('#btnDockClose').click();
  const root = page.locator('.node.is-root');
  await expect(root).toHaveClass(/reading-card/);
  const place = async () => {
    const box = (await root.boundingBox())!;
    return [Math.round(box.x), Math.round(box.y)];
  };
  const before = await place();
  await root.locator('button', { hasText: '▾' }).first().click();
  await expect(page.locator('#nodesLayer .node')).toHaveCount(1);
  expect(await place()).toEqual(before);
  await root.locator('button', { hasText: '▸' }).first().click();
  await expect(page.locator('#nodesLayer .node')).toHaveCount(13);
  expect(await place()).toEqual(before);

  await page.locator('#btnViewSettings').click();
  await page.locator('#orientationSelect').selectOption('four-way');
  await page.locator('#btnDockClose').click();
  await page.getByTestId('fit').click();
  const sides = await page.evaluate(() => {
    const rect = (el: Element) => el.getBoundingClientRect();
    const main = rect(document.querySelector('.node.is-root')!);
    const first = [...document.querySelectorAll('.node[aria-level="2"]')].map(rect);
    const all = [...document.querySelectorAll('#nodesLayer .node')].map(rect);
    let overlaps = 0;
    for (let i = 0; i < all.length; i += 1)
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i]!;
        const b = all[j]!;
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps += 1;
      }
    return {
      right: first.some((r) => r.left >= main.right),
      left: first.some((r) => r.right <= main.left),
      down: first.some((r) => r.top >= main.bottom),
      up: first.some((r) => r.bottom <= main.top),
      overlaps,
    };
  });
  expect(sides).toEqual({ right: true, left: true, down: true, up: true, overlaps: 0 });
});
