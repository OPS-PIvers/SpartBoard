/**
 * Regression test for missing common-namespace keys in non-English locales.
 *
 * The keys `common.saved`, `common.success`, and `common.error` were added to
 * the EN locale but never propagated to DE, ES, or FR.  These keys are used
 * directly by production components:
 *
 *   - `common.saved`   → StickerLibraryModal save-button label
 *   - `common.error`   → DashboardView and Weather/Settings error toasts
 *   - `common.success` → available for shared use
 *
 * Without these keys, i18next falls back to EN for German/Spanish/French
 * users, silently displaying English text in otherwise localised UIs.
 *
 * This test loads each locale JSON directly so the assertion fires even
 * before the i18next runtime resolves the missing fallback.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

/** Keys in the `common` namespace that every locale must provide. */
const REQUIRED_COMMON_KEYS = ['saved', 'success', 'error'] as const;

describe('EN locale — common namespace baseline', () => {
  it('has all required common keys', () => {
    for (const key of REQUIRED_COMMON_KEYS) {
      expect(en.common, `en.common.${key} is missing from EN`).toHaveProperty(
        key
      );
    }
  });
});

describe.each([
  { code: 'de', locale: de },
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
])('$code locale — common namespace parity with EN', ({ code, locale }) => {
  it(`${code}: has all required common keys`, () => {
    for (const key of REQUIRED_COMMON_KEYS) {
      expect(locale.common, `${code}.common.${key} is missing`).toHaveProperty(
        key
      );
    }
  });
});
