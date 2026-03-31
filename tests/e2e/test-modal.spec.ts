import { test, expect } from '@playwright/test';

test('open layout modal via specific button', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  const signInButton = page.locator('button:has-text("Sign in with Google")');
  if (await signInButton.isVisible()) {
    await signInButton.click();
  }
  await page.waitForTimeout(1000);

  // Click the clock tool
  await page.locator('[data-tool-id="clock"]').click({ force: true });
  await page.waitForTimeout(1000);

  // Find the widget container
  const widget = page.locator('.react-draggable').first();
  await widget.hover(); // Hover over widget to show toolbar

  // Try to find any SVG or Lucide icon buttons
  // There are some buttons in the toolbar. One of them might be layout.
  await page.evaluate(() => {
    // Look at elements in the widget window wrapper toolbar
    const toolbar = document.querySelector('.react-draggable');
    if (toolbar) {
      // Find buttons in the header area (often has bg-slate-100 or is absolute)
      const buttons = toolbar.querySelectorAll('button');
      buttons.forEach(b => {
        // usually layout button is one of the last ones before settings/close
        // print them out
        console.log("Widget button: ", b.outerHTML);
      });
    }
  });

  // The actual layout popup might be in DraggableWindow.tsx
  // Let's click on a button that has "Snap" or "Layout" in title or aria-label, if it exists, or just use mouse down
  const snapBtn = page.locator('button[title*="Snap"]');
  if (await snapBtn.count() > 0) {
    await snapBtn.first().click({ force: true });
  } else {
    // Just click all buttons in the widget toolbar until one opens a dropdown
    const buttons = widget.locator('button');
    const cnt = await buttons.count();
    for (let i = 0; i < cnt; i++) {
        await buttons.nth(i).click({ force: true });
        await page.waitForTimeout(500);
        // see if .group or some layout popup appeared
        const popups = await page.locator('.group').count();
        if (popups > 5) break; // layout modal has many layout groups
    }
  }

  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/jules/verification/widget-layouts4.png' });
});
