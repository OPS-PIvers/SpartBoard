/**
 * Regression test for the missing widgets.lunchCount sub-namespace in DE, ES,
 * and FR locales.
 *
 * The `widgets.lunchCount` namespace was added to EN when the Lunch Count widget
 * received Nutrislice integration, but the entire namespace was never propagated
 * to DE, ES, or FR.
 *
 * Affected call sites that use these keys WITHOUT a `defaultValue` fallback:
 *
 *   components/widgets/LunchCount/useNutrislice.ts
 *     t('widgets.lunchCount.noHotLunch')    — lines 148, 284, 307
 *     t('widgets.lunchCount.noBentoBox')    — lines 149, 285, 308
 *     t('widgets.lunchCount.syncSuccess')   — line 269
 *     t('widgets.lunchCount.syncError')     — line 318
 *
 *   components/widgets/LunchCount/Widget.tsx
 *     t('widgets.lunchCount.hotLunch')      — line 573
 *
 * When a German, Spanish, or French user has the Lunch Count widget open, every
 * one of these strings renders as the raw key path (e.g.
 * "widgets.lunchCount.syncError") instead of a translated or even English
 * string.  The toast shown after a sync attempt and the "Hot Lunch" label
 * visible on the widget face are both affected.
 *
 * This test loads each locale JSON directly so the assertion fires even before
 * the i18next runtime would attempt (and silently skip) the fallback.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

/**
 * Keys within widgets.lunchCount that are called via t() without a
 * defaultValue fallback — meaning non-EN users see raw key paths in the UI.
 */
const REQUIRED_LUNCH_COUNT_KEYS = [
  'syncSuccess',
  'syncError',
  'noHotLunch',
  'noBentoBox',
  'hotLunch',
] as const;

// ─── EN baseline ─────────────────────────────────────────────────────────────

describe('EN locale — widgets.lunchCount baseline', () => {
  it('has a widgets.lunchCount section', () => {
    expect(en).toHaveProperty(['widgets', 'lunchCount']);
  });

  it('has all required widgets.lunchCount keys', () => {
    for (const key of REQUIRED_LUNCH_COUNT_KEYS) {
      expect(
        en.widgets.lunchCount,
        `en.widgets.lunchCount.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });
});

// ─── DE / ES / FR parity ─────────────────────────────────────────────────────

describe.each([
  { code: 'de', locale: de },
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
])('$code locale — widgets.lunchCount parity with EN', ({ code, locale }) => {
  it(`${code}: has a widgets.lunchCount section`, () => {
    expect(
      locale,
      `${code}.widgets.lunchCount section is entirely missing`
    ).toHaveProperty(['widgets', 'lunchCount']);
  });

  it(`${code}: has all required widgets.lunchCount keys`, () => {
    for (const key of REQUIRED_LUNCH_COUNT_KEYS) {
      expect(
        locale,
        `${code}.widgets.lunchCount.${key} is missing`
      ).toHaveProperty(['widgets', 'lunchCount', key]);
    }
  });
});
