import { beforeEach, describe, expect, it } from 'vitest';
import type * as admin from 'firebase-admin';
import { handleFocusPanel } from './panel';
import type { FocusCaller, FocusDeps } from './sessions';
import type { FocusPanelListReply, FocusStartReply } from './shared.gen';
import { createMemoryFirestore } from './testFirestore';

// Tuesday 2026-10-27 10:00 in Chicago (CDT).
const NOW = Date.UTC(2026, 9, 27, 15, 0, 0);
const CLASS = 'class-1';

const teacher = (over: Partial<FocusCaller> = {}): FocusCaller => ({
  uid: 'teacher-1',
  email: 'teacher@orono.k12.mn.us',
  emailVerified: true,
  anonymous: false,
  studentRole: false,
  name: 'Ms. Teacher',
  ...over,
});
const other = teacher({ uid: 'teacher-3', email: 'other@orono.k12.mn.us' });

const CLASSES: Record<string, Record<string, string[]>> = {
  'teacher@orono.k12.mn.us': { [CLASS]: ['s1', 's2'] },
  'co@orono.k12.mn.us': { [CLASS]: ['s1', 's2'] },
};
const co = teacher({ uid: 'teacher-2', email: 'co@orono.k12.mn.us' });

let now = NOW;
const deps: FocusDeps = {
  now: () => now,
  hmacSecret: () => 'test-hmac',
  taughtClassEnrollment: (email, classId) => {
    const list = CLASSES[email]?.[classId];
    return Promise.resolve(list ? new Set(list) : null);
  },
  mockClassesOpen: () => mockOpen,
};
let mockOpen = true;

let db: admin.firestore.Firestore;

beforeEach(async () => {
  now = NOW;
  mockOpen = true;
  db = createMemoryFirestore();
  await db
    .doc('organizations/orono/domains/main')
    .set({ domain: '@orono.k12.mn.us', status: 'verified' });
  await db.doc('admins/teacher@orono.k12.mn.us').set({ roleId: 'super_admin' });
  await db.doc('users/teacher-1/rosters/r1').set({
    name: 'Period 3 Math',
    classlinkClassId: CLASS,
  });
  await db.doc('users/teacher-1/rosters/r2').set({
    name: 'Another copy',
    classlinkClassId: CLASS,
  });
  await db.doc('users/teacher-1/rosters/r3').set({ name: 'Local only' });
  await db
    .doc('users/teacher-1/rosters/r4')
    .set({ name: 'Advisory', testClassId: 'mock-1' });
  await db
    .doc('users/teacher-1/rosters/r5')
    .set({ name: 'Bad', classlinkClassId: 'a/b' });
});

const call = (body: unknown, caller = teacher()) =>
  handleFocusPanel(db, caller, body, deps);

const startBody = (over: Record<string, unknown> = {}) => ({
  action: 'start',
  classId: CLASS,
  className: 'Period 3 Math',
  minutes: 20,
  sites: [{ host: 'desmos.com', path: '' }],
  ...over,
});

