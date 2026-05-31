/**
 * Regression test for missing dock live-session and boardNav navigation keys
 * in non-English locales.
 *
 * These keys are rendered in teacher-facing UI:
 *   - dock.liveSession, dock.provideCode, dock.viewLiveSession, dock.noAppsSelected
 *     are used in Dock.tsx for the live-session panel and the dock restoration UI.
 *     None of them use i18next `defaultValue` fallbacks, so missing translations
 *     render as raw EN strings for German, Spanish, and French teachers.
 *   - boardNav.manageAllBoards, boardNav.pinned, boardNav.selectCollection
 *     are used in BoardNavFab.tsx. They use `defaultValue` which silences missing-
 *     key errors — meaning these bugs are invisible at runtime but break the
 *     localization contract.
 *   - sidebar.nav.whatsNewSrAnnouncement is used in Sidebar.tsx as a screen-reader
 *     announcement rendered via a visually-hidden element; missing translation means
 *     SR users in non-EN locales hear English text.
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

type LocaleFile = typeof en;

const NON_EN = [
  { code: 'de', locale: de as unknown as LocaleFile },
  { code: 'es', locale: es as unknown as LocaleFile },
  { code: 'fr', locale: fr as unknown as LocaleFile },
];

/** dock keys used in Dock.tsx for the live-session panel. */
const DOCK_LIVE_KEYS = [
  'liveSession',
  'provideCode',
  'viewLiveSession',
  'noAppsSelected',
] as const;

/** boardNav keys used in BoardNavFab.tsx. */
const BOARD_NAV_KEYS = [
  'manageAllBoards',
  'pinned',
  'selectCollection',
] as const;

describe('EN locale — baseline', () => {
  it('has all required dock live-session keys', () => {
    for (const key of DOCK_LIVE_KEYS) {
      expect(en.dock, `en.dock.${key} missing from EN baseline`).toHaveProperty(
        key
      );
    }
  });

  it('has all required boardNav navigation keys', () => {
    for (const key of BOARD_NAV_KEYS) {
      expect(
        en.boardNav,
        `en.boardNav.${key} missing from EN baseline`
      ).toHaveProperty(key);
    }
  });

  it('has sidebar.nav.whatsNewSrAnnouncement', () => {
    expect(en.sidebar.nav).toHaveProperty('whatsNewSrAnnouncement');
  });
});

describe.each(NON_EN)(
  '$code locale — dock, boardNav, and sidebar.nav parity with EN',
  ({ code, locale }) => {
    it(`${code}: has all dock live-session keys`, () => {
      const dock = (locale as Record<string, unknown>).dock as
        | Record<string, unknown>
        | undefined;
      for (const key of DOCK_LIVE_KEYS) {
        expect(dock, `${code}.dock.${key} is missing`).toHaveProperty(key);
      }
    });

    it(`${code}: has all boardNav navigation keys`, () => {
      const boardNav = (locale as Record<string, unknown>).boardNav as
        | Record<string, unknown>
        | undefined;
      for (const key of BOARD_NAV_KEYS) {
        expect(boardNav, `${code}.boardNav.${key} is missing`).toHaveProperty(
          key
        );
      }
    });

    it(`${code}: has sidebar.nav.whatsNewSrAnnouncement`, () => {
      const nav = (
        (locale as Record<string, unknown>).sidebar as
          | Record<string, unknown>
          | undefined
      )?.nav as Record<string, unknown> | undefined;
      expect(
        nav,
        `${code}.sidebar.nav.whatsNewSrAnnouncement is missing`
      ).toHaveProperty('whatsNewSrAnnouncement');
    });
  }
);
