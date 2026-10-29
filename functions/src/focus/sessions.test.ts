import { beforeEach, describe, expect, it } from 'vitest';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { computeStudentUid } from '../classlinkShared';
import {
  focusEndReasonAt,
  handleFocusAddSite,
  handleFocusEnd,
  handleFocusExtend,
  handleFocusRelease,
  handleFocusStart,
  sweepFocusSessions,
  type FocusCaller,
  type FocusDeps,
} from './sessions';
import { DEFAULT_FOCUS_WINDOW, type FocusSessionDoc } from './shared.gen';
import { createMemoryFirestore } from './testFirestore';

// Against the emulator: firebase emulators:exec --project demo-spartboard --only firestore "pnpm -C functions exec vitest run src/focus/sessions.test.ts"
const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;

// Tuesday 2026-10-27 10:00 in Chicago (CDT).
const NOW = Date.UTC(2026, 9, 27, 15, 0, 0);
const WINDOW_END = Date.UTC(2026, 9, 27, 21, 0, 0);
const HMAC = 'test-hmac';
const CLASS = 'class-1';
const OTHER_CLASS = 'class-2';
const uidOf = (sourcedId: string) => computeStudentUid(sourcedId, HMAC);

const teacher = (over: Partial<FocusCaller> = {}): FocusCaller => ({
  uid: 'teacher-1',
  email: 'teacher@orono.k12.mn.us',
  emailVerified: true,
  anonymous: false,
  studentRole: false,
  name: 'Ms. Teacher',
  ...over,
});
const coTeacher = teacher({
  uid: 'teacher-2',
  email: 'co@orono.k12.mn.us',
  name: 'Mr. Co',
});
const otherTeacher = teacher({
  uid: 'teacher-3',
  email: 'other@orono.k12.mn.us',
  name: 'Other',
});
const sub = teacher({
  uid: 'sub-1',
  email: 'sub@orono.k12.mn.us',
  name: 'Sub',
});

// Who teaches what, by email; values are the class's ClassLink students.
const CLASSES: Record<string, Record<string, string[]>> = {
  'teacher@orono.k12.mn.us': { [CLASS]: ['s1', 's2', 's3'] },
  'co@orono.k12.mn.us': { [CLASS]: ['s1', 's2', 's3'] },
  'other@orono.k12.mn.us': { [OTHER_CLASS]: ['s2', 's3', 's4'] },
};

let now = NOW;
const deps: FocusDeps = {
  now: () => now,
  hmacSecret: () => HMAC,
  taughtClassEnrollment: (email, classId) => {
    const list = CLASSES[email]?.[classId];
    return Promise.resolve(list ? new Set(list) : null);
  },
};

const desmos = { host: 'desmos.com', path: '' };
const startInput = (over: Record<string, unknown> = {}) => ({
  classId: CLASS,
  className: 'Period 3 Math',
  level: 'redirect',
  minutes: 30,
  sites: [desmos],
  ...over,
});

let db: admin.firestore.Firestore;

async function seed() {
  // The emulator keeps data between tests; sessions are cleared, the fixed docs below are rewritten.
  if (EMULATOR) {
    if (admin.apps.length === 0)
      admin.initializeApp({ projectId: 'demo-spartboard' });
    db = admin.firestore();
    await db.recursiveDelete(db.collection('focus_sessions'));
  } else {
    db = createMemoryFirestore();
  }
  await db
    .doc('organizations/orono/domains/main')
    .set({ domain: '@orono.k12.mn.us', status: 'verified' });
  await db.doc('admins/teacher@orono.k12.mn.us').set({ roleId: 'super_admin' });
  await db.doc('admins/other@orono.k12.mn.us').set({ roleId: 'super_admin' });
  await db.doc('admin_settings/focus_sessions').delete();
  await db.doc('feature_permissions/focus').delete();
}

async function sessionDoc(id: string) {
  return (await db.doc(`focus_sessions/${id}`).get()).data() as FocusSessionDoc;
}
async function studentDoc(id: string, sourcedId: string) {
  return (
    await db.doc(`focus_sessions/${id}/students/${uidOf(sourcedId)}`).get()
  ).data() as Record<string, unknown>;
}
const start = (caller = teacher(), over: Record<string, unknown> = {}) =>
  handleFocusStart(db, caller, startInput(over), deps);

