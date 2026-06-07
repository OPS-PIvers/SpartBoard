/**
 * Regression test for missing widgets.weather sub-namespace in DE and FR locales.
 *
 * The `widgets.weather` namespace (36 top-level keys, 50 leaf keys including
 * nested `conditions` and `clothing` sub-objects) was entirely absent from DE
 * and FR while ES had full parity.
 *
 * Every call site in `components/widgets/Weather/Widget.tsx` and
 * `components/widgets/Weather/Settings.tsx` uses bare `t('widgets.weather.*')`
 * calls with NO `defaultValue` fallback, making ALL 50 keys "loud" bugs —
 * German and French teachers see raw i18next key paths rendered directly:
 *
 *   Widget.tsx — call sites without defaultValue (representative sample):
 *     t('widgets.weather.clothing.heavyCoat')   — line 210
 *     t('widgets.weather.clothing.lightJacket')  — line 212
 *     t('widgets.weather.weatherImageAlt')        — line 251
 *     t('widgets.weather.actual')                 — line 312
 *     t('widgets.weather.feelsLike')              — line 313
 *
 *   Settings.tsx — call sites without defaultValue (representative sample):
 *     t('widgets.weather.connectedTo')            — line 130
 *     t('widgets.weather.stationFailed')          — line 135
 *     t('widgets.weather.serviceNotConfigured')   — line 147
 *     t('widgets.weather.invalidApiKey')          — line 158
 *     t('widgets.weather.syncFailed')             — line 183
 *     t('widgets.weather.prioritizeFeelsLike')    — line 238
 *     t('widgets.weather.managedByAdmin')         — line 380
 *     t('widgets.weather.conditions.sunny')       — line 214
 *     (…and 36 more)
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
 * Top-level keys within widgets.weather (flat string values, not sub-objects).
 * All are called via t() WITHOUT a defaultValue — loud bugs in non-EN locales.
 */
const REQUIRED_WEATHER_TOP_KEYS = [
  'actual',
  'feelsLike',
  'weatherImageAlt',
  'connectedTo',
  'stationFailed',
  'serviceNotConfigured',
  'invalidApiKey',
  'updatedFor',
  'syncFailed',
  'enterCity',
  'geoNotSupported',
  'locationDenied',
  'prioritizeFeelsLike',
  'prioritizeDescription',
  'hideClothing',
  'hideClothingDescription',
  'syncBackground',
  'syncBackgroundDescription',
  'manual',
  'automatic',
  'temperature',
  'condition',
  'manualMode',
  'managedByAdmin',
  'schoolStation',
  'stationReady',
  'stationConnectedTo',
  'refreshStation',
  'serviceNotConfiguredAdmin',
  'cityZip',
  'cityPlaceholder',
  'or',
  'useLocation',
  'messageTemplate',
] as const;

/** Keys within widgets.weather.conditions */
const REQUIRED_CONDITIONS_KEYS = [
  'sunny',
  'clear',
  'cloudy',
  'clouds',
  'rainy',
  'rain',
  'drizzle',
  'snowy',
  'snow',
  'windy',
  'squall',
  'tornado',
] as const;

/** Keys within widgets.weather.clothing */
const REQUIRED_CLOTHING_KEYS = [
  'heavyCoat',
  'lightJacket',
  'longSleeves',
  'shortSleeves',
] as const;

// ─── EN baseline ─────────────────────────────────────────────────────────────

describe('EN locale — widgets.weather baseline', () => {
  it('has a widgets.weather section', () => {
    expect(en).toHaveProperty(['widgets', 'weather']);
  });

  it('has all required top-level weather keys', () => {
    for (const key of REQUIRED_WEATHER_TOP_KEYS) {
      expect(
        en.widgets.weather,
        `en.widgets.weather.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });

  it('has a widgets.weather.conditions sub-section', () => {
    expect(en.widgets.weather, 'en.widgets.weather.conditions is missing').toHaveProperty(
      'conditions'
    );
  });

  it('has all required widgets.weather.conditions keys', () => {
    for (const key of REQUIRED_CONDITIONS_KEYS) {
      expect(
        en.widgets.weather.conditions,
        `en.widgets.weather.conditions.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });

  it('has a widgets.weather.clothing sub-section', () => {
    expect(en.widgets.weather, 'en.widgets.weather.clothing is missing').toHaveProperty(
      'clothing'
    );
  });

  it('has all required widgets.weather.clothing keys', () => {
    for (const key of REQUIRED_CLOTHING_KEYS) {
      expect(
        en.widgets.weather.clothing,
        `en.widgets.weather.clothing.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });
});

// ─── DE / ES / FR parity ─────────────────────────────────────────────────────

describe.each([
  { code: 'de', locale: de },
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
])('$code locale — widgets.weather parity with EN', ({ code, locale }) => {
  it(`${code}: has a widgets.weather section`, () => {
    expect(
      locale,
      `${code}.widgets.weather section is entirely missing`
    ).toHaveProperty(['widgets', 'weather']);
  });

  it(`${code}: has all required top-level weather keys (no defaultValue — loud bugs)`, () => {
    for (const key of REQUIRED_WEATHER_TOP_KEYS) {
      expect(
        locale,
        `${code}.widgets.weather.${key} is missing — LOUD bug (no defaultValue fallback)`
      ).toHaveProperty(['widgets', 'weather', key]);
    }
  });

  it(`${code}: has a widgets.weather.conditions sub-section`, () => {
    expect(
      locale,
      `${code}.widgets.weather.conditions section is missing`
    ).toHaveProperty(['widgets', 'weather', 'conditions']);
  });

  it(`${code}: has all required widgets.weather.conditions keys`, () => {
    for (const key of REQUIRED_CONDITIONS_KEYS) {
      expect(
        locale,
        `${code}.widgets.weather.conditions.${key} is missing`
      ).toHaveProperty(['widgets', 'weather', 'conditions', key]);
    }
  });

  it(`${code}: has a widgets.weather.clothing sub-section`, () => {
    expect(
      locale,
      `${code}.widgets.weather.clothing section is missing`
    ).toHaveProperty(['widgets', 'weather', 'clothing']);
  });

  it(`${code}: has all required widgets.weather.clothing keys`, () => {
    for (const key of REQUIRED_CLOTHING_KEYS) {
      expect(
        locale,
        `${code}.widgets.weather.clothing.${key} is missing`
      ).toHaveProperty(['widgets', 'weather', 'clothing', key]);
    }
  });
});
