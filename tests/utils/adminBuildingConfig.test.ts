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
