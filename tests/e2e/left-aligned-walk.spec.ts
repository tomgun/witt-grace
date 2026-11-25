/**
 * must: Puun suunta offers *Ylhäältä alas, vasemmalle tasattu* (owner 2026-11-25): each parent stands above its
 *       first child at the left of its subtree and the next sibling follows to the right; the quick button names it;
 *       a card cannot be dragged there and says why; turning on *Näytä kaikki tekstit* keeps the tree left-aligned
 *       instead of turning it into the centred top-down tree; nothing overlaps either way
 * test: tests/e2e/left-aligned-walk.spec.ts (desktop 1440×900)
 * red-against: the reading view laying the tree out centred (the owner's report: the tree jumped to the top-down
 *              view), a parent centred over its children, a dragged card moving and then jumping back
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addNamed, startBlank } from './helpers.ts';

test.skip(({ viewport }) => (viewport?.width ?? 1440) < 1000, 'the walk drives the desktop tree');

const box = async (page: Page, title: string) =>
  (await page.locator('.node', { has: page.locator('.node-title', { hasText: title }) }).boundingBox())!;
async function leftAligned(page: Page) {
  const root = await box(page, 'Mikä on tarkasteltava väite?');
  const first = await box(page, 'Ensimmäinen peruste');
  const under = await box(page, 'Peruste perusteelle');
  const second = await box(page, 'Toinen peruste');
  // The parent above its first child, at the same left edge; the first child's child likewise.
  expect(Math.abs(first.x - root.x)).toBeLessThan(2);
  expect(first.y).toBeGreaterThan(root.y + root.height);
  expect(Math.abs(under.x - first.x)).toBeLessThan(2);
  // The second reason after the first one's subtree, on the same row.
  expect(second.x).toBeGreaterThanOrEqual(first.x + first.width);
  expect(Math.abs(second.y - first.y)).toBeLessThan(2);
  const overlaps = await page.evaluate(() => {
    const all = [...document.querySelectorAll('#nodesLayer .node')].map((el) => el.getBoundingClientRect());
    return all.some((a, i) =>
      all
        .slice(i + 1)
        .some((b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)
    );
  });
  expect(overlaps).toBe(false);
}

test('the left-aligned tree, and the reading view keeps it', async ({ page }) => {
  await startBlank(page, 'argument');
  await page.locator('.node.is-root .node-title').click();
  await addNamed(page, '#btnSupport', 'Ensimmäinen peruste');
  await addNamed(page, '#btnSupport', 'Peruste perusteelle');
  await page.locator('.node.is-root .node-title').click();
  await addNamed(page, '#btnOppose', 'Toinen peruste');

  await page.locator('#btnViewSettings').click();
  await expect(page.locator('#orientationSelect option[value="top-left"]')).toHaveText(
    '↳ Ylhäältä alas, vasemmalle tasattu'
  );
  await page.locator('#orientationSelect').selectOption('top-left');
  await page.locator('#btnDockClose').click();
  await expect(page.locator('#btnOrientationQuick')).toHaveText('↳ Ylhäältä alas, vasemmalle tasattu');
  await page.getByTestId('fit').click();
  await leftAligned(page);

  // A card keeps its place: the tree places it.
  const before = await box(page, 'Toinen peruste');
  const title = page.locator('.node-title', { hasText: 'Toinen peruste' });
  await page.mouse.move(before.x + 40, before.y + 60);
  await page.mouse.down();
  await page.mouse.move(before.x + 140, before.y + 160, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#noticeText')).toContainText(
    'Vasemmalle tasatussa puussa kortit asettuvat puun mukaan'
  );
  await page.locator('#noticeClose').click();
  await expect(title).toBeVisible();
  const after = await box(page, 'Toinen peruste');
  expect([Math.round(after.x), Math.round(after.y)]).toEqual([Math.round(before.x), Math.round(before.y)]);

  // Näytä kaikki tekstit: the cards grow to their text and the tree stays left-aligned.
  await page.locator('#btnViewSettings').click();
  const reading = page.locator('#dockSection-reading');
  if (!(await reading.evaluate((d) => (d as HTMLDetailsElement).open)))
    await reading.locator('summary').click();
  await page.getByTestId('reading-mode').check();
  await page.locator('#btnDockClose').click();
  await expect(page.locator('.node.reading-card').first()).toBeVisible();
  await page.getByTestId('fit').click();
  await leftAligned(page);
});
