import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
  auth: vi.fn(),
}));

import {
  buildGroupAlertEmail,
  dueEmailAlerts,
  localParts,
  runGroupReminderEmails,
  type EmailAlertDoc,
} from './groupReminderEmails';

const alertDoc = (patch: Partial<EmailAlertDoc> = {}): EmailAlertDoc => ({
  groupName: 'Speech',
  days: [1, 3],
  alerts: [{ time: '10:15', leadMinutes: 0 }],
  repeat: 'weekly',
  startDate: '2026-09-28',
  timeZone: 'America/Chicago',
  message: 'Send Ben to speech',
  ...patch,
});

// Monday 2026-09-28 10:17 in Chicago (CDT, UTC-5).
const MON_1017 = new Date('2026-09-28T15:17:00Z');

describe('localParts', () => {
  it('reads date, ISO weekday and minutes in the teacher zone', () => {
    expect(localParts(MON_1017, 'America/Chicago')).toEqual({
      dateKey: '2026-09-28',
      weekday: 1,
      minutes: 10 * 60 + 17,
    });
  });
});

describe('dueEmailAlerts', () => {
  it('is due inside the send window on a chosen day', () => {
    expect(dueEmailAlerts(alertDoc(), MON_1017)).toEqual([
      { dateKey: '2026-09-28', time: '10:15' },
    ]);
    expect(
      dueEmailAlerts(alertDoc(), new Date('2026-09-28T15:14:00Z'))
    ).toEqual([]);
    expect(
      dueEmailAlerts(alertDoc(), new Date('2026-09-28T15:26:00Z'))
    ).toEqual([]);
  });

  it('honours lead time, days, start date and every other week', () => {
    const lead = alertDoc({ alerts: [{ time: '10:20', leadMinutes: 5 }] });
    expect(dueEmailAlerts(lead, MON_1017)).toHaveLength(1);
    expect(dueEmailAlerts(alertDoc({ days: [2] }), MON_1017)).toEqual([]);
    expect(
      dueEmailAlerts(alertDoc({ startDate: '2026-09-29' }), MON_1017)
    ).toEqual([]);
    const biweekly = alertDoc({ repeat: 'biweekly', startDate: '2026-09-23' });
    expect(dueEmailAlerts(biweekly, MON_1017)).toEqual([]);
    expect(
      dueEmailAlerts(biweekly, new Date('2026-10-05T15:17:00Z'))
    ).toHaveLength(1);
  });

  it('skips an unknown time zone', () => {
    expect(
      dueEmailAlerts(alertDoc({ timeZone: 'Mars/Base' }), MON_1017)
    ).toEqual([]);
  });
});

describe('buildGroupAlertEmail', () => {
  it('uses the group name and time, and escapes the message', () => {
    const mail = buildGroupAlertEmail(
      alertDoc({ message: '<b>Go</b>' }),
      '13:40'
    );
    expect(mail.subject).toBe('Speech at 1:40 PM');
    expect(mail.html).toContain('&lt;b&gt;Go&lt;/b&gt;');
  });
});

describe('runGroupReminderEmails', () => {
  const stubDb = (enabled: boolean, created: Map<string, unknown>) => {
    const snap = {
      id: 'r1_g1',
      ref: { parent: { parent: { id: 'teacher-1' } } },
      data: () => alertDoc(),
    };
    return {
      doc: () => ({
        get: () => Promise.resolve({ data: () => ({ enabled }) }),
      }),
      collectionGroup: () => ({
        limit: () => ({
          get: () => Promise.resolve({ docs: [snap], size: 1 }),
        }),
      }),
      collection: () => ({
        doc: (id: string) => ({
          create: (data: unknown) => {
            if (created.has(id))
              return Promise.reject(
                Object.assign(new Error('exists'), { code: 6 })
              );
            created.set(id, data);
            return Promise.resolve();
          },
        }),
      }),
    };
  };
  const auth = {
    getUser: vi.fn(() =>
      Promise.resolve({ email: 'teacher@school.edu', disabled: false })
    ),
  };

  it('queues nothing while the switch is off', async () => {
    const created = new Map<string, unknown>();
    const db = stubDb(false, created) as never;
    expect(await runGroupReminderEmails(db, auth as never, MON_1017)).toEqual({
      scanned: 0,
      queued: 0,
    });
    expect(created.size).toBe(0);
  });

  it('emails the owner once per alert, even across overlapping runs', async () => {
    const created = new Map<string, unknown>();
    const db = stubDb(true, created) as never;
    await runGroupReminderEmails(db, auth as never, MON_1017);
    await runGroupReminderEmails(
      db,
      auth as never,
      new Date('2026-09-28T15:20:00Z')
    );
    expect([...created.keys()]).toEqual([
      'group-alert_teacher-1_r1_g1_2026-09-28_10:15',
    ]);
    expect(created.values().next().value).toMatchObject({
      to: ['teacher@school.edu'],
      message: { subject: 'Speech at 10:15 AM' },
    });
  });
});
