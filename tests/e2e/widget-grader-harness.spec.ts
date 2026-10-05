import { test, expect } from '@playwright/test';

const PATTERN_WIDGETS = [
  'clock',
  'checklist',
  'text',
  'random',
  'schedule',
  'poll',
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
const LARGE = 'w=1400&h=900';

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

  for (const type of S5B_WIDGETS) {
    for (const fixture of FIXTURES) {
      for (const size of ['', `&${LARGE}`]) {
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
