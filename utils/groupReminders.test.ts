import { describe, expect, it } from 'vitest';
import type { ClassRoster, RosterGroupReminder } from '@/types';
import {
  LATE_WINDOW_MS,
  dueReminders,
  formatReminderSummary,
  msUntilNextReminder,
  parseGroupReminder,
  parseGroupSymbol,
  reminderFallsOn,
} from './groupReminders';
import { anyRosterHasGroups, groupMakerGroups } from './rosterGroups';

const reminder = (
  patch: Partial<RosterGroupReminder> = {}
): RosterGroupReminder => ({
  enabled: true,
  days: [1, 3],
  time: '10:15',
  repeat: 'weekly',
  startDate: '2026-09-28',
  sound: 'off',
  showStudentNames: false,
  ...patch,
});

// 2026-09-28 is a Monday.
const at = (date: string, time = '00:00') => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
};

const roster = (groups: ClassRoster['groups']): ClassRoster => ({
  id: 'r1',
  name: 'Room 112',
  driveFileId: null,
  studentCount: 2,
  createdAt: 0,
  students: [
    { id: 's1', firstName: 'Ben', lastName: 'Carlson', pin: '01' },
    { id: 's2', firstName: 'Henry', lastName: 'Iverson', pin: '02' },
  ],
  groups,
});

describe('reminderFallsOn', () => {
  it('matches the chosen weekdays only', () => {
    expect(reminderFallsOn(reminder(), at('2026-09-28'))).toBe(true);
    expect(reminderFallsOn(reminder(), at('2026-09-29'))).toBe(false);
    expect(reminderFallsOn(reminder(), at('2026-09-30'))).toBe(true);
  });

  it('skips days before the start date and disabled reminders', () => {
    expect(reminderFallsOn(reminder(), at('2026-09-21'))).toBe(false);
    expect(
      reminderFallsOn(reminder({ enabled: false }), at('2026-09-28'))
    ).toBe(false);
  });

  it('fires every other week from the start week for biweekly', () => {
    const r = reminder({ repeat: 'biweekly', startDate: '2026-09-30' });
    expect(reminderFallsOn(r, at('2026-09-30'))).toBe(true);
    expect(reminderFallsOn(r, at('2026-10-05'))).toBe(false);
    expect(reminderFallsOn(r, at('2026-10-07'))).toBe(false);
    expect(reminderFallsOn(r, at('2026-10-12'))).toBe(true);
    // Across the November DST change.
    expect(reminderFallsOn(r, at('2026-11-09'))).toBe(true);
    expect(reminderFallsOn(r, at('2026-11-16'))).toBe(false);
  });
});

describe('dueReminders', () => {
  const groups = [
    {
      id: 'g1',
      name: 'Speech',
      studentIds: ['s1', 's2', 'gone'],
      reminder: reminder(),
    },
  ];

  it('is due from the time until the late window closes', () => {
    const rosters = [roster(groups)];
    expect(dueReminders(rosters, at('2026-09-28', '10:14').getTime())).toEqual(
      []
    );
    const due = dueReminders(rosters, at('2026-09-28', '10:15').getTime());
    expect(due).toHaveLength(1);
    expect(due[0].key).toBe('r1:g1:2026-09-28:10:15');
    expect(due[0].studentNames).toEqual(['Ben', 'Henry']);
    expect(
      dueReminders(
        rosters,
        at('2026-09-28', '10:15').getTime() + LATE_WINDOW_MS + 1
      )
    ).toEqual([]);
  });

  it('reports the wait until the next reminder today', () => {
    const now = at('2026-09-28', '10:00').getTime();
    expect(msUntilNextReminder([roster(groups)], now)).toBe(15 * 60 * 1000);
    expect(
      msUntilNextReminder([roster(groups)], at('2026-09-29').getTime())
    ).toBeNull();
  });
});

describe('parsing', () => {
  it('keeps a valid reminder and normalises its fields', () => {
    expect(
      parseGroupReminder({
        time: '13:30',
        days: [5, 1, 1, 9, 'x'],
        repeat: 'biweekly',
        startDate: '2026-10-01',
        sound: 'alarm',
        showStudentNames: true,
      })
    ).toEqual({
      enabled: true,
      days: [1, 5],
      time: '13:30',
      repeat: 'biweekly',
      startDate: '2026-10-01',
      sound: 'alarm',
      showStudentNames: true,
    });
  });

  it('drops a reminder without a valid time, and unknown sounds go silent', () => {
    expect(parseGroupReminder({ time: '25:00', days: [1] })).toBeUndefined();
    expect(parseGroupReminder({ time: '09:00', sound: 'siren' })?.sound).toBe(
      'off'
    );
  });

  it('keeps symbols private by default', () => {
    expect(parseGroupSymbol({ kind: 'shape', shape: 'star' })).toEqual({
      kind: 'shape',
      shape: 'star',
      color: '#f59e0b',
      showName: false,
    });
    expect(parseGroupSymbol({ kind: 'shape', shape: 'blob' })).toBeUndefined();
    expect(parseGroupSymbol({ kind: 'emoji', emoji: '🐢' })?.emoji).toBe('🐢');
  });
});

describe('formatReminderSummary', () => {
  it('lists days, time and the biweekly note', () => {
    const text = formatReminderSummary(
      reminder({ repeat: 'biweekly' }),
      'every 2 weeks',
      'en-US'
    );
    expect(text).toBe('Mon, Wed · 10:15 AM · every 2 weeks');
  });
});

describe('Group Maker visibility', () => {
  it('hides only groups turned off for Group Maker', () => {
    const r = roster([
      { id: 'a', name: 'Teams 1', studentIds: [] },
      { id: 'b', name: 'Speech', studentIds: [], inGroupMaker: false },
      { id: 'c', name: 'Math', studentIds: [], inGroupMaker: true },
    ]);
    expect(groupMakerGroups(r).map((g) => g.id)).toEqual(['a', 'c']);
  });

  it('treats a roster with only hidden groups as having none', () => {
    expect(
      anyRosterHasGroups([
        roster([
          { id: 'b', name: 'Speech', studentIds: [], inGroupMaker: false },
        ]),
      ])
    ).toBe(false);
  });
});
