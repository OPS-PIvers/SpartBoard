/**
 * Regression test for missing sidebar.plcs locale keys in non-English locales.
 *
 * The PLC (Professional Learning Community) feature was added to the sidebar
 * (SidebarPlcs.tsx, PlcEditModal.tsx, PlcInvitesModal.tsx), and the
 * sidebar.plcs namespace was added to the EN locale, but was never propagated
 * to DE, ES, or FR. All three non-English languages silently fall back to
 * English for the entire PLC panel UI, breaking the localization contract.
 *
 * Additionally, sidebar.settings.remoteControl was added to EN but was not
 * propagated to DE, ES, or FR.
 *
 * This test loads each locale JSON directly (not via i18next) so it catches
 * key-presence issues before the i18next runtime silently swallows them.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

/** All sidebar.plcs keys the current codebase references via t(). */
const REQUIRED_PLCS_KEYS = [
  'title',
  'description',
  'newPlc',
  'newPlcTitle',
  'createNewPlc',
  'createPlc',
  'editPlc',
  'editPlcTitle',
  'viewPlc',
  'viewPlcTitle',
  'deletePlc',
  'leavePlc',
  'actionsMenu',
  'openDashboard',
  'yourPlcs',
  'leadBadge',
  'memberCount_one',
  'memberCount_other',
  'membersLabel',
  'youSuffix',
  'removeMember',
  'remove',
  'leave',
  'nameLabel',
  'namePlaceholder',
  'inviteLabel',
  'invitePlaceholder',
  'sendInvite',
  'inviteHelp',
  'outstandingLabel',
  'revokeInvite',
  'invites',
  'invitesTitle',
  'noInvitesTitle',
  'noInvitesSubtitle',
  'inviteFrom',
  'accept',
  'decline',
  'emptyTitle',
  'emptySubtitle',
  'emptyHasInvites',
  'confirmLeave',
  'confirmLeaveTitle',
  'confirmDelete',
  'confirmDeleteTitle',
  'confirmRemoveMember',
  'confirmRemoveMemberTitle',
  'saveFailed',
  'inviteFailed',
  'removeFailed',
  'revokeFailed',
  'acceptFailed',
  'declineFailed',
  'unreadBadge_one',
  'unreadBadge_other',
] as const;

type LocaleFile = typeof en;

// Verify EN itself is the reference baseline
describe('EN locale — sidebar.plcs baseline', () => {
  it('has a sidebar.plcs section', () => {
    expect(en.sidebar).toHaveProperty('plcs');
  });

  it('has all required sidebar.plcs keys', () => {
    for (const key of REQUIRED_PLCS_KEYS) {
      expect(
        en.sidebar.plcs,
        `en.sidebar.plcs.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });
});

describe.each([
  { code: 'de', locale: de as unknown as LocaleFile },
  { code: 'es', locale: es as unknown as LocaleFile },
  { code: 'fr', locale: fr as unknown as LocaleFile },
])('$code locale — sidebar.plcs parity with EN', ({ code, locale }) => {
  it(`${code}: has a sidebar.plcs section`, () => {
    expect(
      locale.sidebar,
      `${code}.sidebar.plcs section is entirely missing`
    ).toHaveProperty('plcs');
  });

  it(`${code}: has all required sidebar.plcs keys`, () => {
    const plcs = (locale.sidebar as Record<string, unknown>).plcs as
      | Record<string, unknown>
      | undefined;
    for (const key of REQUIRED_PLCS_KEYS) {
      expect(plcs, `${code}.sidebar.plcs.${key} is missing`).toHaveProperty(
        key
      );
    }
  });
});

describe.each([
  { code: 'de', locale: de as unknown as LocaleFile },
  { code: 'es', locale: es as unknown as LocaleFile },
  { code: 'fr', locale: fr as unknown as LocaleFile },
])(
  '$code locale — sidebar.settings.remoteControl parity with EN',
  ({ code, locale }) => {
    it(`${code}: has sidebar.settings.remoteControl`, () => {
      expect(
        locale.sidebar.settings,
        `${code}.sidebar.settings.remoteControl is missing`
      ).toHaveProperty('remoteControl');
    });
  }
);
