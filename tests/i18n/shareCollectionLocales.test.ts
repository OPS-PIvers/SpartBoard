/**
 * Regression test for the shareCollection verbatim-EN placeholder bug in
 * DE, ES, and FR locales.
 *
 * Ten keys in shareCollection were never translated and carried the English
 * source strings verbatim as placeholder values in all three non-English
 * locales. Because i18next only falls back when a key is *absent* — a key
 * with a stored value always renders that value, even when it is still in
 * English — the defect was invisible to key-presence checks and shipped
 * silently to non-English users (bug confirmed 2026-06-15).
 *
 * Affected keys (10):
 *   title, mode, copyMode, substituteMode, expiresIn, building,
 *   selectBuilding, createLink, creating, copy
 *
 * This test:
 *   1. Asserts all required shareCollection keys are present in each locale.
 *   2. Asserts that each of the previously-verbatim keys has been translated
 *      (i.e. its value differs from the EN source) — the critical verbatim
 *      guard introduced to prevent #1936/#1951/#1964-style regressions.
 *
 * Note: keys whose correct translation is legitimately identical to EN (e.g.
 * proper nouns, pure interpolation strings like "{{count}} q") are excluded
 * from the verbatim guard and are tested only for presence.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

/** All leaf keys that must exist under shareCollection. */
const REQUIRED_KEYS = [
  'title',
  'subtitle',
  'mode',
  'copyMode',
  'copyModeHint',
  'substituteMode',
  'substituteModeHint',
  'expiresIn',
  'building',
  'buildingRequired',
  'selectBuilding',
  'createLink',
  'creating',
  'createFailed',
  'linkReady',
  'linkCopied',
  'linkCopyFailed',
  'copy',
  'urlLabel',
  'imported',
  'partialImport',
  'importFailed',
  'notFound',
  'empty',
  'invalidShareUrl',
  'substituteImportRejected',
] as const;

/**
 * Keys that were previously left as verbatim-EN placeholders and MUST now
 * differ from the EN source value. This is the verbatim guard.
 *
 * We exclude keys whose correct translation is genuinely the same as the
 * English source (e.g. interpolation-only strings). All 10 keys that were
 * confirmed untranslated on 2026-06-15 are listed here.
 */
const MUST_DIFFER_FROM_EN_KEYS: readonly (keyof ShareCollectionSection)[] = [
  'title',
  'mode',
  'copyMode',
  'substituteMode',
  'expiresIn',
  'building',
  'selectBuilding',
  'createLink',
  'creating',
  'copy',
];

type ShareCollectionSection = (typeof en)['shareCollection'];

interface LocaleWithShareCollection {
  shareCollection: ShareCollectionSection;
}

function getShareCollection(
  locale: LocaleWithShareCollection
): ShareCollectionSection {
  return locale.shareCollection;
}

// ─── EN baseline ────────────────────────────────────────────────────────────

describe('EN locale — shareCollection baseline', () => {
  it('has a shareCollection section', () => {
    expect(en).toHaveProperty('shareCollection');
  });

  it('has all required shareCollection keys', () => {
    const sc = en.shareCollection;
    for (const key of REQUIRED_KEYS) {
      expect(sc, `en.shareCollection.${key} is missing from EN`).toHaveProperty(
        key
      );
    }
  });
});

// ─── DE / ES / FR parity ────────────────────────────────────────────────────

describe.each([
  { code: 'de', locale: de as unknown as LocaleWithShareCollection },
  { code: 'es', locale: es as unknown as LocaleWithShareCollection },
  { code: 'fr', locale: fr as unknown as LocaleWithShareCollection },
])('$code locale — shareCollection parity with EN', ({ code, locale }) => {
  const sc = getShareCollection(locale);
  const enSc = en.shareCollection;

  it(`${code}: has a shareCollection section`, () => {
    expect(
      locale,
      `${code}.shareCollection section is entirely missing`
    ).toHaveProperty('shareCollection');
  });

  it(`${code}: has all required shareCollection keys`, () => {
    for (const key of REQUIRED_KEYS) {
      expect(sc, `${code}.shareCollection.${key} is missing`).toHaveProperty(
        key
      );
    }
  });

  it(`${code}: verbatim-EN guard — previously-untranslated keys must differ from EN source`, () => {
    for (const key of MUST_DIFFER_FROM_EN_KEYS) {
      const localeValue = sc[key];
      const enValue = enSc[key];
      expect(
        localeValue,
        `${code}.shareCollection.${key} is still a verbatim-EN placeholder ` +
          `("${enValue}") — translate it for ${code} speakers`
      ).not.toBe(enValue);
    }
  });
});
