/**
 * Regression test for missing sidebar.header.* and whatsNew locale keys in
 * non-English locales.
 *
 * Two separate features were shipped with English strings but their i18n keys
 * were never propagated to DE, ES, or FR:
 *
 * 1. sidebar.header.{live,more,moreWidgets,openTools,createFolder} — five new
 *    Dock/sidebar UI labels added to Dock.tsx and Sidebar.tsx.  The keys were
 *    appended to the EN sidebar.header object but the non-English locale files
 *    were not updated, so all three languages silently render the raw key path
 *    string (e.g. "sidebar.header.live") on screen.
 *
 * 2. whatsNew.* (13 keys) — the entire WhatsNew namespace was added to EN
 *    (WhatsNewModal.tsx) but was never added to DE, ES, or FR.  The component
 *    uses i18next defaultValue fallbacks, which masks the gap at runtime but
 *    still means non-English users always see English strings in the modal.
 *
 * This test loads locale JSON directly (not via i18next) so key-presence issues
 * are caught before the i18next runtime silently swallows them.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

// ---------------------------------------------------------------------------
// sidebar.header keys added alongside new Dock/sidebar UI features
// ---------------------------------------------------------------------------

const NEW_SIDEBAR_HEADER_KEYS = [
  'live',
  'more',
  'moreWidgets',
  'openTools',
  'createFolder',
] as const;

type LocaleFile = typeof en;

describe('EN locale — sidebar.header new-key baseline', () => {
  it('has all new sidebar.header keys', () => {
    for (const key of NEW_SIDEBAR_HEADER_KEYS) {
      expect(
        en.sidebar.header,
        `en.sidebar.header.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });
});

describe.each([
  { code: 'de', locale: de as unknown as LocaleFile },
  { code: 'es', locale: es as unknown as LocaleFile },
  { code: 'fr', locale: fr as unknown as LocaleFile },
])('$code locale — sidebar.header parity with EN', ({ code, locale }) => {
  it(`${code}: has all new sidebar.header keys`, () => {
    for (const key of NEW_SIDEBAR_HEADER_KEYS) {
      expect(
        locale.sidebar.header,
        `${code}.sidebar.header.${key} is missing`
      ).toHaveProperty(key);
    }
  });
});

// ---------------------------------------------------------------------------
// whatsNew namespace — added for the What's New modal feature
// ---------------------------------------------------------------------------

const REQUIRED_WHATS_NEW_KEYS = [
  'title',
  'updateNow',
  'later',
  'close',
  'readFullUpdate',
  'showLess',
  'loading',
  'error',
  'previewEmpty',
  'browseEmpty',
] as const;

const REQUIRED_WHATS_NEW_GROUP_KEYS = [
  'feature',
  'improvement',
  'fix',
] as const;

describe('EN locale — whatsNew baseline', () => {
  it('has a whatsNew section', () => {
    expect(en).toHaveProperty('whatsNew');
  });

  it('has all required whatsNew keys', () => {
    for (const key of REQUIRED_WHATS_NEW_KEYS) {
      expect(
        en.whatsNew,
        `en.whatsNew.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });

  it('has all required whatsNew.groups keys', () => {
    for (const key of REQUIRED_WHATS_NEW_GROUP_KEYS) {
      expect(
        en.whatsNew.groups,
        `en.whatsNew.groups.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });
});

describe.each([
  { code: 'de', locale: de as unknown as LocaleFile },
  { code: 'es', locale: es as unknown as LocaleFile },
  { code: 'fr', locale: fr as unknown as LocaleFile },
])('$code locale — whatsNew parity with EN', ({ code, locale }) => {
  it(`${code}: has a whatsNew section`, () => {
    expect(
      locale,
      `${code}.whatsNew section is entirely missing`
    ).toHaveProperty('whatsNew');
  });

  it(`${code}: has all required whatsNew keys`, () => {
    const whatsNew = (locale as Record<string, unknown>).whatsNew as
      | Record<string, unknown>
      | undefined;
    for (const key of REQUIRED_WHATS_NEW_KEYS) {
      expect(whatsNew, `${code}.whatsNew.${key} is missing`).toHaveProperty(
        key
      );
    }
  });

  it(`${code}: has all required whatsNew.groups keys`, () => {
    const whatsNew = (locale as Record<string, unknown>).whatsNew as
      | Record<string, Record<string, unknown>>
      | undefined;
    const groups = whatsNew?.groups;
    for (const key of REQUIRED_WHATS_NEW_GROUP_KEYS) {
      expect(
        groups,
        `${code}.whatsNew.groups.${key} is missing`
      ).toHaveProperty(key);
    }
  });
});
