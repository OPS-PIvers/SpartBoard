/**
 * Regression test: backgrounds namespace verbatim-EN placeholders in DE, ES, FR.
 *
 * When the backgrounds modal was extended with gradient direction labels,
 * background type filter labels (typeAll / typeStill / typeVideo / typeUpload),
 * uploadedImage, and gradient start/end labels, the new keys were added to
 * EN but the non-EN locales received only verbatim copies of the English
 * strings — not real translations.
 *
 * i18next only falls back to defaultValue when a key is ABSENT. A present key
 * whose value equals the EN source string silently renders English regardless
 * of the user's language preference.
 *
 * The keys affected are:
 *   backgrounds.typeAll            – "All"
 *   backgrounds.typeStill          – "Stills"
 *   backgrounds.typeVideo          – "Video"
 *   backgrounds.typeUpload         – "Uploads"
 *   backgrounds.uploadedImage      – "Uploaded image"
 *   backgrounds.gradientStart      – "Start"
 *   backgrounds.gradientEnd        – "End"
 *   backgrounds.directionRight     – "Right"
 *   backgrounds.directionDownRight – "Down-Right"
 *   backgrounds.directionDown      – "Down"
 *   backgrounds.directionDownLeft  – "Down-Left"
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

/**
 * Keys whose EN values should NOT appear verbatim in non-EN locales.
 * "Video" is intentionally excluded — it is the same word in all four
 * languages (a loanword/proper noun in DE/ES/FR).
 */
const TRANSLATABLE_KEYS = [
  'typeAll',
  'typeStill',
  'typeUpload',
  'uploadedImage',
  'gradientStart',
  'gradientEnd',
  'directionRight',
  'directionDownRight',
  'directionDown',
  'directionDownLeft',
] as const;

type BackgroundsNs = (typeof en)['backgrounds'];
type LocaleWithBackgrounds = { backgrounds: Record<string, string> };

describe.each([
  { code: 'de', locale: de as unknown as LocaleWithBackgrounds },
  { code: 'es', locale: es as unknown as LocaleWithBackgrounds },
  { code: 'fr', locale: fr as unknown as LocaleWithBackgrounds },
])(
  '$code locale — backgrounds keys must not be verbatim English',
  ({ code, locale }) => {
    it(`${code}: backgrounds namespace exists`, () => {
      expect(locale).toHaveProperty('backgrounds');
    });

    for (const key of TRANSLATABLE_KEYS) {
      it(`${code}.backgrounds.${key} is present and not the English source value`, () => {
        const enVal = (
          en.backgrounds as BackgroundsNs & Record<string, string>
        )[key];
        const localVal = locale.backgrounds[key];

        // Key must exist
        expect(
          locale.backgrounds,
          `${code}.backgrounds.${key} is missing`
        ).toHaveProperty(key);

        // Value must not equal the EN source string
        expect(
          localVal,
          `${code}.backgrounds.${key} is still the verbatim English value "${enVal}" — needs a real translation`
        ).not.toBe(enVal);
      });
    }
  }
);
