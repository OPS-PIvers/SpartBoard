/**
 * Regression test for plcDashboard.search.groupBoards stored as verbatim
 * English "Boards" in the DE locale.
 *
 * ROOT CAUSE
 * ----------
 * The Wave-4 T9 per-PLC search box (PlcSearchBox.tsx) categorises search
 * results into groups. The group-label keys were added to all four locales as
 * part of the Wave-4 rollout, but `groupBoards` in DE was left as the English
 * placeholder "Boards" instead of the project-wide German equivalent "Tafeln".
 *
 * Every other "board" string in the DE locale uses "Tafel(n)":
 *   - boardsModal.allBoards     → "Tafeln"
 *   - boardsModal.boards        → "Tafeln"
 *   - boardNav.boardList        → "Alle Tafeln"
 *   - plcDashboard.tabs.sharedBoards → "Tafeln"
 *
 * ES and FR are correctly translated ("Tableros", "Tableaux").
 *
 * AFFECTED CALL SITE
 * ------------------
 * components/plc/search/PlcSearchBox.tsx — line 80:
 *   {
 *     key: 'plcDashboard.search.groupBoards',
 *     defaultValue: 'Boards',          ← fires only if key is ABSENT
 *   }
 *
 * Because the DE locale has the key present (just wrong), the defaultValue
 * never fires — German users see "Boards" instead of "Tafeln" in the search
 * result group header. This is a silent verbatim-EN bug.
 *
 * HOW TO VERIFY WITHOUT THIS TEST
 * --------------------------------
 *   pnpm exec vitest run tests/i18n/plcDashboardLocales.test.ts
 *   → All assertions pass, because that test only checks key presence.
 *   The verbatim "Boards" value is never compared against the EN source.
 *
 * FIX
 * ---
 * Set locales/de.json plcDashboard.search.groupBoards to "Tafeln".
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

type LocaleFile = typeof en;

/** Dotted path walker — returns the leaf string or undefined. */
function getLeaf(root: unknown, path: string): string | undefined {
  let node: unknown = root;
  for (const segment of path.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

const EN_VALUE = getLeaf(en, 'plcDashboard.search.groupBoards'); // "Boards"

// ─── EN baseline ─────────────────────────────────────────────────────────────

describe('EN locale — plcDashboard.search.groupBoards baseline', () => {
  it('key exists', () => {
    expect(
      getLeaf(en, 'plcDashboard.search.groupBoards'),
      'en.plcDashboard.search.groupBoards is missing'
    ).toBeDefined();
  });

  it('EN value is "Boards"', () => {
    expect(EN_VALUE).toBe('Boards');
  });
});

// ─── DE / ES / FR translations ───────────────────────────────────────────────

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
  '$code locale — plcDashboard.search.groupBoards translation',
  ({ code, locale, expectedValue }) => {
    it(`${code}: key is present`, () => {
      expect(
        getLeaf(locale, 'plcDashboard.search.groupBoards'),
        `${code}.plcDashboard.search.groupBoards is missing`
      ).toBeDefined();
    });

    it(`${code}: value is not the verbatim English string "Boards"`, () => {
      const value = getLeaf(locale, 'plcDashboard.search.groupBoards');
      expect(
        value,
        `${code}.plcDashboard.search.groupBoards is still the verbatim EN string "Boards" — ` +
          `should be "${expectedValue}". ` +
          `This is a silent bug: the key is present so the defaultValue fallback never fires, ` +
          `but German users see "Boards" instead of "Tafeln".`
      ).not.toBe(EN_VALUE);
    });

    it(`${code}: value is the locale-native translation`, () => {
      const value = getLeaf(locale, 'plcDashboard.search.groupBoards');
      expect(
        value,
        `${code}.plcDashboard.search.groupBoards should be "${expectedValue}" but got "${value}"`
      ).toBe(expectedValue);
    });
  }
);
