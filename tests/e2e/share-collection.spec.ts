import { test, expect } from '@playwright/test';

test.describe('Collections — share + import (Copy mode)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addStyleTag({
      content:
        '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });
    await page.goto('/');
    await expect(page.getByTitle('Open Menu')).toBeVisible({ timeout: 15000 });
  });

  test('host shares a Collection in Copy mode + recipient imports it', async ({
    page,
  }) => {
    // 1. Create a Collection with 2 Boards
    await page.getByTitle('Open Menu').click();
    // "Boards & Collections" opens the BoardsModal directly.
    await page
      .locator('nav button')
      .filter({ hasText: /Boards/i })
      .click();
    const modal = page.getByRole('dialog', { name: /boards/i });

    await modal.getByRole('button', { name: /new collection/i }).click();
    const cPrompt = page.getByRole('dialog', { name: /new collection/i });
    await cPrompt.getByRole('textbox').fill('Share Test Coll');
    await cPrompt.getByRole('button', { name: /^create$/i }).click();
    await modal.getByText('Share Test Coll').first().click();

    for (const name of ['Share-A', 'Share-B']) {
      await modal.getByRole('button', { name: /new board/i }).click();
      const bPrompt = page.getByRole('dialog', { name: /new board/i });
      await bPrompt.getByRole('textbox').fill(name);
      await bPrompt.getByRole('button', { name: /^create$/i }).click();
    }

    // 2. Navigate back to root so the CollectionCard appears in the grid.
    //    CollectionCards render when their parent collection is selected; "Share
    //    Test Coll" is at root (parentCollectionId = null), so select root first.
    //    The root node is the "All Boards" item in the tree panel.
    await modal.getByText(/^all boards$/i).click();

    // Right-click the CollectionCard in the grid to get the CollectionContextMenu.
    // CollectionCard renders as div.group with the collection name in bold text.
    const collCard = modal
      .locator('.group')
      .filter({ hasText: 'Share Test Coll' })
      .first();
    await expect(collCard).toBeVisible({ timeout: 5000 });
    await collCard.click({ button: 'right' });
    const ctxMenu = page.getByRole('menu');
    await expect(ctxMenu).toBeVisible({ timeout: 5000 });
    await ctxMenu.getByRole('menuitem', { name: /share collection/i }).click();

    // 3. Share creator opens; default mode is Copy → Create link
    const shareDialog = page.getByRole('dialog', { name: /share collection/i });
    await expect(shareDialog).toBeVisible({ timeout: 5000 });
    await shareDialog.getByRole('button', { name: /create link/i }).click();

    // 4. URL appears
    const urlInput = shareDialog.getByLabel('Share collection URL');
    await expect(urlInput).toBeVisible({ timeout: 10000 });
    await expect(urlInput).toHaveValue(/\/share-collection\//);
    const shareUrl = await urlInput.inputValue();
    // Dismiss via Escape — success toast may overlap the Done button
    await page.keyboard.press('Escape');

    // 5. Visit the share URL → import modal appears
    await page.goto(shareUrl);
    const importDialog = page.getByRole('dialog', {
      name: /import shared collection/i,
    });
    await expect(importDialog).toBeVisible({ timeout: 10000 });
    await expect(importDialog.getByText('Share Test Coll')).toBeVisible();

    // 6. Click Import
    await importDialog
      .getByRole('button', { name: /^import collection$/i })
      .click();

    // 7. Modal dismisses, user lands on imported Collection's first Board
    await expect(importDialog).not.toBeVisible({ timeout: 10000 });
    // The imported boards carry "(Imported)" suffix
    await expect(page.getByText(/Share-A \(Imported\)/i).first()).toBeVisible({
      timeout: 10000,
    });
  });
});
