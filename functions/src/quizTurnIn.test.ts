import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    Timestamp: { fromMillis: (ms: number) => ms },
  }),
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: () => Promise<void>) => handler,
}));

import {
  TIME_LIMIT_GRACE_MS,
  isOverTime,
  isTurnInWrite,
  quizAttemptDeadline,
  stampTurnIn,
} from './quizTurnIn';
import { runFinalizeExpiredQuizAttempts } from './finalizeExpiredQuizAttempts';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

type Db = Parameters<typeof stampTurnIn>[0];
const T = 1_700_000_000_000;
const MIN = 60_000;
const SESSION = 'quiz_sessions/qs1';
const RESPONSE = `${SESSION}/responses/u1`;
const timed: StubData = {
  sessionMode: 'student',
  timeLimitMinutes: 10,
  status: 'active',
  assignmentId: 'a1',
  publicQuestions: [{ id: 'q1' }],
};
const inProgress = (over: StubData = {}): StubData => ({
  studentUid: 'u1',
  status: 'in-progress',
  attemptStartedAt: T,
  completedAttempts: 0,
  answers: [{ questionId: 'q1', answer: 'A', status: 'draft' }],
  submittedAt: null,
  ...over,
});
const turnedIn = (over: StubData = {}): StubData =>
  inProgress({
    status: 'completed',
    completedAttempts: 1,
    submittedAt: T + 30 * MIN,
    ...over,
  });

describe('quizAttemptDeadline', () => {
  it('scales by extended time and skips pauses', () => {
    const r = { attemptStartedAt: T };
    expect(quizAttemptDeadline(timed, r, undefined)).toBe(T + 10 * MIN);
    expect(quizAttemptDeadline(timed, r, 1.5)).toBe(T + 15 * MIN);
    expect(quizAttemptDeadline(timed, r, 'unlimited')).toBeNull();
    expect(
      quizAttemptDeadline(
        { ...timed, pauseSpans: [{ from: T + MIN, to: T + 4 * MIN }] },
        r,
        undefined
      )
    ).toBe(T + 13 * MIN);
  });

  it('has no deadline for teacher-paced, untimed or unstarted attempts', () => {
    const r = { attemptStartedAt: T };
    expect(
      quizAttemptDeadline({ ...timed, sessionMode: 'teacher' }, r, 1)
    ).toBeNull();
    expect(
      quizAttemptDeadline({ ...timed, timeLimitMinutes: null }, r, 1)
    ).toBeNull();
    expect(quizAttemptDeadline(timed, {}, 1)).toBeNull();
  });
});

describe('isOverTime', () => {
  it("counts the student's extended time from their pointer", async () => {
    const stub = makeStubFirestore({
      'student_assignments/u1/items/a1': { override: { timeMultiplier: 2 } },
    });
    const db = stub.db as unknown as Db;
    const r = { studentUid: 'u1', attemptStartedAt: T };
    expect(await isOverTime(db, timed, r, T + 15 * MIN)).toBe(false);
    expect(
      await isOverTime(db, timed, r, T + 21 * MIN + TIME_LIMIT_GRACE_MS)
    ).toBe(true);
  });

  it('allows the grace after the deadline', async () => {
    const db = makeStubFirestore().db as unknown as Db;
    const r = { studentUid: 'u1', attemptStartedAt: T };
    expect(await isOverTime(db, timed, r, T + 11 * MIN)).toBe(false);
    expect(await isOverTime(db, timed, r, T + 13 * MIN)).toBe(true);
  });
});

