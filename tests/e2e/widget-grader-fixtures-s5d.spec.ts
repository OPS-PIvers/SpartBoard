import { test, expect } from '@playwright/test';

// S5d fixture batch; kept apart from the pattern spec so parallel batches don't collide.
const WIDGETS = [
  'activity-wall',
  'blooms-detail',
  'blooms-taxonomy',
  'custom-widget',
  'first-5',
  'flashcards',
  'need-do-put-then',
  'projects',
  'review',
  'routineGuide',
  'soundboard',
  'stations',
  'url',
  'work-symbols',
];
const FIXTURES = ['empty', 'typical', 'stress'];
const SIZES = [
  { label: 'default size', query: '' },
  { label: '1400x900', query: '&w=1400&h=900' },
];

test.describe('widget grader fixtures: S5d', () => {
  for (const type of WIDGETS) {
    for (const fixture of FIXTURES) {
      for (const size of SIZES) {
        test(`${type} ${fixture} at ${size.label} renders with no errors`, async ({
          page,
        }) => {
          await page.goto(
            `/widget-grader-dev?type=${type}&fixture=${fixture}${size.query}`
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
