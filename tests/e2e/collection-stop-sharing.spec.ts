import { test, expect, type Page } from '@playwright/test';

// COLLECTION_SHARING slice 5: the host stops a Synced collection share from the collection menu.

const openBoards = async (page: Page) => {
  const modal = page.getByRole('dialog', { name: /boards/i });
  if (!(await modal.isVisible())) {
    await page.getByTitle('Open Menu').click();
    await page
      .locator('nav button')
      .filter({ hasText: /Boards/i })
      .click();
  }
  await expect(modal).toBeVisible({ timeout: 5000 });
  return modal;
};

const openCollectionMenu = async (page: Page, name: string) => {
  const modal = await openBoards(page);
  await modal.getByText(/^all boards$/i).click();
  const card = modal.locator('.group').filter({ hasText: name }).first();
  await expect(card).toBeVisible({ timeout: 5000 });
  await card.click({ button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible({ timeout: 5000 });
  return menu;
};

test.describe('Collections: Stop sharing a Synced collection', () => {
  test.beforeEach(async ({ page }) => {
    await page.addStyleTag({
      content:
        '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });
    await page.goto('/');
    await expect(page.getByTitle('Open Menu')).toBeVisible({ timeout: 15000 });
  });

  test('host shares Synced, then stops sharing from the menu', async ({
    page,
  }) => {
    const modal = await openBoards(page);
    await modal.getByRole('button', { name: /new collection/i }).click();
    const cPrompt = page.getByRole('dialog', { name: /new collection/i });
    await cPrompt.getByRole('textbox').fill('Stop Test Coll');
    await cPrompt.getByRole('button', { name: /^create$/i }).click();
    await page.keyboard.press('Escape');
    await modal.getByText('Stop Test Coll').first().click();
    await modal.getByRole('button', { name: /new board/i }).click();
    const bPrompt = page.getByRole('dialog', { name: /new board/i });
    await bPrompt.getByRole('textbox').fill('Stop-A');
    await bPrompt.getByRole('button', { name: /^create$/i }).click();

    let menu = await openCollectionMenu(page, 'Stop Test Coll');
    await expect(
      menu.getByRole('menuitem', { name: /^stop sharing$/i })
    ).toHaveCount(0);
    await menu.getByRole('menuitem', { name: /share collection/i }).click();

    const shareDialog = page.getByRole('dialog', { name: /share collection/i });
    await expect(shareDialog).toBeVisible({ timeout: 5000 });
    await shareDialog.getByRole('button', { name: /^synced/i }).click();
    await shareDialog.getByRole('button', { name: /create link/i }).click();
    const urlInput = shareDialog.getByLabel('Share collection URL');
    await expect(urlInput).toHaveValue(/\/share\/collection\//, {
      timeout: 10000,
    });
    await page.keyboard.press('Escape');

    menu = await openCollectionMenu(page, 'Stop Test Coll');
    await expect(
      menu.getByRole('menuitem', { name: /leave shared collection/i })
    ).toHaveCount(0);
    await menu.getByRole('menuitem', { name: /^stop sharing$/i }).click();

    const confirm = page.getByRole('dialog').filter({
      hasText: /stop sharing this collection\?/i,
    });
    await expect(confirm).toBeVisible({ timeout: 5000 });
    await confirm.getByRole('button', { name: /^stop sharing$/i }).click();
    await expect(page.getByText('Stopped sharing').first()).toBeVisible({
      timeout: 10000,
    });

    // Ended: the menu offers sharing again, not Stop sharing.
    menu = await openCollectionMenu(page, 'Stop Test Coll');
    await expect(
      menu.getByRole('menuitem', { name: /^stop sharing$/i })
    ).toHaveCount(0);
    await expect(
      menu.getByRole('menuitem', { name: /share collection/i })
    ).toBeVisible();
  });
});
