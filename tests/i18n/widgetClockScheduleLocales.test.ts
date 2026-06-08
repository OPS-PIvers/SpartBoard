/**
 * Regression test for missing widgets.clock and widgets.schedule namespaces
 * in DE, ES, and FR locales, and for missing sidebar.boards keys in DE and FR.
 *
 * GAPS FOUND (pre-fix):
 *   - `widgets.clock` (11 leaf keys incl. nested fonts/styles): entirely absent
 *     from DE and FR; ES had full parity.
 *   - `widgets.schedule` (2 keys): absent from ALL non-EN locales (DE, ES, FR).
 *   - `sidebar.boards.create`, `sidebar.boards.enterBoardData`,
 *     `sidebar.boards.imported`: missing from DE and FR; ES had full parity.
 *
 * AFFECTED COMPONENTS (no `defaultValue` fallback — loud bugs):
 *
 *   components/widgets/ClockWidget/Settings.tsx:
 *     t('widgets.clock.format24')          — line 26
 *     t('widgets.clock.showSeconds')       — line 36
 *     t('widgets.clock.fonts.inherit')     — line 51
 *     t('widgets.clock.fonts.digital')     — line 52
 *     t('widgets.clock.fonts.modern')      — line 53
 *     t('widgets.clock.fonts.school')      — line 56
 *     t('widgets.clock.styles.default')    — line 64
 *     t('widgets.clock.styles.lcd')        — line 65
 *     t('widgets.clock.styles.minimal')    — line 66
 *     t('widgets.clock.typography')        — line 74
 *     t('widgets.clock.displayStyle')      — line 99
 *     t('widgets.clock.colorPalette')      — line 122
 *     t('widgets.clock.glow')              — line 151
 *
 *   components/widgets/Schedule/components/ScheduleRow.tsx:
 *     t('widgets.schedule.startTimerUntil', { time }) — lines 233, 236
 *
 *   (sidebar.boards keys are used in components/layout/Sidebar.tsx without
 *   defaultValue — teachers see raw key paths when importing boards)
 *
 * This test loads locale JSON files directly so assertions fire before the
 * i18next runtime attempts (and silently skips) any fallback.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

// ─── widgets.clock keys ───────────────────────────────────────────────────────

/** Top-level string keys within widgets.clock */
const REQUIRED_CLOCK_TOP_KEYS = [
  'format24',
  'showSeconds',
  'typography',
  'displayStyle',
  'colorPalette',
  'glow',
] as const;

/** Keys within widgets.clock.fonts */
const REQUIRED_CLOCK_FONT_KEYS = [
  'inherit',
  'digital',
  'modern',
  'school',
] as const;

/** Keys within widgets.clock.styles */
const REQUIRED_CLOCK_STYLE_KEYS = ['default', 'lcd', 'minimal'] as const;

// ─── widgets.schedule keys ────────────────────────────────────────────────────

const REQUIRED_SCHEDULE_KEYS = ['startTimer', 'startTimerUntil'] as const;

// ─── sidebar.boards keys ─────────────────────────────────────────────────────

const REQUIRED_BOARDS_KEYS = ['create', 'enterBoardData', 'imported'] as const;

// ─── EN baseline ─────────────────────────────────────────────────────────────

