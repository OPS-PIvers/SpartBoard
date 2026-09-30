import { describe, expect, it } from 'vitest';
import {
  defaultsToClear,
  gradebookClassOptions,
  inBuildings,
  parseDistrictConfig,
  parseProficiencyScale,
  type DistrictConfig,
} from './settingsConfig';

const cfg = (
  id: string,
  buildingIds: string[],
  isDefault: boolean
): DistrictConfig => ({
  ...parseDistrictConfig(id, { name: id, buildingIds, isDefault }),
});

describe('district configuration helpers', () => {
  it('clears only overlapping defaults', () => {
    const configs = [
      cfg('a', ['middle'], true),
      cfg('b', ['high'], true),
      cfg('c', ['middle', 'high'], false),
      cfg('d', ['middle'], false),
    ];
    expect(defaultsToClear(configs, 'd', ['middle']).map((c) => c.id)).toEqual([
      'a',
    ]);
    expect(
      defaultsToClear(configs, 'c', ['middle', 'high']).map((c) => c.id)
    ).toEqual(['a', 'b']);
    expect(defaultsToClear(configs, 'a', ['middle'])).toEqual([]);
  });

  it('matches buildings and ignores empty lists', () => {
    expect(inBuildings(['middle'], ['middle', 'high'])).toBe(true);
    expect(inBuildings(['middle'], [])).toBe(false);
    expect(inBuildings([], ['middle'])).toBe(false);
  });

  it('parses a stored district doc, filling defaults', () => {
    const c = parseDistrictConfig('x', {
      name: 'OMS',
      buildingIds: ['middle', 3],
      isDefault: 'yes',
    });
    expect(c.body.name).toBe('OMS');
    expect(c.body.flags.length).toBeGreaterThan(0);
    expect(c.buildingIds).toEqual(['middle']);
    expect(c.isDefault).toBe(false);
  });

  it('parses the organization scale with defaults', () => {
    expect(parseProficiencyScale(undefined).proficient).toBe(80);
    expect(
      parseProficiencyScale({
        proficient: 90,
        levelNames: ['A', 'B'],
      })
    ).toEqual({
      proficient: 90,
      approaching: 60,
      levelNames: ['Proficient', 'Approaching', 'Beginning'],
    });
  });

  it('lists only ClassLink and test-class rosters', () => {
    expect(
      gradebookClassOptions([
        { id: '1', name: 'P1', classlinkClassId: 'c1' },
        { id: '2', name: 'Local' },
        { id: '3', name: 'Test', testClassId: 't' },
      ])
    ).toEqual([
      { id: '1', name: 'P1' },
      { id: '3', name: 'Test' },
    ]);
  });
});
