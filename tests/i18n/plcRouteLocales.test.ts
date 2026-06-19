/**
 * Parity test for the Wave-1 PLC routing + error namespaces.
 *
 *   - `plcRoute.*` (T4): the `/plc...` route surfaces — loading / not-found
 *     cards (PlcRouteHost) and the index-hub copy.
 *   - `plc.errors.*` (T2): the membership-mutation error strings thrown by
 *     `usePlcs` (setMemberRole / transferLead / removeMember / leavePlc /
 *     createPlc / renamePlc) and routed through the i18next singleton.
 *
 * Both namespaces were added to EN during Wave 1 and translated into DE/ES/FR.
 * This test pins that every EN key is present in all three non-English locales
 * (and not silently dropped), so no language falls back to English for the
 * route shell or the membership error toasts.
 *
 * Loads each locale JSON directly (not via i18next) so it catches key-presence
 * issues before the i18next runtime swallows them.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

/** Keys within the `plcRoute` namespace (T4 routing surfaces). */
const REQUIRED_PLC_ROUTE_KEYS = [
  'loading',
  'notFoundTitle',
  'notFoundBody',
  'backToBoard',
  'hubTitle',
  'hubSubtitle',
  'hubEmptyTitle',
  'hubEmptySubtitle',
  'leadBadge',
  'memberCount',
  'memberCount_other',
] as const;

/** Keys within the `plc.errors` namespace (T2 membership-mutation errors). */
const REQUIRED_PLC_ERROR_KEYS = [
  'notSignedIn',
  'nameRequired',
  'accountEmailRequired',
  'plcNotFound',
  'leadCannotLeave',
  'leadCannotBeRemoved',
  'notAMember',
  'targetNotActiveMember',
  'cannotDemoteLead',
  'invalidRole',
] as const;

type LocaleFile = typeof en;

// ─── EN baseline ────────────────────────────────────────────────────────────

describe('EN locale — plcRoute / plc.errors baseline', () => {
  it('has a plcRoute section with all required keys', () => {
    expect(en).toHaveProperty('plcRoute');
    for (const key of REQUIRED_PLC_ROUTE_KEYS) {
      expect(
        (en as Record<string, unknown>).plcRoute,
        `en.plcRoute.${key} is missing`
      ).toHaveProperty(key);
    }
  });

  it('has a plc.errors section with all required keys', () => {
    const plc = (en as Record<string, unknown>).plc as
      | Record<string, unknown>
      | undefined;
    const errors = plc?.errors as Record<string, unknown> | undefined;
    for (const key of REQUIRED_PLC_ERROR_KEYS) {
      expect(errors, `en.plc.errors.${key} is missing`).toHaveProperty(key);
    }
  });
});

// ─── DE / ES / FR parity ────────────────────────────────────────────────────

describe.each([
  { code: 'de', locale: de as unknown as LocaleFile },
  { code: 'es', locale: es as unknown as LocaleFile },
  { code: 'fr', locale: fr as unknown as LocaleFile },
])(
  '$code locale — plcRoute / plc.errors parity with EN',
  ({ code, locale }) => {
    it(`${code}: has a plcRoute section`, () => {
      expect(
        locale,
        `${code}.plcRoute section is entirely missing`
      ).toHaveProperty('plcRoute');
    });

    it(`${code}: has all required plcRoute keys`, () => {
      const ns = (locale as Record<string, unknown>).plcRoute as
        | Record<string, unknown>
        | undefined;
      for (const key of REQUIRED_PLC_ROUTE_KEYS) {
        expect(ns, `${code}.plcRoute.${key} is missing`).toHaveProperty(key);
      }
    });

    it(`${code}: has all required plc.errors keys`, () => {
      const plc = (locale as Record<string, unknown>).plc as
        | Record<string, unknown>
        | undefined;
      const errors = plc?.errors as Record<string, unknown> | undefined;
      for (const key of REQUIRED_PLC_ERROR_KEYS) {
        expect(errors, `${code}.plc.errors.${key} is missing`).toHaveProperty(
          key
        );
      }
    });

    it(`${code}: plcRoute values are translated (not copied from EN)`, () => {
      const enNs = (en as Record<string, unknown>).plcRoute as Record<
        string,
        string
      >;
      const ns = (locale as Record<string, unknown>).plcRoute as Record<
        string,
        string
      >;
      // At least one substantive string must differ from EN — a wholesale copy
      // of the EN block would mean the namespace was never actually translated.
      const differing = REQUIRED_PLC_ROUTE_KEYS.filter(
        (k) => typeof ns[k] === 'string' && ns[k] !== enNs[k]
      );
      expect(
        differing.length,
        `${code}.plcRoute appears copied verbatim from EN (no translated values)`
      ).toBeGreaterThan(0);
    });
  }
);