// The emulator's first call waits on a metadata lookup.
beforeEach(async () => {
  now = NOW;
  await seed();
}, 30_000);

describe('focusStartV1', () => {
  it('starts a session for a class the teacher teaches', async () => {
    const reply = await start();
    expect(reply).toMatchObject({
      endsAt: NOW + 30 * 60_000,
      studentCount: 3,
      otherSessionCount: 0,
    });
    const session = await sessionDoc(reply.sessionId);
    expect(session).toMatchObject({
      orgId: 'orono',
      classId: CLASS,
      className: 'Period 3 Math',
      teacherUid: 'teacher-1',
      teacherName: 'Ms. Teacher',
      teacherUids: ['teacher-1'],
      level: 'redirect',
      sites: [desmos],
      startedAt: NOW,
      endedAt: null,
      endReason: null,
    });
    expect(session.studentUids.sort()).toEqual(
      ['s1', 's2', 's3'].map(uidOf).sort()
    );
    expect(await studentDoc(reply.sessionId, 's1')).toMatchObject({
      status: 'waiting',
      awayMs: 0,
      blockedTries: 0,
      lastReportAt: null,
    });
  });

  it('cuts the length at the window close and refuses outside it', async () => {
    now = WINDOW_END - 10 * 60_000;
    expect((await start()).endsAt).toBe(WINDOW_END);
    now = Date.UTC(2026, 9, 31, 15, 0, 0); // Saturday
    await expect(start(teacher(), { classId: OTHER_CLASS })).rejects.toThrow(
      /school day/
    );
  });

  it('follows the admin window setting', async () => {
    await db.doc('admin_settings/focus_sessions').set({
      window: { ...DEFAULT_FOCUS_WINDOW, start: '11:00' },
    });
    await expect(start()).rejects.toThrow(/school day/);
  });

  it('refuses a bad length, level or site list', async () => {
    await expect(start(teacher(), { minutes: 61 })).rejects.toThrow(/1 to 60/);
    await expect(start(teacher(), { minutes: '30' })).rejects.toThrow(
      /minutes/
    );
    await expect(start(teacher(), { level: 'kiosk' })).rejects.toThrow(/level/);
    await expect(start(teacher(), { sites: [] })).rejects.toThrow(/site/);
    await expect(
      start(teacher(), { sites: [{ host: 'desmos.com.', path: '/' }] })
    ).rejects.toThrow(/web address/);
  });

  it('refuses students, unverified and anonymous callers', async () => {
    await expect(start(teacher({ studentRole: true }))).rejects.toThrow(
      /teacher accounts/
    );
    await expect(
      start(teacher({ email: 'kid@students.orono.k12.mn.us' }))
    ).rejects.toThrow(/teacher accounts/);
    await expect(start(teacher({ emailVerified: false }))).rejects.toThrow(
      /verified/
    );
    await expect(start(teacher({ anonymous: true }))).rejects.toThrow(
      /teacher accounts/
    );
    await expect(
      handleFocusStart(db, null, startInput(), deps)
    ).rejects.toThrow(/Sign in/);
  });

  it('refuses a class the teacher does not teach', async () => {
    await expect(start(teacher(), { classId: OTHER_CLASS })).rejects.toThrow(
      /do not teach/
    );
  });

  it('follows the focus widget permission, failing closed when it has no row', async () => {
    // co@ is not an admin and there is no row yet.
    await expect(start(coTeacher)).rejects.toThrow(/not turned on/);
    await db
      .doc('feature_permissions/focus')
      .set({ widgetType: 'focus', enabled: true, accessLevel: 'admin' });
    await expect(start(coTeacher)).rejects.toThrow(/not turned on/);
    await db.doc('feature_permissions/focus').set({
      widgetType: 'focus',
      enabled: true,
      accessLevel: 'beta',
      betaUsers: ['co@orono.k12.mn.us'],
    });
    await expect(start(coTeacher)).resolves.toMatchObject({ studentCount: 3 });
  });

  it('turns off for admins too when the row is disabled', async () => {
    await db
      .doc('feature_permissions/focus')
      .set({ widgetType: 'focus', enabled: false, accessLevel: 'public' });
    await expect(start()).rejects.toThrow(/not turned on/);
  });

  it('refuses a second session for the same class', async () => {
    await start();
    await expect(start()).rejects.toThrow(/already has/);
  });

  it('uses the mock class for a teacher who owns its roster', async () => {
    await db
      .doc('organizations/orono/testClasses/mock-1')
      .set({ memberEmails: ['Kid@students.orono.k12.mn.us'] });
    await expect(start(teacher(), { classId: 'mock-1' })).rejects.toThrow(
      /do not teach/
    );
    await db.doc('organizations/orono/members/teacher@orono.k12.mn.us').set({
      roleId: 'teacher',
    });
    await db
      .doc('users/teacher-1/rosters/r1')
      .set({ testClassId: 'mock-1', name: 'Mock' });
    const reply = await start(teacher(), { classId: 'mock-1' });
    expect((await sessionDoc(reply.sessionId)).studentUids).toEqual([
      computeStudentUid('test:kid@students.orono.k12.mn.us', HMAC),
    ]);
  });
});

