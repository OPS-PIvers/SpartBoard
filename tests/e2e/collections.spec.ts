import { test, expect } from '@playwright/test';

test.describe('Collections feature', () => {
  test.beforeEach(async ({ page }) => {
    // Disable animations for stable selectors
    await page.addStyleTag({
      content:
        '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });

    await page.goto('/');

    // Wait for the dashboard to load (auth bypass auto-signs in)
    await expect(page.getByTitle('Open Menu')).toBeVisible({ timeout: 15000 });
  });

  test('create Collection, add Board, verify modal interaction', async ({
    page,
  }) => {
    // Open the sidebar
    await page.getByTitle('Open Menu').click();

    // Click "Boards & Collections" — opens BoardsModal directly and closes
    // the sidebar (no intermediate panel anymore). The Boards-prefixed
    // regex still matches "Boards & Collections" as a substring.
    await page
      .locator('nav button')
      .filter({ hasText: /Boards/i })
      .click();

    // The modal is open — it renders with role="dialog" and aria-labelledby="boards-modal-title"
    const modal = page.getByRole('dialog', { name: /boards/i });
    await expect(modal).toBeVisible({ timeout: 10000 });

    // ── Create a Collection ──────────────────────────────────────────────────

    // Click "New Collection" in the modal header
    await modal.getByRole('button', { name: /new collection/i }).click();

    // The showPrompt dialog appears — title "New Collection", input, "Create" button
    const promptDialog = page.getByRole('dialog', { name: /new collection/i });
    await expect(promptDialog).toBeVisible({ timeout: 5000 });

    // Fill the name and confirm
    await promptDialog.getByRole('textbox').fill('Math E2E');
    await promptDialog.getByRole('button', { name: /^create$/i }).click();

    // The collection should now appear in the left-hand tree.
    // Use .first() since "Math E2E" may also appear in the grid as a CollectionCard.
    await expect(modal.getByText('Math E2E').first()).toBeVisible({
      timeout: 5000,
    });

    // ── Select the new Collection ────────────────────────────────────────────

    // Click on the "Math E2E" tree node to select it (first occurrence = tree node)
    await modal.getByText('Math E2E').first().click();

    // ── Create a Board inside the Collection ─────────────────────────────────

    await modal.getByRole('button', { name: /new board/i }).click();

    const boardPromptDialog = page.getByRole('dialog', { name: /new board/i });
    await expect(boardPromptDialog).toBeVisible({ timeout: 5000 });

    await boardPromptDialog.getByRole('textbox').fill('Warm-up E2E');
    await boardPromptDialog.getByRole('button', { name: /^create$/i }).click();

    // The board should appear in the grid (BoardCard renders board.name as bold text)
    await expect(modal.getByText('Warm-up E2E')).toBeVisible({ timeout: 5000 });
  });
});
