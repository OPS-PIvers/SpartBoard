import { test } from '@playwright/test';

test('Dice Widget 10x Enhancement Verification', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await page.waitForSelector('[data-testid="dice-face"]');

  // Take a full page screenshot to document the state
  await page.screenshot({ path: 'dice_verification.png' });
});
