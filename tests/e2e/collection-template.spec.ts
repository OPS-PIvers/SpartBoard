import { test, expect } from '@playwright/test';

test.describe('Collections — save + instantiate via template (Plan 4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addStyleTag({
      content:
        '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });
    await page.goto('/');
    await expect(page.getByTitle('Open Menu')).toBeVisible({ timeout: 15000 });
  });

  test('admin saves a Collection as template and instantiates it from the picker', async ({
    page,
  }) => {
    // This test involves several sequential modal interactions; allow up to 60s.
    test.setTimeout(60000);
    // 1. Open BoardsModal
    await page.getByTitle('Open Menu').click();
    // "Boards & Collections" opens the BoardsModal directly (no
    // intermediate sidebar panel anymore).
    await page
      .locator('nav button')
      .filter({ hasText: /Boards/i })
      .click();
    const modal = page.getByRole('dialog', { name: /boards/i });
    await expect(modal).toBeVisible({ timeout: 10000 });

    // 2. Create Collection "Plan 4 Test". BoardsModal auto-opens the
    //    CollectionColorPicker after each successful create — dismiss it
    //    with Escape so it doesn't block subsequent modal interactions.
    await modal.getByRole('button', { name: /new collection/i }).click();
    const cPrompt = page.getByRole('dialog', { name: /new collection/i });
    await cPrompt.getByRole('textbox').fill('Plan 4 Test');
    await cPrompt.getByRole('button', { name: /^create$/i }).click();
    await page.keyboard.press('Escape');

    // 3. Open the Collection and add 2 Boards
    await modal.getByText('Plan 4 Test').first().click();
    for (const name of ['Welcome', 'Math']) {
      await modal.getByRole('button', { name: /new board/i }).click();
      const bPrompt = page.getByRole('dialog', { name: /new board/i });
      await bPrompt.getByRole('textbox').fill(name);
      await bPrompt.getByRole('button', { name: /^create$/i }).click();
      // Verify each board appears in the grid
      await expect(modal.getByText(name).first()).toBeVisible({
        timeout: 5000,
      });
    }

    // 4. Navigate back to root so the CollectionCard appears in the grid.
    //    The sidebar's root node is now labeled simply "All Boards".
    await modal.getByText(/^all boards$/i).click();
    const collCard = modal
      .locator('.group')
      .filter({ hasText: 'Plan 4 Test' })
      .first();
    await expect(collCard).toBeVisible({ timeout: 5000 });

    // 5. Right-click the CollectionCard → "Save as Template…"
    await collCard.click({ button: 'right' });
    const ctxMenu = page.getByRole('menu');
    await expect(ctxMenu).toBeVisible({ timeout: 5000 });
    await ctxMenu.getByRole('menuitem', { name: /save as template/i }).click();

    // 6. Verify modal title
    const saveDialog = page.getByRole('dialog', {
      name: /save collection as template/i,
    });
    await expect(saveDialog).toBeVisible({ timeout: 5000 });

    // 7. Fill template name and save
    await saveDialog
      .getByPlaceholder(/e\.g\. Morning Routine/i)
      .fill('Plan 4 Template');
    await saveDialog
      .getByRole('button', { name: /save new template/i })
      .click();

    // 8. Verify success message
    await expect(
      saveDialog.getByText(/Plan 4 Template.*saved|saved.*Plan 4 Template/i)
    ).toBeVisible({ timeout: 5000 });

    // 9. Close the Save modal by clicking its backdrop (the outer dialog div
    //    has onClick=onClose; Escape would also dismiss the underlying
    //    BoardsModal via its own document-level Escape listener; toasts can
    //    cover the X button).
    await saveDialog.click({ position: { x: 10, y: 10 } });
    await expect(saveDialog).not.toBeVisible({ timeout: 5000 });

    // 10. Click "+ from Template" in the header.
    //     Drive-session error toasts (persistent 10s) can overlay the header
    //     button and intercept pointer events even with force: true (the click
    //     still hits the topmost element at the button's coordinates). Use
    //     dispatchEvent on the button element directly to bypass z-index.
    await page.waitForSelector(
      '[role="dialog"][aria-labelledby="boards-modal-title"] button:has-text("from Template")',
      { timeout: 5000 }
    );
    await page.evaluate(() => {
      const dialog = document.querySelector(
        '[role="dialog"][aria-labelledby="boards-modal-title"]'
      );
      if (!dialog) return;
      const btn = Array.from(dialog.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('from Template')
      );
      if (btn) btn.click();
    });

    // 11. Verify picker shows "Create from Template" and the saved template.
    //     The modal title is rendered in an h3; the dialog uses aria-label.
    //     Wait for the heading text and the template entry to appear.
    await expect(page.getByText(/create from template/i).first()).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.getByRole('button', { name: /plan 4 template/i })
    ).toBeVisible({ timeout: 5000 });

    // 12. Click the template row to instantiate it
    await page.getByRole('button', { name: /plan 4 template/i }).click();

    // 13. Picker heading disappears; a second "Plan 4 Test" Collection appears.
    //     Each Collection renders in both the sidebar tree AND the grid card —
    //     so 2 collections × 2 occurrences = 4 total text matches. Verify
    //     that at least 2 grid cards for the collection name now exist.
    await expect(
      page.getByText(/create from template/i).first()
    ).not.toBeVisible({ timeout: 10000 });
    // The Collection name "Plan 4 Test" appears in both the tree and grid;
    // 2 collections → at least 4 total text occurrences.
    await expect(modal.getByText('Plan 4 Test')).toHaveCount(4, {
      timeout: 10000,
    });
  });
});
