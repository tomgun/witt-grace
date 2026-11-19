/**
 * must: in the Lehto (grove) theme the tree is drawn with a crown behind the main claim, branches that tell support
 *       from opposition by shape (a dashed oppose edge), at most ten small animals standing on branches, and a
 *       screen-space weather layer behind the cards; the decorations never take input (a card is what is under the
 *       pointer, panning still works) and never sit on the legend or the zoom controls; reduced motion removes the
 *       weather and stops the animals; a phone shows at most three animals and no birds (S-15, owner request
 *       2026-11-12)
 * test: tests/e2e/grove-walk.spec.ts (desktop 1440×900 and mobile 390×844)
 * red-against: the ambient layer above the viewport swallowing pointerdown, oppose drawn solid like support, the
 *              reduced-motion rule missing so animals keep walking, more than ten or no animals on a tree with
 *              many branches, the phone rules missing so birds fly over a 390 px canvas
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ensureTree, openSettings, startWith } from './helpers.ts';

const EXAMPLE = readFileSync('public/examples/debate-etatyomalli.witt.json', 'utf8');

test.beforeEach(async ({ page }) => {
  await startWith(page, EXAMPLE);
  await openSettings(page);
  await page.locator('#themeSelect').selectOption('grove');
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'grove');
  await ensureTree(page);
});

test('crown, shaped branches, a few animals and weather; input is never intercepted', async ({ page }) => {
  await expect(page.locator('.grove-crown')).toHaveCount(1);
  // A daylight grove (redrawn 2026-11-19): a light page, a tree line, and birches at the sides on a wide screen.
  expect(await page.evaluate(() => getComputedStyle(document.body).colorScheme)).toBe('light');
  await expect(page.locator('.grove-treeline')).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) > 600) await expect(page.locator('.grove-birch')).toHaveCount(4);
  await expect(page.getByTestId('grove-ambient')).toBeAttached();
  const animals = await page.locator('.grove-creature').count();
  expect(animals).toBeGreaterThan(0);
  expect(animals).toBeLessThanOrEqual(10);
  // Support and oppose differ in shape, not only in colour.
  const dash = (cls: string) =>
    page
      .locator(`path.edge.${cls}`)
      .first()
      .evaluate((el) => getComputedStyle(el).strokeDasharray);
  expect(await dash('edge-support')).toBe('none');
  expect(await dash('edge-oppose')).not.toBe('none');
  // The decorations are beneath the cards: at the centre of a card that is on screen, no decoration is what is hit.
  await page.locator('#viewport').scrollIntoViewIfNeeded();
  const hits = await page.evaluate(() => {
    const view = document.querySelector('#viewport')!.getBoundingClientRect();
    const onScreen = [...document.querySelectorAll('.node')].filter((n) => {
      const r = n.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      return x > view.left && x < view.right && y > view.top && y < view.bottom && y < innerHeight;
    });
    return onScreen.map((n) => {
      const r = n.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !hit?.closest('.grove-ambient, .grove-creatures, .grove-crown, #edges');
    });
  });
  expect(hits.length).toBeGreaterThan(0);
  expect(hits.every(Boolean)).toBe(true);
  // Panning still works.
  const before = await page.locator('#world').getAttribute('style');
  const view = (await page.locator('#viewport').boundingBox())!;
  await page.mouse.move(view.x + view.width - 40, view.y + view.height - 120);
  await page.mouse.down();
  await page.mouse.move(view.x + view.width - 140, view.y + view.height - 160, { steps: 4 });
  await page.mouse.up();
  expect(await page.locator('#world').getAttribute('style')).not.toBe(before);
  // The legend and the zoom controls are not covered by an animal: whatever passes beneath them on a small
  // canvas, a press at the centre of each of their items reaches that item.
  const covered = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.legend > *, .zoom-controls > *')]
      .filter((item) => item.getClientRects().length > 0)
      .some((item) => {
        const r = item.getBoundingClientRect();
        return !item.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
      })
  );
  expect(covered).toBe(false);
});

test('reduced motion removes the weather and the animals stand still', async ({ page }) => {
  const walking = () =>
    page
      .locator('.grove-squirrel, .grove-snail, .grove-butterfly')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName);
  expect(await walking()).not.toBe('none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByTestId('grove-ambient')).toBeHidden();
  expect(await walking()).toBe('none');
  // The grove itself does not move and stays: the tree line and the light, standing still.
  await expect(page.getByTestId('grove-scenery')).toBeVisible();
  await expect(page.locator('.grove-treeline')).toBeVisible();
  expect(
    await page
      .locator('.grove-light')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName)
  ).toBe('none');
  await expect(page.locator('.grove-creature').first()).toBeAttached();
});

test('a phone shows at most three animals and no birds', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1440) > 600, 'phone rules apply at 600 px and narrower');
  const visible = await page
    .locator('.grove-creature')
    .evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').length);
  expect(visible).toBeLessThanOrEqual(3);
  await expect(page.locator('.grove-bird').first()).toBeHidden();
  // No birch trunks on a narrow screen: they would stand in the middle of the tree.
  await expect(page.locator('.grove-birch').first()).toBeHidden();
  await expect(page.locator('.grove-treeline')).toBeVisible();
});
