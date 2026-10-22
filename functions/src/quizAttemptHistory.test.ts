import { describe, it, expect, vi } from 'vitest';

const DELETE = '__delete__';
vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: vi.fn(), delete: () => DELETE },
  }),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import {
  applyAttemptGradeWrite,
  applyAttemptWrite,
  attemptActionFor,
  attemptNumberOf,
  pickAttemptNumber,
  type AttemptWrite,
} from './quizAttemptHistory';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

type Db = Parameters<typeof applyAttemptWrite>[0];

const T = 1_700_000_000_000;
const RESPONSE = 'quiz_sessions/qs1/responses/u1';
const SCORES = 'quiz_sessions/qs1/attemptScores/u1';

const session: StubData = {
  teacherUid: 't1',
  assignmentId: 'qs1',
  quizTitle: 'Fractions check',
  classIds: ['c1'],
  publicQuestions: [{ id: 'q1', type: 'MC', text: 'a', choices: ['A', 'B'] }],
};
const key: StubData = {
  questions: [
    {
      id: 'q1',
      type: 'MC',
      text: 'a',
      correctAnswer: 'A',
      incorrectAnswers: ['B'],
      points: 2,
    },
  ],
};

const done = (over: StubData = {}): StubData => ({
  studentUid: 'u1',
  status: 'completed',
  classId: 'c1',
  submittedAt: T,
  completedAttempts: 1,
  score: null,
  answers: [{ questionId: 'q1', answer: 'A' }],
  ...over,
});

const reset = (over: StubData = {}): StubData => ({
  ...done(),
  status: 'joined',
  answers: [],
  submittedAt: null,
  ...over,
});

function seed(extra: Record<string, StubData> = {}) {
  return makeStubFirestore({
    'quiz_sessions/qs1': session,
    'users/t1/quiz_assignments/qs1': { questionSnapshot: [] },
    'users/t1/quiz_assignments/qs1/key/answers': key,
    ...extra,
  });
}

const write = (
  before: StubData | undefined,
  after: StubData | undefined,
  eventAt = T
): AttemptWrite => ({
  sessionId: 'qs1',
  responseKey: 'u1',
  before,
  after,
  eventAt,
});

/** Mirrors the event into the store first, as Firestore would. */
async function apply(
  stub: ReturnType<typeof seed>,
  w: AttemptWrite,
  historyOn = true
): Promise<void> {
  if (w.after) stub.store.set(RESPONSE, w.after);
  else stub.store.delete(RESPONSE);
  await applyAttemptWrite(stub.db as unknown as Db, w, () =>
    Promise.resolve(historyOn)
  );
}

describe('attemptActionFor', () => {
  it('copies a newly finished attempt under its number', () => {
    const a = attemptActionFor(
      write(done({ status: 'in-progress' }), done({ completedAttempts: 2 }))
    );
    expect(a).toMatchObject({ kind: 'copy', n: 2 });
  });

  it('follows grading on a finished attempt but skips no-op writes', () => {
    expect(
      attemptActionFor(write(done(), done({ grading: { q1: { points: 1 } } })))
        .kind
    ).toBe('copy');
    expect(attemptActionFor(write(done(), done({ lastWriteAt: 5 }))).kind).toBe(
      'none'
    );
  });

  it('ignores answer saves mid-attempt and a teacher reopen', () => {
    expect(
      attemptActionFor(
        write(
          reset({ status: 'in-progress' }),
          reset({ status: 'in-progress' })
        )
      ).kind
    ).toBe('none');
    expect(
      attemptActionFor(
        write(
          done(),
          done({ status: 'in-progress', unlocked: true, completedAttempts: 0 })
        )
      ).kind
    ).toBe('none');
  });

  it('treats a reset to joined as a retake of the attempt before it', () => {
    const before = done({ completedAttempts: 2 });
    expect(attemptActionFor(write(before, reset()))).toEqual({
      kind: 'retake',
      data: before,
      n: 2,
    });
  });

  it('flags a deleted response', () => {
    expect(attemptActionFor(write(done(), undefined)).kind).toBe('removed');
    expect(attemptActionFor(write(undefined, undefined)).kind).toBe('none');
  });

  it('numbers legacy completed docs as attempt 1', () => {
    expect(attemptNumberOf({ status: 'completed' })).toBe(1);
    expect(attemptNumberOf({ completedAttempts: 3 })).toBe(3);
  });
});

