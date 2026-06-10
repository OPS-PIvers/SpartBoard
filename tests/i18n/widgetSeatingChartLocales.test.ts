/**
 * Regression test for missing widgets.seatingChart namespace in DE, ES, and FR.
 *
 * All 5 keys in widgets.seatingChart were absent from DE, ES, and FR — the
 * entire sub-namespace did not exist in those files.  The call sites in
 * components/widgets/SeatingChart/Widget.tsx use `defaultValue` fallbacks,
 * which silently mask the bug at runtime (non-EN users see English text
 * instead of translated text).
 *
 * The fix is to add proper translations to DE/ES/FR — NOT to rely on the
 * defaultValue band-aid.
 *
 * AFFECTED CALL SITES (components/widgets/SeatingChart/Widget.tsx):
 *   t('widgets.seatingChart.emptyStateAssignTitle',    { defaultValue: 'Empty Classroom' })          — line 967
 *   t('widgets.seatingChart.emptyStateAssignSubtitle', { defaultValue: 'Switch to "Setup" to arrange furniture.' }) — line 970
 *   t('widgets.seatingChart.emptyStateSetupTitle',     { defaultValue: 'No Furniture' })             — line 984
 *   t('widgets.seatingChart.emptyStateFreeform',       { defaultValue: 'Add furniture from the sidebar.' }) — line 989
 *   t('widgets.seatingChart.emptyStateTemplate',       { defaultValue: 'Pick a template and click Apply Layout.' }) — line 992
 *
 * These strings appear on the projected seating-chart widget face when the
 * classroom has no furniture placed, so they are visible to the entire class.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

const REQUIRED_SEATING_CHART_KEYS = [
  'emptyStateAssignTitle',
  'emptyStateAssignSubtitle',
  'emptyStateSetupTitle',
  'emptyStateFreeform',
  'emptyStateTemplate',
] as const;

// ─── EN baseline ─────────────────────────────────────────────────────────────

describe('EN locale — widgets.seatingChart baseline', () => {
  it('has a widgets.seatingChart section', () => {
    expect(en).toHaveProperty(['widgets', 'seatingChart']);
  });

  it('has all required widgets.seatingChart keys', () => {
    for (const key of REQUIRED_SEATING_CHART_KEYS) {
      expect(
        en.widgets.seatingChart,
        `en.widgets.seatingChart.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });
});

// ─── DE / ES / FR parity ─────────────────────────────────────────────────────

describe.each([
  { code: 'de', locale: de },
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
])('$code locale — widgets.seatingChart parity with EN', ({ code, locale }) => {
  it(`${code}: has a widgets.seatingChart section`, () => {
    expect(
      locale,
      `${code}.widgets.seatingChart section is entirely missing`
    ).toHaveProperty(['widgets', 'seatingChart']);
  });

  it(`${code}: has all required widgets.seatingChart keys`, () => {
    for (const key of REQUIRED_SEATING_CHART_KEYS) {
      expect(
        (locale as typeof en).widgets.seatingChart,
        `${code}.widgets.seatingChart.${key} is missing`
      ).toHaveProperty(key);
    }
  });
});
