/**
 * Regression test for verbatim-English translations in collection-UI namespaces.
 *
 * When the Collections / Boards modal, Share Collection, Import Shared
 * Collection, Sub Collections, Template Picker, Quick Access, and Style
 * features were added, their locale strings were planted as English text in DE,
 * ES, and FR instead of being translated. Because i18next resolves any stored
 * value — including a verbatim copy of the English source — the fallback
 * mechanism does NOT fire. Non-English teachers silently see English UI text
 * throughout these high-traffic panels.
 *
 * This test loads each locale JSON directly (not via i18next) and:
 *  1. Asserts all affected keys are present in DE, ES, and FR.
 *  2. Asserts that each translated value is NOT the same as the English source
 *     string (verbatim-copy detection).
 *
 * It was designed to FAIL before the fix (verbatim English) and PASS after.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

type LocaleFile = typeof en;

// ---------------------------------------------------------------------------
// Keys that were verbatim English in DE / ES / FR prior to the fix.
// Each entry is { namespace, key } matching the top-level JSON structure.
// ---------------------------------------------------------------------------

/** sidebar.boards keys that were untranslated */
const SIDEBAR_BOARDS_KEYS = ['manageAll'] as const;

/** boardsModal keys that were untranslated (excluding nested menu.*) */
const BOARDS_MODAL_KEYS = [
  'searchPlaceholder',
  'manageAll',
  'pinnedEmpty',
  'empty',
  'moveTitle',
  'moveDestination',
  'rootDestination',
  'bulkDeleteConfirm',
  'deleteBoardConfirm',
  'deleteCollectionConfirm',
  'dragToMove',
  'colorSaveFailed',
  'collectionMoveFailed',
  'dndFailed',
  'bulkDeleteSuccess',
  'bulkPinSuccess',
  'bulkUnpinSuccess',
  'bulkMoveSuccess',
  'bulkPartialFailure',
  'bulkAllFailed',
  'noBoardsInSelection',
  'createCollectionFailed',
] as const;

/** boardsModal.menu keys that were untranslated */
const BOARDS_MODAL_MENU_KEYS = ['setDefault', 'saveAsTemplate'] as const;

/** shareCollection keys that were untranslated */
const SHARE_COLLECTION_KEYS = [
  'subtitle',
  'copyModeHint',
  'substituteModeHint',
  'buildingRequired',
  'createFailed',
  'linkReady',
  'linkCopied',
  'linkCopyFailed',
  'urlLabel',
  'imported',
  'partialImport',
  'importFailed',
  'notFound',
  'empty',
  'invalidShareUrl',
  'substituteImportRejected',
] as const;

/** importSharedCollection keys that were untranslated */
const IMPORT_SHARED_COLLECTION_KEYS = [
  'title',
  'loading',
  'notFound',
  'shared',
  'substituteOnly',
] as const;

/** subCollections keys that were untranslated */
const SUB_COLLECTIONS_KEYS = ['loading', 'loadError', 'comingSoon'] as const;

/** collectionMenu keys that were untranslated */
const COLLECTION_MENU_KEYS = ['saveAsTemplate'] as const;

/** templatePicker keys that were untranslated */
const TEMPLATE_PICKER_KEYS = [
  'title',
  'loadError',
  'empty',
  'kindCollection',
] as const;

/** backgrounds keys that were untranslated */
const BACKGROUNDS_KEYS = ['favoriteSaveFailed', 'uploadFailed'] as const;

/** quickAccess keys that were untranslated */
const QUICK_ACCESS_KEYS = ['title', 'emptyResults'] as const;

