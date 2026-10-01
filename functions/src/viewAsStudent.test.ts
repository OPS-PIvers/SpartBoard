import { describe, it, expect, vi, beforeEach } from 'vitest';

const createCustomTokenMock =
  vi.fn<(uid: string, claims: Record<string, unknown>) => Promise<string>>();
let docs: Record<string, Record<string, unknown>> = {};
let writes: Array<{ op: string; path: string; data: unknown }> = [];

const { FakeTimestamp } = vi.hoisted(() => {
  class FakeTimestamp {
    constructor(private ms: number) {}
    static fromMillis(ms: number) {
      return new FakeTimestamp(ms);
    }
    toMillis() {
      return this.ms;
    }
  }
  return { FakeTimestamp };
});

function snap(path: string) {
  const data = docs[path];
  return {
    id: path.split('/').pop(),
    exists: data !== undefined,
    data: () => data,
    get: (k: string) => data?.[k],
  };
}

const db = {
  doc: (path: string) => ({ path, get: () => Promise.resolve(snap(path)) }),
  collection: (name: string) => ({
    doc: (id: string) => ({
      path: `${name}/${id}`,
      get: () => Promise.resolve(snap(`${name}/${id}`)),
    }),
    add: (data: unknown) => {
      writes.push({ op: 'add', path: name, data });
      return Promise.resolve();
    },
    where: (field: string, _op: string, value: unknown) => ({
      limit: () => ({
        get: () => {
          const hits = Object.keys(docs)
            .filter(
              (p) =>
                p.startsWith(`${name}/`) &&
                p.split('/').length === name.split('/').length + 1 &&
                docs[p][field] === value
            )
            .map(snap);
          return Promise.resolve({ empty: hits.length === 0, docs: hits });
        },
      }),
    }),
  }),
};

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(() => db, {
    FieldValue: { serverTimestamp: () => 'ts' },
    Timestamp: FakeTimestamp,
  }),
  auth: () => ({ createCustomToken: createCustomTokenMock }),
}));

vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { onCall: (_o: unknown, h: unknown) => h, HttpsError };
});
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));

import { startViewAsStudentV1 } from './viewAsStudent';

type Handler = (r: {
  auth?: { uid: string; token: Record<string, unknown> };
  data: unknown;
}) => Promise<Record<string, unknown>>;
const startStudent = startViewAsStudentV1 as unknown as Handler;

const boss = 'boss@orono.k12.mn.us';
const SID = 'sid-1';
const TEACHER = 'jane-uid';
const exp = () => Date.now() + 30 * 60 * 1000;

const teacherTab = (claim: Record<string, unknown> = {}) => ({
  uid: TEACHER,
  token: {
    viewAs: {
      by: boss,
      sid: SID,
      ro: true,
      adminTarget: false,
      exp: exp(),
      ...claim,
    },
  },
});

function seed() {
  docs = {
    'admin_settings/view_as': { enabled: true },
    [`organizations/orono/members/${boss}`]: { roleId: 'super_admin' },
    [`view_as_sessions/${SID}`]: {
      by: boss,
      targetEmail: 'jane@orono.k12.mn.us',
      targetUid: TEACHER,
      adminTarget: false,
      unlocked: false,
      expiresAt: FakeTimestamp.fromMillis(exp()),
      endedAt: null,
    },
    'quiz_sessions/q1': { teacherUid: TEACHER, classIds: ['c1', 'c2'] },
    'quiz_sessions/q1/responses/stu-uid': {
      studentUid: 'stu-uid',
      classId: 'c2',
    },
    'quiz_sessions/q1/responses/pin-5-1234': {
      studentUid: 'anon-uid',
      pin: '1234',
    },
    'quiz_sessions/other': { teacherUid: 'someone-else' },
    'quiz_sessions/other/responses/stu-uid': { studentUid: 'stu-uid' },
    'guided_learning_sessions/g1': { teacherUid: TEACHER, classId: 'c9' },
    'guided_learning_sessions/g1/responses/gl-uid': {
      studentAnonymousId: 'gl-uid',
    },
    'guided_learning_sessions/g1/responses/gl-anon': { pin: '42' },
    [`activity_wall_sessions/${TEACHER}_w1`]: { classIds: ['c1'] },
    [`activity_wall_sessions/${TEACHER}_w1/submissions/s1`]: {
      authorUid: 'aw-uid',
    },
    'activity_wall_sessions/mallory_w1': { classIds: ['c1'] },
  };
}

beforeEach(() => {
  seed();
  writes = [];
  createCustomTokenMock.mockReset().mockResolvedValue('stok');
});

