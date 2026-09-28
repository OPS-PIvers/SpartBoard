/**
 * Regression test: widgetSettings.common namespace missing from DE, ES, FR.
 *
 * `widgetSettings.common` is the fallback tier resolveLabel() (components/settings/renderer/resolveLabel.ts)
 * checks for every widget's settings-drawer field label that isn't in that widget's own
 * `widgetSettings.<type>` namespace — SettingsDrawer.tsx, PartnerCard.tsx, RosterPicker.tsx,
 * StyleDefaultsFooter.tsx and windowStyle.tsx all read directly from it too. It was entirely
 * absent from DE, ES and FR, so every one of those labels (close, find-a-setting, style-tier
 * labels, roster/partner/defaults copy, ...) rendered as its raw camelCase key instead of a
 * translated string for non-English teachers.
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

type Json = Record<string, unknown>;

function flatten(obj: Json | undefined, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (!obj) return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Json, key));
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

const commonOf = (locale: unknown): Json | undefined =>
  (
    (locale as { widgetSettings?: Record<string, unknown> }).widgetSettings ??
    {}
  ).common as Json | undefined;

const enCommon = commonOf(en);
const enFlat = flatten(enCommon);
const REQUIRED_KEYS = Object.keys(enFlat);

// Leaves that are genuine cognates/loanwords in that locale — kept verbatim on purpose,
// following the same precedent as the `openWeather` brand exception in the weather test.
const COGNATES: Record<string, Set<string>> = {
  de: new Set(['style.layout']), // "Layout" is used as-is throughout de.json
  es: new Set(),
  fr: new Set(['tabs.style', 'emojiNature']), // "Style"/"Nature" are the correct French words, spelled the same
};

describe('EN locale — widgetSettings.common baseline', () => {
  it('has every required key', () => {
    expect(REQUIRED_KEYS.length).toBeGreaterThan(0);
    for (const key of REQUIRED_KEYS) {
      expect(
        enFlat,
        `en.widgetSettings.common.${key} is missing`
      ).toHaveProperty(key);
    }
  });
});

describe.each([
  { code: 'de', locale: de },
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
])(
  '$code locale — widgetSettings.common parity with EN',
  ({ code, locale }) => {
    it(`${code}: has a widgetSettings.common section`, () => {
      expect(
        commonOf(locale),
        `${code}.widgetSettings.common is entirely missing`
      ).toBeDefined();
    });

    const localeFlat = flatten(commonOf(locale));
    const cognates = COGNATES[code] ?? new Set<string>();

    for (const key of REQUIRED_KEYS) {
      it(`${code}.widgetSettings.common.${key} is present`, () => {
        expect(
          localeFlat,
          `${code}.widgetSettings.common.${key} is missing — resolveLabel() falls back to the raw key "${key}"`
        ).toHaveProperty(key);
      });

      if (!cognates.has(key)) {
        it(`${code}.widgetSettings.common.${key} is not the verbatim English value`, () => {
          const enVal = enFlat[key];
          const localVal = localeFlat[key];
          expect(
            localVal,
            `${code}.widgetSettings.common.${key} is still the English source string "${enVal}"`
          ).not.toBe(enVal);
        });
      }
    }
  }
);