describe('pickAttemptNumber', () => {
  const c = (n: number, closed: boolean, submittedAt: number) => ({
    n,
    closed,
    submittedAt,
  });

  it('uses the doc count when that copy is free or still open', () => {
    expect(pickAttemptNumber([], 1, T)).toBe(1);
    expect(pickAttemptNumber([c(1, false, T - 5)], 1, T)).toBe(1);
  });

  it('finds an attempt it already copied by turned-in time', () => {
    expect(
      pickAttemptNumber([c(1, true, T), c(2, false, T + 9)], 1, T + 9)
    ).toBe(2);
  });

  it('moves past a closed copy when a legacy count lags', () => {
    expect(pickAttemptNumber([c(1, true, T)], 1, T + 9)).toBe(2);
    expect(
      pickAttemptNumber([c(1, true, T), c(2, false, T + 5)], 1, T + 9)
    ).toBe(2);
  });
});

describe('applyAttemptWrite', () => {
  it('saves the copy and a scored entry when an attempt is turned in', async () => {
    const stub = seed();
    await apply(stub, write(reset({ status: 'in-progress' }), done()));
    expect(stub.get(`${RESPONSE}/attempts/1`)).toMatchObject({
      n: 1,
      eventAt: T,
      studentUid: 'u1',
      answers: [{ questionId: 'q1', answer: 'A' }],
      submittedAt: T,
    });
    expect(stub.get(SCORES)).toMatchObject({
      studentUid: 'u1',
      attempts: [{ n: 1, at: T, points: 2, max: 2, state: 'scored' }],
    });
  });

  it('keeps every attempt across a retake', async () => {
    const stub = seed();
    const first = done();
    await apply(stub, write(undefined, first));
    await apply(stub, write(first, reset(), T + 1));
    const second = done({
      completedAttempts: 2,
      submittedAt: T + 10,
      answers: [{ questionId: 'q1', answer: 'B' }],
    });
    await apply(stub, write(reset(), second, T + 10));
    expect(stub.get(`${RESPONSE}/attempts/1`)?.answers).toEqual([
      { questionId: 'q1', answer: 'A' },
    ]);
    expect(stub.get(`${RESPONSE}/attempts/2`)?.answers).toEqual([
      { questionId: 'q1', answer: 'B' },
    ]);
    expect(stub.get(SCORES)?.attempts).toEqual([
      { n: 1, at: T, points: 2, max: 2, state: 'scored' },
      { n: 2, at: T + 10, points: 0, max: 2, state: 'scored' },
    ]);
  });

  it('keeps a legacy attempt whose count never advanced', async () => {
    const stub = seed();
    const first = done({ completedAttempts: 0 });
    await apply(stub, write(undefined, first));
    await apply(stub, write(first, reset({ completedAttempts: 0 }), T + 1));
    const second = done({
      completedAttempts: 1,
      submittedAt: T + 10,
      answers: [{ questionId: 'q1', answer: 'B' }],
    });
    await apply(stub, write(reset({ completedAttempts: 0 }), second, T + 10));
    await apply(
      stub,
      write(second, { ...second, grading: { q1: { points: 0 } } }, T + 20)
    );
    expect(stub.get(`${RESPONSE}/attempts/1`)).toMatchObject({
      closed: true,
      answers: [{ questionId: 'q1', answer: 'A' }],
    });
    expect(stub.get(`${RESPONSE}/attempts/2`)).toMatchObject({
      n: 2,
      grading: { q1: { points: 0 } },
    });
    expect(stub.has(`${RESPONSE}/attempts/3`)).toBe(false);
    expect(stub.get(SCORES)?.attempts).toHaveLength(2);
  });

  it('keeps grades on the live doc when no copy could be made', async () => {
    const grading = { q1: { points: 1 } };
    const stub = seed({
      'quiz_sessions/qs1': { ...session, widgetKind: 'review' },
    });
    const graded = done({ grading });
    await apply(stub, write(graded, reset({ grading })));
    expect(stub.get(RESPONSE)?.grading).toEqual(grading);
  });

  it('does not let a late event overwrite a newer copy', async () => {
    const stub = seed({
      [`${RESPONSE}/attempts/1`]: { n: 1, eventAt: T + 50, grading: 'newer' },
    });
    await apply(stub, write(undefined, done(), T));
    expect(stub.get(`${RESPONSE}/attempts/1`)).toEqual({
      n: 1,
      eventAt: T + 50,
      grading: 'newer',
    });
  });

  it('moves the last attempt’s teacher grades onto its copy at a retake', async () => {
    const grading = { q1: { points: 1, comment: 'Close' } };
    const stub = seed();
    const graded = done({ grading });
    await apply(stub, write(undefined, graded));
    await apply(stub, write(graded, reset({ grading })));
    expect(stub.get(`${RESPONSE}/attempts/1`)?.grading).toEqual(grading);
    expect(stub.get(RESPONSE)?.grading).toBe(DELETE);
  });

  it('keeps grades on the live doc when the teacher lacks attempt history', async () => {
    const grading = { q1: { points: 1 } };
    const stub = seed();
    const graded = done({ grading });
    await apply(stub, write(undefined, graded), false);
    await apply(stub, write(graded, reset({ grading })), false);
    expect(stub.get(`${RESPONSE}/attempts/1`)?.grading).toEqual(grading);
    expect(stub.get(RESPONSE)?.grading).toEqual(grading);
  });

  it('leaves grades alone when the doc moved on before the event arrived', async () => {
    const grading = { q1: { points: 1 } };
    const stub = seed();
    const graded = done({ grading });
    const next = done({ completedAttempts: 2, grading });
    stub.store.set(RESPONSE, next);
    await applyAttemptWrite(
      stub.db as unknown as Db,
      write(graded, reset({ grading })),
      () => Promise.resolve(true)
    );
    expect(stub.get(RESPONSE)?.grading).toEqual(grading);
  });

  it('moves a removed student’s attempts to their archive copy', async () => {
    const stub = seed({
      'quiz_sessions/qs1/archived_responses/u1__2': {
        originalResponseKey: 'u1',
        archivedAt: T - 1000,
      },
      'quiz_sessions/qs1/archived_responses/u1__1': {
        originalResponseKey: 'u1',
        archivedAt: T - 3_600_000,
      },
    });
    await apply(stub, write(undefined, done()));
    await apply(stub, write(done(), undefined));
    expect(stub.has(`${RESPONSE}/attempts/1`)).toBe(false);
    expect(stub.has(SCORES)).toBe(false);
    expect(
      stub.get('quiz_sessions/qs1/archived_responses/u1__2/attempts/1')
    ).toMatchObject({ n: 1, answers: [{ questionId: 'q1', answer: 'A' }] });
    expect(
      stub.get('quiz_sessions/qs1/archived_responses/u1__2')?.attemptScores
    ).toEqual([{ n: 1, at: T, points: 2, max: 2, state: 'scored' }]);
  });

  it('clears attempts with no fresh archive so a reused PIN key starts fresh', async () => {
    const stub = seed({
      'quiz_sessions/qs1/archived_responses/u1__1': {
        originalResponseKey: 'u1',
        archivedAt: T - 3_600_000,
      },
    });
    await apply(stub, write(undefined, done()));
    await apply(stub, write(done(), undefined));
    expect(stub.has(`${RESPONSE}/attempts/1`)).toBe(false);
    expect(stub.has(SCORES)).toBe(false);
    expect(
      stub.has('quiz_sessions/qs1/archived_responses/u1__1/attempts/1')
    ).toBe(false);
  });

  it('writes nothing for a late event about a removed response', async () => {
    const stub = seed();
    await applyAttemptWrite(stub.db as unknown as Db, write(undefined, done()));
    expect(stub.has(`${RESPONSE}/attempts/1`)).toBe(false);
    expect(stub.has(SCORES)).toBe(false);
  });

  it('skips Review game sessions', async () => {
    const stub = seed({
      'quiz_sessions/qs1': { ...session, widgetKind: 'review' },
    });
    await apply(stub, write(undefined, done()));
    expect(stub.has(`${RESPONSE}/attempts/1`)).toBe(false);
    expect(stub.has(SCORES)).toBe(false);
  });
});

