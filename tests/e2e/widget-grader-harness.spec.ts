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
const S5B_WIDGETS = [
  'breathing',
  'catalyst',
  'catalyst-instruction',
  'catalyst-visual',
  'countdown',
  'mathTool',
  'mathTools',
  'nextUp',
  'onboarding',
  'pdf',
  'quiz',
  'recessGear',
  'seating-chart',
  'smartNotebook',
  'stickers',
  'talking-tool',
];
const FIXTURES = ['empty', 'typical', 'stress'];

const S5A_WIDGETS = [
  'calendar',
  'classes',
  'dice',
  'drawing',
  'embed',
  'expectations',
  'instructionalRoutines',
  'lunchCount',
  'materials',
  'miniApp',
  'qr',
  'scoreboard',
  'sound',
  'time-tool',
  'traffic',
  'weather',
  'webcam',
];
const BIG = '&w=1400&h=900';

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

  for (const type of [...S5A_WIDGETS, ...S5B_WIDGETS, ...BATCH_3_WIDGETS]) {
    for (const fixture of FIXTURES) {
      for (const size of ['', BIG]) {
        test(`${type} ${fixture}${size ? ' at 1400x900' : ''} renders with no errors`, async ({
          page,
        }) => {
          await page.goto(
            `/widget-grader-dev?type=${type}&fixture=${fixture}${size}`
          );
          await expect(
            page.locator('[data-grader-ready="true"]')
          ).toBeVisible();
          await expect(page.locator('[data-draggable-window]')).toHaveCount(1);
          const errors = await page.evaluate(
            () => window.__widgetGrader?.errors
          );
          expect(errors).toEqual([]);
        });
      }
    }
  }
});
