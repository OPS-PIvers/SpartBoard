import { describe, expect, it } from 'vitest';
import type { RosterGroup, RosterGroupReminder, Student } from '@/types';
import {
  buildGroupScheduleHtml,
  groupScheduleByDay,
  upcomingOnWeeks,
} from './groupSchedulePrint';

const reminder = (
  patch: Partial<RosterGroupReminder> = {}
): RosterGroupReminder => ({
  enabled: true,
  days: [1, 3],
  alerts: [{ time: '10:15', leadMinutes: 0 }],
  repeat: 'weekly',
  startDate: '2026-09-28',
  sound: 'off',
  snoozeMinutes: 3,
  showName: false,
  showTime: false,
  showMessage: false,
  message: '',
  emailAlert: false,
  emailMessage: '',
  ...patch,
});

const student = (id: string, firstName: string, lastName: string): Student =>
  ({ id, firstName, lastName, pin: '' }) as Student;

const students = [
  student('s1', 'Zoe', 'Adams'),
  student('s2', 'Ava', 'Brown'),
  student('s3', 'Max', 'Cole'),
];

const groups: RosterGroup[] = [
  {
    id: 'speech',
    name: 'Speech',
    studentIds: ['s1', 's2', 'gone'],
    reminder: reminder({
      alerts: [
        { time: '13:40', leadMinutes: 2 },
        { time: '09:05', leadMinutes: 0 },
      ],
    }),
  },
  {
    id: 'math',
    name: '',
    studentIds: ['s3'],
    reminder: reminder({
      days: [1],
      alerts: [{ time: '10:00', leadMinutes: 0 }],
    }),
  },
  {
    id: 'off',
    name: 'Off',
    studentIds: ['s3'],
    reminder: reminder({ enabled: false }),
  },
  { id: 'plain', name: 'Table 1', studentIds: ['s1'] },
];

const labels = {
  title: 'Group schedule',
  printed: 'Printed',
  everyTwoWeeks: 'Every 2 weeks',
  weeksOf: 'weeks of',
  noGroups: 'No groups',
};

describe('groupScheduleByDay', () => {
  it('lists each enabled alert by weekday in time order with sorted names', () => {
    const days = groupScheduleByDay(groups, students);
    expect(
      days.get(1)?.map((r) => [r.time, r.group.id, r.students.join('|')])
    ).toEqual([
      ['09:05', 'speech', 'Ava Brown|Zoe Adams'],
      ['10:00', 'math', 'Max Cole'],
      ['13:40', 'speech', 'Ava Brown|Zoe Adams'],
    ]);
    expect(days.get(3)?.map((r) => r.time)).toEqual(['09:05', '13:40']);
    expect(days.get(2)).toEqual([]);
  });
});

describe('upcomingOnWeeks', () => {
  it('returns the Mondays of on-weeks for a biweekly reminder', () => {
    const weeks = upcomingOnWeeks(
      reminder({ repeat: 'biweekly', startDate: '2026-09-28' }),
      new Date(2026, 9, 8),
      3
    );
    expect(weeks.map((d) => d.getDate())).toEqual([12, 26, 9]);
  });

  it('skips weeks before the start date', () => {
    const weeks = upcomingOnWeeks(
      reminder({ repeat: 'biweekly', startDate: '2026-10-19', days: [3] }),
      new Date(2026, 9, 1),
      2
    );
    expect(weeks.map((d) => d.toDateString())).toEqual([
      new Date(2026, 9, 19).toDateString(),
      new Date(2026, 10, 2).toDateString(),
    ]);
  });
});

describe('buildGroupScheduleHtml', () => {
  const html = buildGroupScheduleHtml({
    rosterName: 'Room <12>',
    groups: [
      ...groups,
      {
        id: 'bi',
        name: 'Social',
        studentIds: ['s2'],
        reminder: reminder({ days: [5], repeat: 'biweekly' }),
      },
    ],
    students,
    labels,
    symbolSvg: (g) => `<svg data-g="${g.id}"></svg>`,
    now: new Date(2026, 9, 1),
    locale: 'en-US',
  });

  it('escapes the class name and draws each symbol', () => {
    expect(html).toContain('Room &lt;12&gt;');
    expect(html).toContain('data-g="math"');
    expect(html).not.toContain('data-g="off"');
  });

  it('marks empty days and biweekly weeks', () => {
    expect(html).toContain('Tuesday</h2><p class="none">No groups</p>');
    expect(html).toContain('Every 2 weeks · weeks of Sep 28, Oct 12');
  });
});
