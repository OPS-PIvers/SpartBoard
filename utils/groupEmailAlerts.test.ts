import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/firebase', () => ({ db: {} }));

import type { RosterGroup } from '@/types';
import { defaultGroupReminder } from './groupReminders';
import { buildGroupEmailAlertDocs } from './groupEmailAlerts';

const group = (patch: Partial<RosterGroup['reminder']> = {}): RosterGroup => ({
  id: 'g1',
  name: ' Speech ',
  studentIds: ['s1', 's2'],
  reminder: {
    ...defaultGroupReminder(new Date(2026, 8, 28)),
    days: [1, 3],
    emailAlert: true,
    emailMessage: ' Walk them over ',
    ...patch,
  },
});

describe('buildGroupEmailAlertDocs', () => {
  it('copies only the schedule and message, never students', () => {
    const [d] = buildGroupEmailAlertDocs('r1', [group()], 'America/Chicago', 5);
    expect(d).toEqual({
      rosterId: 'r1',
      groupId: 'g1',
      groupName: 'Speech',
      days: [1, 3],
      alerts: [{ time: '09:00', leadMinutes: 0 }],
      repeat: 'weekly',
      startDate: '2026-09-28',
      timeZone: 'America/Chicago',
      message: 'Walk them over',
      updatedAt: 5,
    });
    expect(JSON.stringify(d)).not.toContain('s1');
  });

  it('skips groups without an emailed, enabled, scheduled reminder', () => {
    const docs = buildGroupEmailAlertDocs(
      'r1',
      [
        group({ emailAlert: false }),
        group({ enabled: false }),
        group({ days: [] }),
        { id: 'g2', name: 'Teams', studentIds: [] },
      ],
      'UTC',
      0
    );
    expect(docs).toEqual([]);
  });
});
