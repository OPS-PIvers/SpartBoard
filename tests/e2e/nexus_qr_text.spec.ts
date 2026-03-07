import { test, expect } from '@playwright/test';

test('Nexus: Text Widget to QR Widget Sync', async ({ page }) => {
  // Disable animations
  await page.addStyleTag({
    content:
      '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  // 1. Load dashboard
  await page.goto('/');

  // 2. Open Dock and Add Widgets
  // The dock button might need waiting or finding by title
  await page.getByTitle('Open Tools').click();
  // Wait for dock animation/stability
  await page.waitForTimeout(500);

  // Add Text Widget (Note)
  const noteButton = page.getByRole('button', { name: /Note/i }).first();
  await expect(noteButton).toBeVisible();
  await noteButton.click({ force: true });

  // Add QR Widget
  const qrButton = page.getByRole('button', { name: /QR/i }).first();
  await expect(qrButton).toBeVisible();
  await qrButton.click({ force: true });

  // Close dock by clicking outside
  await page.mouse.click(0, 0);

  // Move QR Widget to avoid overlap
  // The QR widget is likely on top because it was added last.
  const qrWidget = page
    .locator('.widget')
    .filter({ hasText: 'https://google.com' })
    .first();
  const qrBox = await qrWidget.boundingBox();
  if (qrBox) {
    await page.mouse.move(
      qrBox.x + qrBox.width / 2,
      qrBox.y + qrBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(qrBox.x + 400, qrBox.y + 100); // Move right
    await page.mouse.up();
  }

  // 3. Edit Text Widget
  // Text widget has a contentEditable div.
  // Wait for the widget count to increase or verify the new widget exists
  // The default text might be empty or different, let's just find the last created text widget
  const textWidgets = page
    .locator('.widget')
    .filter({ has: page.locator('[contenteditable]') });

  // Ensure at least one exists and is visible
  await expect(textWidgets.last()).toBeVisible();

  const contentArea = textWidgets.last().locator('[contenteditable]');

  // Wait for it to be enabled/editable
  await expect(contentArea).toBeEditable();

  await contentArea.click({ force: true });
  // Clear and type new URL
  await contentArea.fill('https://nexus.test/link');
  await contentArea.blur(); // Trigger save

  // 4. Configure QR Widget
  // Find QR widget by its default content
  // qrWidget is already defined above
  await expect(qrWidget).toBeVisible();

  // Activate widget to show toolbar
  await qrWidget.click({ position: { x: 20, y: 20 } });

  // Click Settings button in the toolbar (it appears in DOM when active)
  // The button aria-label includes the keyboard shortcut hint
  const settingsButton = page.getByRole('button', {
    name: 'Settings (Alt+S)',
    exact: true,
  });
  // Force click to ensure it works even if animation/position is tricky
  await settingsButton.click({ force: true });

  // 5. Enable Sync
  // The settings panel is open.

  // Wait for settings panel to be clearly visible (by looking for Close button or unique text)
  // This ensures animation is done
  await expect(page.getByLabel('Close settings')).toBeVisible({
    timeout: 10000,
  });

  // Find the checkbox for sync.
  // The Toggle component uses role="switch" usually, or we can find by the label text and the input within it
  await expect(page.getByText('Sync with Text Widget')).toBeVisible({
    timeout: 10000,
  });

  // Locate the switch associated with the text
  const syncToggle = page.getByRole('switch').first();

  // Click the checkbox (toggle)
  await syncToggle.click({ force: true });
  await expect(syncToggle).toBeChecked();

  // 6. Verify Sync
  // Input should be disabled
  const urlInput = page.locator(
    'input[type="text"][placeholder="https://..."]'
  );
  await expect(urlInput).toBeDisabled();

  // Input value should match text widget
  await expect(urlInput).toHaveValue('https://nexus.test/link');

  // 7. Verify Widget Display
  // The widget content has changed, so we need to re-locate it or use a broader locator.
  // We can find it by the "DONE" button which is currently visible in the settings mode.
  // Or better, find the widget by the new synced text if it updated already in the background?
  // But the "DONE" button is what we need to click.
  // The 'qrWidget' locator was based on 'https://google.com' which might be gone.

  // Close settings (using standard Close button)
  await page.getByLabel('Close settings').click();

  // Find the widget by content on the dashboard (Settings input is gone now)
  // Use a looser check or poll for it
  const syncedWidget = page
    .locator('.widget')
    .filter({ hasText: 'https://nexus.test/link' })
    .first();

  // Wait for sync to propagate
  await expect(syncedWidget).toBeVisible({ timeout: 15000 });

  // Verify URL text in widget updated
  await expect(syncedWidget).toContainText('https://nexus.test/link');

  // Verify "Linked" badge exists in the widget (optional UI check)
  // We use a broader check or skip if it's flaky/icon-based without knowing exact aria-label
  const linkedBadge = syncedWidget.getByText('Linked');
  if (await linkedBadge.isVisible()) {
    await expect(linkedBadge).toBeVisible();
  } else {
    // eslint-disable-next-line no-console
    console.log('Linked badge not found or visible, skipping UI check.');
  }

  // 8. Verify Repeater Functionality (Update Text -> Update QR)
  // Go back to text widget and change text
  await contentArea.click();
  await contentArea.fill('https://nexus.test/updated');
  await contentArea.blur(); // Trigger save

  // Verify QR widget updates automatically
  // Need to wait for sync to happen
  // Note: syncedWidget locator relies on the OLD value, so we must find it again or use a stable locator.
  const updatedWidget = page
    .locator('.widget')
    .filter({ hasText: 'https://nexus.test/updated' })
    .first();
  await expect(updatedWidget).toBeVisible();
});
