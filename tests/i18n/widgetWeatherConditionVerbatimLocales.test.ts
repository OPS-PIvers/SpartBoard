/**
 * Regression test for verbatim-English value stored in FR for
 * widgets.weather.condition.
 *
 * BUG SUMMARY
 * -----------
 *
 * FR widgets.weather.condition = "Condition"  (verbatim EN)
 *
 * Proof of error:
 *   - DE correctly translates this as "Wetterlage" (a weather-specific German
 *     compound term — the translator made an intentional, domain-specific choice).
 *   - ES correctly translates this as "Condición" (with the required Spanish accent).
 *   - FR kept the bare English word "Condition" — no accent, no localization.
 *     The correct French label for the weather condition selector is
 *     "Conditions météo", consistent with how the weather domain is referenced
 *     throughout the FR locale ("météo", "données météo", "station météo", etc.).
 *
 * WHY THIS IS A LOUD BUG (no silent fallback)
 * --------------------------------------------
 * The key is used via t() WITHOUT a defaultValue fallback in:
 *
 *   components/widgets/Weather/Settings.tsx:352
 *     {t('widgets.weather.condition')}
 *
 * i18next renders whatever is stored in the locale file verbatim, so
 * French teachers see "Condition" (English text) as the weather-condition
 * section heading in the Weather widget settings panel.
 *
 * This test loads locale JSON files directly so the assertion fires before
 * the i18next runtime would attempt (and silently skip) any fallback.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

// ─── EN baseline ─────────────────────────────────────────────────────────────

describe('EN locale — widgets.weather.condition baseline', () => {
  it('has widgets.weather.condition', () => {
    expect(en.widgets.weather).toHaveProperty('condition');
  });
});

// ─── FR: condition must not be verbatim EN ────────────────────────────────────
//
// DE uses "Wetterlage", ES uses "Condición" — FR must not copy the EN value.

describe('FR locale — widgets.weather.condition must not be verbatim EN', () => {
  it('fr: widgets.weather.condition is present', () => {
    expect(fr, 'fr.widgets.weather.condition is missing').toHaveProperty([
      'widgets',
      'weather',
      'condition',
    ]);
  });

  it('fr: widgets.weather.condition is NOT the verbatim English value "Condition"', () => {
    expect(
      fr.widgets.weather.condition,
      'fr.widgets.weather.condition is still the English placeholder — ' +
        "t('widgets.weather.condition') has no defaultValue in " +
        'Weather/Settings.tsx:352, so FR teachers see English text as the ' +
        'weather-condition section heading in the Weather widget settings. ' +
        'DE correctly uses "Wetterlage"; ES correctly uses "Condición".'
    ).not.toBe(en.widgets.weather.condition);
  });
});

// ─── DE + ES sanity checks — must not regress ────────────────────────────────

describe('DE locale — widgets.weather.condition sanity check (must not regress)', () => {
  it('de: widgets.weather.condition is not verbatim EN ("Wetterlage")', () => {
    expect(
      de.widgets.weather.condition,
      'de.widgets.weather.condition regressed to the English value'
    ).not.toBe(en.widgets.weather.condition);
  });
});

describe('ES locale — widgets.weather.condition sanity check (must not regress)', () => {
  it('es: widgets.weather.condition is not verbatim EN ("Condición")', () => {
    expect(
      es.widgets.weather.condition,
      'es.widgets.weather.condition regressed to the English value'
    ).not.toBe(en.widgets.weather.condition);
  });
});