describe('one session per student (F7)', () => {
  it('marks students another session holds, then hands them over when it ends', async () => {
    const first = await start();
    now += 60_000;
    const second = await start(otherTeacher, { classId: OTHER_CLASS });
    expect(second.otherSessionCount).toBe(2);
    expect(await studentDoc(second.sessionId, 's2')).toMatchObject({
      status: 'other-session',
      otherSessionEndsAt: first.endsAt,
    });
    expect(await studentDoc(second.sessionId, 's4')).toMatchObject({
      status: 'waiting',
    });

    const extended = await handleFocusExtend(
      db,
      teacher(),
      { sessionId: first.sessionId },
      deps
    );
    expect(await studentDoc(second.sessionId, 's3')).toMatchObject({
      otherSessionEndsAt: extended.endsAt,
    });

    await handleFocusEnd(db, teacher(), { sessionId: first.sessionId }, deps);
    expect(await studentDoc(second.sessionId, 's2')).toMatchObject({
      status: 'waiting',
      otherSessionEndsAt: null,
    });
  });

  it('frees a student released from the session that holds them', async () => {
    const first = await start();
    now += 60_000;
    const second = await start(otherTeacher, { classId: OTHER_CLASS });
    await handleFocusRelease(
      db,
      teacher(),
      { sessionId: first.sessionId, studentUid: uidOf('s2') },
      deps
    );
    expect(await studentDoc(second.sessionId, 's2')).toMatchObject({
      status: 'waiting',
    });
    expect(await studentDoc(second.sessionId, 's3')).toMatchObject({
      status: 'other-session',
    });
  });
});

describe('focusExtendV1', () => {
  it('adds 10 minutes, capped at the window close', async () => {
    const { sessionId, endsAt } = await start();
    const reply = await handleFocusExtend(db, teacher(), { sessionId }, deps);
    expect(reply.endsAt).toBe(endsAt + 10 * 60_000);
    now = WINDOW_END - 5 * 60_000;
    await db
      .doc(`focus_sessions/${sessionId}`)
      .update({ endsAt: now + 60_000 });
    expect(
      (await handleFocusExtend(db, teacher(), { sessionId }, deps)).endsAt
    ).toBe(WINDOW_END);
    await expect(
      handleFocusExtend(db, teacher(), { sessionId }, deps)
    ).rejects.toThrow(/end of the school day/);
  });

  it('refuses after the session ended, and refuses non-teachers', async () => {
    const { sessionId, endsAt } = await start();
    await expect(
      handleFocusExtend(db, otherTeacher, { sessionId }, deps)
    ).rejects.toThrow(/do not teach/);
    await expect(
      handleFocusExtend(db, sub, { sessionId, shareId: 'share-1' }, deps)
    ).rejects.toThrow(/do not teach/);
    now = endsAt;
    await expect(
      handleFocusExtend(db, teacher(), { sessionId }, deps)
    ).rejects.toThrow(/has ended/);
  });

  it('adds a co-teacher of the class to the session on first use', async () => {
    const { sessionId } = await start();
    await handleFocusExtend(db, coTeacher, { sessionId }, deps);
    expect((await sessionDoc(sessionId)).teacherUids).toEqual([
      'teacher-1',
      'teacher-2',
    ]);
  });
});

