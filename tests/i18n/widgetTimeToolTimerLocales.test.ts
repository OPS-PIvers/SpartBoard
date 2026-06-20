/**
 * Regression test: widgets.timeTool.timer in DE is a verbatim-English placeholder.
 *
 * The TimeTool settings panel shows a two-button mode selector whose labels are
 * rendered via bare t() calls with no defaultValue fallback:
 *
 *   components/widgets/TimeTool/Settings.tsx line 107:
 *     t('widgets.timeTool.timer')   ← Timer mode button label
 *   components/widgets/TimeTool/Settings.tsx line 108:
 *     t('widgets.timeTool.stopwatch')  ← Stopwatch mode button label
 *
 * The German translator correctly rendered "Stopwatch" as the native compound
 * "Stoppuhr", but left "Timer" as the verbatim English loanword "Timer".  Because
 * the key IS present in de.json (value "Timer"), i18next resolves it to "Timer"
 * rather than triggering any defaultValue fallback — the bug is invisible at
 * runtime without a value-equality check.
 *
 * ES uses "Temporizador" and FR uses "Minuteur", both native-language words for
 * the countdown-timer concept, confirming the intent was to localise this label.
 * The consistent German companion for "Stoppuhr" is "Countdown" (Duden-attested
 * loanword for countdown timers) or the compound "Countdown-Uhr".
 *
 * Test strategy: load locale JSON directly (not via i18next) and assert that
 * de.widgets.timeTool.timer is PRESENT and NOT equal to the EN source string.
 * This is the "value ≠ EN source" pattern from remoteBoardPickerAndRandomHomeLocales.
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

// ── EN baseline ──────────────────────────────────────────────────────────────

describe('EN locale — widgets.timeTool.timer baseline', () => {
  it('has widgets.timeTool.timer', () => {
    expect(en.widgets.timeTool).toHaveProperty('timer');
  });

  it('EN widgets.timeTool.timer is "Timer"', () => {
    expect(en.widgets.timeTool.timer).toBe('Timer');
  });
});

// ── DE / ES / FR parity and value checks ─────────────────────────────────────

describe.each(NON_EN)(
  '$code locale — widgets.timeTool.timer must be translated',
  ({ code, locale }) => {
    it(`${code}: widgets.timeTool.timer is present`, () => {
      expect(
        locale.widgets?.timeTool,
        `${code}.widgets.timeTool.timer is missing`
      ).toHaveProperty('timer');
    });

    it(`${code}: widgets.timeTool.timer is not the verbatim English value "${en.widgets.timeTool.timer}"`, () => {
      expect(
        locale.widgets?.timeTool?.timer,
        `${code}.widgets.timeTool.timer is still the English placeholder — needs a real translation`
      ).not.toBe(en.widgets.timeTool.timer);
    });
  }
);

// ── DE-specific exact-value assertion ────────────────────────────────────────

describe('DE locale — exact German translation', () => {
  it('de: widgets.timeTool.timer is "Countdown"', () => {
    expect((de as unknown as LocaleFile).widgets?.timeTool?.timer).toBe(
      'Countdown'
    );
  });
});
