/**
 * Regression test for missing widgetWindow action keys in DE and FR locales.
 *
 * The `widgetWindow` namespace received nine new action keys across two
 * commits:
 *
 *   - 6c03932 feat(spotify): added `takeScreenshot`, `annotate`, `duplicate`,
 *     `restore`, `maximize`, `minimize` to EN + ES but forgot DE and FR.
 *   - 68e6f96 feat(widget): FAB kebab when maximized added `moreActions`,
 *     `recordScreen`, `stopRecording` to EN + ES but again skipped DE and FR.
 *
 * All nine keys are used in `components/common/DraggableWindow.tsx` via bare
 * `t('widgetWindow.<key>')` calls with NO `defaultValue` fallback.  When a
 * German or French user opens SpartBoard, every affected button aria-label /
 * tooltip shows the raw key path (e.g. "widgetWindow.maximize") instead of a
 * translated or even English string.
 *
 * Affected call sites (no defaultValue):
 *   t('widgetWindow.annotate')        — lines 2696, 2938
 *   t('widgetWindow.duplicate')       — line 2951
 *   t('widgetWindow.moreActions')     — line 2732
 *   t('widgetWindow.recordScreen')    — line 2711
 *   t('widgetWindow.stopRecording')   — line 2710
 *   t('widgetWindow.restore')         — lines 2748, 3172
 *   t('widgetWindow.maximize')        — line 3173
 *   t('widgetWindow.minimize')        — line 3187
 *
 * This test loads each locale JSON directly so the assertion fires even
 * before the i18next runtime would attempt (and silently skip) the fallback.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

/**
 * Keys that are used without a `defaultValue` in DraggableWindow.tsx and
 * therefore show raw key paths in non-EN locales if missing.
 */
const REQUIRED_WIDGET_WINDOW_ACTION_KEYS = [
  'takeScreenshot',
  'annotate',
  'duplicate',
  'moreActions',
  'recordScreen',
  'stopRecording',
  'restore',
  'maximize',
  'minimize',
] as const;

// ─── EN baseline ─────────────────────────────────────────────────────────────

describe('EN locale — widgetWindow action keys baseline', () => {
  it('has a widgetWindow section', () => {
    expect(en).toHaveProperty('widgetWindow');
  });

  it('has all required widgetWindow action keys', () => {
    for (const key of REQUIRED_WIDGET_WINDOW_ACTION_KEYS) {
      expect(
        en.widgetWindow,
        `en.widgetWindow.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });
});

// ─── DE / ES / FR parity ─────────────────────────────────────────────────────

describe.each([
  { code: 'de', locale: de },
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
])(
  '$code locale — widgetWindow action keys parity with EN',
  ({ code, locale }) => {
    it(`${code}: has a widgetWindow section`, () => {
      expect(
        locale,
        `${code}.widgetWindow section is entirely missing`
      ).toHaveProperty('widgetWindow');
    });

    it(`${code}: has all required widgetWindow action keys`, () => {
      for (const key of REQUIRED_WIDGET_WINDOW_ACTION_KEYS) {
        expect(locale, `${code}.widgetWindow.${key} is missing`).toHaveProperty(
          ['widgetWindow', key]
        );
      }
    });
  }
);
