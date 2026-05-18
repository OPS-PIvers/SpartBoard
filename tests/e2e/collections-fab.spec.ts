import { test, expect } from '@playwright/test';

test.describe('Collections — FAB + Breadcrumb + app-open', () => {
  test.beforeEach(async ({ page }) => {
    await page.addStyleTag({
      content:
        '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });
    await page.goto('/');
    await expect(page.getByTitle('Open Menu')).toBeVisible({ timeout: 15000 });
  });

  test('breadcrumb chip shows the active Collection and Board name', async ({
    page,
  }) => {
    // With no Collection yet, the chip should show "All Boards" + the
    // active Board's name. The breadcrumb mounts inside BoardNavFab so
    // it only renders when boardsInCollection.length > 1; create a
    // second Board so the FAB (and chip) become visible.
    await page.getByTitle('Open Menu').click();
    await page
      .locator('nav button')
      .filter({ hasText: /Boards/i })
      .click();
    await page
      .locator('button')
      .filter({ hasText: /manage all boards/i })
      .click();
    const modal = page.getByRole('dialog', { name: /boards/i });
    await modal.getByRole('button', { name: /new board/i }).click();
    const prompt = page.getByRole('dialog', { name: /new board/i });
    await prompt.getByRole('textbox').fill('Breadcrumb E2E');
    await prompt.getByRole('button', { name: /^create$/i }).click();
    // Dismiss via Escape — a success toast may overlap the Close button in
    // the top-right corner, making a pointer click unreliable.
    await page.keyboard.press('Escape');

    // After closing the modal, BoardNavFab should be visible (2 boards
    // exist at root). The breadcrumb chip should also be visible.
    const chip = page
      .locator('button')
      .filter({ hasText: /All Boards/i })
      .filter({ hasText: /Breadcrumb E2E/i });
    await expect(chip.first()).toBeVisible({ timeout: 10000 });
  });

  test('FAB Collection submenu lets the user switch Collections', async ({
    page,
  }) => {
    // Create a Collection + 2 Boards inside it. Then verify the FAB's
    // kebab popover has a "Switch Collection…" entry that opens a
    // submenu listing the new Collection.
    await page.getByTitle('Open Menu').click();
    await page
      .locator('nav button')
      .filter({ hasText: /Boards/i })
      .click();
    await page
      .locator('button')
      .filter({ hasText: /manage all boards/i })
      .click();
    const modal = page.getByRole('dialog', { name: /boards/i });

    await modal.getByRole('button', { name: /new collection/i }).click();
    const cPrompt = page.getByRole('dialog', { name: /new collection/i });
    await cPrompt.getByRole('textbox').fill('FAB Switch Coll');
    await cPrompt.getByRole('button', { name: /^create$/i }).click();
    await modal.getByText('FAB Switch Coll').first().click();

    // Create 2 boards inside the new Collection.
    for (const name of ['FAB-A', 'FAB-B']) {
      await modal.getByRole('button', { name: /new board/i }).click();
      const bPrompt = page.getByRole('dialog', { name: /new board/i });
      await bPrompt.getByRole('textbox').fill(name);
      await bPrompt.getByRole('button', { name: /^create$/i }).click();
    }
    // Dismiss via Escape — a success toast may overlap the Close button in
    // the top-right corner, making a pointer click unreliable.
    await page.keyboard.press('Escape');
    // Wait for the modal to be fully dismissed before interacting with the FAB.
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // Now the active Collection is "FAB Switch Coll" with 2 boards.
    // The FAB picker should expose "Switch Collection…" at the top.
    await page.getByLabel('Select board').click();
    await expect(
      page.getByRole('menuitem', { name: /switch collection/i })
    ).toBeVisible({ timeout: 5000 });

    // Clicking it opens the Collection switcher submenu.
    await page.getByRole('menuitem', { name: /switch collection/i }).click();
    await expect(
      page.getByRole('menu', { name: /switch collection/i })
    ).toBeVisible();

    // The submenu should list both "All Boards (root)" and "FAB Switch Coll".
    await expect(
      page.getByRole('menuitem', { name: /all boards \(root\)/i })
    ).toBeVisible();
    await expect(
      page.getByRole('menuitem', { name: 'FAB Switch Coll' })
    ).toBeVisible();
  });
});
