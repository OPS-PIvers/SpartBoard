import { describe, expect, it } from 'vitest';
import type { DailySchedule } from '@/types';
import { toDefaultSchedules, withDefaultSchedules } from './defaultSchedules';

const saved: DailySchedule[] = [
  {
    id: 'day',
    name: 'My day',
    days: [1, 2],
    items: [
      {
        id: 'mm',
        task: 'Morning Meeting',
        startTime: '09:15',
        endTime: '09:40',
        done: true,
        spawnedWidgetIds: ['w1'],
        linkedWidgets: ['time-tool'],
      },
      { id: 'pe', task: 'PE', startTime: '13:00', oneOffDate: '2026-11-18' },
    ],
  },
];

describe('toDefaultSchedules', () => {
  it('drops today-only events, done marks and spawned widget ids', () => {
    expect(toDefaultSchedules(saved)).toEqual([
      {
        id: 'day',
        name: 'My day',
        days: [1, 2],
        items: [
          {
            id: 'mm',
            task: 'Morning Meeting',
            startTime: '09:15',
            endTime: '09:40',
            linkedWidgets: ['time-tool'],
          },
        ],
      },
    ]);
  });

  it('never keeps the legacy default schedule id', () => {
    const legacy = [{ ...saved[0], id: 'default' }];
    expect(toDefaultSchedules(legacy)[0].id).toBe('saved-default');
  });
});

describe('withDefaultSchedules', () => {
  it('replaces the starter items with the saved schedules', () => {
    const base = { items: [{ time: '08:00', task: 'Math' }], cardOpacity: 1 };
    expect(withDefaultSchedules(base, saved)).toEqual({
      items: [],
      cardOpacity: 1,
      schedules: toDefaultSchedules(saved),
    });
  });

  it('leaves the base alone with no saved schedule', () => {
    const base = { cardOpacity: 1 };
    expect(withDefaultSchedules(base, undefined)).toBe(base);
    expect(withDefaultSchedules(base, [])).toBe(base);
  });
});