/** style keys that were untranslated */
const STYLE_KEYS = ['readOnlyNotice'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RecordLike = Record<string, unknown>;

function assertTranslated(
  locale: LocaleFile,
  enLocale: LocaleFile,
  langCode: string,
  ns: keyof LocaleFile,
  key: string,
  enSection: RecordLike,
  langSection: RecordLike | undefined
) {
  expect(
    langSection,
    `${langCode}.${String(ns)}.${key} is missing`
  ).toHaveProperty(key);

  const enVal = enSection[key];
  const langVal = langSection?.[key];

  // Only assert non-verbatim for string values; skip interpolation-only strings
  if (typeof enVal === 'string' && typeof langVal === 'string') {
    expect(
      langVal,
      `${langCode}.${String(ns)}.${key} is a verbatim copy of the English source ("${enVal}") — it must be translated`
    ).not.toBe(enVal);
  }
}

// ---------------------------------------------------------------------------
// EN baseline — sanity check that our key lists match what EN actually has
// ---------------------------------------------------------------------------

describe('EN locale — collection-UI baseline', () => {
  it('has sidebar.boards.manageAll', () => {
    expect(en.sidebar.boards).toHaveProperty('manageAll');
  });

  it('has all expected boardsModal keys', () => {
    for (const key of BOARDS_MODAL_KEYS) {
      expect(en.boardsModal, `en.boardsModal.${key} missing`).toHaveProperty(
        key
      );
    }
  });

  it('has all expected boardsModal.menu keys', () => {
    for (const key of BOARDS_MODAL_MENU_KEYS) {
      expect(
        en.boardsModal.menu,
        `en.boardsModal.menu.${key} missing`
      ).toHaveProperty(key);
    }
  });

  it('has all expected shareCollection keys', () => {
    for (const key of SHARE_COLLECTION_KEYS) {
      expect(
        en.shareCollection,
        `en.shareCollection.${key} missing`
      ).toHaveProperty(key);
    }
  });

  it('has all expected importSharedCollection keys', () => {
    for (const key of IMPORT_SHARED_COLLECTION_KEYS) {
      expect(
        en.importSharedCollection,
        `en.importSharedCollection.${key} missing`
      ).toHaveProperty(key);
    }
  });

  it('has all expected subCollections keys', () => {
    for (const key of SUB_COLLECTIONS_KEYS) {
      expect(
        en.subCollections,
        `en.subCollections.${key} missing`
      ).toHaveProperty(key);
    }
  });

  it('has all expected collectionMenu keys', () => {
    for (const key of COLLECTION_MENU_KEYS) {
      expect(
        en.collectionMenu,
        `en.collectionMenu.${key} missing`
      ).toHaveProperty(key);
    }
  });

  it('has all expected templatePicker keys', () => {
    for (const key of TEMPLATE_PICKER_KEYS) {
      expect(
        en.templatePicker,
        `en.templatePicker.${key} missing`
      ).toHaveProperty(key);
    }
  });

  it('has all expected backgrounds keys', () => {
    for (const key of BACKGROUNDS_KEYS) {
      expect(en.backgrounds, `en.backgrounds.${key} missing`).toHaveProperty(
        key
      );
    }
  });

  it('has all expected quickAccess keys', () => {
    for (const key of QUICK_ACCESS_KEYS) {
      expect(en.quickAccess, `en.quickAccess.${key} missing`).toHaveProperty(
        key
      );
    }
  });

  it('has all expected style keys', () => {
    for (const key of STYLE_KEYS) {
      expect(en.style, `en.style.${key} missing`).toHaveProperty(key);
    }
  });
});

// ---------------------------------------------------------------------------
// DE / ES / FR parity + non-verbatim checks
// ---------------------------------------------------------------------------

describe.each([
  { code: 'de', locale: de as unknown as LocaleFile },
  { code: 'es', locale: es as unknown as LocaleFile },
  { code: 'fr', locale: fr as unknown as LocaleFile },
])(
  '$code locale — collection-UI translations must not be verbatim English',
  ({ code, locale }) => {
    it(`${code}: sidebar.boards.manageAll is translated`, () => {
      const enBoards = en.sidebar.boards as RecordLike;
      const langBoards = (locale.sidebar as RecordLike)?.boards as
        | RecordLike
        | undefined;
      for (const key of SIDEBAR_BOARDS_KEYS) {
        // assertTranslated checks presence on langBoards and non-verbatim vs enBoards
        assertTranslated(
          locale,
          en,
          code,
          'sidebar',
          key,
          enBoards,
          langBoards
        );
      }
    });

    it(`${code}: boardsModal keys are present and translated`, () => {
      const enSection = en.boardsModal as RecordLike;
      const langSection = locale.boardsModal as RecordLike | undefined;
      for (const key of BOARDS_MODAL_KEYS) {
        assertTranslated(
          locale,
          en,
          code,
          'boardsModal',
          key,
          enSection,
          langSection
        );
      }
    });

    it(`${code}: boardsModal.menu keys are present and translated`, () => {
      const enSection = en.boardsModal.menu as RecordLike;
      const langSection = (locale.boardsModal as RecordLike | undefined)
        ?.menu as RecordLike | undefined;
      for (const key of BOARDS_MODAL_MENU_KEYS) {
        // Pass menu sub-object as section and bare key (not dotted) so
        // toHaveProperty checks the key directly on the menu object.
        assertTranslated(
          locale,
          en,
          code,
          'boardsModal',
          key,
          enSection,
          langSection
        );
      }
    });

    it(`${code}: shareCollection keys are present and translated`, () => {
      const enSection = en.shareCollection as RecordLike;
      const langSection = locale.shareCollection as RecordLike | undefined;
      for (const key of SHARE_COLLECTION_KEYS) {
        assertTranslated(
          locale,
          en,
          code,
          'shareCollection',
          key,
          enSection,
          langSection
        );
      }
    });

    it(`${code}: importSharedCollection keys are present and translated`, () => {
      const enSection = en.importSharedCollection as RecordLike;
      const langSection = locale.importSharedCollection as
        | RecordLike
        | undefined;
      for (const key of IMPORT_SHARED_COLLECTION_KEYS) {
        assertTranslated(
          locale,
          en,
          code,
          'importSharedCollection',
          key,
          enSection,
          langSection
        );
      }
    });

    it(`${code}: subCollections keys are present and translated`, () => {
      const enSection = en.subCollections as RecordLike;
      const langSection = locale.subCollections as RecordLike | undefined;
      for (const key of SUB_COLLECTIONS_KEYS) {
        assertTranslated(
          locale,
          en,
          code,
          'subCollections',
          key,
          enSection,
          langSection
        );
      }
    });

    it(`${code}: collectionMenu keys are present and translated`, () => {
      const enSection = en.collectionMenu as RecordLike;
      const langSection = locale.collectionMenu as RecordLike | undefined;
      for (const key of COLLECTION_MENU_KEYS) {
        assertTranslated(
          locale,
          en,
          code,
          'collectionMenu',
          key,
          enSection,
          langSection
        );
      }
    });

    it(`${code}: templatePicker keys are present and translated`, () => {
      const enSection = en.templatePicker as RecordLike;
      const langSection = locale.templatePicker as RecordLike | undefined;
      for (const key of TEMPLATE_PICKER_KEYS) {
        assertTranslated(
          locale,
          en,
          code,
          'templatePicker',
          key,
          enSection,
          langSection
        );
      }
    });

    it(`${code}: backgrounds.favoriteSaveFailed and uploadFailed are translated`, () => {
      const enSection = en.backgrounds as RecordLike;
      const langSection = locale.backgrounds as RecordLike | undefined;
      for (const key of BACKGROUNDS_KEYS) {
        assertTranslated(
          locale,
          en,
          code,
          'backgrounds',
          key,
          enSection,
          langSection
        );
      }
    });

    it(`${code}: quickAccess keys are present and translated`, () => {
      const enSection = en.quickAccess as RecordLike;
      const langSection = locale.quickAccess as RecordLike | undefined;
      for (const key of QUICK_ACCESS_KEYS) {
        assertTranslated(
          locale,
          en,
          code,
          'quickAccess',
          key,
          enSection,
          langSection
        );
      }
    });

    it(`${code}: style.readOnlyNotice is translated`, () => {
      const enSection = en.style as RecordLike;
      const langSection = locale.style as RecordLike | undefined;
      for (const key of STYLE_KEYS) {
        assertTranslated(
          locale,
          en,
          code,
          'style',
          key,
          enSection,
          langSection
        );
      }
    });
  }
);
