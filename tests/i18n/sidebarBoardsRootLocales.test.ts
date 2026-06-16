// Regression: sidebar.boards.rootBoards was stored as verbatim EN 'Boards' in DE/ES/FR — fixes PR #1983.

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
