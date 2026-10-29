// Unit tests for submitMiniAppResultV1 (docs/plans/MINI_APP_RESULTS.md D6, D8, D9).
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
}));

vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    onCall: (_opts: unknown, handler: unknown) => handler,
    HttpsError: FakeHttpsError,
  };
});
vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ value: () => `secret:${name}` }),
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));

import {
  WINDOW_GRACE_MS,
  handleSubmitMiniAppResult,
  type MiniAppCaller,
} from './miniAppResults';

type Doc = Record<string, unknown>;
type Db = Parameters<typeof handleSubmitMiniAppResult>[0];

function makeDb(docs: Record<string, Doc>) {
  const refFor = (path: string) => ({
    path,
    get: () =>
      Promise.resolve({
        exists: docs[path] !== undefined,
        data: () => docs[path],
      }),
    set: (data: Doc, opts?: { merge?: boolean; mergeFields?: string[] }) => {
      docs[path] =
        opts?.merge || opts?.mergeFields
          ? { ...(docs[path] ?? {}), ...data }
          : data;
    },
  });
  const docRef = (
    path: string
  ): ReturnType<typeof refFor> & {
    collection: (sub: string) => { doc: (id: string) => unknown };
  } => ({
    ...refFor(path),
    collection: (sub: string) => ({
      doc: (id: string) => docRef(`${path}/${sub}/${id}`),
    }),
  });
  return {
    collection: (c: string) => ({ doc: (id: string) => docRef(`${c}/${id}`) }),
    runTransaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: (ref: ReturnType<typeof refFor>) => ref.get(),
        set: (
          ref: ReturnType<typeof refFor>,
          d: Doc,
          o?: { merge?: boolean; mergeFields?: string[] }
        ) => ref.set(d, o),
      }),
  } as unknown as Db;
}

const NOW = Date.UTC(2026, 9, 11, 15, 0, 0);
const SESSION = 'mini_app_sessions/s1';
const pseudonym = (uid: string, sid: string) => `p:${uid}:${sid}`;
const student: MiniAppCaller = {
  uid: 'stu-1',
  studentRole: true,
  classIds: ['class-1'],
};
const SUMMARY = `${SESSION}/submissions/${pseudonym('stu-1', 's1')}`;

function session(over: Doc = {}): Doc {
  return {
    teacherUid: 't1',
    status: 'active',
    mode: 'submissions',
    submissionsEnabled: true,
    resultsVersion: 2,
    attemptLimit: 2,
    classIds: ['class-1'],
    manifest: {
      questions: [
        { id: 'q1', type: 'mc', prompt: 'One' },
        { id: 'q2', type: 'tf', prompt: 'Two' },
      ],
    },
    ...over,
  };
}

const KEY = { questions: { q1: { correct: 'B' }, q2: { correct: true } } };

const submit = (
  docs: Record<string, Doc>,
  input: Doc,
  caller: MiniAppCaller | null = student,
  now = NOW
) => handleSubmitMiniAppResult(makeDb(docs), caller, input, now, pseudonym);

