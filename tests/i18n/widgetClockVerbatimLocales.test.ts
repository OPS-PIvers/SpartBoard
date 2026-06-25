/**
 * Regression test for verbatim-English values stored in FR (and for
 * styles.minimal also in DE) for widgets.clock.fonts.digital and
 * widgets.clock.styles.minimal.
 *
 * BUG SUMMARY
 * -----------
 *
 * 1. FR widgets.clock.fonts.digital = "Digital"  (verbatim EN)
 *    Proof of error: within the same FR locale file, widgets.timeTool.digital
 *    is correctly set to "Numérique".  The clock variant was never updated —
 *    a copy-paste oversight.
 *    Correct value: "Numérique"
 *
 * 2. DE widgets.clock.styles.minimal = "Minimal"  (verbatim EN)
 *    FR widgets.clock.styles.minimal = "Minimal"  (verbatim EN)
 *    Proof of error: ES correctly translates this as "Minimalista" while DE
 *    and FR both kept the untranslated EN placeholder.
 *    Correct values: DE → "Minimalistisch", FR → "Minimaliste"
 *
 * WHY THESE ARE LOUD BUGS (no silent fallback)
 * --------------------------------------------
 * Both keys are used via t() WITHOUT a defaultValue fallback in two
 * components, meaning i18next renders whatever is stored in the locale file
 * verbatim — including a wrong-language placeholder:
 *
 *   components/widgets/ClockWidget/Settings.tsx:
 *     t('widgets.clock.fonts.digital')     — line 52   (no defaultValue)
 *     t('widgets.clock.styles.minimal')    — line 66   (no defaultValue)
 *
 *   components/widgets/TimeTool/Settings.tsx:
 *     t('widgets.clock.fonts.digital')     — line 457  (no defaultValue)
 *     t('widgets.clock.styles.minimal')    — line 469  (no defaultValue)
 *
 * French and German teachers see English text in the Clock and TimeTool
 * widget settings panels whenever they open the font or style selectors.
 *
 * This test loads locale JSON files directly so assertions fire before the
 * i18next runtime would attempt (and silently skip) any fallback.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

// ─── EN baseline ─────────────────────────────────────────────────────────────

describe('EN locale — widgets.clock.fonts.digital and styles.minimal baseline', () => {
  it('has widgets.clock.fonts.digital', () => {
    expect(en.widgets.clock.fonts).toHaveProperty('digital');
  });

  it('has widgets.clock.styles.minimal', () => {
    expect(en.widgets.clock.styles).toHaveProperty('minimal');
  });
});

// ─── FR: clock.fonts.digital must be "Numérique", not "Digital" ──────────────
//
// The same locale correctly translates widgets.timeTool.digital as "Numérique".
// The clock variant was left at the EN placeholder — an obvious oversight.

describe('FR locale — widgets.clock.fonts.digital must not be verbatim EN', () => {
  it('fr: widgets.clock.fonts.digital is present', () => {
    expect(fr, 'fr.widgets.clock.fonts.digital is missing').toHaveProperty([
      'widgets',
      'clock',
      'fonts',
      'digital',
    ]);
  });

  it('fr: widgets.clock.fonts.digital is NOT the verbatim English value "Digital"', () => {
    expect(
      fr.widgets.clock.fonts.digital,
      'fr.widgets.clock.fonts.digital is still the English placeholder — ' +
        "t('widgets.clock.fonts.digital') has no defaultValue in " +
        'ClockWidget/Settings.tsx:52 and TimeTool/Settings.tsx:457, so ' +
        'FR users see English text in the font selector. ' +
        'Note: fr.widgets.timeTool.digital is already correctly set to ' +
        '"Numérique" — this key was simply missed.'
    ).not.toBe(en.widgets.clock.fonts.digital);
  });
});

// ─── DE + FR: clock.styles.minimal must be localised, not verbatim EN ────────
//
// ES already has "Minimalista" — DE and FR kept "Minimal" (the EN value).

describe.each([
  { code: 'de', locale: de },
  { code: 'fr', locale: fr },
])(
  '$code locale — widgets.clock.styles.minimal must not be verbatim EN',
  ({ code, locale }) => {
    it(`${code}: widgets.clock.styles.minimal is present`, () => {
      expect(
        locale,
        `${code}.widgets.clock.styles.minimal is missing`
      ).toHaveProperty(['widgets', 'clock', 'styles', 'minimal']);
    });

    it(`${code}: widgets.clock.styles.minimal is NOT the verbatim English value "Minimal"`, () => {
      expect(
        (locale as typeof en).widgets.clock.styles.minimal,
        `${code}.widgets.clock.styles.minimal is still the English placeholder — ` +
          `t('widgets.clock.styles.minimal') has no defaultValue in ` +
          `ClockWidget/Settings.tsx:66 and TimeTool/Settings.tsx:469, so ` +
          `${code} users see English text in the style selector. ` +
          `ES already has the correct localised value ("Minimalista").`
      ).not.toBe(en.widgets.clock.styles.minimal);
    });
  }
);

// ─── ES sanity check — must not regress ──────────────────────────────────────

describe('ES locale — widgets.clock sanity check (must not regress)', () => {
  it('es: widgets.clock.styles.minimal is not verbatim EN ("Minimalista")', () => {
    expect(
      es.widgets.clock.styles.minimal,
      'es.widgets.clock.styles.minimal regressed to the English value'
    ).not.toBe(en.widgets.clock.styles.minimal);
  });

  it('es: widgets.clock.fonts.digital is present', () => {
    // ES uses "Digital" as well — it is an accepted Spanish loanword.
    // We only guard that the key is present for ES.
    expect(es.widgets.clock.fonts).toHaveProperty('digital');
  });
});
