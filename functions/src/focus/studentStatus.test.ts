// The student's session check and status reports: request parsing, F7 hand-over and the report throttle.
import { describe, it, expect } from 'vitest';
import {
  FOCUS_REPORT_BURST_MS,
  FocusCallError,
  applyReport,
  focusReport,
  focusStatus,
  normalizeReportedHost,
  parsePushSubscription,
  parseReportRequest,
  parseStatusRequest,
  pickSession,
  type FocusStudentStore,
  type SessionCandidate,
} from './studentStatus';
import type {
  FocusPushSubscription,
  FocusReportRequest,
  FocusSessionDoc,
  FocusStudentDoc,
} from './shared.gen';

const NOW = 1_800_000_000_000;
const UID = 'student-uid';

const session = (over: Partial<FocusSessionDoc> = {}): FocusSessionDoc => ({
  orgId: 'orono',
  classId: 'class-1',
  className: 'Science 3',
  teacherUid: 't1',
  teacherName: 'Ms. Rivera',
  teacherUids: ['t1'],
  level: 'redirect',
  sites: [{ host: 'desmos.com', path: '' }],
  studentUids: [UID],
  startedAt: NOW - 10 * 60_000,
  endsAt: NOW + 20 * 60_000,
  endedAt: null,
  endReason: null,
  ...over,
});

const student = (over: Partial<FocusStudentDoc> = {}): FocusStudentDoc => ({
  status: 'waiting',
  awaySince: null,
  awayMs: 0,
  blockedTries: 0,
  lastReportAt: null,
  protocol: null,
  liveHost: null,
  otherSessionEndsAt: null,
  ...over,
});

const push: FocusPushSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc:def',
  keys: { p256dh: 'BOr_key-1', auth: 'au_th' },
};

const report = (
  over: Partial<FocusReportRequest> = {}
): FocusReportRequest => ({
  sessionId: 's1',
  protocol: 9,
  status: 'on-task',
  blockedTries: 0,
  host: null,
  ...over,
});

const statusOf = async (p: Promise<unknown>): Promise<number> => {
  try {
    await p;
    return 200;
  } catch (e) {
    return e instanceof FocusCallError ? e.status : -1;
  }
};

describe('parsePushSubscription', () => {
  it("accepts Chrome's push service", () => {
    expect(parsePushSubscription(push)).toEqual(push);
  });

  it('refuses any other endpoint, so sends never go elsewhere', () => {
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/x',
      'https://fcm.googleapis.com.evil.example/x',
      'https://evil.example/fcm.googleapis.com',
      'https://fcm.googleapis.com:8443/x',
      'https://user@fcm.googleapis.com/x',
      'not a url',
      `https://fcm.googleapis.com/${'x'.repeat(2100)}`,
    ])
      expect(parsePushSubscription({ ...push, endpoint })).toBeNull();
  });

  it('refuses missing or malformed keys', () => {
    expect(parsePushSubscription({ endpoint: push.endpoint })).toBeNull();
    expect(
      parsePushSubscription({ ...push, keys: { p256dh: 'a b', auth: 'x' } })
    ).toBeNull();
    expect(
      parsePushSubscription({
        ...push,
        keys: { p256dh: 'a'.repeat(201), auth: 'x' },
      })
    ).toBeNull();
  });
});

describe('parseStatusRequest', () => {
  it('needs a protocol', () => {
    expect(() => parseStatusRequest({})).toThrow(FocusCallError);
    expect(() => parseStatusRequest({ protocol: -1 })).toThrow(FocusCallError);
    expect(() => parseStatusRequest(null)).toThrow(FocusCallError);
  });

  it('keeps, clears or ignores the subscription', () => {
    expect(parseStatusRequest({ protocol: 9 }).push).toBeUndefined();
    expect(parseStatusRequest({ protocol: 9, push: null }).push).toBeNull();
    expect(parseStatusRequest({ protocol: 9, push }).push).toEqual(push);
    expect(
      parseStatusRequest({ protocol: 9, push: { endpoint: 'x' } }).push
    ).toBeUndefined();
  });
});

