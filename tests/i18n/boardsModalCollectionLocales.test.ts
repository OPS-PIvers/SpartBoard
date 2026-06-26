/**
 * Regression test for EN-placeholder strings in boardsModal, shareCollection,
 * importSharedCollection, quickAccess, collectionMenu, subCollections,
 * templatePicker, and sidebar.boards namespaces.
 *
 * PROBLEM: All of these namespaces were added to de.json, es.json, and fr.json
 * with verbatim English values rather than real translations. Because the keys
 * ARE present in the non-EN locale files, i18next resolves them to the stored
 * English string without ever reaching the defaultValue fallback. DE, ES, and
 * FR teachers see raw English UI text throughout the Boards & Collections modal,
 * the Share Collection panel, the Import shared Collection modal, the Quick
 * Access widget picker, the Collection context menu, the sub-collections
 * listing, and the template picker.
 *
 * AFFECTED CALL SITES (representative sample — all use t() without a
 * defaultValue that would help, or with a defaultValue that is also English):
 *
 *   components/boardsModal/BoardsModal.tsx
 *     t('boardsModal.title')                        — modal heading
 *     t('boardsModal.empty')                        — empty-collection notice
 *     t('boardsModal.bulkDeleteConfirm')            — destructive confirm dialog
 *     t('boardsModal.deleteCollectionConfirm')      — destructive confirm dialog
 *     t('boardsModal.noBoardsInSelection')          — bulk-action guard
 *     t('boardsModal.searchPlaceholder')            — search input
 *     ... (40+ keys total)
 *
 *   components/boardsModal/BoardContextMenu.tsx
 *     t('boardsModal.menu.duplicate')               — context menu item
 *     t('boardsModal.menu.saveAsTemplate')          — context menu item
 *     t('boardsModal.menu.setDefault')              — context menu item
 *
 *   components/share/ShareCollectionLinkCreatorModal.tsx
 *     t('shareCollection.title'), t('shareCollection.subtitle'), etc.
 *
 *   components/share/ImportSharedCollectionModal.tsx
 *     t('importSharedCollection.title'), etc.
 *
 *   components/quickAccessModal/QuickAccessModal.tsx
 *     t('quickAccess.title'), t('quickAccess.emptyResults'), etc.
 *
 *   components/subs/SubCollectionsList.tsx
 *     t('subCollections.loading'), t('subCollections.openBoard'), etc.
 *
 *   components/boardsModal/CreateFromTemplateModal.tsx
 *     t('templatePicker.title'), t('templatePicker.loading'), etc.
 *
 *   components/layout/sidebar/SidebarBoardsActive.tsx
 *     t('sidebar.boards.activeCollection'), t('sidebar.boards.manageAll')
 *
 * This test loads the locale JSON files directly (not through i18next) so the
 * assertions fire regardless of any defaultValue fallbacks in the call sites.
 *
 * The test asserts two things:
 *   1. The keys are present in each non-EN locale.
 *   2. The stored value is NOT equal to the English source string — confirming
 *      it has been genuinely translated rather than left as an EN placeholder.
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

// ---------------------------------------------------------------------------
// Keys to assert are translated (not equal to EN source value).
// Each entry: [dotted.key.path, EN source value]
// We focus on the multi-word human-visible strings most likely to confuse
// teachers if shown in English on a non-EN locale.
// ---------------------------------------------------------------------------

/** boardsModal keys with multi-word English values that must be translated */
const BOARDS_MODAL_TRANSLATED_KEYS: [string[], string][] = [
  [['boardsModal', 'title'], en.boardsModal.title],
  [['boardsModal', 'searchPlaceholder'], en.boardsModal.searchPlaceholder],
  [['boardsModal', 'pinnedEmpty'], en.boardsModal.pinnedEmpty],
  [['boardsModal', 'empty'], en.boardsModal.empty],
  [['boardsModal', 'moveTitle'], en.boardsModal.moveTitle],
  [['boardsModal', 'moveDestination'], en.boardsModal.moveDestination],
  [['boardsModal', 'deleteBoardConfirm'], en.boardsModal.deleteBoardConfirm],
  [
    ['boardsModal', 'deleteCollectionConfirm'],
    en.boardsModal.deleteCollectionConfirm,
  ],
  [['boardsModal', 'bulkDeleteConfirm'], en.boardsModal.bulkDeleteConfirm],
  [['boardsModal', 'noBoardsInSelection'], en.boardsModal.noBoardsInSelection],
  [['boardsModal', 'manageAll'], en.boardsModal.manageAll],
  [['boardsModal', 'menu', 'duplicate'], en.boardsModal.menu.duplicate],
  [
    ['boardsModal', 'menu', 'saveAsTemplate'],
    en.boardsModal.menu.saveAsTemplate,
  ],
  [['boardsModal', 'menu', 'setDefault'], en.boardsModal.menu.setDefault],
  [['boardsModal', 'colorPicker', 'title'], en.boardsModal.colorPicker.title],
  [
    ['boardsModal', 'colorPicker', 'swatches'],
    en.boardsModal.colorPicker.swatches,
  ],
  [['boardsModal', 'dndFailed'], en.boardsModal.dndFailed],
  [['boardsModal', 'bulkAllFailed'], en.boardsModal.bulkAllFailed],
];

