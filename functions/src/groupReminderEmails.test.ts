import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
  auth: vi.fn(),
}));

import {
  alertOwnerUid,
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
  const alertSnap = (
    path = 'users/teacher-1/group_email_alerts/r1_g1',
    data: object = alertDoc()
  ) => ({ id: path.split('/').pop(), ref: { path }, data: () => data });
  const stubDb = (
    enabled: boolean,
    created: Map<string, unknown>,
    snaps = [alertSnap()]
  ) => {
    return {
      doc: () => ({
        get: () => Promise.resolve({ data: () => ({ enabled }) }),
      }),
      collectionGroup: () => ({
        limit: () => ({
          get: () => Promise.resolve({ docs: snaps, size: snaps.length }),
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
  const teacher = {
    email: 'teacher@school.edu',
    emailVerified: true,
    disabled: false,
    providerData: [{ providerId: 'google.com' }],
  };
  const auth = { getUser: vi.fn(() => Promise.resolve(teacher)) };

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

  it('mails no one whose admin turned off group schedules', async () => {
    const created = new Map<string, unknown>();
    const db = stubDb(true, created) as never;
    const canEmail = vi.fn(() => Promise.resolve(false));
    await runGroupReminderEmails(db, auth as never, MON_1017, canEmail);
    expect(canEmail).toHaveBeenCalledWith('teacher-1', 'teacher@school.edu');
    expect(created.size).toBe(0);
  });

  it('mails no one whose address is unverified or not a Google sign-in', async () => {
    for (const patch of [
      { emailVerified: false },
      { providerData: [{ providerId: 'password' }] },
      { email: undefined, providerData: [] },
    ]) {
      const created = new Map<string, unknown>();
      const db = stubDb(true, created) as never;
      const other = {
        getUser: () => Promise.resolve({ ...teacher, ...patch }),
      };
      await runGroupReminderEmails(db, other as never, MON_1017);
      expect(created.size).toBe(0);
    }
  });

  it('mails only from docs at exactly users/{uid}/group_email_alerts/{id}', async () => {
    const created = new Map<string, unknown>();
    const db = stubDb(true, created, [
      alertSnap('admin_settings/victim/group_email_alerts/x'),
      alertSnap('global_permissions/victim/group_email_alerts/x'),
      alertSnap('users/victim/other/y/group_email_alerts/x'),
    ]) as never;
    const getUser = vi.fn(() => Promise.resolve(teacher));
    await runGroupReminderEmails(db, { getUser } as never, MON_1017);
    expect(created.size).toBe(0);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('skips docs past the rule caps on name, message and alert count', async () => {
    const created = new Map<string, unknown>();
    const at = (time: string) => ({ time, leadMinutes: 0 });
    const db = stubDb(true, created, [
      alertSnap(undefined, alertDoc({ groupName: 'x'.repeat(81) })),
      alertSnap(undefined, alertDoc({ message: 'x'.repeat(501) })),
      alertSnap(undefined, alertDoc({ alerts: Array(7).fill(at('10:15')) })),
      alertSnap(undefined, alertDoc({ alerts: [] })),
    ]) as never;
    await runGroupReminderEmails(db, auth as never, MON_1017);
    expect(created.size).toBe(0);
  });

  it('still mails a doc at the caps, counting emoji as one character', async () => {
    const created = new Map<string, unknown>();
    const db = stubDb(true, created, [
      alertSnap(
        undefined,
        alertDoc({ groupName: '😀'.repeat(80), message: 'x'.repeat(500) })
      ),
    ]) as never;
    await runGroupReminderEmails(db, auth as never, MON_1017);
    expect(created.size).toBe(1);
  });
});

describe('alertOwnerUid', () => {
  it('returns the uid only for users/{uid}/group_email_alerts/{id}', () => {
    expect(alertOwnerUid('users/u1/group_email_alerts/a')).toBe('u1');
    expect(alertOwnerUid('admin_settings/u1/group_email_alerts/a')).toBeNull();
    expect(alertOwnerUid('users/u1/group_email_alerts/a/b/c')).toBeNull();
    expect(alertOwnerUid('x/users/u1/group_email_alerts/a')).toBeNull();
  });
});

describe('dueEmailAlerts across midnight', () => {
  const late = alertDoc({
    days: [1],
    alerts: [{ time: '00:05', leadMinutes: 30 }],
  });

  it('is due the evening before when the lead reaches back past midnight', () => {
    // Sunday 2026-09-27 23:36 in Chicago (CDT) is 00:05 Monday minus 30 minutes plus 1.
    expect(dueEmailAlerts(late, new Date('2026-09-28T04:36:00Z'))).toEqual([
      { dateKey: '2026-09-28', time: '00:05' },
    ]);
  });

  it('is not due on the alert day itself once the window has passed', () => {
    expect(dueEmailAlerts(late, new Date('2026-09-28T05:10:00Z'))).toEqual([]);
  });

  it('keeps a late-running tick after midnight for a late-evening alert', () => {
    const evening = alertDoc({
      days: [1],
      alerts: [{ time: '23:55', leadMinutes: 0 }],
    });
    // Tuesday 00:03 Chicago: a tick that ran late still sends Monday's 23:55 alert.
    expect(dueEmailAlerts(evening, new Date('2026-09-29T05:03:00Z'))).toEqual([
      { dateKey: '2026-09-28', time: '23:55' },
    ]);
  });
});
