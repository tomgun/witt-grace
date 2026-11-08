// Shared steps for the browser walks: the app starts on the home screen like the prototype (UI_INVENTORY S-01).
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Clears storage and starts a blank document of the given mode through the New work dialog. */
export async function startBlank(page: Page, mode: 'argument' | 'decision'): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#btnHomeNew').click();
  await page.locator(mode === 'decision' ? '#btnNewWorkDecision' : '#btnNewWorkArgument').click();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.getByTestId('node-count')).toHaveText('1');
  await ensureTree(page);
}

/** A narrow window starts in the table presentation like the prototype (≤ 600 px); the walks drive the tree. */
export async function ensureTree(page: Page): Promise<void> {
  if (await page.locator('#btnTableView.active').count()) await page.locator('#btnTreeView').click();
  await expect(page.locator('#viewport')).toBeVisible();
  // A narrow window also hides the left panel by default; the walks select through the outline, so open it.
  if (await page.getByTestId('outline').isHidden()) {
    await page.locator('#viewport').focus();
    await page.keyboard.press('Alt+1');
    await expect(page.getByTestId('outline')).toBeVisible();
  }
}

/** Seeds the prototype's storage key with a document and continues into the workspace. */
export async function startWith(page: Page, json: string): Promise<void> {
  await page.goto('/');
  await page.evaluate((d) => {
    window.localStorage.clear();
    window.localStorage.setItem('witt-project-v3', d);
  }, json);
  await page.reload();
  await page.locator('#btnHomeContinue').click();
  await expect(page.getByTestId('app')).toBeVisible();
  await ensureTree(page);
}

/** Adds a child to the selected node with the given bottom-zone/left-panel button and names it inline. */
export async function addNamed(page: Page, buttonSelector: string, title: string): Promise<void> {
  await page.locator(buttonSelector).click();
  const editor = page.locator('.node-inline-editor');
  await expect(editor).toBeFocused();
  await editor.fill(title);
  await editor.press('Enter');
  await expect(page.locator('.node-title', { hasText: title })).toBeVisible();
}

/** Sets the own credence and influence sliders in the inspector (Punnitse must be on). A slider only saves on a
 * change, exactly as the prototype's `change` event, so the value is first nudged away from the current one. */
export async function reviewSelected(page: Page, credence: string, influence: string): Promise<void> {
  const c = page.getByTestId('review-credence');
  await c.fill(credence === '0' ? '1' : '0');
  await c.blur();
  await c.fill(credence);
  await c.blur();
  const i = page.getByTestId('review-influence');
  await i.fill(influence === '0' ? '0.5' : '0');
  await i.blur();
  await i.fill(influence);
  await i.blur();
}

/** Selects the root by tapping its card: works at every width, unlike the outline on a phone. */
export async function selectRoot(page: Page): Promise<void> {
  await page.locator('.node.is-root .node-title').click();
  await expect(page.locator('.node.is-root')).toHaveClass(/selected/);
}
