/**
 * Regression test for missing widgets.timeTool namespace in DE and FR locales,
 * partial gaps (15 keys) in ES, and 4 hardcoded-English Stations section strings
 * that were not extracted to i18n keys (autoRotateStations, addStationsTip,
 * rotateStationsClockwise, rotateStationsOnEnd).
 *
 * GAPS FOUND (pre-fix, batch 1 — commit ad13e57):
 *   - `widgets.timeTool` (35 leaf keys): entirely absent from DE and FR.
 *   - `widgets.timeTool` in ES: missing 15 keys (autoPickRandomStudent,
 *     addRandomizerTip, autoPickNext, triggerRandomizerWhenTimerEnds,
 *     autoAdvanceNextUpQueue, addNextUpTip, autoAdvanceNext, advanceQueueOnEnd,
 *     adjustStep, adjustStepHint, adjustStepUnit, addTime, subtractTime,
 *     play, pause, reset).
 *
 * GAPS FOUND (pre-fix, batch 2 — this commit):
 *   - `widgets.timeTool.autoRotateStations` — missing from ALL locales (new key).
 *   - `widgets.timeTool.addStationsTip`       — missing from ALL locales (new key).
 *   - `widgets.timeTool.rotateStationsClockwise` — missing from ALL locales (new key).
 *   - `widgets.timeTool.rotateStationsOnEnd`  — missing from ALL locales (new key).
 *   All four were hardcoded English strings in Settings.tsx (lines 369, 374-376,
 *   383, 385-386) with no t() call at all — silent English fallback for ALL
 *   non-English users.
 *
 * AFFECTED COMPONENTS (no `defaultValue` fallback — loud bugs):
 *
 *   components/widgets/TimeTool/TimeToolWidget.tsx:
 *     t('widgets.timeTool.backspace')      — line 281
 *     t('widgets.timeTool.confirmTime')    — line 302
 *     t('widgets.timeTool.closeKeypad')    — line 321
 *     t('widgets.timeTool.subtractTime')   — line 549
 *     t('widgets.timeTool.reset')          — line 597
 *     t('widgets.timeTool.addTime')        — line 605
 *
 *   components/widgets/TimeTool/Settings.tsx:
 *     t('widgets.timeTool.mode')                          — line 65
 *     t('widgets.timeTool.timer')                         — line 107
 *     t('widgets.timeTool.stopwatch')                     — line 108
 *     t('widgets.timeTool.digital')                       — line 135
 *     t('widgets.timeTool.visualRing')                    — line 136
 *     t('widgets.timeTool.alertSound')                    — line 145
 *     t('widgets.timeTool.adjustStep')                    — line 172
 *     t('widgets.timeTool.adjustStepUnit')                — line 193
 *     t('widgets.timeTool.adjustStepHint')                — line 197
 *     t('widgets.timeTool.timerEndAction')                — line 205
 *     t('widgets.timeTool.addExpectationsTip')            — line 212
 *     t('widgets.timeTool.switchToVoiceLevel')            — line 218
 *     t('widgets.timeTool.level')                         — line 249
 *     t('widgets.timeTool.autoSetTrafficLight')           — line 258
 *     t('widgets.timeTool.addTrafficLightTip')            — line 264
 *     t('widgets.timeTool.stop')                          — line 296
 *     t('widgets.timeTool.slow')                          — line 311
 *     t('widgets.timeTool.go')                            — line 326
 *     t('widgets.timeTool.autoPickRandomStudent')         — line 334
 *     t('widgets.timeTool.addRandomizerTip')              — line 340
 *     t('widgets.timeTool.autoPickNext')                  — line 347
 *     t('widgets.timeTool.triggerRandomizerWhenTimerEnds') — line 350
 *     t('widgets.timeTool.autoRotateStations')            — line 369 (new)
 *     t('widgets.timeTool.addStationsTip')                — line 375 (new)
 *     t('widgets.timeTool.rotateStationsClockwise')       — line 383 (new)
 *     t('widgets.timeTool.rotateStationsOnEnd')           — line 386 (new)
 *     t('widgets.timeTool.autoAdvanceNextUpQueue')        — line 408
 *     t('widgets.timeTool.addNextUpTip')                  — line 414
 *     t('widgets.timeTool.autoAdvanceNext')               — line 421
 *     t('widgets.timeTool.advanceQueueOnEnd')             — line 424
 *     t('widgets.timeTool.numberStyle')                   — line 509
 *
 * This test loads locale JSON files directly so assertions fire before the
 * i18next runtime attempts (and silently skips) any fallback.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

/**
 * All leaf keys within widgets.timeTool.
 * Every one is called via t() WITHOUT a defaultValue — loud bugs in non-EN locales.
 */
const REQUIRED_TIME_TOOL_KEYS = [
  'mode',
  'timer',
  'stopwatch',
  'digital',
  'visualRing',
  'alertSound',
  'numberStyle',
  'timerEndAction',
  'addExpectationsTip',
  'switchToVoiceLevel',
  'level',
  'autoSetTrafficLight',
  'addTrafficLightTip',
  'stop',
  'slow',
  'go',
  'backspace',
  'confirmTime',
  'closeKeypad',
  'autoPickRandomStudent',
  'addRandomizerTip',
  'autoPickNext',
  'triggerRandomizerWhenTimerEnds',
  'autoRotateStations',
  'addStationsTip',
  'rotateStationsClockwise',
  'rotateStationsOnEnd',
  'autoAdvanceNextUpQueue',
  'addNextUpTip',
  'autoAdvanceNext',
  'advanceQueueOnEnd',
  'adjustStep',
  'adjustStepHint',
  'adjustStepUnit',
  'addTime',
  'subtractTime',
  'play',
  'pause',
  'reset',
] as const;

// ─── EN baseline ─────────────────────────────────────────────────────────────

describe('EN locale — widgets.timeTool baseline', () => {
  it('has a widgets.timeTool section', () => {
    expect(en).toHaveProperty(['widgets', 'timeTool']);
  });

  it('has all required timeTool keys', () => {
    for (const key of REQUIRED_TIME_TOOL_KEYS) {
      expect(
        en.widgets.timeTool,
        `en.widgets.timeTool.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });
});

// ─── DE / ES / FR parity ─────────────────────────────────────────────────────

describe.each([
  { code: 'de', locale: de },
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
])('$code locale — widgets.timeTool parity with EN', ({ code, locale }) => {
  it(`${code}: has a widgets.timeTool section`, () => {
    expect(
      locale,
      `${code}.widgets.timeTool section is entirely missing — LOUD bug (no defaultValue fallback)`
    ).toHaveProperty(['widgets', 'timeTool']);
  });

  it(`${code}: has all required timeTool keys (no defaultValue — loud bugs)`, () => {
    for (const key of REQUIRED_TIME_TOOL_KEYS) {
      expect(
        locale,
        `${code}.widgets.timeTool.${key} is missing — LOUD bug (no defaultValue fallback)`
      ).toHaveProperty(['widgets', 'timeTool', key]);
    }
  });
});