describe('applyAttemptGradeWrite', () => {
  const COPY = `${RESPONSE}/attempts/1`;

  it('rescores an earlier attempt when the teacher grades its copy', async () => {
    const stub = seed();
    const first = done({ answers: [{ questionId: 'q1', answer: 'B' }] });
    await apply(stub, write(undefined, first));
    await apply(stub, write(first, reset(), T + 1));
    const before = stub.get(COPY);
    expect(before?.closed).toBe(true);
    const after = { ...before, grading: { q1: { points: 2 } } };
    stub.store.set(COPY, after);
    await applyAttemptGradeWrite(stub.db as unknown as Db, {
      sessionId: 'qs1',
      responseKey: 'u1',
      n: 1,
      before,
      after,
    });
    expect(stub.get(SCORES)?.attempts).toHaveLength(1);
  });

  it('rescores the Gradebook row’s copy of an earlier attempt too', async () => {
    const ROW = 'grade_index/qs1__u1';
    const stub = seed({
      [ROW]: {
        attempts: [{ n: 1, at: T, points: 0, max: 2, state: 'awaiting-grade' }],
      },
    });
    const first = done({ answers: [{ questionId: 'q1', answer: 'B' }] });
    await apply(stub, write(undefined, first));
    await apply(stub, write(first, reset(), T + 1));
    const before = stub.get(COPY);
    const after = { ...before, grading: { q1: { points: 2 } } };
    stub.store.set(COPY, after);
    await applyAttemptGradeWrite(stub.db as unknown as Db, {
      sessionId: 'qs1',
      responseKey: 'u1',
      n: 1,
      before,
      after,
    });
    expect(stub.get(ROW)?.attempts).toEqual(stub.get(SCORES)?.attempts);
    expect(stub.get('grade_index_sessions/qs1')).toMatchObject({
      kind: 'quiz',
    });
  });

  it('ignores open copies and writes that leave grading alone', async () => {
    const stub = seed({
      [SCORES]: { studentUid: 'u1', attempts: [] },
    });
    const open = { n: 1, studentUid: 'u1', answers: [], grading: {} };
    await applyAttemptGradeWrite(stub.db as unknown as Db, {
      sessionId: 'qs1',
      responseKey: 'u1',
      n: 1,
      before: open,
      after: { ...open, grading: { q1: { points: 1 } } },
    });
    const closed = { ...open, closed: true };
    await applyAttemptGradeWrite(stub.db as unknown as Db, {
      sessionId: 'qs1',
      responseKey: 'u1',
      n: 1,
      before: closed,
      after: { ...closed },
    });
    expect(stub.get(SCORES)?.attempts).toEqual([]);
  });

  it('never lets a late live event overwrite a closed copy', async () => {
    const stub = seed();
    const first = done();
    await apply(stub, write(undefined, first));
    await apply(stub, write(first, reset(), T + 1));
    const graded = { ...stub.get(COPY), grading: { q1: { points: 1 } } };
    stub.store.set(COPY, graded);
    stub.store.set(RESPONSE, first);
    await applyAttemptWrite(
      stub.db as unknown as Db,
      write(done({ status: 'in-progress' }), first, T + 5)
    );
    expect(stub.get(COPY)?.grading).toEqual({ q1: { points: 1 } });
  });
});
