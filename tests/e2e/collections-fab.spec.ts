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
    // After creating a second board the new board becomes active. The
    // BoardBreadcrumb pill (transient — fades after 3s) should appear
    // briefly with "All Boards" + the new Board's name. Playwright's
    // auto-wait catches it during the display window.
    await page.getByTitle('Open Menu').click();
    // "Boards & Collections" opens the BoardsModal directly.
    await page
      .locator('nav button')
      .filter({ hasText: /Boards/i })
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
    // exist at root). The transient breadcrumb chip ("No Collection › <name>"
    // — see boardBreadcrumb.root i18n key) should appear briefly within
    // its 3s display window; Playwright's auto-wait catches it.
    const chip = page
      .locator('button')
      .filter({ hasText: /No Collection/i })
      .filter({ hasText: /Breadcrumb E2E/i });
    await expect(chip.first()).toBeVisible({ timeout: 10000 });
  });

  test('FAB Collections button opens the Collection switcher', async ({
    page,
  }) => {
    // Create 2 Collections + 2 Boards inside the second one. Then verify
    // the FAB exposes a dedicated [Collections] button that opens
    // CollectionSwitcherMenu directly. The button renders whenever any
    // Collection exists (collections.length >= 1) — two Collections here
    // exercise the menu rendering a list rather than a single entry.
    await page.getByTitle('Open Menu').click();
    // "Boards & Collections" opens the BoardsModal directly.
    await page
      .locator('nav button')
      .filter({ hasText: /Boards/i })
      .click();
    const modal = page.getByRole('dialog', { name: /boards/i });

    // Collection 1.
    await modal.getByRole('button', { name: /new collection/i }).click();
    let cPrompt = page.getByRole('dialog', { name: /new collection/i });
    await cPrompt.getByRole('textbox').fill('Coll One');
    await cPrompt.getByRole('button', { name: /^create$/i }).click();

    // Collection 2 — needed so the [Collections] FAB button appears.
    await modal.getByRole('button', { name: /new collection/i }).click();
    cPrompt = page.getByRole('dialog', { name: /new collection/i });
    await cPrompt.getByRole('textbox').fill('Coll Two');
    await cPrompt.getByRole('button', { name: /^create$/i }).click();

    // Open Coll Two and add 2 boards so we land inside it after closing.
    await modal.getByText('Coll Two').first().click();
    for (const name of ['FAB-A', 'FAB-B']) {
      await modal.getByRole('button', { name: /new board/i }).click();
      const bPrompt = page.getByRole('dialog', { name: /new board/i });
      await bPrompt.getByRole('textbox').fill(name);
      await bPrompt.getByRole('button', { name: /^create$/i }).click();
    }

    // Dismiss the modal.
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // The FAB row should expose a dedicated Collections button (Folder icon).
    await page.getByLabel('Select collection').click();

    // Clicking it opens CollectionSwitcherMenu listing "No Collection" + both collections.
    await expect(
      page.getByRole('menuitem', { name: /no collection/i })
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole('menuitem', { name: 'Coll One' })
    ).toBeVisible();
    await expect(
      page.getByRole('menuitem', { name: 'Coll Two' })
    ).toBeVisible();
  });
});