describe('parseReportRequest', () => {
  it('accepts a well-formed report and normalizes the host', () => {
    expect(
      parseReportRequest({
        ...report(),
        status: 'away',
        host: 'WWW.Desmos.com.',
      })
    ).toEqual(report({ status: 'away', host: 'www.desmos.com' }));
  });

  it('refuses bad ids, statuses and counts', () => {
    for (const bad of [
      { sessionId: '../x' },
      { sessionId: '' },
      { status: 'released' },
      { blockedTries: -1 },
      { blockedTries: 1.5 },
      { protocol: '9' },
    ])
      expect(() => parseReportRequest({ ...report(), ...bad })).toThrow(
        FocusCallError
      );
  });

  it('drops anything that is not a host name', () => {
    expect(normalizeReportedHost('https://desmos.com/x')).toBeNull();
    expect(normalizeReportedHost('desmos.com:443')).toBeNull();
    expect(normalizeReportedHost(42)).toBeNull();
    expect(normalizeReportedHost('localhost')).toBe('localhost');
  });
});

describe('pickSession (F7)', () => {
  const c = (
    id: string,
    s: Partial<FocusSessionDoc>,
    st: FocusStudentDoc['status'] | null
  ): SessionCandidate => ({
    id,
    session: session(s),
    student: st ? { status: st } : null,
  });

  it('returns none when nothing is running', () => {
    expect(pickSession([], NOW)).toBeNull();
    expect(
      pickSession(
        [
          c('a', { endsAt: NOW }, 'on-task'),
          c('b', { endedAt: NOW - 1 }, null),
        ],
        NOW
      )
    ).toBeNull();
  });

  it('keeps the student in the session holding them, not one that left them waiting', () => {
    const held = c('b', { startedAt: NOW - 1 }, 'away');
    const r = pickSession(
      [c('a', { startedAt: NOW - 100 }, 'other-session'), held],
      NOW
    );
    expect(r).toEqual({ pick: held, promote: false });
  });

  it('prefers the earliest holding session when two claim the student', () => {
    const first = c('z', { startedAt: NOW - 100 }, null);
    expect(
      pickSession([c('a', { startedAt: NOW - 50 }, 'on-task'), first], NOW)
        ?.pick
    ).toBe(first);
  });

  it('skips a session that released the student and hands them to the waiting one', () => {
    const next = c('b', { startedAt: NOW - 50 }, 'other-session');
    expect(
      pickSession([c('a', { startedAt: NOW - 100 }, 'released'), next], NOW)
    ).toEqual({ pick: next, promote: true });
    expect(pickSession([c('a', {}, 'released')], NOW)).toBeNull();
  });

  it('hands the student to the earliest waiting session once the first ends', () => {
    const next = c('b', { startedAt: NOW - 100 }, 'other-session');
    const r = pickSession(
      [
        c('a', { endedAt: NOW - 5 }, 'on-task'),
        c('c', { startedAt: NOW - 50 }, 'other-session'),
        next,
      ],
      NOW
    );
    expect(r).toEqual({ pick: next, promote: true });
  });
});