/** shareCollection keys */
const SHARE_COLLECTION_TRANSLATED_KEYS: [string[], string][] = [
  [['shareCollection', 'title'], en.shareCollection.title],
  [['shareCollection', 'subtitle'], en.shareCollection.subtitle],
  [['shareCollection', 'copyModeHint'], en.shareCollection.copyModeHint],
  [
    ['shareCollection', 'substituteModeHint'],
    en.shareCollection.substituteModeHint,
  ],
  [
    ['shareCollection', 'buildingRequired'],
    en.shareCollection.buildingRequired,
  ],
  [['shareCollection', 'linkCopied'], en.shareCollection.linkCopied],
  [['shareCollection', 'linkCopyFailed'], en.shareCollection.linkCopyFailed],
  [['shareCollection', 'createFailed'], en.shareCollection.createFailed],
  [['shareCollection', 'importFailed'], en.shareCollection.importFailed],
  [['shareCollection', 'notFound'], en.shareCollection.notFound],
  [['shareCollection', 'empty'], en.shareCollection.empty],
  [
    ['shareCollection', 'substituteImportRejected'],
    en.shareCollection.substituteImportRejected,
  ],
];

/** importSharedCollection keys */
const IMPORT_SHARED_COLLECTION_TRANSLATED_KEYS: [string[], string][] = [
  [['importSharedCollection', 'title'], en.importSharedCollection.title],
  [['importSharedCollection', 'loading'], en.importSharedCollection.loading],
  [['importSharedCollection', 'notFound'], en.importSharedCollection.notFound],
  [['importSharedCollection', 'import'], en.importSharedCollection.import],
  [
    ['importSharedCollection', 'substituteOnly'],
    en.importSharedCollection.substituteOnly,
  ],
];

/** quickAccess keys */
const QUICK_ACCESS_TRANSLATED_KEYS: [string[], string][] = [
  [['quickAccess', 'title'], en.quickAccess.title],
  [['quickAccess', 'searchPlaceholder'], en.quickAccess.searchPlaceholder],
  [['quickAccess', 'emptyResults'], en.quickAccess.emptyResults],
];

/** collectionMenu keys */
const COLLECTION_MENU_TRANSLATED_KEYS: [string[], string][] = [
  [['collectionMenu', 'share'], en.collectionMenu.share],
  [['collectionMenu', 'saveAsTemplate'], en.collectionMenu.saveAsTemplate],
];

/** subCollections keys */
const SUB_COLLECTIONS_TRANSLATED_KEYS: [string[], string][] = [
  [['subCollections', 'loading'], en.subCollections.loading],
  [['subCollections', 'loadError'], en.subCollections.loadError],
  [['subCollections', 'openBoard'], en.subCollections.openBoard],
];

/** templatePicker keys */
const TEMPLATE_PICKER_TRANSLATED_KEYS: [string[], string][] = [
  [['templatePicker', 'title'], en.templatePicker.title],
  [['templatePicker', 'loading'], en.templatePicker.loading],
  [['templatePicker', 'loadError'], en.templatePicker.loadError],
  [['templatePicker', 'empty'], en.templatePicker.empty],
  [['templatePicker', 'kindCollection'], en.templatePicker.kindCollection],
];

