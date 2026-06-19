/**
 * Regression test: backgrounds.presets verbatim-EN placeholder in ES locale.
 *
 * When the backgrounds namespace was first built out, DE and FR received proper
 * translations ("Voreinstellungen" and "Préréglages" respectively), but the ES
 * locale was left with the verbatim English string "Presets". Because i18next
 * only falls back to its fallbackLng when a key is ABSENT, a present key whose
 * value equals the EN source string silently renders English regardless of the
 * user's language preference.
 *
 * Key affected:
 *   backgrounds.presets  – EN "Presets", ES should be "Preajustes" (not "Presets")
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import es from '@/locales/es.json';

describe('backgrounds.presets locale — ES must not be verbatim English', () => {
  it('es.backgrounds.presets is present', () => {
    expect(
      es.backgrounds,
      'es.backgrounds namespace is missing'
    ).toHaveProperty('presets');
  });

  it('es.backgrounds.presets is not the verbatim English value "Presets"', () => {
    const enVal = en.backgrounds.presets;
    const esVal = es.backgrounds.presets;

    expect(
      esVal,
      `es.backgrounds.presets is still the verbatim English value "${enVal}" — needs a real Spanish translation (e.g. "Preajustes")`
    ).not.toBe(enVal);
  });
});
