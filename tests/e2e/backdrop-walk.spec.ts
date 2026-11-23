/**
 * must: the home screen has a backdrop canvas `#homeBackdrop` (owner 2026-11-23, WG-062, UI_INVENTORY S-15): it is
 *       hidden from assistive technology, never takes the pointer (the buttons over it still work), has something
 *       drawn on it, turns on a desktop-width window and stands still when the person asks for less motion or the
 *       window is phone-width; it is gone in the workspace
 * test: tests/e2e/backdrop-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: a canvas that swallows clicks on the home screen's buttons, an animation that ignores the reduced
 *              motion setting, an empty canvas (a colour token that did not resolve), the canvas left over the
 *              workspace
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
