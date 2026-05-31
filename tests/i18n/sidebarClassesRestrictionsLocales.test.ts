/**
 * Regression test for missing sidebar.classes.restrictions* locale keys
 * in non-English locales.
 *
 * The student-restrictions feature was added to the class roster editor
 * (components/classes/RestrictionsPicker.tsx and RosterEditorModal.tsx).
 * Eleven keys were added to the EN locale under sidebar.classes but were
 * never propagated to DE, ES, or FR. All three non-English languages
 * silently fall back to English for the restrictions UI, breaking the
 * localization contract for teachers who use those languages.
 *
 * Keys used by the components:
 *   - sidebar.classes.addRestrictions        (RosterEditorModal.tsx)
 *   - sidebar.classes.hideRestrictions       (RosterEditorModal.tsx)
 *   - sidebar.classes.restrictionsHeader     (RosterEditorModal.tsx)
 *   - sidebar.classes.restrictionsNone       (RestrictionsPicker.tsx)
 *   - sidebar.classes.restrictionsCount_one  (RestrictionsPicker.tsx)
 *   - sidebar.classes.restrictionsCount_other (RestrictionsPicker.tsx)
 *   - sidebar.classes.restrictionsPickerLabel (RestrictionsPicker.tsx)
 *   - sidebar.classes.restrictionsFilter     (RestrictionsPicker.tsx)
 *   - sidebar.classes.restrictionsEmptyRoster (RestrictionsPicker.tsx)
 *   - sidebar.classes.restrictionsNoMatches  (RestrictionsPicker.tsx)
 *   - sidebar.classes.restrictionsFooter     (RestrictionsPicker.tsx)
 *
 * This test loads each locale JSON directly (not via i18next) so it catches
 * key-presence issues before the i18next runtime silently swallows them with
 * English fallback values.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

/** All sidebar.classes restrictions keys referenced by component code. */
const REQUIRED_RESTRICTIONS_KEYS = [
  'addRestrictions',
  'hideRestrictions',
  'restrictionsHeader',
  'restrictionsNone',
  'restrictionsCount_one',
  'restrictionsCount_other',
  'restrictionsPickerLabel',
  'restrictionsFilter',
  'restrictionsEmptyRoster',
  'restrictionsNoMatches',
  'restrictionsFooter',
] as const;

type LocaleFile = typeof en;

// Verify EN itself is the reference baseline
describe('EN locale — sidebar.classes.restrictions* baseline', () => {
  it('has a sidebar.classes section', () => {
    expect(en.sidebar).toHaveProperty('classes');
  });

  it('has all required sidebar.classes restrictions keys', () => {
    for (const key of REQUIRED_RESTRICTIONS_KEYS) {
      expect(
        en.sidebar.classes,
        `en.sidebar.classes.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });
});

describe.each([
  { code: 'de', locale: de as unknown as LocaleFile },
  { code: 'es', locale: es as unknown as LocaleFile },
  { code: 'fr', locale: fr as unknown as LocaleFile },
])(
  '$code locale — sidebar.classes.restrictions* parity with EN',
  ({ code, locale }) => {
    it(`${code}: has a sidebar.classes section`, () => {
      expect(
        locale.sidebar,
        `${code}.sidebar.classes section is entirely missing`
      ).toHaveProperty('classes');
    });

    it(`${code}: has all required sidebar.classes restrictions keys`, () => {
      const classes = (locale.sidebar as Record<string, unknown>).classes as
        | Record<string, unknown>
        | undefined;
      for (const key of REQUIRED_RESTRICTIONS_KEYS) {
        expect(
          classes,
          `${code}.sidebar.classes.${key} is missing`
        ).toHaveProperty(key);
      }
    });
  }
);
