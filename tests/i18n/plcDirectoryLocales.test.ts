/**
 * Parity test for the `plcDirectory` locale namespace (Wave 1, T5).
 *
 * The "PLCs in my building" directory at `/plc` (PlcIndexHub) introduced a new
 * `plcDirectory` namespace. This test pins that every key present in EN is also
 * present in DE / ES / FR so no language silently falls back to English for the
 * directory UI.
 *
 * Loads each locale JSON directly (not via i18next) so it catches key-presence
 * issues before the i18next runtime swallows them.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

const REQUIRED_KEYS = [
  'heading',
  'subtitle',
  'memberCount',
  'memberCount_other',
  'requestToJoin',
  'requestHint',
  'emptyTitle',
  'emptySubtitle',
  'noOrgTitle',
  'noOrgSubtitle',
] as const;

describe('EN locale — plcDirectory baseline', () => {
  it('has a plcDirectory section with all required keys', () => {
    expect(en).toHaveProperty('plcDirectory');
    for (const key of REQUIRED_KEYS) {
      expect(
        (en as Record<string, unknown>).plcDirectory,
        `en.plcDirectory.${key} is missing`
      ).toHaveProperty(key);
    }
  });
});

describe.each([
  { code: 'de', locale: de },
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
])('$code locale — plcDirectory parity with EN', ({ code, locale }) => {
  it(`${code}: has a plcDirectory section`, () => {
    expect(
      locale,
      `${code}.plcDirectory section is entirely missing`
    ).toHaveProperty('plcDirectory');
  });

  it(`${code}: has all required plcDirectory keys`, () => {
    const ns = (locale as Record<string, unknown>).plcDirectory as
      | Record<string, unknown>
      | undefined;
    for (const key of REQUIRED_KEYS) {
      expect(ns, `${code}.plcDirectory.${key} is missing`).toHaveProperty(key);
    }
  });
});