describe('applyReport', () => {
  it('starts and closes an away stretch on the server clock', () => {
    const away = applyReport(student(), report({ status: 'away' }), NOW, false);
    expect(away.write).toMatchObject({
      status: 'away',
      awaySince: NOW,
      awayMs: 0,
      lastReportAt: NOW,
      protocol: 9,
    });
    const back = applyReport(
      student({ ...away.write }),
      report({ status: 'on-task' }),
      NOW + 90_000,
      false
    );
    expect(back.write).toMatchObject({
      status: 'on-task',
      awaySince: null,
      awayMs: 90_000,
    });
  });

  it('keeps a running away stretch across reports', () => {
    const r = applyReport(
      student({
        status: 'away',
        awaySince: NOW - 120_000,
        lastReportAt: NOW - 60_000,
      }),
      report({ status: 'away' }),
      NOW,
      false
    );
    expect(r.write).toMatchObject({ awaySince: NOW - 120_000, awayMs: 0 });
  });

  it('drops an unchanged report inside a minute and other changes inside the burst gap', () => {
    const prev = student({ status: 'on-task', lastReportAt: NOW - 30_000 });
    expect(applyReport(prev, report(), NOW, false)).toEqual({
      write: null,
      active: true,
    });
    expect(
      applyReport(prev, report({ status: 'away' }), NOW, false).write?.status
    ).toBe('away');
    const recent = student({
      status: 'on-task',
      lastReportAt: NOW - FOCUS_REPORT_BURST_MS + 1,
    });
    expect(
      applyReport(recent, report({ blockedTries: 3 }), NOW, false).write
    ).toBeNull();
    expect(
      applyReport(
        student({ status: 'on-task', lastReportAt: NOW - 55_000 }),
        report(),
        NOW,
        false
      ).write
    ).not.toBeNull();
  });

  it('always applies a status change, so away time is neither lost nor counted twice', () => {
    const left = applyReport(
      student({ status: 'on-task', lastReportAt: NOW - 3_000 }),
      report({ status: 'away' }),
      NOW,
      false
    ).write;
    expect(left).toMatchObject({ status: 'away', awaySince: NOW });
    const back = applyReport(
      student({ ...left }),
      report({ status: 'on-task' }),
      NOW + 2_000,
      false
    ).write;
    expect(back).toMatchObject({ status: 'on-task', awayMs: 2_000 });
  });

  it('never lowers blocked tries and counts a rise as a change', () => {
    const prev = student({
      status: 'on-task',
      blockedTries: 4,
      lastReportAt: NOW - 20_000,
    });
    expect(
      applyReport(prev, report({ blockedTries: 5 }), NOW, false).write
        ?.blockedTries
    ).toBe(5);
    expect(
      applyReport(
        { ...prev, lastReportAt: NOW - 70_000 },
        report({ blockedTries: 1 }),
        NOW,
        false
      ).write?.blockedTries
    ).toBe(4);
  });

  it('keeps the site only while the live-site switch is on', () => {
    const r = report({ host: 'desmos.com' });
    expect(applyReport(student(), r, NOW, false).write?.liveHost).toBeNull();
    expect(applyReport(student(), r, NOW, true).write?.liveHost).toBe(
      'desmos.com'
    );
    expect(
      applyReport(
        student({
          status: 'on-task',
          liveHost: 'desmos.com',
          lastReportAt: NOW - 20_000,
        }),
        report(),
        NOW,
        false
      ).write?.liveHost
    ).toBeNull();
  });

  it('tells a released or waiting student to check status, without writing', () => {
    for (const status of ['released', 'other-session'] as const)
      expect(applyReport(student({ status }), report(), NOW, false)).toEqual({
        write: null,
        active: false,
      });
  });
});

class MemoryStore implements FocusStudentStore {
  sessions = new Map<string, FocusSessionDoc>();
  students = new Map<string, FocusStudentDoc>();
  pushes = new Map<string, FocusPushSubscription>();
  live = false;
  promoted: string[] = [];
  key = (id: string, uid: string) => `${id}/${uid}`;
  openSessionsFor(uid: string) {
    return Promise.resolve(
      [...this.sessions.entries()]
        .filter(([, s]) => s.studentUids.includes(uid) && s.endedAt === null)
        .map(([id, s]) => ({
          id,
          session: s,
          student: this.students.get(this.key(id, uid)) ?? null,
        }))
    );
  }
  promote(id: string, uid: string) {
    const st = this.students.get(this.key(id, uid));
    if (st?.status !== 'other-session') return Promise.resolve(false);
    this.students.set(this.key(id, uid), { ...st, status: 'waiting' });
    this.promoted.push(id);
    return Promise.resolve(true);
  }
  savePush(uid: string, p: FocusPushSubscription | null) {
    if (p) this.pushes.set(uid, p);
    else this.pushes.delete(uid);
    return Promise.resolve();
  }
  showLiveSite() {
    return Promise.resolve(this.live);
  }
  report(
    id: string,
    uid: string,
    apply: Parameters<FocusStudentStore['report']>[2]
  ) {
    const k = this.key(id, uid);
    const { write, active } = apply(
      this.sessions.get(id) ?? null,
      this.students.get(k) ?? null
    );
    if (write)
      this.students.set(k, {
        ...(this.students.get(k) ?? student()),
        ...write,
      });
    return Promise.resolve(active);
  }
}

