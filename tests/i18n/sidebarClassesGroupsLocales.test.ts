/**
 * Regression test for missing sidebar.classes.* group-editor locale keys
 * in non-English locales.
 *
 * The roster groups tab (RosterEditorModal.tsx, M17 A4) was shipped with
 * these keys only as inline `defaultValue` strings — never added to any
 * locale JSON file, so DE/ES/FR silently fell back to English.
 *
 * Keys used by components/classes/RosterEditorModal.tsx:
 *   - sidebar.classes.studentsTab
 *   - sidebar.classes.groupsTab
 *   - sidebar.classes.newGroupName
 *   - sidebar.classes.emptyGroupsTitle
 *   - sidebar.classes.emptyGroupsSubtitle
 *   - sidebar.classes.addGroup
 *   - sidebar.classes.editGroupMembers
 *   - sidebar.classes.removeGroup
 *   - sidebar.classes.groupMemberCount_one / _other
 *   - sidebar.classes.noStudentsToGroup
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

/** All sidebar.classes group-editor keys referenced by component code. */
const REQUIRED_GROUPS_KEYS = [
  'studentsTab',
  'groupsTab',
  'newGroupName',
  'emptyGroupsTitle',
  'emptyGroupsSubtitle',
  'addGroup',
  'editGroupMembers',
  'removeGroup',
  'groupMemberCount_one',
  'groupMemberCount_other',
  'noStudentsToGroup',
] as const;

type LocaleFile = typeof en;

// Verify EN itself is the reference baseline
describe('EN locale — sidebar.classes group-editor keys baseline', () => {
  it('has all required sidebar.classes group-editor keys', () => {
    for (const key of REQUIRED_GROUPS_KEYS) {
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
  '$code locale — sidebar.classes group-editor key parity with EN',
  ({ code, locale }) => {
    it(`${code}: has all required sidebar.classes group-editor keys`, () => {
      const classes = (locale.sidebar as Record<string, unknown>).classes as
        | Record<string, unknown>
        | undefined;
      for (const key of REQUIRED_GROUPS_KEYS) {
        expect(
          classes,
          `${code}.sidebar.classes.${key} is missing`
        ).toHaveProperty(key);
      }
    });
  }
);
