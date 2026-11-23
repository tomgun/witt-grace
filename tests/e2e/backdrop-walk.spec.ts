/**
 * must: the home screen has a backdrop canvas `#homeBackdrop` (owner 2026-11-23, WG-062, UI_INVENTORY S-15): it is
 *       hidden from assistive technology, never takes the pointer (the buttons over it still work), has something
 *       drawn on it, turns on a desktop-width window and stands still when the person asks for less motion or the
 *       window is phone-width; it is gone in the workspace; on a desktop-width window a point of it is taken hold
 *       of with the mouse where no control is in the way (a hand cursor shows it), follows the drag and is let go,
 *       and a press on a button still goes to the button
 * test: tests/e2e/backdrop-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: a canvas that swallows clicks on the home screen's buttons, an animation that ignores the reduced
 *              motion setting, an empty canvas (a colour token that did not resolve), the canvas left over the
 *              workspace, a grab that starts on a button and swallows its press, a point that stays held after
 *              the mouse is released
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

test('the backdrop is drawn, out of the way, and gone in the workspace', async ({ page, viewport }) => {
  await page.goto('/');
  const backdrop = page.locator('#homeBackdrop');
  await expect(backdrop).toHaveAttribute('aria-hidden', 'true');
  await expect(backdrop).toHaveCSS('pointer-events', 'none');
  const wide = (viewport?.width ?? 1440) >= 700;
  await expect(backdrop).toHaveAttribute('data-animated', String(wide));
  expect(await drawnPixels(page)).toBeGreaterThan(500);
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
  expect(await drawnPixels(page)).toBeGreaterThan(500);
});

test('a point of the himmeli is taken hold of with the mouse and let go; controls are not grabbed through', async ({
  page,
  viewport,
}) => {
  test.skip((viewport?.width ?? 1440) < 700, 'the himmeli is still and not held on a phone-width window');
  await page.goto('/');
  const cursor = () => page.locator('#homeScreen').evaluate((el) => (el as HTMLElement).style.cursor);
  // Find a point: the pointer turns into a hand near one, where nothing of the page is in the way.
  let spot: [number, number] | null = null;
  for (let y = 520; y < 880 && !spot; y += 8)
    for (let x = 600; x < 800 && !spot; x += 8) {
      await page.mouse.move(x, y);
      if ((await cursor()) === 'grab') spot = [x, y];
    }
  expect(spot).not.toBeNull();
  const [x, y] = spot as [number, number];
  const backdrop = page.locator('#homeBackdrop');
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