/** sidebar.boards keys that were stored as English placeholders */
const SIDEBAR_BOARDS_TRANSLATED_KEYS: [string[], string][] = [
  [
    ['sidebar', 'boards', 'activeCollection'],
    en.sidebar.boards.activeCollection,
  ],
  [['sidebar', 'boards', 'manageAll'], en.sidebar.boards.manageAll],
];

// ---------------------------------------------------------------------------
// Helper: walk a dotted path into a nested object
// ---------------------------------------------------------------------------

function get(obj: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>(
    (acc, key) => (acc as Record<string, unknown>)?.[key],
    obj
  );
}

// ---------------------------------------------------------------------------
// EN baseline — sanity-check a sample of keys exist in EN
// ---------------------------------------------------------------------------

describe('EN locale — boards/collections i18n baseline', () => {
  it('has boardsModal.title', () => {
    expect(en.boardsModal).toHaveProperty('title');
  });
  it('has shareCollection.title', () => {
    expect(en.shareCollection).toHaveProperty('title');
  });
  it('has importSharedCollection.title', () => {
    expect(en.importSharedCollection).toHaveProperty('title');
  });
  it('has quickAccess.title', () => {
    expect(en.quickAccess).toHaveProperty('title');
  });
  it('has collectionMenu.share', () => {
    expect(en.collectionMenu).toHaveProperty('share');
  });
  it('has subCollections.loading', () => {
    expect(en.subCollections).toHaveProperty('loading');
  });
  it('has templatePicker.title', () => {
    expect(en.templatePicker).toHaveProperty('title');
  });
  it('has sidebar.boards.activeCollection', () => {
    expect(en.sidebar.boards).toHaveProperty('activeCollection');
  });
  it('has sidebar.boards.manageAll', () => {
    expect(en.sidebar.boards).toHaveProperty('manageAll');
  });
});

// ---------------------------------------------------------------------------
// Non-EN locales: boardsModal must NOT carry EN placeholder strings
// ---------------------------------------------------------------------------

