/**
 * Regression test: widgetSettings.weather namespace missing from DE, ES, FR.
 *
 * The Weather widget's settings-drawer schema (components/widgets/Weather/settings.schema.ts)
 * declares bare field labels like `label: 'weatherMode'`, which SchemaRenderer resolves via
 * resolveLabel() (components/settings/renderer/resolveLabel.ts) by looking up
 * `widgetSettings.weather.<leaf>`, falling back to `widgetSettings.common.<leaf>`, and finally
 * falling back to rendering the raw leaf key itself (e.g. "weatherMode") when neither exists.
 *
 * `widgetSettings.weather` and `widgetSettings.common` are both entirely absent from DE, ES and
 * FR (only 5 of the 58 widgetSettings sub-namespaces — random, scoreboard, checklist, schedule,
 * poll — have any translations at all), so every field label in the Weather settings drawer
 * renders as its raw camelCase key ("weatherMode", "temperature", "condition", "sunny", ...)
 * instead of a translated string for non-English teachers.
 *
 * Loads the locale JSON directly, since the runtime i18next fallback-to-defaultValue only
 * triggers when a key is absent — it would mask nothing here, but a value that merely copies
 * the English source text would still read as a bug this test also has to catch.
 */
import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

const REQUIRED_KEYS = [
  'weatherMode',
  'manual',
  'automatic',
  'temperature',
  'condition',
  'sunny',
  'cloudy',
  'rainy',
  'snowy',
  'windy',
  'automaticWeather',
  'weatherSource',
  'openWeather',
  'cityZip',
  'useLocation',
  'refreshWeather',
  'refreshCity',
  'showFeelsLike',
  'hideClothing',
  'syncBackground',
  'secondaryColor',
  'matchText',
  'clothingCard',
] as const;

// Excluded from the "must differ from EN" check: brand name, kept verbatim in every locale.
const BRAND_KEYS = new Set(['openWeather']);

type WeatherSettingsNs = Record<string, string>;

const weatherOf = (locale: unknown): WeatherSettingsNs | undefined =>
  (
    (locale as { widgetSettings?: Record<string, unknown> }).widgetSettings ??
    {}
  ).weather as WeatherSettingsNs | undefined;

describe('EN locale — widgetSettings.weather baseline', () => {
  it('has every required key', () => {
    const weather = weatherOf(en);
    for (const key of REQUIRED_KEYS) {
      expect(
        weather,
        `en.widgetSettings.weather.${key} is missing`
      ).toHaveProperty(key);
    }
  });
});

describe.each([
  { code: 'de', locale: de, cognates: new Set<string>() },
  { code: 'es', locale: es, cognates: new Set(['manual']) },
  { code: 'fr', locale: fr, cognates: new Set<string>() },
])(
  '$code locale — widgetSettings.weather parity with EN',
  ({ code, locale, cognates }) => {
    it(`${code}: has a widgetSettings.weather section`, () => {
      expect(
        weatherOf(locale),
        `${code}.widgetSettings.weather is entirely missing`
      ).toBeDefined();
    });

    for (const key of REQUIRED_KEYS) {
      it(`${code}.widgetSettings.weather.${key} is present`, () => {
        const weather = weatherOf(locale);
        expect(
          weather,
          `${code}.widgetSettings.weather.${key} is missing — resolveLabel() falls back to the raw key "${key}"`
        ).toHaveProperty(key);
      });

      if (!BRAND_KEYS.has(key) && !cognates.has(key)) {
        it(`${code}.widgetSettings.weather.${key} is not the verbatim English value`, () => {
          const enVal = weatherOf(en)?.[key];
          const localVal = weatherOf(locale)?.[key];
          expect(
            localVal,
            `${code}.widgetSettings.weather.${key} is still the English source string "${enVal}"`
          ).not.toBe(enVal);
        });
      }
    }
  }
);
