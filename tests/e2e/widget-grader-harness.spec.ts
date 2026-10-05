import { test, expect } from '@playwright/test';

const PATTERN_WIDGETS = [
  'clock',
  'checklist',
  'text',
  'random',
  'schedule',
  'poll',
];
const BATCH_3_WIDGETS = [
  'blending-board',
  'car-rider-pro',
  'concept-web',
  'graphic-organizer',
  'guided-learning',
  'hotspot-image',
  'music',
  'numberLine',
  'reveal-grid',
  'specialist-schedule',
  'starter-pack',
  'syntax-framer',
  'video-activity',
];
const FIXTURES = ['empty', 'typical', 'stress'];

test.describe('widget grader harness', () => {
  for (const type of [...PATTERN_WIDGETS, ...BATCH_3_WIDGETS]) {
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