describe('focusPanelV1', () => {
  it('lists linked classes once each, and no sessions yet', async () => {
    expect(await call({ action: 'list' })).toEqual({
      canStart: true,
      classes: [
        { classId: 'mock-1', name: 'Advisory' },
        { classId: CLASS, name: 'Period 3 Math' },
      ],
      sessions: [],
    });
  });

  it('refuses the list to teachers without the Focus widget', async () => {
    await expect(call({ action: 'list' }, other)).rejects.toThrow(
      'Focus is not turned on for your account.'
    );
    await db
      .doc('feature_permissions/focus')
      .set({ enabled: true, accessLevel: 'public' });
    await expect(call({ action: 'list' }, other)).resolves.toMatchObject({
      sessions: [],
    });
  });

  it('starts at the default level and lists the running session', async () => {
    const started = (await call(
      startBody({ level: 'lock' })
    )) as FocusStartReply;
    expect(started).toMatchObject({
      studentCount: 2,
      endsAt: NOW + 20 * 60_000,
    });
    const session = (
      await db.doc(`focus_sessions/${started.sessionId}`).get()
    ).data() as { level: string };
    expect(session.level).toBe('redirect');
    const list = (await call({ action: 'list' })) as FocusPanelListReply;
    expect(list.sessions).toEqual([
      {
        sessionId: started.sessionId,
        classId: CLASS,
        className: 'Period 3 Math',
        level: 'redirect',
        sites: [{ host: 'desmos.com', path: '' }],
        endsAt: NOW + 20 * 60_000,
        studentCount: 2,
      },
    ]);
  });

  it('extends, releases and ends through the session handlers', async () => {
    const { sessionId } = (await call(startBody())) as FocusStartReply;
    expect(await call({ action: 'extend', sessionId })).toEqual({
      endsAt: NOW + 30 * 60_000,
    });
    expect(await call({ action: 'release', sessionId })).toEqual({
      released: 2,
    });
    expect(await call({ action: 'end', sessionId })).toEqual({ endedAt: NOW });
    expect(
      ((await call({ action: 'list' })) as FocusPanelListReply).sessions
    ).toEqual([]);
  });

  it('never passes a share id or student id through', async () => {
    const { sessionId } = (await call(startBody())) as FocusStartReply;
    // A sub share id would switch the handler to the substitute check; the panel only acts as a teacher.
    await expect(
      call({ action: 'end', sessionId, shareId: 'x' }, other)
    ).rejects.toThrow('You do not teach this class.');
    expect(
      await call({ action: 'release', sessionId, studentUid: 'nope' })
    ).toEqual({ released: 2 });
  });

  it('drops sessions whose time ran out before the sweep ended them', async () => {
    await call(startBody());
    now = NOW + 21 * 60_000;
    expect(
      ((await call({ action: 'list' })) as FocusPanelListReply).sessions
    ).toEqual([]);
  });

  it('lists mock classes only on dev or for admins', async () => {
    mockOpen = false;
    expect(
      ((await call({ action: 'list' })) as FocusPanelListReply).classes
    ).toHaveLength(2);
    await db.doc('admins/teacher@orono.k12.mn.us').delete();
    await db
      .doc('feature_permissions/focus')
      .set({ enabled: true, accessLevel: 'public' });
    expect(
      ((await call({ action: 'list' })) as FocusPanelListReply).classes
    ).toEqual([{ classId: CLASS, name: 'Period 3 Math' }]);
  });

  it('refuses student and anonymous callers before any action', async () => {
    await expect(
      call({ action: 'list' }, teacher({ studentRole: true }))
    ).rejects.toThrow('Focus sessions are for teacher accounts.');
    await expect(
      call({ action: 'list' }, teacher({ anonymous: true }))
    ).rejects.toThrow('Focus sessions are for teacher accounts.');
  });

  it("joins a co-teacher to their partner's running session", async () => {
    await db.doc('admins/co@orono.k12.mn.us').set({ roleId: 'super_admin' });
    await db
      .doc('users/teacher-2/rosters/r1')
      .set({ name: 'P3', classlinkClassId: CLASS });
    const { sessionId } = (await call(startBody())) as FocusStartReply;
    const list = (await call({ action: 'list' }, co)) as FocusPanelListReply;
    expect(list.sessions.map((s) => s.sessionId)).toEqual([sessionId]);
    const session = (await db.doc(`focus_sessions/${sessionId}`).get()).data();
    expect(session?.teacherUids).toEqual(['teacher-1', 'teacher-2']);
    expect(await call({ action: 'end', sessionId }, co)).toEqual({
      endedAt: NOW,
    });
  });

  it('keeps Release and End for a running session after the widget is turned off', async () => {
    const { sessionId } = (await call(startBody())) as FocusStartReply;
    await db.doc('admins/teacher@orono.k12.mn.us').delete();
    const list = (await call({ action: 'list' })) as FocusPanelListReply;
    expect(list).toMatchObject({ canStart: false, classes: [] });
    expect(list.sessions.map((s) => s.sessionId)).toEqual([sessionId]);
    await expect(call({ action: 'extend', sessionId })).rejects.toThrow(
      'Focus sessions are not turned on for your account.'
    );
    expect(await call({ action: 'end', sessionId })).toEqual({ endedAt: NOW });
    await expect(call({ action: 'list' })).rejects.toThrow(
      'Focus is not turned on for your account.'
    );
  });

  it('refuses unknown actions', async () => {
    await expect(call({ action: 'add-site' })).rejects.toThrow(
      'Unknown action.'
    );
    await expect(call(null)).rejects.toThrow('Unknown action.');
  });
});