describe('focusStatus', () => {
  it('returns no session and the server clock when the student has none', async () => {
    const store = new MemoryStore();
    expect(await focusStatus({ protocol: 9 }, UID, store, NOW)).toEqual({
      session: null,
      serverNow: NOW,
    });
  });

  it('returns no session once the student is released from it', async () => {
    const store = new MemoryStore();
    store.sessions.set('s1', session());
    store.students.set('s1/' + UID, student({ status: 'released' }));
    expect(
      (await focusStatus({ protocol: 9 }, UID, store, NOW)).session
    ).toBeNull();
  });

  it('returns the running session as the extension sees it', async () => {
    const store = new MemoryStore();
    store.live = true;
    store.sessions.set('s1', session());
    store.students.set('s1/' + UID, student({ status: 'away' }));
    expect(await focusStatus({ protocol: 9 }, UID, store, NOW)).toEqual({
      session: {
        sessionId: 's1',
        teacherName: 'Ms. Rivera',
        level: 'redirect',
        sites: [{ host: 'desmos.com', path: '' }],
        endsAt: NOW + 20 * 60_000,
        released: false,
        showLiveSite: true,
      },
      serverNow: NOW,
    });
  });

  it('stores and clears the push subscription', async () => {
    const store = new MemoryStore();
    await focusStatus({ protocol: 9, push }, UID, store, NOW);
    expect(store.pushes.get(UID)).toEqual(push);
    await focusStatus({ protocol: 9 }, UID, store, NOW);
    expect(store.pushes.get(UID)).toEqual(push);
    await focusStatus({ protocol: 9, push: null }, UID, store, NOW);
    expect(store.pushes.has(UID)).toBe(false);
  });

  it('moves a waiting student into the next session once theirs has ended', async () => {
    const store = new MemoryStore();
    store.sessions.set('a', session({ endsAt: NOW - 1 }));
    store.sessions.set('b', session({ teacherName: 'Mr. Lee' }));
    store.students.set('a/' + UID, student({ status: 'on-task' }));
    store.students.set('b/' + UID, student({ status: 'other-session' }));
    const reply = await focusStatus({ protocol: 9 }, UID, store, NOW);
    expect(reply.session?.sessionId).toBe('b');
    expect(reply.session?.released).toBe(false);
    expect(store.promoted).toEqual(['b']);
  });

  it('refuses a malformed request', async () => {
    expect(await statusOf(focusStatus({}, UID, new MemoryStore(), NOW))).toBe(
      400
    );
  });
});

describe('focusReport', () => {
  it("writes the student's state in a running session", async () => {
    const store = new MemoryStore();
    store.sessions.set('s1', session());
    expect(
      await focusReport({ ...report(), status: 'away' }, UID, store, NOW)
    ).toEqual({ ok: true, active: true });
    expect(store.students.get('s1/' + UID)).toMatchObject({
      status: 'away',
      awaySince: NOW,
    });
  });

  it("doesn't write into a session the student isn't in, or one that has ended", async () => {
    const store = new MemoryStore();
    store.sessions.set('s1', session({ studentUids: ['someone-else'] }));
    store.sessions.set('s2', session({ endedAt: NOW - 1 }));
    for (const sessionId of ['s1', 's2', 'missing'])
      expect(
        await focusReport({ ...report(), sessionId }, UID, store, NOW)
      ).toEqual({ ok: true, active: false });
    expect(store.students.size).toBe(0);
  });

  it('refuses a malformed report', async () => {
    expect(
      await statusOf(
        focusReport({ sessionId: 's1' }, UID, new MemoryStore(), NOW)
      )
    ).toBe(400);
  });
});