describe('EN locale — widgets.clock baseline', () => {
  it('has a widgets.clock section', () => {
    expect(en).toHaveProperty(['widgets', 'clock']);
  });

  it('has all required top-level clock keys', () => {
    for (const key of REQUIRED_CLOCK_TOP_KEYS) {
      expect(
        en.widgets.clock,
        `en.widgets.clock.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });

  it('has a widgets.clock.fonts sub-section', () => {
    expect(
      en.widgets.clock,
      'en.widgets.clock.fonts is missing'
    ).toHaveProperty('fonts');
  });

  it('has all required widgets.clock.fonts keys', () => {
    for (const key of REQUIRED_CLOCK_FONT_KEYS) {
      expect(
        en.widgets.clock.fonts,
        `en.widgets.clock.fonts.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });

  it('has a widgets.clock.styles sub-section', () => {
    expect(
      en.widgets.clock,
      'en.widgets.clock.styles is missing'
    ).toHaveProperty('styles');
  });

  it('has all required widgets.clock.styles keys', () => {
    for (const key of REQUIRED_CLOCK_STYLE_KEYS) {
      expect(
        en.widgets.clock.styles,
        `en.widgets.clock.styles.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });
});

describe('EN locale — widgets.schedule baseline', () => {
  it('has a widgets.schedule section', () => {
    expect(en).toHaveProperty(['widgets', 'schedule']);
  });

  it('has all required schedule keys', () => {
    for (const key of REQUIRED_SCHEDULE_KEYS) {
      expect(
        en.widgets.schedule,
        `en.widgets.schedule.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });
});

describe('EN locale — sidebar.boards baseline', () => {
  it('has all required sidebar.boards keys', () => {
    for (const key of REQUIRED_BOARDS_KEYS) {
      expect(
        en.sidebar.boards,
        `en.sidebar.boards.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });
});

// ─── DE / ES / FR parity: widgets.clock ─────────────────────────────────────

describe.each([
  { code: 'de', locale: de },
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
])('$code locale — widgets.clock parity with EN', ({ code, locale }) => {
  it(`${code}: has a widgets.clock section`, () => {
    expect(
      locale,
      `${code}.widgets.clock section is entirely missing — LOUD bug (no defaultValue fallback)`
    ).toHaveProperty(['widgets', 'clock']);
  });

  it(`${code}: has all required top-level clock keys (no defaultValue — loud bugs)`, () => {
    for (const key of REQUIRED_CLOCK_TOP_KEYS) {
      expect(
        locale,
        `${code}.widgets.clock.${key} is missing — LOUD bug (no defaultValue fallback)`
      ).toHaveProperty(['widgets', 'clock', key]);
    }
  });

  it(`${code}: has a widgets.clock.fonts sub-section`, () => {
    expect(
      locale,
      `${code}.widgets.clock.fonts sub-section is missing`
    ).toHaveProperty(['widgets', 'clock', 'fonts']);
  });

  it(`${code}: has all required widgets.clock.fonts keys`, () => {
    for (const key of REQUIRED_CLOCK_FONT_KEYS) {
      expect(
        locale,
        `${code}.widgets.clock.fonts.${key} is missing`
      ).toHaveProperty(['widgets', 'clock', 'fonts', key]);
    }
  });

  it(`${code}: has a widgets.clock.styles sub-section`, () => {
    expect(
      locale,
      `${code}.widgets.clock.styles sub-section is missing`
    ).toHaveProperty(['widgets', 'clock', 'styles']);
  });

  it(`${code}: has all required widgets.clock.styles keys`, () => {
    for (const key of REQUIRED_CLOCK_STYLE_KEYS) {
      expect(
        locale,
        `${code}.widgets.clock.styles.${key} is missing`
      ).toHaveProperty(['widgets', 'clock', 'styles', key]);
    }
  });
});

// ─── DE / ES / FR parity: widgets.schedule ───────────────────────────────────

describe.each([
  { code: 'de', locale: de },
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
])('$code locale — widgets.schedule parity with EN', ({ code, locale }) => {
  it(`${code}: has a widgets.schedule section`, () => {
    expect(
      locale,
      `${code}.widgets.schedule section is entirely missing — LOUD bug (no defaultValue fallback)`
    ).toHaveProperty(['widgets', 'schedule']);
  });

  it(`${code}: has all required schedule keys (no defaultValue — loud bugs)`, () => {
    for (const key of REQUIRED_SCHEDULE_KEYS) {
      expect(
        locale,
        `${code}.widgets.schedule.${key} is missing — LOUD bug (no defaultValue fallback)`
      ).toHaveProperty(['widgets', 'schedule', key]);
    }
  });
});

// ─── DE / FR parity: sidebar.boards ─────────────────────────────────────────

describe.each([
  { code: 'de', locale: de },
  { code: 'fr', locale: fr },
])('$code locale — sidebar.boards missing keys', ({ code, locale }) => {
  it(`${code}: has all required sidebar.boards keys`, () => {
    for (const key of REQUIRED_BOARDS_KEYS) {
      expect(locale, `${code}.sidebar.boards.${key} is missing`).toHaveProperty(
        ['sidebar', 'boards', key]
      );
    }
  });
});