const result = (q1: string, q2: boolean) => ({
  sessionId: 's1',
  kind: 'result',
  payload: {
    items: [
      { id: 'q1', answer: q1 },
      { id: 'q2', answer: q2 },
    ],
  },
});

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('handleSubmitMiniAppResult gating', () => {
  it('rejects a signed-out caller', async () => {
    await expectCode(
      submit({ [SESSION]: session() }, result('B', true), null),
      'unauthenticated'
    );
  });

  it('refuses a session that was not created as v2', async () => {
    await expectCode(
      submit(
        { [SESSION]: session({ resultsVersion: undefined }) },
        result('B', true)
      ),
      'failed-precondition'
    );
  });

  it.each([
    ['an ended session', { status: 'ended' }],
    ['a view-only session', { mode: 'view-only' }],
    ['submissions off', { submissionsEnabled: false }],
    ['a closed window', { closeAt: NOW - WINDOW_GRACE_MS - 1 }],
    ['a window that has not opened', { openAt: NOW + WINDOW_GRACE_MS + 1 }],
  ])('refuses %s', async (_label, over) => {
    await expectCode(
      submit({ [SESSION]: session(over) }, result('B', true)),
      'failed-precondition'
    );
  });

  it('refuses a student outside the targeted classes', async () => {
    await expectCode(
      submit({ [SESSION]: session() }, result('B', true), {
        ...student,
        classIds: ['other'],
      }),
      'permission-denied'
    );
  });

  it('refuses an excluded student', async () => {
    await expectCode(
      submit(
        {
          [SESSION]: session({ assignmentId: 'a1' }),
          'student_assignments/stu-1/items/a1': { excluded: true },
        },
        result('B', true)
      ),
      'permission-denied'
    );
  });

  it('refuses a seated student whose period is closed', async () => {
    await expectCode(
      submit(
        {
          [SESSION]: session({
            periodAccess: { 'class-1': { state: 'closed', label: 'P1' } },
          }),
          [`${SESSION}/seats/stu-1`]: { classId: 'class-1' },
        },
        result('B', true)
      ),
      'failed-precondition'
    );
  });

  it('rejects a malformed result', async () => {
    await expectCode(
      submit(
        { [SESSION]: session() },
        { sessionId: 's1', kind: 'result', payload: { items: 'nope' } }
      ),
      'invalid-argument'
    );
  });
});

describe('handleSubmitMiniAppResult grading and attempts', () => {
  it('grades against the session key and writes the attempt and summary', async () => {
    const docs: Record<string, Doc> = {
      [SESSION]: session(),
      [`${SESSION}/private/key`]: KEY,
    };
    const res = await submit(docs, result('A', true));
    expect(res).toEqual({
      attempt: 1,
      attemptsLeft: 1,
      score: 1,
      maxScore: 2,
      items: [
        { id: 'q1', correct: false },
        { id: 'q2', correct: true },
      ],
    });
    expect(docs[SUMMARY]).toMatchObject({
      studentUid: 'stu-1',
      attemptCount: 1,
      best: {
        score: 1,
        maxScore: 2,
        attemptNo: 1,
        gradedBy: 'server',
        items: [
          { id: 'q1', correct: false, by: 'server' },
          { id: 'q2', correct: true, by: 'server' },
        ],
      },
      lastSubmittedAt: NOW,
      submittedAt: NOW,
    });
    expect(docs[`${SUMMARY}/attempts/1`]).toMatchObject({
      attemptNo: 1,
      kind: 'result',
      score: 1,
      maxScore: 2,
    });
  });

  it('keeps the best attempt and stops at the limit', async () => {
    const docs: Record<string, Doc> = {
      [SESSION]: session(),
      [`${SESSION}/private/key`]: KEY,
    };
    await submit(docs, result('B', true));
    const second = await submit(docs, result('A', false));
    expect(second.attemptsLeft).toBe(0);
    expect(docs[SUMMARY]).toMatchObject({
      attemptCount: 2,
      best: { score: 2, maxScore: 2, attemptNo: 1 },
    });
    await expectCode(submit(docs, result('B', true)), 'resource-exhausted');
  });

  it('allows unlimited attempts when the limit is null', async () => {
    const docs: Record<string, Doc> = {
      [SESSION]: session({ attemptLimit: null }),
    };
    for (let i = 0; i < 4; i++) await submit(docs, result('B', true));
    expect(docs[SUMMARY]).toMatchObject({ attemptCount: 4 });
  });

  it('hides scores and correctness when the teacher turned them off', async () => {
    const docs: Record<string, Doc> = {
      [SESSION]: session({ showCorrectAnswers: false }),
      [`${SESSION}/private/key`]: KEY,
    };
    expect(await submit(docs, result('B', true))).toEqual({
      attempt: 1,
      attemptsLeft: 1,
    });
  });

  it('strips names and emails before saving', async () => {
    const docs: Record<string, Doc> = {
      [SESSION]: session({ manifest: undefined }),
    };
    await submit(docs, {
      sessionId: 's1',
      kind: 'result',
      payload: {
        data: { studentName: 'Ada', email: 'ada@x.org', level: 3 },
      },
    });
    expect(docs[SUMMARY].payload).toEqual({ items: [], data: { level: 3 } });
  });

  it('keys an anonymous shared-link student by uid', async () => {
    const docs: Record<string, Doc> = {
      [SESSION]: session({ classIds: [] }),
    };
    await submit(docs, result('B', true), {
      uid: 'anon-1',
      studentRole: false,
      classIds: [],
    });
    expect(docs[`${SESSION}/submissions/anon-1`]).toMatchObject({
      attemptCount: 1,
      studentUid: 'anon-1',
    });
  });

  it('saves legacy posts without using an attempt', async () => {
    const docs: Record<string, Doc> = {
      [SESSION]: session({ attemptLimit: 1 }),
    };
    await submit(docs, { sessionId: 's1', kind: 'legacy', payload: 41 });
    expect(
      await submit(docs, { sessionId: 's1', kind: 'legacy', payload: 42 })
    ).toEqual({ attempt: 0, attemptsLeft: 1 });
    expect(docs[SUMMARY]).toMatchObject({ payload: { value: 42 } });
    expect(docs[SUMMARY].attemptCount).toBeUndefined();
    expect((await submit(docs, result('B', true))).attempt).toBe(1);
  });

  it('grades an answer with an @ before stripping it from the saved copy', async () => {
    const docs: Record<string, Doc> = {
      [SESSION]: session({
        manifest: { questions: [{ id: 'q1', type: 'short', prompt: 'One' }] },
      }),
      [`${SESSION}/private/key`]: {
        questions: { q1: { accepted: ['a@b.co'] } },
      },
    };
    const res = await submit(docs, {
      sessionId: 's1',
      kind: 'result',
      payload: { items: [{ id: 'q1', answer: 'a@b.co' }] },
    });
    expect(res.score).toBe(1);
    const attempt = docs[`${SUMMARY}/attempts/1`] as {
      items: { answer: unknown }[];
    };
    expect(attempt.items[0].answer).toBeNull();
  });

  it("marks I'm Done without using an attempt, even with submissions off", async () => {
    const docs: Record<string, Doc> = {
      [SESSION]: session({ submissionsEnabled: false }),
    };
    expect(
      await submit(docs, { sessionId: 's1', kind: 'done', payload: null })
    ).toEqual({ attempt: 0, attemptsLeft: 2 });
    expect(docs[SUMMARY]).toMatchObject({ payload: { completed: true } });
    expect(docs[SUMMARY].attemptCount).toBeUndefined();
  });
});

