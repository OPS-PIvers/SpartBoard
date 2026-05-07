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
    await page.getByTitle('Open Menu').click();
    await expect(page.getByText('SpartBoard', { exact: true })).toBeVisible();
    // Use a specific locator for the Sidebar Boards button to avoid ambiguity with the Dock button
    await page
      .locator('nav button')
      .filter({ hasText: /Boards/i })
      .click();
    await expect(page.getByText('My Boards')).toBeVisible();

    const boardCard = page
      .locator('.group.relative')
      .filter({ has: page.getByTitle('Share') })
      .first();
    await expect(boardCard).toBeVisible();
    await boardCard.hover();

    const shareButton = boardCard.getByTitle('Share');
    await expect(shareButton).toBeVisible();

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

    // Force click to ensure it registers even if there are layout shifts
    await shareButton.click({ force: true });

    // Share now opens `ShareLinkCreatorModal` (host picks a mode, then
    // clicks "Create link"). Wait for the modal then click through.
    await expect(
      page.getByRole('heading', { name: 'Share board' })
    ).toBeVisible({
      timeout: 15000,
    });
    // The default "Synced" mode is fine for this test — no need to click a
    // mode option first.
    await page.getByRole('button', { name: /create link/i }).click();

    // The result panel shows the URL in an input (aria-label "Share link
    // URL"). Wait for it to appear AND validate the URL shape directly on
    // the input — the input's value is the source of truth and works even
    // when the clipboard mock fails to capture the auto-copy. This
    // replaces the legacy "Link copied" toast assertion.
    const shareUrlInput = page.getByLabel('Share link URL');
    await expect(shareUrlInput).toBeVisible({ timeout: 15000 });
    await expect(shareUrlInput).toHaveValue(/\/share\//, { timeout: 15000 });

    // Prefer the clipboard-mock value when present (covers the auto-copy
    // path); fall back to reading the input directly so the import
    // roundtrip below always has a URL to navigate to.
    if (!clipboardText) {
      clipboardText = await shareUrlInput.inputValue();
    }
    expect(clipboardText).toContain('/share/');

    // Visit the share URL. The recipient flow is the new
    // `ImportShareModePicker` in confirmation mode (the host already
    // chose "synced" by default in `ShareLinkCreatorModal`), so the
    // dialog shows heading "Import shared board" and a single primary
    // action button labelled "Import synced board" — not the legacy
    // 3-option picker.
    const shareUrl = clipboardText;
    // eslint-disable-next-line no-console
    console.log('Share URL:', shareUrl);

    await page.goto(shareUrl);

    const importHeading = page.getByRole('heading', {
      name: 'Import shared board',
    });
    await expect(importHeading).toBeVisible({ timeout: 15000 });

    // Default host mode is "synced" → button text is "Import synced board".
    await page.getByRole('button', { name: /import synced board/i }).click();

    // Modal dismisses on import success.
    await expect(importHeading).not.toBeVisible();

    await page.getByTitle('Open Menu').click();
    await page
      .locator('nav button')
      .filter({ hasText: /Boards/i })
      .click();

    // The imported board's name carries a " (Synced)" suffix (see
    // `importSharedBoard` in DashboardContext.tsx). Use the suffix as
    // the locator so the assertion doesn't depend on the source board's
    // name.
    await expect(
      page
        .locator('.group.relative')
        .filter({ hasText: /\(Synced\)/ })
        .first()
    ).toBeVisible({ timeout: 15000 });
  });
});
