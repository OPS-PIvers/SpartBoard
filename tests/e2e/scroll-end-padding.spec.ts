import { test, expect, type Locator, type Page } from '@playwright/test';
import { dismissWelcomeToast } from './helpers/dismissWelcomeToast';
import { expectScrollEndPadding } from './helpers/scrollEndPadding';

const openBoard = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.addStyleTag({
    content:
      '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  await dismissWelcomeToast(page);
};

// Visits every tab in the dialog's rail and measures each scroller at its end.
const checkEveryTab = async (
  page: Page,
  dialog: Locator,
  surface: string
): Promise<void> => {
  // A short viewport makes most panels overflow, so every tab's end padding is measured.
  await page.setViewportSize({ width: 1280, height: 480 });
  const tabs = dialog.getByRole('tablist').first().getByRole('tab');
  const count = await tabs.count();
  expect(count).toBeGreaterThan(1);
  for (let i = 0; i < count; i++) {
    const tab = tabs.nth(i);
    const name =
      (await tab.getAttribute('title')) ?? (await tab.innerText()).trim();
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    // Let lazy data and loading states settle before measuring.
    await page.waitForTimeout(400);
    await expectScrollEndPadding(dialog, `${surface} > ${name}`);
  }
};

test('every Admin Settings tab keeps padding under its last row', async ({
  page,
}) => {
  await openBoard(page);
  await page.getByRole('button', { name: 'Admin Settings' }).click();
  const dialog = page.getByRole('dialog', { name: /admin settings/i });
  await expect(dialog).toBeVisible();
  await checkEveryTab(page, dialog, 'Admin Settings');
});

test('every Profile & Settings section keeps padding under its last row', async ({
  page,
}) => {
  await openBoard(page);
  await page.getByTitle('Open Menu').click();
  await page.getByRole('button', { name: /profile & settings/i }).click();
  const dialog = page.getByRole('dialog', { name: /profile & settings/i });
  await expect(dialog).toBeVisible();
  await checkEveryTab(page, dialog, 'Profile & Settings');
});

test('the widget settings drawer keeps padding under its last row', async ({
  page,
}) => {
  await openBoard(page);
  await page.getByTitle('Open Tools').click();
  await page.waitForTimeout(500);
  await page
    .getByRole('button', { name: /^Clock$/ })
    .first()
    .click({ force: true });
  await page.mouse.click(0, 0);
  const clockWidget = page
    .locator('.widget', { has: page.getByTestId('clock-time-container') })
    .last();
  await clockWidget.click({ position: { x: 20, y: 20 } });
  await page
    .getByRole('button', { name: 'Settings (Alt+S)', exact: true })
    .click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible({ timeout: 10000 });
  await checkEveryTab(page, drawer, 'Clock settings');
});
