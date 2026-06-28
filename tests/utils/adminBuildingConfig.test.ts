import { describe, it, expect } from 'vitest';
import { getAdminBuildingConfig } from '@/utils/adminBuildingConfig';
import type { FeaturePermission, WidgetType } from '@/types';

const makePerm = (
  widgetType: WidgetType,
  buildingDefaults: Record<string, Record<string, unknown>>,
  extraConfig: Record<string, unknown> = {}
): FeaturePermission => ({
  widgetType: widgetType as FeaturePermission['widgetType'],
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
  config: { buildingDefaults, ...extraConfig } as FeaturePermission['config'],
});

describe('getAdminBuildingConfig', () => {
  it('returns empty object when no buildings selected', () => {
    const result = getAdminBuildingConfig('dice', [makePerm('dice', {})], []);
    expect(result).toEqual({});
  });

  it('returns empty object when widget has no permission entry', () => {
    const result = getAdminBuildingConfig('dice', [], ['high']);
    expect(result).toEqual({});
  });

  it('returns empty object when building has no defaults', () => {
    const perm = makePerm('dice', { high: { count: 2 } });
    const result = getAdminBuildingConfig('dice', [perm], ['middle']);
    expect(result).toEqual({});
  });

  it('canonicalizes legacy building IDs via alias map', () => {
    // Stored under the long-form legacy key — must still resolve to `high`.
    const perm = makePerm('dice', { 'orono-high-school': { count: 4 } });
    const result = getAdminBuildingConfig('dice', [perm], ['high']);
    expect(result).toEqual({ count: 4 });
  });

  it('only takes the first selected building as the active key', () => {
    const perm = makePerm('dice', {
      high: { count: 3 },
      middle: { count: 9 },
    });
    const result = getAdminBuildingConfig(
      'dice',
      [perm],
      ['middle', 'high'] // first wins
    );
    expect(result).toEqual({ count: 9 });
  });

  describe('reveal-grid', () => {
    it('rejects columns outside the validated set', () => {
      const perm = makePerm('reveal-grid', { high: { columns: 7 } });
      expect(getAdminBuildingConfig('reveal-grid', [perm], ['high'])).toEqual(
        {}
      );
    });

    it('accepts valid columns and trims/validates strings', () => {
      const perm = makePerm('reveal-grid', {
        high: {
          columns: 3,
          revealMode: 'flip',
          fontFamily: 'serif',
          defaultCardColor: '#abc',
          defaultCardBackColor: '   ', // empty after trim — should be rejected
        },
      });
      expect(getAdminBuildingConfig('reveal-grid', [perm], ['high'])).toEqual({
        columns: 3,
        revealMode: 'flip',
        fontFamily: 'serif',
        defaultCardColor: '#abc',
      });
    });
  });

  describe('drawing', () => {
    it('rejects widths outside 1..20 but keeps valid customColors', () => {
      const perm = makePerm('drawing', {
        high: {
          width: 99,
          customColors: ['#111', '#222'],
        },
      });
      const result = getAdminBuildingConfig('drawing', [perm], ['high']);
      expect(result).toMatchObject({
        customColors: ['#111', '#222', '#222', '#222', '#222'],
        color: '#111',
      });
      expect(result).not.toHaveProperty('width');
    });

    it('accepts rounded valid width and pads short customColors arrays', () => {
      const perm = makePerm('drawing', {
        high: {
          width: 5.4,
          customColors: ['#111', '#222'],
        },
      });
      const result = getAdminBuildingConfig('drawing', [perm], ['high']);
      expect(result).toMatchObject({
        width: 5,
        customColors: ['#111', '#222', '#222', '#222', '#222'],
        color: '#111',
      });
    });
  });

  describe('countdown', () => {
    it('rejects unknown viewMode but keeps other valid fields', () => {
      const perm = makePerm('countdown', {
        high: {
          title: 'Field Trip',
          viewMode: 'rainbow', // invalid
          includeWeekends: true,
        },
      });
      expect(getAdminBuildingConfig('countdown', [perm], ['high'])).toEqual({
        title: 'Field Trip',
        includeWeekends: true,
      });
    });
  });

  describe('clock', () => {
    it('passes through valid clockStyle and glow alongside existing fields', () => {
      const perm = makePerm('clock', {
        high: {
          format24: false,
          fontFamily: 'font-mono',
          themeColor: '#ff0000',
          clockStyle: 'lcd',
          glow: true,
        },
      });
      expect(getAdminBuildingConfig('clock', [perm], ['high'])).toEqual({
        format24: false,
        fontFamily: 'font-mono',
        themeColor: '#ff0000',
        clockStyle: 'lcd',
        glow: true,
      });
    });

    it('rejects unknown clockStyle and non-boolean glow', () => {
      const perm = makePerm('clock', {
        high: {
          clockStyle: 'neon', // invalid
          glow: 'yes', // invalid
        },
      });
      expect(getAdminBuildingConfig('clock', [perm], ['high'])).toEqual({});
    });

    it('passes clockStyle through independently when glow is invalid', () => {
      const perm = makePerm('clock', {
        high: { clockStyle: 'lcd', glow: 'yes' },
      });
      expect(getAdminBuildingConfig('clock', [perm], ['high'])).toEqual({
        clockStyle: 'lcd',
      });
    });

    it('passes glow through independently when clockStyle is invalid', () => {
      const perm = makePerm('clock', {
        high: { clockStyle: 'neon', glow: false },
      });
      expect(getAdminBuildingConfig('clock', [perm], ['high'])).toEqual({
        glow: false,
      });
    });
  });

  describe('time-tool', () => {
    it('passes through all valid appearance and behavior defaults', () => {
      const perm = makePerm('time-tool', {
        high: {
          mode: 'timer',
          visualType: 'visual',
          duration: 300,
          selectedSound: 'Chime',
          themeColor: '#3b82f6',
          glow: true,
          fontFamily: 'font-mono',
          clockStyle: 'lcd',
          timerEndTrafficColor: 'green',
          timerEndTriggerRandom: true,
          timerEndTriggerNextUp: true,
          timerEndTriggerStationsRotate: true,
        },
      });
      expect(getAdminBuildingConfig('time-tool', [perm], ['high'])).toEqual({
        mode: 'timer',
        visualType: 'visual',
        duration: 300,
        elapsedTime: 300,
        selectedSound: 'Chime',
        themeColor: '#3b82f6',
        glow: true,
        fontFamily: 'font-mono',
        clockStyle: 'lcd',
        timerEndTrafficColor: 'green',
        timerEndTriggerRandom: true,
        timerEndTriggerNextUp: true,
        timerEndTriggerStationsRotate: true,
      });
    });

    it('seeds elapsedTime to the duration for a timer', () => {
      const perm = makePerm('time-tool', { high: { duration: 120 } });
      expect(getAdminBuildingConfig('time-tool', [perm], ['high'])).toEqual({
        duration: 120,
        elapsedTime: 120,
      });
    });

    it('clamps duration and elapsedTime to the maximum of 59999 seconds', () => {
      const perm = makePerm('time-tool', { high: { duration: 99999 } });
      expect(getAdminBuildingConfig('time-tool', [perm], ['high'])).toEqual({
        duration: 59999,
        elapsedTime: 59999,
      });
    });

    it('resets elapsedTime to zero for a stopwatch default', () => {
      const perm = makePerm('time-tool', {
        high: { mode: 'stopwatch', duration: 120 },
      });
      expect(getAdminBuildingConfig('time-tool', [perm], ['high'])).toEqual({
        mode: 'stopwatch',
        duration: 120,
        elapsedTime: 0,
      });
    });

    it('resets elapsedTime for a stopwatch even without a duration', () => {
      const perm = makePerm('time-tool', { high: { mode: 'stopwatch' } });
      expect(getAdminBuildingConfig('time-tool', [perm], ['high'])).toEqual({
        mode: 'stopwatch',
        elapsedTime: 0,
      });
    });

    it('accepts a null traffic color (None) but rejects invalid colors', () => {
      const permNull = makePerm('time-tool', {
        high: { timerEndTrafficColor: null },
      });
      expect(getAdminBuildingConfig('time-tool', [permNull], ['high'])).toEqual(
        {
          timerEndTrafficColor: null,
        }
      );
      const permBad = makePerm('time-tool', {
        high: { timerEndTrafficColor: 'purple' },
      });
      expect(getAdminBuildingConfig('time-tool', [permBad], ['high'])).toEqual(
        {}
      );
    });

    it('rejects invalid enum values and malformed colors/fonts', () => {
      const perm = makePerm('time-tool', {
        high: {
          mode: 'countup', // invalid
          visualType: 'hologram', // invalid
          selectedSound: 'Buzzer', // invalid
          themeColor: 'blue', // not a hex
          glow: 'yes', // not a boolean
          fontFamily: 'Comic Sans', // not a prefixed FONTS id
          clockStyle: 'neon', // invalid
          timerEndTriggerRandom: 'true', // not a boolean
        },
      });
      expect(getAdminBuildingConfig('time-tool', [perm], ['high'])).toEqual({});
    });
  });

  describe('numberLine', () => {
    it('passes through valid axis fields and appearance fields together', () => {
      const perm = makePerm('numberLine', {
        high: {
          min: -5,
          max: 5,
          step: 0.5,
          displayMode: 'decimals',
          showArrows: false,
          cardColor: '#fef3c7',
          cardOpacity: 0.8,
          fontFamily: 'serif',
          fontColor: '#1e293b',
        },
      });
      expect(getAdminBuildingConfig('numberLine', [perm], ['high'])).toEqual({
        min: -5,
        max: 5,
        step: 0.5,
        displayMode: 'decimals',
        showArrows: false,
        cardColor: '#fef3c7',
        cardOpacity: 0.8,
        fontFamily: 'serif',
        fontColor: '#1e293b',
      });
    });

    it('rejects out-of-range cardOpacity, empty colors, and non-string fontFamily', () => {
      const perm = makePerm('numberLine', {
        high: {
          cardColor: '   ', // empty after trim
          cardOpacity: 1.5, // out of [0, 1]
          fontFamily: 123, // not a string
          fontColor: '', // empty
        },
      });
      expect(getAdminBuildingConfig('numberLine', [perm], ['high'])).toEqual(
        {}
      );
    });

    it('accepts cardOpacity at exact bounds 0 and 1', () => {
      const permZero = makePerm('numberLine', {
        high: { cardOpacity: 0 },
      });
      expect(
        getAdminBuildingConfig('numberLine', [permZero], ['high'])
      ).toEqual({ cardOpacity: 0 });

      const permOne = makePerm('numberLine', {
        high: { cardOpacity: 1 },
      });
      expect(getAdminBuildingConfig('numberLine', [permOne], ['high'])).toEqual(
        { cardOpacity: 1 }
      );
    });

    it('rejects fontFamily values outside the GlobalFontFamily union', () => {
      const perm = makePerm('numberLine', {
        high: { fontFamily: 'not-a-real-font' },
      });
      expect(getAdminBuildingConfig('numberLine', [perm], ['high'])).toEqual(
        {}
      );
    });
  });

  describe('concept-web', () => {
    it('passes through node dimensions, font family, and surface fields', () => {
      const perm = makePerm('concept-web', {
        high: {
          defaultNodeWidth: 20,
          defaultNodeHeight: 12,
          fontFamily: 'comic',
          cardColor: '#fef3c7',
          cardOpacity: 0.6,
        },
      });
      expect(getAdminBuildingConfig('concept-web', [perm], ['high'])).toEqual({
        defaultNodeWidth: 20,
        defaultNodeHeight: 12,
        fontFamily: 'comic',
        cardColor: '#fef3c7',
        cardOpacity: 0.6,
      });
    });

    it('does not wire fontColor (ConceptWeb node text is hardcoded)', () => {
      const perm = makePerm('concept-web', {
        high: { fontColor: '#1e293b' },
      });
      expect(getAdminBuildingConfig('concept-web', [perm], ['high'])).toEqual(
        {}
      );
    });

    it('rejects invalid surface values and unknown font families', () => {
      const perm = makePerm('concept-web', {
        high: {
          fontFamily: 'not-a-font',
          cardColor: 'rgb(0,0,0)',
          cardOpacity: 2,
        },
      });
      expect(getAdminBuildingConfig('concept-web', [perm], ['high'])).toEqual(
        {}
      );
    });

    it('accepts cardOpacity at exact bounds 0 and 1', () => {
      const permZero = makePerm('concept-web', { high: { cardOpacity: 0 } });
      expect(
        getAdminBuildingConfig('concept-web', [permZero], ['high'])
      ).toEqual({ cardOpacity: 0 });

      const permOne = makePerm('concept-web', { high: { cardOpacity: 1 } });
      expect(
        getAdminBuildingConfig('concept-web', [permOne], ['high'])
      ).toEqual({ cardOpacity: 1 });
    });
  });

  describe('stations', () => {
    it('passes through the prefixed font family and all surface fields', () => {
      const perm = makePerm('stations', {
        high: {
          fontFamily: 'font-mono',
          fontColor: '#1e293b',
          cardColor: '#fef3c7',
          cardOpacity: 0.5,
        },
      });
      expect(getAdminBuildingConfig('stations', [perm], ['high'])).toEqual({
        fontFamily: 'font-mono',
        fontColor: '#1e293b',
        cardColor: '#fef3c7',
        cardOpacity: 0.5,
      });
    });

    it('rejects bare GlobalFontFamily ids — stations uses the prefixed space', () => {
      // 'sans' is a valid GlobalFontFamily value but NOT a FONTS id; the
      // TypographySettings-backed stations widget expects 'font-sans'.
      const perm = makePerm('stations', { high: { fontFamily: 'sans' } });
      expect(getAdminBuildingConfig('stations', [perm], ['high'])).toEqual({});
    });

    it('rejects invalid surface values and unknown font families', () => {
      const perm = makePerm('stations', {
        high: {
          fontFamily: 'not-a-font',
          fontColor: 'rgb(0,0,0)',
          cardColor: 'banana',
          cardOpacity: 1.5,
        },
      });
      expect(getAdminBuildingConfig('stations', [perm], ['high'])).toEqual({});
    });

    it('accepts cardOpacity at exact bounds 0 and 1', () => {
      const permZero = makePerm('stations', { high: { cardOpacity: 0 } });
      expect(getAdminBuildingConfig('stations', [permZero], ['high'])).toEqual({
        cardOpacity: 0,
      });

      const permOne = makePerm('stations', { high: { cardOpacity: 1 } });
      expect(getAdminBuildingConfig('stations', [permOne], ['high'])).toEqual({
        cardOpacity: 1,
      });
    });
  });

  describe('need-do-put-then', () => {
    it('passes through the prefixed font family, surface fields, and text size preset', () => {
      const perm = makePerm('need-do-put-then', {
        high: {
          fontFamily: 'font-handwritten',
          fontColor: '#0f172a',
          cardColor: '#fef3c7',
          cardOpacity: 0.6,
          textSizePreset: 'large',
        },
      });
      expect(
        getAdminBuildingConfig('need-do-put-then', [perm], ['high'])
      ).toEqual({
        fontFamily: 'font-handwritten',
        fontColor: '#0f172a',
        cardColor: '#fef3c7',
        cardOpacity: 0.6,
        textSizePreset: 'large',
      });
    });

    it('rejects bare GlobalFontFamily ids — uses the prefixed space', () => {
      // 'sans' is a valid GlobalFontFamily value but NOT a FONTS id; the
      // TypographySettings-backed widget expects 'font-sans'.
      const perm = makePerm('need-do-put-then', {
        high: { fontFamily: 'sans' },
      });
      expect(
        getAdminBuildingConfig('need-do-put-then', [perm], ['high'])
      ).toEqual({});
    });

    it('rejects invalid surface values, fonts, and text size presets', () => {
      const perm = makePerm('need-do-put-then', {
        high: {
          fontFamily: 'not-a-font',
          fontColor: 'rgb(0,0,0)',
          cardColor: 'banana',
          cardOpacity: 1.5,
          textSizePreset: 'gigantic',
        },
      });
      expect(
        getAdminBuildingConfig('need-do-put-then', [perm], ['high'])
      ).toEqual({});
    });

    it('accepts cardOpacity at exact bounds 0 and 1', () => {
      const permZero = makePerm('need-do-put-then', {
        high: { cardOpacity: 0 },
      });
      expect(
        getAdminBuildingConfig('need-do-put-then', [permZero], ['high'])
      ).toEqual({ cardOpacity: 0 });

      const permOne = makePerm('need-do-put-then', {
        high: { cardOpacity: 1 },
      });
      expect(
        getAdminBuildingConfig('need-do-put-then', [permOne], ['high'])
      ).toEqual({ cardOpacity: 1 });
    });
  });

  describe('checklist', () => {
    it('passes through scale, items, font family, and appearance fields', () => {
      const perm = makePerm('checklist', {
        high: {
          scaleMultiplier: 1.5,
          items: [{ id: 'a', text: 'Sharpen pencil' }],
          fontFamily: 'handwritten',
          cardColor: '#e0f2fe',
          cardOpacity: 0.75,
          fontColor: '#0f172a',
        },
      });
      const result = getAdminBuildingConfig('checklist', [perm], ['high']);
      expect(result).toMatchObject({
        scaleMultiplier: 1.5,
        fontFamily: 'handwritten',
        cardColor: '#e0f2fe',
        cardOpacity: 0.75,
        fontColor: '#0f172a',
      });
      // items get fresh UUIDs but preserve text and reset completion.
      expect(result.items).toEqual([
        { id: expect.any(String), text: 'Sharpen pencil', completed: false },
      ]);
    });

    it('rejects invalid appearance values, unknown font families, and malformed scale', () => {
      const perm = makePerm('checklist', {
        high: {
          fontFamily: 'wingdings',
          cardColor: 'white',
          cardOpacity: -0.5,
          fontColor: '#12', // too short to be a valid hex
          scaleMultiplier: 'large', // invalid type
        },
      });
      expect(getAdminBuildingConfig('checklist', [perm], ['high'])).toEqual({});
    });

    it('clamps scaleMultiplier to the panel slider range [0.5, 2.5]', () => {
      const permHigh = makePerm('checklist', {
        high: { scaleMultiplier: 5 },
      });
      expect(getAdminBuildingConfig('checklist', [permHigh], ['high'])).toEqual(
        { scaleMultiplier: 2.5 }
      );

      const permLow = makePerm('checklist', {
        high: { scaleMultiplier: 0.1 },
      });
      expect(getAdminBuildingConfig('checklist', [permLow], ['high'])).toEqual({
        scaleMultiplier: 0.5,
      });
    });
  });

  describe('text', () => {
    it('passes through bgColor, fontSize, prefixed font family, fontColor, and vertical align', () => {
      const perm = makePerm('text', {
        high: {
          bgColor: '#fef9c3',
          fontSize: 24,
          fontFamily: 'font-serif',
          fontColor: '#1e293b',
          verticalAlign: 'top',
        },
      });
      expect(getAdminBuildingConfig('text', [perm], ['high'])).toEqual({
        bgColor: '#fef9c3',
        fontSize: 24,
        fontFamily: 'font-serif',
        fontColor: '#1e293b',
        verticalAlign: 'top',
      });
    });

    it('rejects bare GlobalFontFamily ids — text uses the prefixed FONTS space', () => {
      // 'sans' is a valid GlobalFontFamily value but NOT a FONTS id; the
      // TextWidget reads fontFamily via getFontClass and expects 'font-sans'.
      const perm = makePerm('text', { high: { fontFamily: 'sans' } });
      expect(getAdminBuildingConfig('text', [perm], ['high'])).toEqual({});
    });

    it('rejects malformed bgColor/fontColor, non-finite fontSize, and unknown vertical align', () => {
      const perm = makePerm('text', {
        high: {
          bgColor: 'banana',
          fontSize: Number.NaN,
          fontFamily: 'not-a-font',
          fontColor: 'rgb(0,0,0)',
          verticalAlign: 'middle',
        },
      });
      expect(getAdminBuildingConfig('text', [perm], ['high'])).toEqual({});
    });
  });

  it('returns empty for unknown widget types', () => {
    const perm = makePerm('clock', { high: { format24: true } });
    // Pass a type that has no case in the switch.
    expect(
      getAdminBuildingConfig(
        'jigsaw' as unknown as WidgetType,
        [perm],
        ['high']
      )
    ).toEqual({});
  });
});
