/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { test, expect } from '@playwright/test';

test.describe('Board Sharing', () => {
  test.beforeEach(async ({ page }) => {
    // eslint-disable-next-line no-console
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);
    // Disable animations and transitions for more stable tests
    await page.addStyleTag({
      content:
        '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });
    await page.goto('/');

    // Wait for initial loading to finish
    await expect(page.locator('.animate-spin').first()).not.toBeVisible({
      timeout: 15000,
    });

    const dashboardVisible = await page.getByTitle('Open Menu').isVisible();
    if (!dashboardVisible) {
      const signInButton = page.getByRole('button', { name: /sign in/i });
      if (await signInButton.isVisible()) {
        await signInButton.click();
      }
    }
    await expect(page.getByTitle('Open Menu')).toBeVisible({ timeout: 15000 });
  });

  test('can share and import a board', async ({ page }) => {
    // Open the sidebar, then the Boards panel, then "Manage all boards"
    // (the new flow — old inline SidebarBoards list with per-card Share
    // buttons was replaced by SidebarBoardsActive + BoardsModal).
    await page.getByTitle('Open Menu').click();
    await expect(page.getByText('SpartBoard', { exact: true })).toBeVisible();
    await page
      .locator('nav button')
      .filter({ hasText: /Boards/i })
      .click();

    const manageAllButton = page
      .locator('button')
      .filter({ hasText: /manage all boards/i });
    await expect(manageAllButton).toBeVisible({ timeout: 5000 });
    await manageAllButton.click();

    const modal = page.getByRole('dialog', { name: /boards/i });
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Locate a Board card in the modal grid. BoardCard renders the board
    // name as bold text inside a `.group` card; we pick the first one and
    // right-click to open its context menu (which contains "Share…").
    const firstBoardCard = modal.locator('.group').first();
    await expect(firstBoardCard).toBeVisible({ timeout: 10000 });

    let clipboardText = '';
    await page.exposeFunction('mockWriteText', (text: string) => {
      clipboardText = text;
    });
    await page.addInitScript(() => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText = (text) =>
          (window as any).mockWriteText(text);
      } else {
        (navigator as any).clipboard = {
          writeText: (text: string) => (window as any).mockWriteText(text),
        };
      }
    });

    await firstBoardCard.click({ button: 'right' });

    // Click the "Share…" item in the BoardContextMenu.
    await page.getByRole('button', { name: /share/i }).first().click();

    // ShareLinkCreatorModal opens. Default mode is "Synced" — just hit
    // "Create link".
    await expect(
      page.getByRole('heading', { name: 'Share board' })
    ).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: /create link/i }).click();

    // The result panel shows the URL in an input (aria-label "Share link
    // URL"). Validate the URL shape directly on the input — the input's
    // value is the source of truth even when the clipboard mock fails.
    const shareUrlInput = page.getByLabel('Share link URL');
    await expect(shareUrlInput).toBeVisible({ timeout: 15000 });
    await expect(shareUrlInput).toHaveValue(/\/share\//, { timeout: 15000 });

    if (!clipboardText) {
      clipboardText = await shareUrlInput.inputValue();
    }
    expect(clipboardText).toContain('/share/');

    // Visit the share URL. The recipient flow is `ImportShareModePicker`
    // in confirmation mode (host already chose "synced" by default), so
    // the dialog shows "Import shared board" + "Import synced board".
    const shareUrl = clipboardText;
    // eslint-disable-next-line no-console
    console.log('Share URL:', shareUrl);

    await page.goto(shareUrl);

    const importHeading = page.getByRole('heading', {
      name: 'Import shared board',
    });
    await expect(importHeading).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /import synced board/i }).click();

    // Modal dismisses on import success.
    await expect(importHeading).not.toBeVisible();

    // After import the imported board's name carries a "(Synced)" suffix
    // (see `importSharedBoard` in DashboardContext.tsx). It shows up in
    // the SidebarBoardsActive picker (root collection).
    await page.getByTitle('Open Menu').click();
    await page
      .locator('nav button')
      .filter({ hasText: /Boards/i })
      .click();

    await expect(page.getByText(/\(Synced\)/).first()).toBeVisible({
      timeout: 15000,
    });
  });
});