describe('handleSubmitMiniAppResult staff audience', () => {
  const staff: MiniAppCaller = {
    uid: 'staff-1',
    studentRole: false,
    classIds: [],
    staff: { staffEmail: 'pat@orono.k12.mn.us', staffName: 'Pat T' },
  };
  const staffSession = () =>
    session({ audience: 'staff', classIds: [], attemptLimit: null });

  it('refuses a caller who is not district staff', async () => {
    await expectCode(
      submit({ [SESSION]: staffSession() }, result('B', true), {
        uid: 'anon-1',
        studentRole: false,
        classIds: [],
        staff: null,
      }),
      'permission-denied'
    );
    await expectCode(
      submit({ [SESSION]: staffSession() }, result('B', true)),
      'permission-denied'
    );
  });

  it("names the staff member's submission under their uid", async () => {
    const docs: Record<string, Doc> = {
      [SESSION]: staffSession(),
      [`${SESSION}/private/key`]: KEY,
    };
    await submit(docs, result('B', true), staff);
    expect(docs[`${SESSION}/submissions/staff-1`]).toMatchObject({
      studentUid: 'staff-1',
      staffEmail: 'pat@orono.k12.mn.us',
      staffName: 'Pat T',
    });
  });

  it('adds no staff fields on a student session', async () => {
    const docs: Record<string, Doc> = {
      [SESSION]: session(),
      [`${SESSION}/private/key`]: KEY,
    };
    await submit(docs, result('B', true));
    expect(docs[SUMMARY]).not.toHaveProperty('staffEmail');
  });
});
