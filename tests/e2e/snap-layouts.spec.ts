import { test, expect } from '@playwright/test';

test('Snap Layouts verification', async ({ page }) => {
  // Set a standard viewport to make mathematical assertions predictable
  await page.setViewportSize({ width: 1280, height: 720 });

  await test.step('Navigating to dashboard', async () => {
    await page.goto('/');
    await page.waitForSelector('#dashboard-root', { timeout: 30000 });
  });

  const widget = page.locator('.widget').first();
  const dragSurface = widget.locator('[data-testid="drag-surface"]');

  await test.step('Add Note widget and position it', async () => {
    const noteButton = page.locator('button[data-tool-id="text"]');
    const openToolsButton = page.locator('button[aria-label="Open Tools"]');

    if (await openToolsButton.isVisible()) {
      await openToolsButton.click();
    }

    await expect(noteButton).toBeVisible();
    await noteButton.evaluate((el) => (el as HTMLElement).click());
    await expect(widget).toBeVisible();

    await widget.evaluate((el) => {
      el.style.left = '400px';
      el.style.top = '200px';
    });
  });

  const snapLayoutButton = page.locator('button[aria-label="Snap Layout"]');

  await test.step('Open Snap Layout menu', async () => {
    await dragSurface.evaluate((el) => (el as HTMLElement).click());

    const expandButton = page.locator('button[aria-label="Expand Toolbar"]');
    if (await expandButton.isVisible()) {
      await expandButton.click();
    }

    await expect(snapLayoutButton).toBeVisible({ timeout: 10000 });
    await snapLayoutButton.evaluate((el) => (el as HTMLElement).click());
    await expect(page.locator('text=Choose Layout')).toBeVisible();
  });

  await test.step('Snap to Left Half', async () => {
    const firstLayoutZone = page.locator(
      'button[aria-label*="Snap to Split Screen - left-half"]'
    );
    await firstLayoutZone.evaluate((el) => (el as HTMLElement).click());

    // Verify widget position/size reaches expected bounds
    await expect(async () => {
      const box = await widget.boundingBox();
      if (!box) throw new Error('Bounding box not found');
      expect(Math.round(box.x)).toBe(16);
      expect(Math.round(box.width)).toBe(618);
    }).toPass();
  });

  await test.step('Snap to Bottom half', async () => {
    await dragSurface.evaluate((el) => (el as HTMLElement).click());
    await snapLayoutButton.evaluate((el) => (el as HTMLElement).click());
    const bottomZone = page.locator(
      'button[aria-label*="Snap to Top/Bottom - bottom"]'
    );
    await bottomZone.evaluate((el) => (el as HTMLElement).click());

    // Verify widget position/size reaches expected bounds
    // Note: DOCK_HEIGHT might be dynamic (56px if collapsed, 100px if expanded)
    await expect(async () => {
      const box = await widget.boundingBox();
      if (!box) throw new Error('Bounding box not found');

      const dock = page.locator('[data-testid="dock"]');
      const dockBox = await dock.boundingBox();
      const dockHeight = dockBox?.height ?? 100;

      // PADDING=16, GAP=12
      const safeHeight = 720 - dockHeight - 32;
      const expectedY = Math.round(16 + 0.5 * safeHeight + 6);
      const expectedH = Math.round(0.5 * safeHeight - 6);

      expect(Math.round(box.y)).toBe(expectedY);
      expect(Math.round(box.height)).toBe(expectedH);
    }).toPass();
  });

  await test.step('Drag-to-Edge detection', async () => {
    const boxCurrent = await widget.boundingBox();
    if (!boxCurrent) throw new Error('Widget bounding box not found');
    await page.mouse.move(boxCurrent.x + 50, boxCurrent.y + 10);
    await page.mouse.down();
    await page.mouse.move(1275, 300, { steps: 10 });

    const preview = page.getByTestId('snap-preview');
    await expect(preview).toBeVisible();

    await page.mouse.up();

    await expect(async () => {
      const box = await widget.boundingBox();
      if (!box) throw new Error('Bounding box not found');
      expect(Math.round(box.x)).toBe(646);
      expect(Math.round(box.width)).toBe(618);
    }).toPass();
  });
});
