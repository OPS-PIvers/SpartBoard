/**
 * Regression test for the missing widgets.random sub-namespace in DE, ES, and
 * FR locales.
 *
 * The `widgets.random` namespace was added to EN when the Randomizer widget
 * gained Scoreboard integration, jigsaw grouping, absence tracking, and class
 * context features. The entire namespace was never propagated to DE, ES, or FR.
 *
 * Three call sites in RandomWidget.tsx use these keys WITHOUT a `defaultValue`
 * fallback, making them "loud" bugs — non-English users see raw key paths
 * rendered directly in the UI:
 *
 *   - t('widgets.random.sendToScoreboard')    — aria-label + title on the
 *       "Send to Scoreboard" button (line ~1943, ~1950)
 *   - t('widgets.random.scoreboardUpdated')   — addToast() success message
 *       shown after updating a scoreboard (line ~853)
 *   - t('widgets.random.scoreboardCreated')   — addToast() success message
 *       shown after creating a scoreboard (line ~864)
 *
 * When a German, Spanish, or French teacher clicks the Scoreboard button after
 * randomizing groups, the toast displays "widgets.random.scoreboardCreated"
 * verbatim. The button itself shows "widgets.random.sendToScoreboard" as its
 * tooltip. This test catches the regression before the i18next runtime silently
 * skips the missing key.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

/**
 * Keys within widgets.random that are called via t() WITHOUT a defaultValue
 * fallback — these are the "loud" bugs that render raw key paths in the UI.
 */
const REQUIRED_RANDOM_KEYS_NO_DEFAULT = [
  'sendToScoreboard',
  'scoreboardCreated',
  'scoreboardUpdated',
] as const;

/**
 * All leaf keys within widgets.random that must be present for full locale
 * parity with EN (covers all UI strings, including those with defaultValue).
 */
const REQUIRED_RANDOM_TOP_KEYS = [
  'sendToScoreboard',
  'scoreboardCreated',
  'scoreboardUpdated',
  'shuffleHint',
  'groupSize',
  'expertLabelShort',
  'homeLabelShort',
  'launchJigsaw',
  'launchJigsawHint',
  'launchHomeGroup',
  'launchHomeGroupHint',
  'everyoneAbsentTitle',
  'everyoneAbsentSubtitle',
  'updateAttendance',
  'stepperDecrease',
  'stepperIncrease',
  'modeChipAria',
  'modeChipTitle',
  'expertGroupCount',
  'homeGroupCount',
  'expertGroupCountReduced',
  'homeGroupCountReduced',
  'jigsawNeedsMultipleGroups',
  'restrictionsUnsatisfied',
] as const;

/** Sub-sections that must exist under widgets.random */
const REQUIRED_RANDOM_SUBSECTIONS = [
  'modes',
  'absent',
  'classContext',
] as const;

/** Keys within widgets.random.modes */
const REQUIRED_MODES_KEYS = ['single', 'shuffle', 'groups', 'jigsaw'] as const;

/** Keys within widgets.random.absent */
const REQUIRED_ABSENT_KEYS = [
  'title',
  'summary',
  'buttonLabel',
  'clearAll',
  'footer',
  'emptyRoster',
  'unnamedStudent',
  'ariaLabel',
] as const;

/** Keys within widgets.random.classContext */
const REQUIRED_CLASS_CONTEXT_KEYS = [
  'triggerAria',
  'menuAria',
  'switchHeading',
  'markAbsentAction',
] as const;

// ─── EN baseline ─────────────────────────────────────────────────────────────

describe('EN locale — widgets.random baseline', () => {
  it('has a widgets.random section', () => {
    expect(en).toHaveProperty(['widgets', 'random']);
  });

  it('has all required top-level keys (no-defaultValue group)', () => {
    for (const key of REQUIRED_RANDOM_KEYS_NO_DEFAULT) {
      expect(
        en.widgets.random,
        `en.widgets.random.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });

  it('has all required sub-sections', () => {
    for (const section of REQUIRED_RANDOM_SUBSECTIONS) {
      expect(
        en.widgets.random,
        `en.widgets.random.${section} is missing from EN`
      ).toHaveProperty(section);
    }
  });

  it('has all required widgets.random.modes keys', () => {
    for (const key of REQUIRED_MODES_KEYS) {
      expect(
        en.widgets.random.modes,
        `en.widgets.random.modes.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });
});

// ─── DE / ES / FR parity ─────────────────────────────────────────────────────

describe.each([
  { code: 'de', locale: de },
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
])('$code locale — widgets.random parity with EN', ({ code, locale }) => {
  it(`${code}: has a widgets.random section`, () => {
    expect(
      locale,
      `${code}.widgets.random section is entirely missing`
    ).toHaveProperty(['widgets', 'random']);
  });

  it(`${code}: has all required top-level keys (no-defaultValue group — loud bugs)`, () => {
    for (const key of REQUIRED_RANDOM_KEYS_NO_DEFAULT) {
      expect(
        locale,
        `${code}.widgets.random.${key} is missing — this is a LOUD bug (no defaultValue fallback)`
      ).toHaveProperty(['widgets', 'random', key]);
    }
  });

  it(`${code}: has all required top-level keys`, () => {
    for (const key of REQUIRED_RANDOM_TOP_KEYS) {
      expect(locale, `${code}.widgets.random.${key} is missing`).toHaveProperty(
        ['widgets', 'random', key]
      );
    }
  });

  it(`${code}: has all required sub-sections`, () => {
    for (const section of REQUIRED_RANDOM_SUBSECTIONS) {
      expect(
        locale,
        `${code}.widgets.random.${section} section is missing`
      ).toHaveProperty(['widgets', 'random', section]);
    }
  });

  it(`${code}: has all required widgets.random.modes keys`, () => {
    for (const key of REQUIRED_MODES_KEYS) {
      expect(
        locale,
        `${code}.widgets.random.modes.${key} is missing`
      ).toHaveProperty(['widgets', 'random', 'modes', key]);
    }
  });

  it(`${code}: has all required widgets.random.absent keys`, () => {
    for (const key of REQUIRED_ABSENT_KEYS) {
      expect(
        locale,
        `${code}.widgets.random.absent.${key} is missing`
      ).toHaveProperty(['widgets', 'random', 'absent', key]);
    }
  });

  it(`${code}: has all required widgets.random.classContext keys`, () => {
    for (const key of REQUIRED_CLASS_CONTEXT_KEYS) {
      expect(
        locale,
        `${code}.widgets.random.classContext.${key} is missing`
      ).toHaveProperty(['widgets', 'random', 'classContext', key]);
    }
  });
});
