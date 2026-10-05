import { test, expect } from '@playwright/test';

const PATTERN_WIDGETS = [
  'clock',
  'checklist',
  'text',
  'random',
  'schedule',
  'poll',
];
const FIXTURES = ['empty', 'typical', 'stress'];

test.describe('widget grader harness', () => {
  for (const type of PATTERN_WIDGETS) {
    for (const fixture of FIXTURES) {
      test(`${type} ${fixture} renders with no errors`, async ({ page }) => {
        await page.goto(`/widget-grader-dev?type=${type}&fixture=${fixture}`);
        await expect(page.locator('[data-grader-ready="true"]')).toBeVisible();
        await expect(page.locator('[data-draggable-window]')).toHaveCount(1);
        const errors = await page.evaluate(() => window.__widgetGrader?.errors);
        expect(errors).toEqual([]);
      });
    }
  }
});
