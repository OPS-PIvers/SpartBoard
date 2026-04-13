import { expect, test } from '@playwright/test';

test('Dice Widget 10x Enhancement Verification', async ({ page }) => {
  await page.goto('/');

  // Wait for the app to be ready - Open Menu is a good indicator
  const menuButton = page.getByTitle('Open Menu');
  await expect(menuButton).toBeVisible({ timeout: 15000 });

  // Handle potential setup wizard
  if (await page.getByText("Let's get started").isVisible()) {
    while (
      await page.getByRole('button', { name: /Next|Get Started/i }).isVisible()
    ) {
      await page.getByRole('button', { name: /Next|Get Started/i }).click();
      await page.waitForTimeout(500);
    }
  }

  // 1. Open the dock
  const openToolsButton = page.getByTitle('Open Tools');
  if (await openToolsButton.isVisible()) {
    await openToolsButton.click();
  }

  // 2. Add Dice widget
  const diceButton = page.getByRole('button', { name: /Dice/i }).first();
  await expect(diceButton).toBeVisible({ timeout: 10000 });

  // Use force click because the button might be "unstable" during dock animations
  await diceButton.click({ force: true });

  // 3. Verify widget appeared and has 1 face by default
  const diceFaces = page.locator('[data-testid="dice-face"]');
  await expect(diceFaces.first()).toBeVisible({ timeout: 10000 });
  await expect(diceFaces).toHaveCount(1);

  // 4. Capture a verification artifact
  await page.screenshot({ path: 'verification/dice_10x.png' });
});
