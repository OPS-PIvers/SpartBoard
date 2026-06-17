/**
 * Regression test for two verbatim-English values found in the German locale:
 *
 *   1. remote.boardPicker.title — stored as 'Boards' (verbatim EN) in DE.
 *      ES='Tableros', FR='Tableaux' were correct; DE was silently returning
 *      the English string. Because the key is present in de.json, i18next
 *      resolves it to 'Boards' and the defaultValue fallback never triggers.
 *      Correct German: 'Tafeln'.
 *
 *   2. widgets.random.homeLabelShort — stored as 'HOME' (verbatim EN) in DE.
 *      ES='BASE', FR='ACCUEIL' were correct; DE was silently returning
 *      the English string. Context: this is the badge label shown on home-group
 *      cards in the jigsaw/group widget — the surrounding DE strings say
 *      "Heimgruppen starten" / "Zu Heimgruppen zurückkehren", so the German
 *      abbreviation should be 'HEIM'.
 *      Correct German: 'HEIM'.
 *
 * This test loads each locale JSON directly (not via i18next) so the values
 * are verified regardless of defaultValue fallbacks or i18next runtime behaviour.
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

describe('EN locale — remote.boardPicker and widgets.random.homeLabelShort baseline', () => {
  it('has remote.boardPicker.title', () => {
    expect(en.remote?.boardPicker).toHaveProperty('title');
  });

  it('has widgets.random.homeLabelShort', () => {
    expect(en.widgets?.random).toHaveProperty('homeLabelShort');
  });
});

// ---------------------------------------------------------------------------
// Non-EN locales — keys must be present AND must not be verbatim English
// ---------------------------------------------------------------------------

describe.each(NON_EN)(
  '$code locale — remote.boardPicker.title and widgets.random.homeLabelShort are translated',
  ({ code, locale }) => {
    // ── remote.boardPicker.title ──────────────────────────────────────────────

    it(`${code}: remote.boardPicker.title is present`, () => {
      expect(
        (locale as Record<string, unknown>).remote,
        `${code}.remote.boardPicker.title is missing`
      ).toHaveProperty(['boardPicker', 'title']);
    });

    it(`${code}: remote.boardPicker.title is not the verbatim English value "${en.remote?.boardPicker?.title}"`, () => {
      const actual = (
        (locale as Record<string, unknown>).remote as Record<string, unknown>
      )?.boardPicker as Record<string, unknown> | undefined;
      expect(
        actual?.title,
        `${code}.remote.boardPicker.title is still the English placeholder — needs a real translation`
      ).not.toBe(en.remote?.boardPicker?.title);
    });

    // ── widgets.random.homeLabelShort ─────────────────────────────────────────

    it(`${code}: widgets.random.homeLabelShort is present`, () => {
      expect(
        locale.widgets?.random,
        `${code}.widgets.random.homeLabelShort is missing`
      ).toHaveProperty('homeLabelShort');
    });

    it(`${code}: widgets.random.homeLabelShort is not the verbatim English value "${en.widgets?.random?.homeLabelShort}"`, () => {
      const val = locale.widgets?.random?.homeLabelShort;
      expect(
        val,
        `${code}.widgets.random.homeLabelShort is still the English placeholder — needs a real translation`
      ).not.toBe(en.widgets?.random?.homeLabelShort);
    });
  }
);

// ---------------------------------------------------------------------------
// DE-specific assertions — verify the exact correct German translations
// ---------------------------------------------------------------------------

describe('DE locale — exact German translations', () => {
  it('de: remote.boardPicker.title is "Tafeln"', () => {
    const remote = (de as unknown as Record<string, unknown>).remote as
      | Record<string, unknown>
      | undefined;
    const boardPicker = remote?.boardPicker as
      | Record<string, unknown>
      | undefined;
    expect(boardPicker?.title).toBe('Tafeln');
  });

  it('de: widgets.random.homeLabelShort is "HEIM"', () => {
    expect((de as unknown as LocaleFile).widgets?.random?.homeLabelShort).toBe(
      'HEIM'
    );
  });
});
