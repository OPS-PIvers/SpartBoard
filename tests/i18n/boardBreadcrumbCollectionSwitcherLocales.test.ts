/**
 * Regression test for boardBreadcrumb.openManager and collectionSwitcher.title
 * placeholder translations in non-English locales.
 *
 * Both keys existed in DE, ES, and FR but were set to their verbatim English
 * source strings ("Manage Boards" and "Switch Collection") rather than proper
 * translations.  Because the keys are present in the locale files, i18next
 * resolves them to those English strings even for DE/ES/FR teachers — the
 * `defaultValue` fallback is only used when the key is absent entirely, not
 * when a wrong value is stored.
 *
 * Components affected:
 *   - BoardBreadcrumb.tsx: t('boardBreadcrumb.openManager', { defaultValue: 'Manage Boards' })
 *     used as the aria-label on the breadcrumb pill button.
 *   - CollectionSwitcherMenu.tsx: t('collectionSwitcher.title', { defaultValue: 'Switch Collection' })
 *     used both as the aria-label on the menu <div> and as the visible section heading.
 *
 * This test loads the locale JSON files directly (not through i18next) so the
 * issue is caught regardless of defaultValue fallbacks or i18next runtime behaviour.
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
// EN baseline — confirm the keys exist with the expected English values
// ---------------------------------------------------------------------------

describe('EN locale — boardBreadcrumb and collectionSwitcher baseline', () => {
  it('has boardBreadcrumb.openManager', () => {
    expect(en.boardBreadcrumb).toHaveProperty('openManager');
  });

  it('has collectionSwitcher.title', () => {
    expect(en.collectionSwitcher).toHaveProperty('title');
  });
});

// ---------------------------------------------------------------------------
// Non-EN locales — keys must be present AND must not be verbatim English
// ---------------------------------------------------------------------------

describe.each(NON_EN)(
  '$code locale — boardBreadcrumb and collectionSwitcher are translated',
  ({ code, locale }) => {
    it(`${code}: boardBreadcrumb.openManager is present`, () => {
      expect(
        locale.boardBreadcrumb,
        `${code}.boardBreadcrumb.openManager is missing`
      ).toHaveProperty('openManager');
    });

    it(`${code}: boardBreadcrumb.openManager is not the English placeholder "Manage Boards"`, () => {
      const val = locale.boardBreadcrumb.openManager;
      expect(
        val,
        `${code}.boardBreadcrumb.openManager is still the English placeholder — needs a real translation`
      ).not.toBe(en.boardBreadcrumb.openManager);
    });

    it(`${code}: boardBreadcrumb.root is not the English source "No Collection"`, () => {
      const val = locale.boardBreadcrumb.root;
      expect(
        val,
        `${code}.boardBreadcrumb.root is still the English source — needs a real translation`
      ).not.toBe(en.boardBreadcrumb.root);
    });

    it(`${code}: collectionSwitcher.title is present`, () => {
      expect(
        locale.collectionSwitcher,
        `${code}.collectionSwitcher.title is missing`
      ).toHaveProperty('title');
    });

    it(`${code}: collectionSwitcher.title is not the English placeholder "Switch Collection"`, () => {
      const val = locale.collectionSwitcher.title;
      expect(
        val,
        `${code}.collectionSwitcher.title is still the English placeholder — needs a real translation`
      ).not.toBe(en.collectionSwitcher.title);
    });

    it(`${code}: collectionSwitcher.root is not the English source "No Collection"`, () => {
      const val = locale.collectionSwitcher.root;
      expect(
        val,
        `${code}.collectionSwitcher.root is still the English source — needs a real translation`
      ).not.toBe(en.collectionSwitcher.root);
    });
  }
);