describe('stampTurnIn', () => {
  it('only acts on the write that finishes an attempt', () => {
    expect(isTurnInWrite('quiz', inProgress(), turnedIn())).toBe(true);
    expect(isTurnInWrite('quiz', turnedIn(), turnedIn())).toBe(false);
    expect(
      isTurnInWrite('video-activity', { completedAt: null }, { completedAt: 5 })
    ).toBe(true);
  });

  it('records the server time and flags a late turn-in as time up', async () => {
    const after = turnedIn({ submittedAt: T + 5 * MIN });
    const stub = makeStubFirestore({ [SESSION]: timed, [RESPONSE]: after });
    const stamped = await stampTurnIn(
      stub.db as unknown as Db,
      'quiz',
      'qs1',
      'u1',
      inProgress(),
      after,
      T + 30 * MIN
    );
    expect(stub.get(RESPONSE)).toMatchObject({
      turnIn: { at: T + 30 * MIN, claimed: T + 5 * MIN },
      timeUp: true,
    });
    expect(stamped).toMatchObject({ timeUp: true });
  });

  it('leaves an on-time turn-in unflagged', async () => {
    const after = turnedIn({ submittedAt: T + 5 * MIN });
    const stub = makeStubFirestore({ [SESSION]: timed, [RESPONSE]: after });
    await stampTurnIn(
      stub.db as unknown as Db,
      'quiz',
      'qs1',
      'u1',
      inProgress(),
      after,
      T + 5 * MIN
    );
    expect(stub.get(RESPONSE)?.turnIn).toEqual({
      at: T + 5 * MIN,
      claimed: T + 5 * MIN,
    });
    expect(stub.get(RESPONSE)?.timeUp).toBeUndefined();
  });

  it('rethrows a failed stamp so the trigger retries', async () => {
    const db = {
      collection: () => {
        throw new Error('boom');
      },
    } as unknown as Db;
    await expect(
      stampTurnIn(db, 'quiz', 'qs1', 'u1', inProgress(), turnedIn(), T)
    ).rejects.toThrow('boom');
  });

  it('does not stamp a later attempt on a retried event', async () => {
    const after = turnedIn();
    const stub = makeStubFirestore({
      [SESSION]: timed,
      [RESPONSE]: inProgress({ status: 'joined', submittedAt: null }),
    });
    await stampTurnIn(
      stub.db as unknown as Db,
      'quiz',
      'qs1',
      'u1',
      inProgress(),
      after,
      T + 30 * MIN
    );
    expect(stub.get(RESPONSE)?.turnIn).toBeUndefined();
  });
});

describe('runFinalizeExpiredQuizAttempts', () => {
  it('turns in an attempt whose limit ran out, marked time up', async () => {
    const stub = makeStubFirestore({
      [SESSION]: timed,
      [RESPONSE]: inProgress(),
    });
    const res = await runFinalizeExpiredQuizAttempts(
      stub.db as unknown as Db,
      T + 20 * MIN
    );
    expect(res.finalized).toBe(1);
    expect(stub.get(RESPONSE)).toMatchObject({
      status: 'completed',
      autoSubmitted: true,
      timeUp: true,
      completedAttempts: 1,
    });
  });

  it('leaves running clocks, paused sessions and untimed sessions alone', async () => {
    const stub = makeStubFirestore({
      [SESSION]: timed,
      [RESPONSE]: inProgress(),
      'quiz_sessions/qs2': { ...timed, status: 'paused' },
      'quiz_sessions/qs2/responses/u1': inProgress(),
      'quiz_sessions/qs3': { ...timed, sessionMode: 'teacher' },
      'quiz_sessions/qs3/responses/u1': inProgress(),
    });
    const res = await runFinalizeExpiredQuizAttempts(
      stub.db as unknown as Db,
      T + 11 * MIN
    );
    expect(res.finalized).toBe(0);
    const later = await runFinalizeExpiredQuizAttempts(
      stub.db as unknown as Db,
      T + 60 * MIN
    );
    expect(later.finalized).toBe(1);
    expect(stub.get('quiz_sessions/qs2/responses/u1')?.status).toBe(
      'in-progress'
    );
    expect(stub.get('quiz_sessions/qs3/responses/u1')?.status).toBe(
      'in-progress'
    );
  });
});
