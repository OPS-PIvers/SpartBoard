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
