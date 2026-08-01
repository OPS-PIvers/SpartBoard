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

// ─── admin.plc.recovery terminology (DE/ES PLC->PLG/Comunidad drift) ────────

/**
 * DE and ES left the literal English acronym "PLC" untranslated across every
 * string in `admin.plc.recovery` (title/subtitle/explainer/empty/dissolve/
 * confirmDissolve), while FR correctly used its established term ("CAP") for
 * the same namespace. Two prior PRs (#2162, #2214) explicitly left DE/ES
 * alone here on the theory that `admin.plc.recovery` "intentionally keeps
 * PLC" as an admin-only acronym distinct from the teacher-facing PLC UI.
 *
 * That theory doesn't hold up: `PlcRecoveryPanel.tsx` — the very component
 * that renders this namespace — also renders `plcDashboard.resources.*`
 * strings on the same screen (its loading/error states), and those already
 * use the real DE/ES terms ("PLGs werden geladen…" / "Cargando
 * Comunidades…"). So the "admin-only acronym" distinction isn't just
 * unproven, it's directly contradicted by the same screen mixing "PLG"/
 * "Comunidad" and untranslated "PLC" for the identical concept. DE's
 * established term is "PLG" (used 700+ times elsewhere, e.g.
 * plcDashboard.subtitle, sidebar.plcs.*, plc.errors.*); ES's is "Comunidad"
 * (same pattern). This is the DE/ES sibling of the FR "CAP" translation
 * already present in this namespace — fixed by using the same real terms,
 * not by inventing a new admin-only convention.
 *
 * Scoped strictly to `admin.plc.recovery` (not a whole-locale-file scan) so
 * it doesn't false-positive on legitimately different/untranslated "PLC"
 * uses elsewhere (there are none left, but the scope keeps this test's
 * intent narrow and its failure message precise).
 */
describe('admin.plc.recovery terminology — DE uses "PLG", ES uses "Comunidad", not raw "PLC"', () => {
  it('DE: no admin.plc.recovery value contains the untranslated acronym "PLC"', () => {
    const recovery = de.admin.plc.recovery as Record<string, string>;
    for (const [key, value] of Object.entries(recovery)) {
      expect(
        value,
        `de.admin.plc.recovery.${key} still says "PLC"`
      ).not.toMatch(/\bPLC\b/);
    }
  });

  it('ES: no admin.plc.recovery value contains the untranslated acronym "PLC"', () => {
    const recovery = es.admin.plc.recovery as Record<string, string>;
    for (const [key, value] of Object.entries(recovery)) {
      expect(
        value,
        `es.admin.plc.recovery.${key} still says "PLC"`
      ).not.toMatch(/\bPLC\b/);
    }
  });

  it('DE: admin.plc.recovery uses the established "PLG" term where EN says "PLC"', () => {
    const recovery = de.admin.plc.recovery as Record<string, string>;
    const enRecovery = en.admin.plc.recovery as Record<string, string>;
    for (const key of ['title', 'empty', 'dissolve'] as const) {
      if (/\bPLCs?\b/.test(enRecovery[key])) {
        expect(recovery[key], `de.admin.plc.recovery.${key}`).toMatch(/PLGs?/);
      }
    }
  });

  it('ES: admin.plc.recovery uses the established "Comunidad" term where EN says "PLC"', () => {
    const recovery = es.admin.plc.recovery as Record<string, string>;
    const enRecovery = en.admin.plc.recovery as Record<string, string>;
    for (const key of ['title', 'empty', 'dissolve'] as const) {
      if (/\bPLCs?\b/.test(enRecovery[key])) {
        expect(recovery[key], `es.admin.plc.recovery.${key}`).toMatch(
          /Comunidad(es)?/
        );
      }
    }
  });
});