const call = (
  data: Record<string, unknown>,
  auth: { uid: string; token: Record<string, unknown> } = teacherTab()
) => startStudent({ auth, data });

describe('startViewAsStudentV1', () => {
  it('audits, then mints a read-only student token from the response', async () => {
    const res = await call({
      kind: 'quiz',
      sessionId: 'q1',
      studentKey: 'stu-uid',
    });
    expect(res).toMatchObject({
      token: 'stok',
      studentUid: 'stu-uid',
      sid: SID,
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      path: 'admin_audit_log',
      data: {
        action: 'view_as_student',
        sid: SID,
        email: boss,
        targetUid: TEACHER,
        studentUid: 'stu-uid',
        path: 'quiz_sessions/q1/responses/stu-uid',
      },
    });
    const [uid, claims] = createCustomTokenMock.mock.calls[0];
    expect(uid).toBe('stu-uid');
    expect(claims).toMatchObject({
      studentRole: true,
      classIds: ['c2'],
      viewAs: {
        by: boss,
        sid: SID,
        ro: true,
        adminTarget: false,
        student: true,
      },
    });
  });

  it('mints an anonymous PIN joiner without the student role', async () => {
    await call({ kind: 'quiz', sessionId: 'q1', studentKey: 'pin-5-1234' });
    const [uid, claims] = createCustomTokenMock.mock.calls[0];
    expect(uid).toBe('anon-uid');
    expect(claims).toMatchObject({
      studentRole: false,
      classIds: ['c1', 'c2'],
    });
  });

  it('reads guided learning and activity wall students', async () => {
    await call({
      kind: 'guided-learning',
      sessionId: 'g1',
      studentKey: 'gl-uid',
    });
    await call({
      kind: 'guided-learning',
      sessionId: 'g1',
      studentKey: 'gl-anon',
    });
    await call({
      kind: 'activity-wall',
      sessionId: `${TEACHER}_w1`,
      studentKey: 'aw-uid',
    });
    const calls = createCustomTokenMock.mock.calls;
    expect(calls[0]).toMatchObject([
      'gl-uid',
      { studentRole: true, classIds: ['c9'] },
    ]);
    expect(calls[1]).toMatchObject(['gl-anon', { studentRole: false }]);
    expect(calls[2]).toMatchObject([
      'aw-uid',
      { studentRole: true, classIds: ['c1'] },
    ]);
  });

  it("refuses another teacher's activity", async () => {
    await expect(
      call({ kind: 'quiz', sessionId: 'other', studentKey: 'stu-uid' })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      call({
        kind: 'activity-wall',
        sessionId: 'mallory_w1',
        studentKey: 'aw-uid',
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('refuses a student with no work in the activity', async () => {
    await expect(
      call({ kind: 'quiz', sessionId: 'q1', studentKey: 'nobody' })
    ).rejects.toMatchObject({ code: 'not-found' });
    await expect(
      call({
        kind: 'activity-wall',
        sessionId: `${TEACHER}_w1`,
        studentKey: 'nobody',
      })
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('refuses outside a live teacher View as session', async () => {
    const plain = { uid: TEACHER, token: { email: 'jane@orono.k12.mn.us' } };
    const data = { kind: 'quiz', sessionId: 'q1', studentKey: 'stu-uid' };
    await expect(call(data, plain)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(
      call(data, teacherTab({ exp: Date.now() - 1 }))
    ).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(
      call(data, { ...teacherTab(), uid: 'stu-uid' })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    docs[`view_as_sessions/${SID}`].endedAt = 'ts';
    await expect(call(data)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('refuses when the switch is off or the admin lost super admin', async () => {
    const data = { kind: 'quiz', sessionId: 'q1', studentKey: 'stu-uid' };
    docs['admin_settings/view_as'] = { enabled: false };
    await expect(call(data)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    seed();
    docs[`organizations/orono/members/${boss}`] = { roleId: 'domain_admin' };
    await expect(call(data)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('rejects bad ids', async () => {
    await expect(
      call({ kind: 'poll', sessionId: 'q1', studentKey: 'stu-uid' })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      call({ kind: 'quiz', sessionId: 'q1/../x', studentKey: 'stu-uid' })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('never outlives the teacher session', async () => {
    const short = Date.now() + 60_000;
    docs[`view_as_sessions/${SID}`].expiresAt = FakeTimestamp.fromMillis(short);
    const res = await call({
      kind: 'quiz',
      sessionId: 'q1',
      studentKey: 'stu-uid',
    });
    expect(res.expiresAt).toBe(short);
  });
});