describe.each(NON_EN)(
  '$code locale — boardsModal translated (not EN placeholder)',
  ({ code, locale }) => {
    for (const [keyPath, enValue] of BOARDS_MODAL_TRANSLATED_KEYS) {
      const dotted = keyPath.join('.');
      it(`${code}: ${dotted} is not the English placeholder`, () => {
        const val = get(locale as unknown as Record<string, unknown>, keyPath);
        expect(
          val,
          `${code}.${dotted} is missing — key must be present in non-EN locale`
        ).toBeDefined();
        expect(
          val,
          `${code}.${dotted} is still the verbatim English string "${enValue}" — needs a real translation`
        ).not.toBe(enValue);
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Non-EN locales: shareCollection must NOT carry EN placeholder strings
// ---------------------------------------------------------------------------

describe.each(NON_EN)(
  '$code locale — shareCollection translated (not EN placeholder)',
  ({ code, locale }) => {
    for (const [keyPath, enValue] of SHARE_COLLECTION_TRANSLATED_KEYS) {
      const dotted = keyPath.join('.');
      it(`${code}: ${dotted} is not the English placeholder`, () => {
        const val = get(locale as unknown as Record<string, unknown>, keyPath);
        expect(
          val,
          `${code}.${dotted} is missing — key must be present in non-EN locale`
        ).toBeDefined();
        expect(
          val,
          `${code}.${dotted} is still the verbatim English string "${enValue}" — needs a real translation`
        ).not.toBe(enValue);
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Non-EN locales: importSharedCollection must NOT carry EN placeholder strings
// ---------------------------------------------------------------------------

describe.each(NON_EN)(
  '$code locale — importSharedCollection translated (not EN placeholder)',
  ({ code, locale }) => {
    for (const [keyPath, enValue] of IMPORT_SHARED_COLLECTION_TRANSLATED_KEYS) {
      const dotted = keyPath.join('.');
      it(`${code}: ${dotted} is not the English placeholder`, () => {
        const val = get(locale as unknown as Record<string, unknown>, keyPath);
        expect(
          val,
          `${code}.${dotted} is missing — key must be present in non-EN locale`
        ).toBeDefined();
        expect(
          val,
          `${code}.${dotted} is still the verbatim English string "${enValue}" — needs a real translation`
        ).not.toBe(enValue);
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Non-EN locales: quickAccess must NOT carry EN placeholder strings
// ---------------------------------------------------------------------------

describe.each(NON_EN)(
  '$code locale — quickAccess translated (not EN placeholder)',
  ({ code, locale }) => {
    for (const [keyPath, enValue] of QUICK_ACCESS_TRANSLATED_KEYS) {
      const dotted = keyPath.join('.');
      it(`${code}: ${dotted} is not the English placeholder`, () => {
        const val = get(locale as unknown as Record<string, unknown>, keyPath);
        expect(
          val,
          `${code}.${dotted} is missing — key must be present in non-EN locale`
        ).toBeDefined();
        expect(
          val,
          `${code}.${dotted} is still the verbatim English string "${enValue}" — needs a real translation`
        ).not.toBe(enValue);
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Non-EN locales: collectionMenu must NOT carry EN placeholder strings
// ---------------------------------------------------------------------------

describe.each(NON_EN)(
  '$code locale — collectionMenu translated (not EN placeholder)',
  ({ code, locale }) => {
    for (const [keyPath, enValue] of COLLECTION_MENU_TRANSLATED_KEYS) {
      const dotted = keyPath.join('.');
      it(`${code}: ${dotted} is not the English placeholder`, () => {
        const val = get(locale as unknown as Record<string, unknown>, keyPath);
        expect(
          val,
          `${code}.${dotted} is missing — key must be present in non-EN locale`
        ).toBeDefined();
        expect(
          val,
          `${code}.${dotted} is still the verbatim English string "${enValue}" — needs a real translation`
        ).not.toBe(enValue);
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Non-EN locales: subCollections must NOT carry EN placeholder strings
// ---------------------------------------------------------------------------

describe.each(NON_EN)(
  '$code locale — subCollections translated (not EN placeholder)',
  ({ code, locale }) => {
    for (const [keyPath, enValue] of SUB_COLLECTIONS_TRANSLATED_KEYS) {
      const dotted = keyPath.join('.');
      it(`${code}: ${dotted} is not the English placeholder`, () => {
        const val = get(locale as unknown as Record<string, unknown>, keyPath);
        expect(
          val,
          `${code}.${dotted} is missing — key must be present in non-EN locale`
        ).toBeDefined();
        expect(
          val,
          `${code}.${dotted} is still the verbatim English string "${enValue}" — needs a real translation`
        ).not.toBe(enValue);
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Non-EN locales: templatePicker must NOT carry EN placeholder strings
// ---------------------------------------------------------------------------

describe.each(NON_EN)(
  '$code locale — templatePicker translated (not EN placeholder)',
  ({ code, locale }) => {
    for (const [keyPath, enValue] of TEMPLATE_PICKER_TRANSLATED_KEYS) {
      const dotted = keyPath.join('.');
      it(`${code}: ${dotted} is not the English placeholder`, () => {
        const val = get(locale as unknown as Record<string, unknown>, keyPath);
        expect(
          val,
          `${code}.${dotted} is missing — key must be present in non-EN locale`
        ).toBeDefined();
        expect(
          val,
          `${code}.${dotted} is still the verbatim English string "${enValue}" — needs a real translation`
        ).not.toBe(enValue);
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Non-EN locales: sidebar.boards must NOT carry EN placeholder strings
// ---------------------------------------------------------------------------

describe.each(NON_EN)(
  '$code locale — sidebar.boards translated (not EN placeholder)',
  ({ code, locale }) => {
    for (const [keyPath, enValue] of SIDEBAR_BOARDS_TRANSLATED_KEYS) {
      const dotted = keyPath.join('.');
      it(`${code}: ${dotted} is not the English placeholder`, () => {
        const val = get(locale as unknown as Record<string, unknown>, keyPath);
        expect(
          val,
          `${code}.${dotted} is missing — key must be present in non-EN locale`
        ).toBeDefined();
        expect(
          val,
          `${code}.${dotted} is still the verbatim English string "${enValue}" — needs a real translation`
        ).not.toBe(enValue);
      });
    }
  }
);
