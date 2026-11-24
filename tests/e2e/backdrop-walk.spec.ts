/**
 * must: the home screen has the himmeli canvas `#homeBackdrop` (owner 2026-11-23, WG-062, UI_INVENTORY S-15) in a
 *       band of its own that closes the page, under the method (`#homeClosing`, owner 2026-11-24), with one
 *       line of text under it; the method is a page of its own under the first screenful; the tree is drawn in
 *       the chosen theme's colours: the canvas is hidden from assistive technology and never takes the pointer; the
 *       whole tree stays inside its band; on a desktop-width window nothing of it is there at first: after 30 s
 *       the main claim appears, then reasons one at a time until all 51 points are there; whoever scrolls to the
 *       band before that finds the tree begun (six points) and growing; with reduced motion and on a phone-width
 *       window it is whole and still from the start; it is gone in the workspace; on a desktop-width window a
 *       point is taken hold of with the mouse (a hand cursor shows it), follows the drag and is let go, and a
 *       press on a button still goes to the button
 * test: tests/e2e/backdrop-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: the tree drawn in the previous theme's colours (pale or invisible after a theme change), the
 *              method starting inside the first screenful, the tree behind the slogan or the example card again, an animation that ignores the reduced motion
 *              setting, an empty canvas (a colour token that did not resolve), the canvas left over the
 *              workspace, the whole tree at once on arrival, a tree that never grows, an empty band met by a
 *              reader who scrolls down at once, a tree cut by its band's edge, a grab that starts on a button and
 *              swallows its press, a point that stays held after the mouse is released
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

test('the himmeli has its own band, grows from the main claim, and is gone in the workspace', async ({
  page,
  viewport,
}) => {
  await page.clock.install();
  await page.goto('/');
  const backdrop = page.locator('#homeBackdrop');
  await expect(backdrop).toHaveAttribute('aria-hidden', 'true');
  await expect(backdrop).toHaveCSS('pointer-events', 'none');
  // The page in order: the top, the method as a page of its own, and the himmeli's band closing the page, with
  // a line of text under the tree.
  const top = (await page.locator('.home-hero').boundingBox())!;
  const method = (await page.locator('#homeMethod').boundingBox())!;
  const band = (await page.locator('#homeClosing').boundingBox())!;
  expect(method.y).toBeGreaterThanOrEqual(top.y + top.height - 1);
  expect(band.y).toBeGreaterThanOrEqual(method.y + method.height - 1);
  await expect(page.locator('.home-closing-line')).toHaveText('Hyvä päätös kasvaa perustelu kerrallaan.');
  if ((viewport?.width ?? 1440) >= 1021) {
    // On a desktop window the top fills the first screenful and the method is at least a screenful.
    expect(method.y).toBeGreaterThanOrEqual(viewport!.height);
    expect(method.height).toBeGreaterThanOrEqual(viewport!.height);
  }
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
  // The whole of it is inside its band: nothing is drawn at the canvas's edges.
  await page.clock.fastForward(3_000);
  const box = await drawnBox(page);
  expect(box.left).toBeGreaterThan(0.005);
  expect(box.top).toBeGreaterThan(0.005);
  expect(box.right).toBeLessThan(0.995);
  expect(box.bottom).toBeLessThan(0.995);
  await page.locator('#btnHomeNew').click();
  await page.locator('#btnNewWorkArgument').click();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.locator('#homeBackdrop')).toHaveCount(0);
});

test('the himmeli is drawn in the chosen theme’s colours, not the previous theme’s', async ({
  page,
  viewport,
}) => {
  test.skip((viewport?.width ?? 1440) < 700, 'the desktop walk covers the theme change');
  await page.clock.install();
  await page.goto('/');
  await page.clock.fastForward(WHOLE_TREE_MS);
  const backdrop = page.locator('#homeBackdrop');
  await expect(backdrop).toHaveAttribute('data-points', '51');
  /** Whether something on the canvas is drawn in the body's own `--accent` (the main claim's colour). */
  const inAccent = () =>
    backdrop.evaluate((canvas) => {
      const probe = document.createElement('span');
      probe.style.color = getComputedStyle(document.body).getPropertyValue('--accent');
      document.body.append(probe);
      const [r, g, b] = (getComputedStyle(probe).color.match(/[\d.]+/g) ?? []).map(Number);
      probe.remove();
      const c = canvas as HTMLCanvasElement;
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < data.length; i += 4)
        if (
          data[i + 3]! > 120 &&
          Math.abs(data[i]! - r!) < 14 &&
          Math.abs(data[i + 1]! - g!) < 14 &&
          Math.abs(data[i + 2]! - b!) < 14
        )
          return true;
      return false;
    });
  for (const theme of ['obsidian', 'manuscript-pen', 'light']) {
    await page.locator('#homeScreen select').nth(1).selectOption(theme);
    await expect(backdrop).toHaveAttribute('data-theme', theme);
    await page.clock.fastForward(500);
    expect(await inAccent(), `the main claim in ${theme}'s accent`).toBe(true);
  }
});

test('scrolling to the band at once finds the tree begun, not an empty band', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 1440) < 700, 'on a phone-width window the tree is whole from the start');
  await page.clock.install();
  await page.goto('/');
  const backdrop = page.locator('#homeBackdrop');
  await expect(backdrop).toHaveAttribute('data-points', '0');
  await backdrop.scrollIntoViewIfNeeded();
  await page.clock.fastForward(1_000);
  await expect(backdrop).toHaveAttribute('data-points', '6');
  // It grows on from there, a reason at a time.
  await page.clock.fastForward(16_000);
  await expect(backdrop).toHaveAttribute('data-points', /^[78]$/);
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
  await page.clock.fastForward(WHOLE_TREE_MS);
  await expect(page.locator('#homeBackdrop')).toHaveAttribute('data-points', '51');
  await page.locator('#homeBackdrop').scrollIntoViewIfNeeded();
  await page.clock.fastForward(2_000);
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
