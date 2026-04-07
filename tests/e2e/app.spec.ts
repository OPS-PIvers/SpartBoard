import { APP_NAME } from '../../config/constants';
import { test, expect } from '@playwright/test';

test.describe(APP_NAME, () => {
  test.beforeEach(async ({ page }) => {
    // Disable animations and transitions for more stable tests
    await page.addStyleTag({
      content:
        '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });
    await page.goto('/');
  });

  test('has title', async ({ page }) => {
    await expect(page).toHaveTitle(new RegExp(APP_NAME, 'i'));
  });

  test('can open sidebar and view widgets', async ({ page }) => {
    // Open sidebar
    const menuButton = page.getByTitle('Open Menu');
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    // Verify sidebar header
    await expect(page.getByText(APP_NAME, { exact: true })).toBeVisible();

    // Verify Workspace section is visible
    await expect(page.getByText('Workspace')).toBeVisible();
  });

  test('can add a Clock widget', async ({ page }) => {
    // Open Dock (it is minimized by default)
    const openToolsButton = page.getByTitle('Open Tools');
    await expect(openToolsButton).toBeVisible();
    await openToolsButton.click();

    // Wait for dock animation
    await page.waitForTimeout(500);

    // Click Clock widget in the Dock
    // The Dock renders buttons with the tool label.
    // Use force: true to bypass potential animation stability checks
    const clockButton = page.getByRole('button', { name: /Clock/i }).first();
    await expect(clockButton).toBeVisible();
    await clockButton.click({ force: true });

    // Verify Clock widget is on the dashboard
    // The widget has class 'widget'.
    const widget = page.locator('.widget').first();
    await expect(widget).toBeVisible({ timeout: 10000 });

    // Optional: Verify it looks like a clock (contains a colon)
    await expect(widget.getByText(':').first()).toBeVisible();
  });
});
