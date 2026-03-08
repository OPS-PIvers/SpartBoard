/* eslint-disable no-console */
import { test, expect } from '@playwright/test';

test('Snap Layouts verification', async ({ page }) => {
  // Set a standard viewport to make mathematical assertions predictable
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.goto('http://localhost:3000/?auth_bypass=true');

  // Wait for dashboard to load
  await page.waitForSelector('#dashboard-root', { timeout: 30000 });

  // 1. Create a widget (Using Note/Text widget as it has more safe space for clicking)
  console.log('Adding Note widget...');
  const noteButton = page.locator('button[data-tool-id="text"]');
  const openToolsButton = page.locator('button[aria-label="Open Tools"]');

  if (await openToolsButton.isVisible()) {
    await openToolsButton.click();
  }

  await expect(noteButton).toBeVisible();
  // dnd-kit adds aria-disabled="true" when not in edit mode, which can confuse Playwright.
  await noteButton.evaluate((el) => (el as HTMLElement).click());

  // Find the widget
  const widget = page.locator('.widget').first();
  await expect(widget).toBeVisible();

  // 1.5 Move widget to center to ensure popovers are in viewport
  // We use evaluate to move it directly to avoid any drag interference with subsequent clicks
  console.log('Moving widget to center...');
  await widget.evaluate((el) => {
    el.style.left = '400px';
    el.style.top = '200px';
  });
  await page.waitForTimeout(500);

  // 2. Open the tool menu
  console.log('Opening tool menu...');
  // Click the drag surface specifically, as it's the safe area for window interactions
  const dragSurface = widget.locator('[data-testid="drag-surface"]');
  await dragSurface.evaluate((el) => (el as HTMLElement).click());

  // The toolbar might be collapsed by default. Expand it.
  const expandButton = page.locator('button[aria-label="Expand Toolbar"]');
  if (await expandButton.isVisible()) {
    await expandButton.click();
  }

  // Wait for the tool menu (portal)
  const snapLayoutButton = page.locator('button[aria-label="Snap Layout"]');
  await expect(snapLayoutButton).toBeVisible({ timeout: 10000 });

  // 3. Open the Snap Layout menu
  console.log('Opening Snap Layout menu...');
  // Use evaluate to bypass potential interceptions and viewport clipping
  await snapLayoutButton.evaluate((el) => (el as HTMLElement).click());

  const snapMenu = page.locator('text=Choose Layout');
  await expect(snapMenu).toBeVisible();

  // 4. Click a snap zone (e.g., Left Half of Split Screen)
  console.log('Snapping to Left Half...');
  const firstLayoutZone = page.locator(
    'button[aria-label*="Snap to Split Screen - left-half"]'
  );

  // Note: On small viewports or high-density layouts, the button might be "visible"
  // but clipped by a container's overflow or the viewport itself.
  // Evaluate click bypasses viewport visibility checks.
  await firstLayoutZone.evaluate((el) => (el as HTMLElement).click());

  // Wait for snap to apply
  await page.waitForTimeout(500);

  // Verify widget position/size (EXACT match for left half)
  const box = await widget.boundingBox();
  if (box) {
    // Playwright default viewport is 1280x720
    // PADDING=16, GAP=12, DOCK_HEIGHT=100
    // safeWidth = 1280 - 32 = 1248
    // zone.w = 0.5 -> rawW = 624
    // gap calculation: rawW - GAP/2 = 624 - 6 = 618
    const x = Math.round(box.x);
    const w = Math.round(box.width);
    expect(x).toBe(16);
    expect(w).toBe(618);
  }

  // 4.5. Test a new layout (e.g. Top/Bottom - bottom)
  console.log('Snapping to Bottom half...');
  await dragSurface.evaluate((el) => (el as HTMLElement).click());
  await snapLayoutButton.evaluate((el) => (el as HTMLElement).click());
  const bottomZone = page.locator(
    'button[aria-label*="Snap to Top/Bottom - bottom"]'
  );
  await bottomZone.evaluate((el) => (el as HTMLElement).click());
  await page.waitForTimeout(500);

  const boxBottom = await widget.boundingBox();
  if (boxBottom) {
    // safeHeight = 720 - 100 - 32 = 588
    // y = PADDING + 0.5*safeHeight + GAP/2 = 16 + 294 + 6 = 316
    // h = 294 - 6 = 288
    const y = Math.round(boxBottom.y);
    const h = Math.round(boxBottom.height);
    expect(y).toBe(316);
    expect(h).toBe(288);
  }

  // 5. Test Drag-to-Edge Detection
  console.log('Testing Drag-to-Edge...');

  // Drag to right edge
  const boxCurrent = await widget.boundingBox();
  if (!boxCurrent) throw new Error('Widget bounding box not found');
  await page.mouse.move(boxCurrent.x + 50, boxCurrent.y + 10);
  await page.mouse.down();
  await page.mouse.move(1275, 300, { steps: 10 });

  // Check if preview overlay exists
  const preview = page.locator('div.fixed.bg-indigo-500\\/20');
  await expect(preview).toBeVisible();

  // Release to snap
  await page.mouse.up();
  await page.waitForTimeout(500);

  // Verify widget is now on the right with EXACT snapped bounds
  const boxRight = await widget.boundingBox();
  if (boxRight) {
    // x = PADDING + 0.5*safeWidth + GAP/2 = 16 + 624 + 6 = 646
    // w = 624 - 6 = 618
    const x = Math.round(boxRight.x);
    const w = Math.round(boxRight.width);
    expect(x).toBe(646);
    expect(w).toBe(618);
  }
});