describe('focusReleaseV1', () => {
  it('releases one student and folds their running away time', async () => {
    const { sessionId } = await start();
    await db.doc(`focus_sessions/${sessionId}/students/${uidOf('s1')}`).update({
      status: 'away',
      awaySince: NOW,
      awayMs: 1000,
      liveHost: 'x.com',
    });
    now = NOW + 5000;
    const reply = await handleFocusRelease(
      db,
      teacher(),
      { sessionId, studentUid: uidOf('s1') },
      deps
    );
    expect(reply.released).toBe(1);
    expect(await studentDoc(sessionId, 's1')).toMatchObject({
      status: 'released',
      awaySince: null,
      awayMs: 6000,
      liveHost: null,
    });
    expect(await studentDoc(sessionId, 's2')).toMatchObject({
      status: 'waiting',
    });
  });

  it('releases the whole class and keeps the session open', async () => {
    const { sessionId } = await start();
    const reply = await handleFocusRelease(db, teacher(), { sessionId }, deps);
    expect(reply.released).toBe(3);
    expect((await sessionDoc(sessionId)).endedAt).toBeNull();
    expect(
      (await handleFocusRelease(db, teacher(), { sessionId }, deps)).released
    ).toBe(0);
  });

  it('refuses a student who is not in the session', async () => {
    const { sessionId } = await start();
    await expect(
      handleFocusRelease(
        db,
        teacher(),
        { sessionId, studentUid: uidOf('s9') },
        deps
      )
    ).rejects.toThrow(/not in this session/);
  });
});

describe('substitutes (F8)', () => {
  async function shareFor(classId: string, over: Record<string, unknown> = {}) {
    await db
      .doc('users/teacher-1/rosters/r1')
      .set({ classlinkClassId: classId, name: 'P3' });
    await db.doc('shared_collections/share-1').set({
      intendedMode: 'substitute',
      hostUid: 'teacher-1',
      expiresAt: NOW + 86_400_000,
      subEmails: ['sub@orono.k12.mn.us'],
      sharedRosters: [{ id: 'r1' }],
      ...over,
    });
  }

  it('lets a sub release and end with a share that covers the class', async () => {
    const { sessionId } = await start();
    await shareFor(CLASS);
    const released = await handleFocusRelease(
      db,
      sub,
      { sessionId, studentUid: uidOf('s1'), shareId: 'share-1' },
      deps
    );
    expect(released.released).toBe(1);
    const ended = await handleFocusEnd(
      db,
      sub,
      { sessionId, shareId: 'share-1' },
      deps
    );
    expect(ended.endedAt).toBe(NOW);
  });

  it('refuses a share for another class, an expired share or another sub', async () => {
    const { sessionId } = await start();
    await shareFor(OTHER_CLASS);
    await expect(
      handleFocusEnd(db, sub, { sessionId, shareId: 'share-1' }, deps)
    ).rejects.toThrow(/does not cover/);
    await shareFor(CLASS, { expiresAt: NOW - 1 });
    await expect(
      handleFocusEnd(db, sub, { sessionId, shareId: 'share-1' }, deps)
    ).rejects.toThrow(/expired/);
    await shareFor(CLASS, { subEmails: ['someone@orono.k12.mn.us'] });
    await expect(
      handleFocusEnd(db, sub, { sessionId, shareId: 'share-1' }, deps)
    ).rejects.toThrow(/does not name you/);
    await shareFor(CLASS, { hostUid: 'teacher-9' });
    await expect(
      handleFocusEnd(db, sub, { sessionId, shareId: 'share-1' }, deps)
    ).rejects.toThrow(/not from a teacher/);
  });

  it('never lets a sub add sites', async () => {
    const { sessionId } = await start();
    await shareFor(CLASS);
    await expect(
      handleFocusAddSite(
        db,
        sub,
        { sessionId, shareId: 'share-1', site: { host: 'evil.com', path: '' } },
        deps
      )
    ).rejects.toThrow(/do not teach/);
    expect((await sessionDoc(sessionId)).sites).toEqual([desmos]);
  });
});

