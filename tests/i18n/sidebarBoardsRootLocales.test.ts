/**
 * Regression test for sidebar.boards.rootBoards verbatim-EN placeholder bug.
 *
 * The sidebar.boards.rootBoards key was set to the English string 'Boards' in
 * DE, ES, and FR locales. This causes the breadcrumb label shown in
 * SidebarBoardsActive.tsx (line: t('sidebar.boards.rootBoards', ...)) to display
 * the English word "Boards" to German, Spanish, and French users instead of the
 * correct translated term.
 *
 * Evidence: every other key that translates "Boards" in each locale uses the
 * correct term (DE='Tafeln', ES='Tableros', FR='Tableaux') — e.g.
 * boardsModal.allBoards, boardsModal.boards, boardNav.boardList.
 *
 * This test:
 * 1. Checks that all 4 locales carry the sidebar.boards.rootBoards key.
 * 2. Checks that DE, ES, and FR each use their established locale-native
 *    translation, NOT the verbatim English string.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

type LocaleFile = typeof en;

const EN_VALUE = en.sidebar.boards.rootBoards; // 'Boards'

describe('EN locale — sidebar.boards.rootBoards baseline', () => {
  it('has the sidebar.boards.rootBoards key', () => {
    expect(en.sidebar.boards).toHaveProperty('rootBoards');
  });
  it('EN value is "Boards"', () => {
    expect(EN_VALUE).toBe('Boards');
  });
});

describe.each([
  {
    code: 'de',
    locale: de as unknown as LocaleFile,
    expectedValue: 'Tafeln',
  },
  {
    code: 'es',
    locale: es as unknown as LocaleFile,
    expectedValue: 'Tableros',
  },
  {
    code: 'fr',
    locale: fr as unknown as LocaleFile,
    expectedValue: 'Tableaux',
  },
])(
  '$code locale — sidebar.boards.rootBoards translation',
  ({ code, locale, expectedValue }) => {
    it(`${code}: has the sidebar.boards.rootBoards key`, () => {
      expect(
        locale.sidebar.boards,
        `${code}.sidebar.boards.rootBoards is missing`
      ).toHaveProperty('rootBoards');
    });

    it(`${code}: value is not the verbatim English string`, () => {
      const value = locale.sidebar.boards.rootBoards;
      expect(
        value,
        `${code}.sidebar.boards.rootBoards is still the verbatim EN string '${EN_VALUE}' — should be '${expectedValue}'`
      ).not.toBe(EN_VALUE);
    });

    it(`${code}: value is the locale-native translation`, () => {
      const value = locale.sidebar.boards.rootBoards;
      expect(
        value,
        `${code}.sidebar.boards.rootBoards should be '${expectedValue}' but got '${value}'`
      ).toBe(expectedValue);
    });
  }
);
