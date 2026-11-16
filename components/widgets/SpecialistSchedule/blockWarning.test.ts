import { describe, expect, it } from 'vitest';
import type {
  SpecialistScheduleBuildingConfig,
  SpecialistScheduleConfig,
} from '@/types';
import { findDueSpecialistWarning } from './blockWarning';

// Friday 2026-11-13.
const at = (h: number, m: number) => new Date(2026, 10, 13, h, m).getTime();

const building: SpecialistScheduleBuildingConfig = {
  cycleLength: 2,
  rotationMode: 'calendar',
  startDate: '2026-11-12',
  schoolDays: ['2026-11-12', '2026-11-13'],
};

const config = (
  extra: Partial<SpecialistScheduleConfig> = {}
): SpecialistScheduleConfig => ({
  cycleDays: [
    {
      dayNumber: 2,
      items: [
        {
          id: 'art',
          task: 'Art',
          startTime: '09:00',
          endTime: '09:50',
          warning: { minutes: 5, sound: 'Gong' },
        },
      ],
    },
  ],
  ...extra,
});

describe('findDueSpecialistWarning', () => {
  it('warns for the rotation block of the day N minutes before its end', () => {
    expect(findDueSpecialistWarning(config(), building, at(9, 44))).toBeNull();
    const due = findDueSpecialistWarning(config(), building, at(9, 45));
    expect(due?.key).toBe('art');
    expect(due?.block).toMatchObject({
      task: 'Art',
      minutes: 5,
      sound: 'Gong',
      endsAt: at(9, 50),
    });
  });

  it('ignores a rotation block that belongs to another day', () => {
    const other = { ...building, startDate: '2026-11-13' };
    expect(findDueSpecialistWarning(config(), other, at(9, 46))).toBeNull();
  });

  it('warns for a daily recurring block, with no rotation at all', () => {
    const recurring = config({
      cycleDays: [],
      recurringItems: [
        {
          id: 'lunch',
          type: 'daily',
          task: 'Lunch',
          startTime: '11:00',
          endTime: '11:30',
          warning: { minutes: 3 },
        },
      ],
    });
    const due = findDueSpecialistWarning(recurring, undefined, at(11, 28));
    expect(due?.key).toBe('lunch');
    expect(due?.block.sound).toBe('Chime');
  });

  it('skips a block with no end time and one already fired today', () => {
    const noEnd = config({
      cycleDays: [
        {
          dayNumber: 2,
          items: [
            { id: 'x', task: 'X', startTime: '09:00', warning: { minutes: 5 } },
          ],
        },
      ],
    });
    expect(findDueSpecialistWarning(noEnd, building, at(9, 30))).toBeNull();
    const fired = config({ warningsFired: { art: '2026-11-13' } });
    expect(findDueSpecialistWarning(fired, building, at(9, 46))).toBeNull();
  });
});
