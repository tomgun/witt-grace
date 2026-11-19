/**
 * must: an opened example is readable at once: Punnitse shows the ratings and the result on the cards, the automatic
 *       fit stops at 75 % with the main claim in view, and ⤢ still shows the whole tree; below 100 % the selected
 *       card's actions follow it at a fixed 32 px size and do what the card's own buttons do; the wheel moves the
 *       view and Ctrl + wheel zooms (WG-038, owner 2026-11-19, UI_INVENTORY S-15)
 * test: tests/e2e/canvas-walk.spec.ts (desktop 1440×900; the phone starts in the table)
 * red-against: an example opened with the text-only layers (no figure on any card), the tree shrunk to 43 % so that
 *              nothing can be read, the main claim outside the view, the action bar scaling with the zoom, a wheel
 *              that zooms instead of scrolling
 */
import { expect, test } from '@playwright/test';

test('an example opens readable; the selected card has full-size actions; the wheel scrolls', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile',
    'the tree canvas is a desktop walk; a phone starts in the table'
  );
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#btnHomeDemo').click();
  await page.locator('.example-card[data-example="painonhallinta"]').click();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.locator('#btnWorkflowEvaluate')).toHaveClass(/active/);

  // The cards carry figures: every reason shows its ratings, the main claim its result.
  const root = page.locator('.node.is-root');
  await expect(root.locator('.meta-chip').first()).toBeVisible();
  await expect(page.locator('.node:not(.is-root) .meta-chip').first()).toBeVisible();
  await expect(page.getByTestId('zoom-label')).toHaveText('75 %');
  const view = (await page.locator('#viewport').boundingBox())!;
  const rootBox = (await root.boundingBox())!;
  expect(rootBox.x).toBeGreaterThanOrEqual(view.x);
  expect(rootBox.y).toBeGreaterThanOrEqual(view.y);
  expect(rootBox.x + rootBox.width).toBeLessThanOrEqual(view.x + view.width);
  expect(rootBox.y + rootBox.height).toBeLessThanOrEqual(view.y + view.height);

  // The wheel scrolls the view; with Ctrl it zooms.
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
  await page.mouse.wheel(0, 120);
  await expect(page.getByTestId('zoom-label')).toHaveText('75 %');
  await expect.poll(async () => Math.round((await root.boundingBox())!.y)).toBe(Math.round(rootBox.y) - 120);
  await page.mouse.wheel(0, -120);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect(page.getByTestId('zoom-label')).toHaveText('94 %');

  // Below 100 % the selected card's actions follow it at a fixed size.
  const reason = page.locator('.node:not(.is-root)').first();
  await reason.locator('.node-title').click();
  const bar = page.getByTestId('selection-bar');
  await expect(bar).toBeVisible();
  const plus = (await bar.locator('[data-action="support"]').boundingBox())!;
  expect(Math.round(plus.width)).toBe(32);
  expect(Math.round(plus.height)).toBe(32);
  await expect(page.getByTestId('node-count')).toHaveText('13');
  await bar.locator('[data-action="support"]').click();
  await expect(page.getByTestId('node-count')).toHaveText('14');
  await expect(page.locator('.node-inline-editor')).toBeFocused();
  await page.keyboard.press('Escape');

  // At 100 % and above the card's own buttons are large enough and the bar is gone.
  await page.locator('#zoomIn').click();
  await page.locator('#zoomIn').click();
  await expect(page.getByTestId('zoom-label')).toHaveText('135 %');
  await expect(bar).toBeHidden();

  // ⤢ shows the whole tree, smaller than the automatic fit.
  await page.getByTestId('fit').click();
  await expect(page.getByTestId('zoom-label')).toHaveText('40 %');
});

/**
 * must: a card that is added is wholly in view with its title editor open, however deep it is and whatever the
 *       zoom (WG-038, S-15)
 * red-against: the camera left where it was, so that the second level is already half outside the view at 115 %
 */
test('a card added deep in a wide tree is in view', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the tree canvas is a desktop walk');
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#btnHomeNew').click();
  await page.locator('#btnNewWorkArgument').click();
  const editor = page.locator('.node-inline-editor');
  await expect(editor).toBeFocused();
  await editor.press('Enter');
  const view = (await page.locator('#viewport').boundingBox())!;
  for (const title of ['Ensimmäinen taso', 'Toinen taso', 'Kolmas taso', 'Neljäs taso', 'Viides taso']) {
    await page.locator('#viewport').focus();
    await page.keyboard.press('+');
    await expect(editor).toBeFocused();
    await editor.fill(title);
    await editor.press('Enter');
    const card = page.locator('#nodesLayer .node', { hasText: title });
    await expect(card).toHaveAttribute('aria-selected', 'true');
    await expect
      .poll(async () => {
        const box = (await card.boundingBox())!;
        return box.x >= view.x && box.x + box.width <= view.x + view.width;
      })
      .toBe(true);
  }
});

/**
 * must: a card selected from the outline or with the keyboard is brought into view by the smallest move, and a card
 *       pressed on the canvas does not move the view (WG-038, S-15)
 * red-against: the main claim left off screen after its branch was built, the view jumping under the pointer
 */
test('a card selected from the outline comes into view; a pressed card stays put', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the tree canvas is a desktop walk');
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#btnHomeNew').click();
  await page.locator('#btnNewWorkArgument').click();
  const editor = page.locator('.node-inline-editor');
  await expect(editor).toBeFocused();
  await editor.press('Enter');
  for (const title of ['Ensimmäinen taso', 'Toinen taso', 'Kolmas taso']) {
    await page.locator('#viewport').focus();
    await page.keyboard.press('+');
    await expect(editor).toBeFocused();
    await editor.fill(title);
    await editor.press('Enter');
  }
  const view = (await page.locator('#viewport').boundingBox())!;
  const root = page.locator('.node.is-root');
  const inView = async (card: typeof root) => {
    const box = (await card.boundingBox())!;
    return box.x >= view.x && box.x + box.width <= view.x + view.width;
  };
  expect(await inView(root)).toBe(false);
  await page.locator('#treeOutline .outline-item').first().click();
  await expect(root).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => inView(root)).toBe(true);

  // A card pressed on the canvas is selected where it is.
  const first = page.locator('#nodesLayer .node', { hasText: 'Ensimmäinen taso' });
  const before = (await first.boundingBox())!;
  await first.locator('.node-title').click();
  await expect(first).toHaveAttribute('aria-selected', 'true');
  expect((await first.boundingBox())!.x).toBe(before.x);
});
