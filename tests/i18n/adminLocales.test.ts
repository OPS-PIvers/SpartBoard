/**
 * Regression test for the missing admin namespace in DE/ES/FR locales.
 *
 * The `admin` namespace (admin.stickers.*) was added to the EN locale for the
 * Global Sticker Library admin feature but was never propagated to DE, ES, or
 * FR. The keys are used in `components/admin/StickerLibraryModal.tsx` via
 * direct t() calls WITHOUT `defaultValue` fallbacks:
 *
 *   - t('admin.stickers.title')
 *   - t('admin.stickers.saveChanges')
 *   - t('admin.stickers.description')
 *   - t('admin.stickers.supportedFiles')
 *   - t('admin.stickers.confirmDiscardChanges')
 *
 * Because i18next has no defaultValue to fall back on, non-English users see
 * the raw key path (e.g., "admin.stickers.title") rendered directly in the UI
 * instead of any translated or even English text.
 *
 * This test loads each locale JSON directly so the assertion fires even before
 * the i18next runtime resolves the missing fallback.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

/** Keys within admin.stickers that components call t() on without defaultValue. */
const REQUIRED_ADMIN_STICKER_KEYS = [
  'title',
  'saveChanges',
  'discardChanges',
  'confirmDiscardChanges',
  'description',
  'supportedFiles',
  'uploadDescription',
  'dropImages',
  'collectionTitle',
  'clearAll',
  'wait',
  'dropOrPaste',
  'toAddCustom',
  'essentials',
  'globalCollection',
  'myCollection',
  'dragOrClick',
  'deleteSticker',
  'dragFromLibrary',
  'stickerAdded',
] as const;

/**
 * Keys within admin.plc.recovery that the PLC recovery panel (W4-T11,
 * Decision 3.4) renders. The panel passes `defaultValue` on every t() call, but
 * DE/ES/FR must still carry real translations (no raw-key leak for non-English
 * admins) — enforced below.
 */
const REQUIRED_ADMIN_PLC_RECOVERY_KEYS = [
  'title',
  'subtitle',
  'explainer',
  'empty',
  'leadLabel',
  'membersLabel_one',
  'membersLabel_other',
  'reassignLead',
  'reassignTitle',
  'reassignDescription',
  'newLeadLabel',
  'noEligibleMembers',
  'confirmReassign',
  'reassignSuccess',
  'dissolve',
  'confirmDissolve',
  'dissolveSuccess',
  'actionFailed',
  'cancel',
  'confirm',
] as const;

// ─── EN baseline ─────────────────────────────────────────────────────────────

describe('EN locale — admin namespace baseline', () => {
  it('has an admin section', () => {
    expect(en).toHaveProperty('admin');
  });

  it('has an admin.stickers section', () => {
    expect(en.admin).toHaveProperty('stickers');
  });

  it('has all required admin.stickers keys', () => {
    for (const key of REQUIRED_ADMIN_STICKER_KEYS) {
      expect(
        en.admin.stickers,
        `en.admin.stickers.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });

  it('has an admin.plc.recovery section', () => {
    expect(en).toHaveProperty(['admin', 'plc', 'recovery']);
  });

  it('has all required admin.plc.recovery keys', () => {
    for (const key of REQUIRED_ADMIN_PLC_RECOVERY_KEYS) {
      expect(
        en,
        `en.admin.plc.recovery.${key} is missing from EN`
      ).toHaveProperty(['admin', 'plc', 'recovery', key]);
    }
  });
});

// ─── DE / ES / FR parity ─────────────────────────────────────────────────────

// Vitest's `toHaveProperty` accepts a deep key-path array and safely handles
// undefined parents, so we can assert the nested shape without casting the
// other locales to `typeof en` or extracting nested `Record<string, unknown>`s.
describe.each([
  { code: 'de', locale: de },
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
])('$code locale — admin namespace parity with EN', ({ code, locale }) => {
  it(`${code}: has an admin section`, () => {
    expect(locale, `${code}.admin section is entirely missing`).toHaveProperty(
      'admin'
    );
  });

  it(`${code}: has an admin.stickers section`, () => {
    expect(locale, `${code}.admin.stickers section is missing`).toHaveProperty([
      'admin',
      'stickers',
    ]);
  });

  it(`${code}: has all required admin.stickers keys`, () => {
    for (const key of REQUIRED_ADMIN_STICKER_KEYS) {
      expect(locale, `${code}.admin.stickers.${key} is missing`).toHaveProperty(
        ['admin', 'stickers', key]
      );
    }
  });

  it(`${code}: has an admin.plc.recovery section`, () => {
    expect(
      locale,
      `${code}.admin.plc.recovery section is missing`
    ).toHaveProperty(['admin', 'plc', 'recovery']);
  });

  it(`${code}: has all required admin.plc.recovery keys`, () => {
    for (const key of REQUIRED_ADMIN_PLC_RECOVERY_KEYS) {
      expect(
        locale,
        `${code}.admin.plc.recovery.${key} is missing`
      ).toHaveProperty(['admin', 'plc', 'recovery', key]);
    }
  });
});