describe('focusAddSiteV1', () => {
  it('adds a site once and refuses bad ones', async () => {
    const { sessionId } = await start();
    const site = { host: 'docs.google.com', path: '/document/d/abc' };
    expect(
      (await handleFocusAddSite(db, teacher(), { sessionId, site }, deps)).sites
    ).toEqual([desmos, site]);
    expect(
      (await handleFocusAddSite(db, teacher(), { sessionId, site }, deps)).sites
    ).toHaveLength(2);
    await expect(
      handleFocusAddSite(
        db,
        teacher(),
        { sessionId, site: { host: 'docs.google.com', path: '/open' } },
        deps
      )
    ).rejects.toThrow(/web address/);
  });

  it('stops at the site limit', async () => {
    const sites = Array.from({ length: 20 }, (_, i) => ({
      host: `site${i}.com`,
      path: '',
    }));
    const { sessionId } = await start(teacher(), { sites });
    await expect(
      handleFocusAddSite(
        db,
        teacher(),
        { sessionId, site: { host: 'more.com', path: '' } },
        deps
      )
    ).rejects.toThrow(/at most 20/);
  });
});

describe('focusEndV1 and the summary (F11)', () => {
  it('collapses each student to a summary with the expiry field, once', async () => {
    const { sessionId } = await start();
    await db.doc(`focus_sessions/${sessionId}/students/${uidOf('s1')}`).update({
      status: 'away',
      awaySince: NOW + 1000,
      awayMs: 4000,
      blockedTries: 2,
      lastReportAt: NOW + 1000,
      liveHost: 'games.com',
    });
    now = NOW + 3000;
    const reply = await handleFocusEnd(db, teacher(), { sessionId }, deps);
    expect(reply.endedAt).toBe(NOW + 3000);
    const session = await sessionDoc(sessionId);
    expect(session).toMatchObject({
      endedAt: NOW + 3000,
      endReason: 'teacher',
    });
    const expiry = session.focusExpiresAt as Timestamp;
    expect(expiry.toMillis()).toBe(NOW + 3000 + 30 * 86_400_000);

    const s1 = await studentDoc(sessionId, 's1');
    expect(Object.keys(s1).sort()).toEqual(
      ['awayMs', 'blockedTries', 'connected', 'focusExpiresAt', 'status'].sort()
    );
    expect(s1).toMatchObject({
      status: 'ended',
      awayMs: 6000,
      blockedTries: 2,
      connected: true,
    });
    expect((s1.focusExpiresAt as Timestamp).toMillis()).toBe(expiry.toMillis());
    expect(await studentDoc(sessionId, 's2')).toMatchObject({
      status: 'ended',
      connected: false,
    });

    now += 60_000;
    expect(
      (await handleFocusEnd(db, teacher(), { sessionId }, deps)).endedAt
    ).toBe(NOW + 3000);
  });

  it('refuses a teacher of another class', async () => {
    const { sessionId } = await start();
    await expect(
      handleFocusEnd(db, otherTeacher, { sessionId }, deps)
    ).rejects.toThrow(/do not teach/);
  });
});

describe('scheduled ender', () => {
  it('ends sessions whose time ran out or whose window closed', async () => {
    const timed = await start();
    now = WINDOW_END - 10 * 60_000;
    const cut = await start(otherTeacher, { classId: OTHER_CLASS });
    expect(cut.endsAt).toBe(WINDOW_END);

    expect(await sweepFocusSessions(db, now)).toEqual({ ended: 1, failed: 0 });
    expect(await sessionDoc(timed.sessionId)).toMatchObject({
      endReason: 'time',
      endedAt: timed.endsAt,
    });
    expect((await sessionDoc(cut.sessionId)).endedAt).toBeNull();

    expect(await sweepFocusSessions(db, WINDOW_END)).toEqual({
      ended: 1,
      failed: 0,
    });
    expect(await sessionDoc(cut.sessionId)).toMatchObject({
      endReason: 'window',
      endedAt: WINDOW_END,
    });
  });

  it('ends a running session when the admin moves the window', () => {
    const session = {
      endsAt: NOW + 30 * 60_000,
      endedAt: null,
    } as FocusSessionDoc;
    expect(focusEndReasonAt(session, NOW, DEFAULT_FOCUS_WINDOW)).toBeNull();
    expect(
      focusEndReasonAt(session, NOW, { ...DEFAULT_FOCUS_WINDOW, end: '09:00' })
    ).toBe('window');
  });
});
