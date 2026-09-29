import { describe, expect, it } from 'vitest';
import type {
  BuildingScheduleDefaults,
  DailySchedule,
  FeaturePermission,
} from '@/types';
import {
  dateKey,
  listBellPeriods,
  listTeacherBellPeriods,
  matchBellPeriod,
  normalizePeriodKey,
  resolveBellWindow,
  resolveBuildingSchedule,
} from './bellSchedule';

const regular: DailySchedule = {
  id: 'regular',
  name: 'Regular',
  days: [1, 2, 3, 4, 5],
  items: [
    { task: 'Homeroom', startTime: '08:00', endTime: '08:10' },
    {
      task: 'Period 1',
      startTime: '08:15',
      endTime: '09:05',
      isClassPeriod: true,
      periodId: 'P1',
    },
    {
      task: 'Period 3',
      startTime: '10:40',
      endTime: '11:30',
      isClassPeriod: true,
      periodId: 'P3',
    },
  ],
};
const early: DailySchedule = {
  id: 'early',
  name: 'Early release',
  days: [],
  items: [
    {
      task: 'P3 (short)',
      startTime: '09:30',
      endTime: '10:00',
      isClassPeriod: true,
      periodId: 'P3',
    },
    {
      task: 'Assembly',
      startTime: '10:00',
      endTime: '11:00',
      periodId: 'ASM',
    },
  ],
};
const defaults: BuildingScheduleDefaults = {
  buildingId: 'b1',
  items: [],
  schedules: [regular, early],
  dateOverrides: { '2026-10-02': 'early' },
};

// 2026-09-29 is a Tuesday; 2026-10-02 a Friday; 2026-10-03 a Saturday.
const tue = new Date(2026, 8, 29, 7, 0);
const specialFri = new Date(2026, 9, 2, 7, 0);
const sat = new Date(2026, 9, 3, 7, 0);

describe('resolveBuildingSchedule', () => {
  it('picks by weekday, with a special day taking precedence', () => {
    expect(resolveBuildingSchedule(defaults, tue)?.id).toBe('regular');
    expect(resolveBuildingSchedule(defaults, specialFri)?.id).toBe('early');
    expect(resolveBuildingSchedule(defaults, sat)).toBeNull();
    expect(resolveBuildingSchedule(null, tue)).toBeNull();
  });

  it('ignores an override naming a schedule that no longer exists', () => {
    expect(
      resolveBuildingSchedule(
        { ...defaults, dateOverrides: { [dateKey(tue)]: 'gone' } },
        tue
      )?.id
    ).toBe('regular');
  });
});

describe('listBellPeriods', () => {
  it('lists each class period once across schedules', () => {
    expect(listBellPeriods(defaults)).toEqual([
      { periodId: 'P1', label: 'Period 1' },
      { periodId: 'P3', label: 'Period 3' },
    ]);
  });
});

describe('resolveBellWindow', () => {
  it('resolves the day schedule times to epoch ms', () => {
    expect(resolveBellWindow(defaults, { periodId: 'P3' }, tue)).toEqual({
      openAt: new Date(2026, 8, 29, 10, 40).getTime(),
      closeAt: new Date(2026, 8, 29, 11, 30).getTime(),
    });
  });

  it('uses the special-day times for the same period id', () => {
    expect(resolveBellWindow(defaults, { periodId: 'P3' }, specialFri)).toEqual(
      {
        openAt: new Date(2026, 9, 2, 9, 30).getTime(),
        closeAt: new Date(2026, 9, 2, 10, 0).getTime(),
      }
    );
  });

  it('returns null when the day has no such class period', () => {
    expect(
      resolveBellWindow(defaults, { periodId: 'P1' }, specialFri)
    ).toBeNull();
    expect(
      resolveBellWindow(defaults, { periodId: 'ASM' }, specialFri)
    ).toBeNull();
    expect(resolveBellWindow(defaults, { periodId: 'P1' }, sat)).toBeNull();
    expect(resolveBellWindow(defaults, null, tue)).toBeNull();
  });
});

describe('listTeacherBellPeriods', () => {
  const permissions = [
    {
      widgetType: 'schedule',
      accessLevel: 'public',
      betaUsers: [],
      enabled: true,
      config: { buildingDefaults: { b1: defaults } },
    },
  ] as unknown as FeaturePermission[];

  it('tags each period with its building and skips buildings with none', () => {
    expect(listTeacherBellPeriods(permissions, ['b1', 'b2', 'b1'])).toEqual([
      { buildingId: 'b1', periodId: 'P1', label: 'Period 1' },
      { buildingId: 'b1', periodId: 'P3', label: 'Period 3' },
    ]);
    expect(listTeacherBellPeriods([], ['b1'])).toEqual([]);
  });
});

describe('matchBellPeriod', () => {
  const options = [
    { buildingId: 'b1', periodId: 'P3', label: 'Period 3' },
    { buildingId: 'b1', periodId: '5A', label: '5th Hour (A)' },
    { buildingId: 'b1', periodId: '5B', label: '5th Hour (B)' },
    { buildingId: 'b1', periodId: 'Planning', label: 'Planning' },
  ];

  it('folds period prefixes and leading zeros', () => {
    expect(normalizePeriodKey(' Period 03 ')).toBe('3');
    expect(normalizePeriodKey('P3')).toBe('3');
    expect(normalizePeriodKey('0')).toBe('0');
    expect(normalizePeriodKey('Planning')).toBe('planning');
  });

  it('tags the one building period a OneRoster period names', () => {
    expect(matchBellPeriod(['3'], options)).toEqual({
      buildingId: 'b1',
      periodId: 'P3',
    });
    expect(matchBellPeriod(['5b'], options)).toEqual({
      buildingId: 'b1',
      periodId: '5B',
    });
  });

  it('leaves the class untagged when nothing or several periods match', () => {
    expect(matchBellPeriod(['5'], options)).toBeNull();
    expect(matchBellPeriod(['3', '5A'], options)).toBeNull();
    expect(matchBellPeriod([], options)).toBeNull();
    expect(matchBellPeriod(['3'], undefined)).toBeNull();
    expect(
      matchBellPeriod(['3'], [...options, { ...options[0], buildingId: 'b2' }])
    ).toBeNull();
  });
});
