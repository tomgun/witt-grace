/**
 * must: the home screen has a backdrop canvas `#homeBackdrop` (owner 2026-11-23, WG-062, UI_INVENTORY S-15): it is
 *       hidden from assistive technology, never takes the pointer (the buttons over it still work), has something
 *       drawn on it, turns on a desktop-width window and stands still when the person asks for less motion or the
 *       window is phone-width; it is gone in the workspace; on a desktop-width window a point of it is taken hold
 *       of with the mouse where no control is in the way (a hand cursor shows it), follows the drag and is let go,
 *       and a press on a button still goes to the button; on a desktop-width window nothing of it is there at
 *       first (owner 2026-11-24): after 30 s the main claim appears, then reasons one at a time, and the whole
 *       tree (51 points) hangs in the band between the top row and the example card; still, it is whole from
 *       the start
 * test: tests/e2e/backdrop-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: a canvas that swallows clicks on the home screen's buttons, an animation that ignores the reduced
 *              motion setting, an empty canvas (a colour token that did not resolve), the canvas left over the
 *              workspace, a grab that starts on a button and swallows its press, a point that stays held after
 *              the mouse is released, the whole tree at once on arrival, a tree that never grows, a tree that
 *              runs under the example card, the text column or the top row, or off the window's edge
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const drawnPixels = (page: Page) =>
  page.locator('#homeBackdrop').evaluate((canvas) => {
    const c = canvas as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let drawn = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) drawn++;
    return drawn;
  });

/** The box of what is drawn, as fractions of the canvas. */
const drawnBox = (page: Page) =>
  page.locator('#homeBackdrop').evaluate((canvas) => {
    const c = canvas as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const box = { left: 1, right: 0, top: 1, bottom: 0 };
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (data[(y * c.width + x) * 4 + 3]! > 0) {
          box.left = Math.min(box.left, x / c.width);
          box.right = Math.max(box.right, x / c.width);
          box.top = Math.min(box.top, y / c.height);
          box.bottom = Math.max(box.bottom, y / c.height);
        }
    return box;
  });
const WHOLE_TREE_MS = 51 * 15_000 + 40_000;

test('the backdrop is drawn, out of the way, and gone in the workspace', async ({ page, viewport }) => {
  await page.clock.install();
  await page.goto('/');
  const backdrop = page.locator('#homeBackdrop');
  await expect(backdrop).toHaveAttribute('aria-hidden', 'true');
  await expect(backdrop).toHaveCSS('pointer-events', 'none');
  const wide = (viewport?.width ?? 1440) >= 700;
  await expect(backdrop).toHaveAttribute('data-animated', String(wide));
  if (wide) {
    // Nothing at first; the main claim after half a minute; reasons one at a time; then the whole tree.
    await expect(backdrop).toHaveAttribute('data-points', '0');
    expect(await drawnPixels(page)).toBe(0);
    await page.clock.fastForward(31_000);
    await expect(backdrop).toHaveAttribute('data-points', '1');
    await page.clock.fastForward(16_000);
    await expect(backdrop).toHaveAttribute('data-points', /^[23]$/);
    await page.clock.fastForward(WHOLE_TREE_MS);
  }
  await expect(backdrop).toHaveAttribute('data-points', '51');
  expect(await drawnPixels(page)).toBeGreaterThan(500);
  // The whole of it is inside the window; on a wide window it hangs in the band above the example card, under
  // the top row, and never runs under the card or the text column.
  await page.clock.fastForward(3_000);
  const box = await drawnBox(page);
  expect(box.right).toBeLessThan(0.995);
  expect(box.bottom).toBeLessThan(0.995);
  if ((viewport?.width ?? 1440) >= 1000) {
    const size = viewport!;
    const card = (await page.locator('.home-visual').boundingBox())!;
    const nav = (await page.locator('.home-nav').boundingBox())!;
    expect(box.top * size.height).toBeGreaterThanOrEqual(nav.y + nav.height);
    expect(box.bottom * size.height).toBeLessThanOrEqual(card.y);
    expect(box.left * size.width).toBeGreaterThanOrEqual(card.x - 2);
    expect(box.right * size.width).toBeLessThanOrEqual(card.x + card.width + 2);
  }
  // The home screen's main action is pressed through it.
  await page.locator('#btnHomeNew').click();
  await page.locator('#btnNewWorkArgument').click();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.locator('#homeBackdrop')).toHaveCount(0);
});

test('with reduced motion the backdrop stands still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#homeBackdrop')).toHaveAttribute('data-animated', 'false');
  await expect(page.locator('#homeBackdrop')).toHaveAttribute('data-points', '51');
  expect(await drawnPixels(page)).toBeGreaterThan(500);
});

test('a point of the himmeli is taken hold of with the mouse and let go; controls are not grabbed through', async ({
  page,
  viewport,
}) => {
  test.skip((viewport?.width ?? 1440) < 700, 'the himmeli is still and not held on a phone-width window');
  await page.clock.install();
  await page.goto('/');
  // Before the tree has appeared there is nothing to take hold of.
  await page.mouse.move(1000, 120);
  await page.mouse.move(1020, 180);
  expect(await page.locator('#homeScreen').evaluate((el) => (el as HTMLElement).style.cursor)).toBe('');
  await page.clock.fastForward(WHOLE_TREE_MS);
  await expect(page.locator('#homeBackdrop')).toHaveAttribute('data-points', '51');
  const cursor = () => page.locator('#homeScreen').evaluate((el) => (el as HTMLElement).style.cursor);
  // Find a point: the pointer turns into a hand near one, where nothing of the page is in the way. The page's
  // layout decides where that is, so the whole window is tried, as pointer moves the page itself would see.
  const spot = await page.evaluate(() => {
    const home = document.getElementById('homeScreen') as HTMLElement;
    for (let y = 8; y < window.innerHeight; y += 8)
      for (let x = 8; x < window.innerWidth; x += 8) {
        const target = document.elementFromPoint(x, y);
        if (!target) continue;
        target.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
        if (home.style.cursor === 'grab') return [x, y] as [number, number];
      }
    return null;
  });
  expect(spot).not.toBeNull();
  const [x, y] = spot as [number, number];
  const backdrop = page.locator('#homeBackdrop');
  await page.mouse.move(x, y);
  expect(await cursor()).toBe('grab');
  await page.mouse.down();
  await expect(backdrop).toHaveAttribute('data-held', /^\d+$/);
  expect(await cursor()).toBe('grabbing');
  await page.mouse.move(x - 120, y - 90, { steps: 8 });
  await page.mouse.up();
  await expect(backdrop).not.toHaveAttribute('data-held');
  expect(await cursor()).not.toBe('grabbing');
  // Over a button the pointer stays a pointer and a press goes to the button.
  await page.locator('#btnHomeNew').hover();
  expect(await cursor()).toBe('');
  await page.locator('#btnHomeNew').click();
  await expect(page.locator('#newWorkDialog')).toBeVisible();
  await expect(backdrop).not.toHaveAttribute('data-held');
});
