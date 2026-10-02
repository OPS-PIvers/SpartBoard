import { describe, expect, it } from 'vitest';
import type { BuildingScheduleDefaults, DailySchedule } from '@/types';
import {
  classIdsInSession,
  pickClassInSession,
  sortClassesByBell,
} from './studentClassOrder';

const period = (id: string, start: string, end: string) => ({
  task: `Period ${id}`,
  startTime: start,
  endTime: end,
  isClassPeriod: true,
  periodId: id,
});
const regular: DailySchedule = {
  id: 'regular',
  name: 'Regular',
  days: [1, 2, 3, 4, 5],
  items: [
    period('1', '08:00', '08:50'),
    period('2', '09:00', '09:50'),
    period('3', '10:00', '10:50'),
    period('5A', '12:00', '12:30'),
    period('5B', '12:30', '13:00'),
  ],
};
const defaults: BuildingScheduleDefaults = {
  buildingId: 'oms',
  items: [],
  schedules: [regular, { id: 'early', name: 'Early', days: [], items: [] }],
};
const scheduleFor = (id: string) => (id === 'oms' ? defaults : null);
const bell = (periodId: string) => ({ buildingId: 'oms', periodId });
const cls = (
  classId: string,
  name: string,
  periodId?: string
): { classId: string; name: string; bellPeriod?: ReturnType<typeof bell> } => ({
  classId,
  name,
  ...(periodId ? { bellPeriod: bell(periodId) } : {}),
});
const ids = (list: { classId: string }[]) => list.map((c) => c.classId);

// 2026-10-02 is a Friday.
const at = (h: number, m: number) => new Date(2026, 9, 2, h, m).getTime();

describe('sortClassesByBell', () => {
  it('orders by schedule position, then name, with unscheduled classes last', () => {
    const sorted = sortClassesByBell(
      [
        cls('hr', 'Homeroom Z'),
        cls('p3', 'Zoology', '3'),
        cls('p1b', 'Biology', '1'),
        cls('p1a', 'Algebra', '1'),
        cls('p5', 'Spanish', '5'),
        cls('art', 'Art'),
      ],
      scheduleFor
    );
    expect(ids(sorted)).toEqual(['p1a', 'p1b', 'p3', 'p5', 'art', 'hr']);
  });

  it('ranks a bare 5 with the first 5 section and keeps 5A before 5B', () => {
    const sorted = sortClassesByBell(
      [cls('b', 'B', '5B'), cls('bare', 'Bare', '5'), cls('a', 'A', '5A')],
      scheduleFor
    );
    expect(ids(sorted)).toEqual(['bare', 'a', 'b']);
  });

  it('keeps a bell period the schedule does not name ahead of classes without one', () => {
    const sorted = sortClassesByBell(
      [cls('none', 'Art'), cls('odd', 'Zed', '9'), cls('p2', 'Math', '2')],
      scheduleFor
    );
    expect(ids(sorted)).toEqual(['p2', 'odd', 'none']);
  });

  it('falls back to period order when no schedule loaded', () => {
    const sorted = sortClassesByBell(
      [cls('p10', 'X', '10'), cls('p2', 'Y', '2')],
      () => null
    );
    expect(ids(sorted)).toEqual(['p2', 'p10']);
  });
});

describe('classIdsInSession', () => {
  const classes = [
    cls('p1', 'Bio', '1'),
    cls('p2', 'Alg', '2'),
    cls('hr', 'HR'),
  ];

  it('opens 5 minutes before the start and closes at the end', () => {
    expect(classIdsInSession(classes, scheduleFor, at(8, 54))).toEqual([]);
    expect(classIdsInSession(classes, scheduleFor, at(8, 55))).toEqual(['p2']);
    expect(classIdsInSession(classes, scheduleFor, at(9, 49))).toEqual(['p2']);
    expect(classIdsInSession(classes, scheduleFor, at(9, 50))).toEqual([]);
  });

  it('spans every section of a bare period', () => {
    const lunch = [cls('p5', 'Spanish', '5')];
    expect(classIdsInSession(lunch, scheduleFor, at(12, 45))).toEqual(['p5']);
  });

  it('skips weekends, where the schedule has no period', () => {
    expect(
      classIdsInSession(
        classes,
        scheduleFor,
        new Date(2026, 9, 3, 9, 20).getTime()
      )
    ).toEqual([]);
  });
});

describe('pickClassInSession', () => {
  it('returns the single class in session', () => {
    expect(
      pickClassInSession([cls('p1', 'Bio', '1')], scheduleFor, at(8, 30))
    ).toBe('p1');
  });

  it('returns null with none in session', () => {
    expect(
      pickClassInSession([cls('p1', 'Bio', '1')], scheduleFor, at(11, 30))
    ).toBeNull();
  });

  it('returns null when two classes are in session', () => {
    const pair = [cls('a', 'A', '1'), cls('b', 'B', '1')];
    expect(pickClassInSession(pair, scheduleFor, at(8, 30))).toBeNull();
  });
});
