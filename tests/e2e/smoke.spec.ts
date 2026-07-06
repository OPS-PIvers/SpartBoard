import { APP_NAME } from '@/config/constants';
import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(new RegExp(APP_NAME));
});

test('dashboard loads and shows sidebar button', async ({ page }) => {
  await page.goto('/');

  // Wait for the "Open Menu" button to be visible.
  await expect(page.getByTitle('Open Menu')).toBeVisible();
});
