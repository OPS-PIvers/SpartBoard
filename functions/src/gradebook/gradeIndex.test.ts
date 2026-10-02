import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: vi.fn() },
  }),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: () => Promise<void>) => handler,
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import * as admin from 'firebase-admin';
import {
  __resetGradeIndexEnabledCache,
  applyDocWrite,
  sessionWriteMatters,
  docWriteMatters,
  drainDirtySessions,
  markSessionDirty,
  recomputeSession,
} from './gradeIndex';
import {
  gradeIndexQuizResponse,
  gradeIndexQuizSession,
  runGradeIndexRecompute,
} from './gradeIndexTriggers';
import { makeStubFirestore, type StubData } from '../testing/stubFirestore';
import type { IndexRow } from './types';

type Db = Parameters<typeof applyDocWrite>[0];
type Handler = (event: {
  params: Record<string, string>;
  data?: {
    before: { exists: boolean; data: () => StubData | undefined };
    after: { exists: boolean; data: () => StubData | undefined };
  };
}) => Promise<void>;

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

const quizSession: StubData = {
  teacherUid: 't1',
  assignmentId: 'qs1',
  quizTitle: 'Fractions check',
  rosterIds: ['r1'],
  classIds: ['c1'],
  dueAt: NOW - DAY,
  scorePublishedAt: NOW - 10,
  publicQuestions: [{ id: 'q1', type: 'MC', text: 'a', choices: ['A', 'B'] }],
};
const quizKey: StubData = {
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
const completed = (over: StubData = {}): StubData => ({
  studentUid: 'u1',
  status: 'completed',
  classId: 'c1',
  submittedAt: NOW - 2 * DAY,
  completedAttempts: 1,
  answers: [{ questionId: 'q1', answer: 'A' }],
  ...over,
});

function seed(extra: Record<string, StubData> = {}) {
  return makeStubFirestore({
    'admin_settings/gradebook_index': { enabled: true },
    'quiz_sessions/qs1': quizSession,
    'users/t1/quiz_assignments/qs1': { questionSnapshot: [] },
    'users/t1/quiz_assignments/qs1/key/answers': quizKey,
    ...extra,
  });
}

const SUB: Record<string, string> = {
  quiz: 'quiz_sessions/{s}/responses',
  projects: 'project_runs/{s}/grades',
  'activity-wall': 'activity_wall_sessions/{s}/submissions',
};

/** Mirrors the event into the store first, since the index re-reads the doc. */
async function applyWrite(
  stub: ReturnType<typeof makeStubFirestore>,
  w: Parameters<typeof applyDocWrite>[1],
  now: number
) {
  const path = `${SUB[w.kind].replace('{s}', w.sessionId)}/${w.docId}`;
  if (w.after) stub.store.set(path, w.after);
  else stub.store.delete(path);
  return applyDocWrite(stub.db as unknown as Db, w, now);
}

beforeEach(() => __resetGradeIndexEnabledCache());

describe('applyDocWrite', () => {
  it('uses the doc as it is now, not a late event payload', async () => {
    const stub = seed({ 'quiz_sessions/qs1/responses/u1': completed() });
    const stale = completed({ status: 'in-progress', answers: [] });
    await applyDocWrite(
      stub.db as unknown as Db,
      {
        kind: 'quiz',
        sessionId: 'qs1',
        docId: 'u1',
        before: completed(),
        after: stale,
      },
      NOW
    );
    expect(stub.get('grade_index/qs1__u1')).toMatchObject({
      state: 'scored',
      rawPct: 100,
    });
  });

  it('keeps a row a trigger rewrote after the recompute started', async () => {
    const stub = seed({
      'quiz_sessions/qs1/responses/u1': completed(),
      'grade_index/qs1__u1': {
        sessionId: 'qs1',
        studentUid: 'u1',
        updatedAt: NOW + 10,
      },
    });
    expect(
      await recomputeSession(stub.db as unknown as Db, 'quiz', 'qs1', NOW)
    ).toEqual({ written: 0, deleted: 0 });
  });

  it('writes a scored quiz row', async () => {
    const stub = seed({ 'quiz_sessions/qs1/responses/u1': completed() });
    await applyWrite(
      stub,
      {
        kind: 'quiz',
        sessionId: 'qs1',
        docId: 'u1',
        before: undefined,
        after: completed(),
      },
      NOW
    );
    expect(stub.get('grade_index/qs1__u1')).toMatchObject({
      kind: 'quiz',
      ownerUid: 't1',
      studentUid: 'u1',
      rosterId: 'r1',
      classId: 'c1',
      rawPct: 100,
      points: 2,
      max: 2,
      state: 'scored',
      published: true,
      assigned: true,
      title: 'Fractions check',
    });
  });

  it('skips anonymous PIN responses', async () => {
    const stub = seed();
    const n = await applyWrite(
      stub,
      {
        kind: 'quiz',
        sessionId: 'qs1',
        docId: 'pin-3-1234',
        before: undefined,
        after: completed({ studentUid: 'anon' }),
      },
      NOW
    );
    expect(n).toBe(0);
    expect(stub.has('grade_index/qs1__anon')).toBe(false);
  });

  it('ignores mid-attempt answer saves', () => {
    const before = { status: 'in-progress', answers: [] };
    const after = {
      status: 'in-progress',
      answers: [{ questionId: 'q1', answer: 'B' }],
    };
    expect(
      docWriteMatters({
        kind: 'quiz',
        sessionId: 's',
        docId: 'u',
        before,
        after,
      })
    ).toBe(false);
  });

  it('keeps each attempt across a retake', async () => {
    const stub = seed();
    await applyWrite(
      stub,
      {
        kind: 'quiz',
        sessionId: 'qs1',
        docId: 'u1',
        before: undefined,
        after: completed(),
      },
      NOW
    );
    const retake = completed({ status: 'in-progress', answers: [] });
    await applyWrite(
      stub,
      {
        kind: 'quiz',
        sessionId: 'qs1',
        docId: 'u1',
        before: completed(),
        after: retake,
      },
      NOW
    );
    const second = completed({
      completedAttempts: 2,
      answers: [{ questionId: 'q1', answer: 'B' }],
    });
    await applyWrite(
      stub,
      {
        kind: 'quiz',
        sessionId: 'qs1',
        docId: 'u1',
        before: retake,
        after: second,
      },
      NOW
    );
    const row = stub.get('grade_index/qs1__u1') as unknown as IndexRow;
    expect(row.attempts.map((a) => [a.n, a.points])).toEqual([
      [1, 2],
      [2, 0],
    ]);
    expect(row).toMatchObject({ state: 'scored', points: 0, max: 2 });
  });

  it('marks a student outside individual targeting as not assigned', async () => {
    const stub = seed({
      'quiz_sessions/qs1': { ...quizSession, individualTargeting: true },
      'student_assignments/u2/items/qs1': { dueAt: NOW + DAY },
    });
    await applyWrite(
      stub,
      {
        kind: 'quiz',
        sessionId: 'qs1',
        docId: 'u1',
        before: undefined,
        after: completed(),
      },
      NOW
    );
    await applyWrite(
      stub,
      {
        kind: 'quiz',
        sessionId: 'qs1',
        docId: 'u2',
        before: undefined,
        after: completed({ studentUid: 'u2' }),
      },
      NOW
    );
    expect(stub.get('grade_index/qs1__u1')).toMatchObject({ assigned: false });
    expect(stub.get('grade_index/qs1__u2')).toMatchObject({
      assigned: true,
      dueAt: NOW + DAY,
    });
  });

  it('deletes the row when the response goes', async () => {
    const stub = seed({
      'grade_index/qs1__u1': { sessionId: 'qs1', studentUid: 'u1' },
    });
    await applyWrite(
      stub,
      {
        kind: 'quiz',
        sessionId: 'qs1',
        docId: 'u1',
        before: completed(),
        after: undefined,
      },
      NOW
    );
    expect(stub.has('grade_index/qs1__u1')).toBe(false);
  });

  it('builds one row per project group member', async () => {
    const stub = makeStubFirestore({
      'project_runs/t1_p1': {
        teacherUid: 't1',
        title: 'Bridge build',
        classIds: ['c1'],
      },
      'project_runs/t1_p1/groups/g1': {
        classId: 'c1',
        memberUids: ['u1', 'u2'],
      },
    });
    const grade = {
      points: 16,
      maxPoints: 20,
      released: false,
      overridesByUid: { u2: { points: 20 } },
    };
    await applyWrite(
      stub,
      {
        kind: 'projects',
        sessionId: 't1_p1',
        docId: 'g1',
        before: undefined,
        after: grade,
      },
      NOW
    );
    expect(stub.get('grade_index/t1_p1__u1')).toMatchObject({
      kind: 'projects',
      rawPct: 80,
      published: false,
    });
    expect(stub.get('grade_index/t1_p1__u2')).toMatchObject({ rawPct: 100 });
  });

  it('keeps an Activity Wall row until the author has no submissions left', async () => {
    const stub = makeStubFirestore({
      'activity_wall_sessions/t1_w1': {
        teacherUid: 't1',
        title: 'Exit wall',
        classIds: ['c1'],
        workKind: 'work',
      },
      'activity_wall_sessions/t1_w1/submissions/a': {
        authorUid: 'u1',
        submittedAt: 5,
      },
      'activity_wall_sessions/t1_w1/submissions/b': {
        authorUid: 'u1',
        submittedAt: 3,
      },
    });
    await applyWrite(
      stub,
      {
        kind: 'activity-wall',
        sessionId: 't1_w1',
        docId: 'a',
        before: undefined,
        after: { authorUid: 'u1', submittedAt: 5 },
      },
      NOW
    );
    expect(stub.get('grade_index/t1_w1__u1')).toMatchObject({
      submittedAt: 3,
      state: 'scored',
    });
    stub.store.delete('activity_wall_sessions/t1_w1/submissions/a');
    stub.store.delete('activity_wall_sessions/t1_w1/submissions/b');
    await applyWrite(
      stub,
      {
        kind: 'activity-wall',
        sessionId: 't1_w1',
        docId: 'b',
        before: { authorUid: 'u1', submittedAt: 3 },
        after: undefined,
      },
      NOW
    );
    expect(stub.has('grade_index/t1_w1__u1')).toBe(false);
  });
});

describe('recomputeSession and the dirty queue', () => {
  it('rebuilds every row and drops rows whose work is gone', async () => {
    const stub = seed({
      'quiz_sessions/qs1/responses/u1': completed(),
      'quiz_sessions/qs1/responses/pin-1-99': completed({ studentUid: 'anon' }),
      'grade_index/qs1__gone': { sessionId: 'qs1', studentUid: 'gone' },
    });
    const result = await recomputeSession(
      stub.db as unknown as Db,
      'quiz',
      'qs1',
      NOW
    );
    expect(result).toEqual({ written: 1, deleted: 1 });
    expect(stub.has('grade_index/qs1__u1')).toBe(true);
    expect(stub.has('grade_index/qs1__gone')).toBe(false);
  });

  it('writes nothing when a rerun changes nothing', async () => {
    const stub = seed({ 'quiz_sessions/qs1/responses/u1': completed() });
    const db = stub.db as unknown as Db;
    await recomputeSession(db, 'quiz', 'qs1', NOW);
    expect(await recomputeSession(db, 'quiz', 'qs1', NOW + 1)).toEqual({
      written: 0,
      deleted: 0,
    });
  });

  it('removes every row once the session is deleted', async () => {
    const stub = makeStubFirestore({
      'grade_index/qs9__u1': { sessionId: 'qs9', studentUid: 'u1' },
    });
    expect(
      await recomputeSession(stub.db as unknown as Db, 'quiz', 'qs9', NOW)
    ).toEqual({ written: 0, deleted: 1 });
  });

  it('moves a failing session behind newer work, then drops it', async () => {
    const stub = seed({ 'quiz_sessions/qs1/responses/u1': completed() });
    const db = stub.db as unknown as { collection: (n: string) => unknown };
    const collection = db.collection.bind(db);
    db.collection = (name: string) => {
      if (name === 'users') throw new Error('unavailable');
      return collection(name);
    };
    const typed = stub.db as unknown as Db;
    await markSessionDirty(typed, 'quiz', 'qs1', 1);
    expect(await drainDirtySessions(typed)).toEqual({
      recomputed: 0,
      failed: 1,
    });
    const queued = stub.get('grade_index_sessions/qs1');
    expect(queued?.failures).toBe(1);
    expect(queued?.dirtyAt).toBeGreaterThan(1);
    for (let i = 0; i < 4; i++) await drainDirtySessions(typed);
    expect(stub.has('grade_index_sessions/qs1')).toBe(false);
  });

  it('drains queued sessions and clears the queue entry', async () => {
    const stub = seed({ 'quiz_sessions/qs1/responses/u1': completed() });
    const db = stub.db as unknown as Db;
    await markSessionDirty(db, 'quiz', 'qs1', NOW);
    expect(await drainDirtySessions(db)).toEqual({ recomputed: 1, failed: 0 });
    expect(stub.has('grade_index_sessions/qs1')).toBe(false);
    expect(stub.has('grade_index/qs1__u1')).toBe(true);
  });
});

describe('Review sessions', () => {
  const recompute = (session: StubData, assignment: StubData = {}) => {
    const stub = seed({
      'quiz_sessions/qs1': { ...quizSession, ...session },
      'users/t1/quiz_assignments/qs1': { questionSnapshot: [], ...assignment },
      'quiz_sessions/qs1/responses/u1': completed(),
      'grade_index/qs1__u1': { sessionId: 'qs1', studentUid: 'u1' },
    });
    return recomputeSession(stub.db as unknown as Db, 'quiz', 'qs1', NOW).then(
      (result) => ({ result, has: stub.has('grade_index/qs1__u1') })
    );
  };

  it('leaves out a session tagged as a Review', async () => {
    expect(
      await recompute({ widgetKind: 'review', sessionMode: 'student' })
    ).toEqual({ result: { written: 0, deleted: 1 }, has: false });
  });

  it('leaves out an untagged game session', async () => {
    expect((await recompute({ sessionMode: 'game' })).has).toBe(false);
  });

  it('leaves out an untagged teacher-paced session unless it is a view-only share', async () => {
    expect((await recompute({ sessionMode: 'teacher' })).has).toBe(false);
    expect(
      (await recompute({ sessionMode: 'teacher' }, { mode: 'view-only' })).has
    ).toBe(true);
  });

  it('keeps a teacher-paced session tagged as a Quiz', async () => {
    expect(
      (await recompute({ sessionMode: 'teacher', widgetKind: 'quiz' })).has
    ).toBe(true);
  });
});

describe('Resource sessions', () => {
  const recomputeQuiz = (session: StubData) => {
    const stub = seed({
      'quiz_sessions/qs1': { ...quizSession, ...session },
      'quiz_sessions/qs1/responses/u1': completed(),
      'grade_index/qs1__u1': { sessionId: 'qs1', studentUid: 'u1' },
    });
    return recomputeSession(stub.db as unknown as Db, 'quiz', 'qs1', NOW).then(
      () => stub.has('grade_index/qs1__u1')
    );
  };

  const recomputeMiniApp = (session: StubData) => {
    const stub = makeStubFirestore({
      'mini_app_sessions/m1': {
        teacherUid: 't1',
        appTitle: 'Fractions',
        classIds: ['c1'],
        ...session,
      },
      'mini_app_sessions/m1/submissions/s1': {
        studentUid: 'u1',
        submittedAt: NOW - DAY,
      },
      'grade_index/m1__u1': { sessionId: 'm1', studentUid: 'u1' },
    });
    return recomputeSession(
      stub.db as unknown as Db,
      'mini-app',
      'm1',
      NOW
    ).then(() => stub.has('grade_index/m1__u1'));
  };

  it('drops the rows of a quiz the teacher marked as a Resource', async () => {
    expect(await recomputeQuiz({ workKind: 'resource' })).toBe(false);
  });

  it('keeps a quiz with no field or marked as Work', async () => {
    expect(await recomputeQuiz({})).toBe(true);
    expect(await recomputeQuiz({ workKind: 'work' })).toBe(true);
  });

  it('treats a mini-app as a Resource unless it is marked as Work', async () => {
    expect(await recomputeMiniApp({})).toBe(false);
    expect(await recomputeMiniApp({ workKind: 'work' })).toBe(true);
  });

  it('recomputes the session when the field flips', () => {
    expect(
      sessionWriteMatters({ workKind: 'work' }, { workKind: 'resource' })
    ).toBe(true);
  });
});

describe('kill switch', () => {
  it('leaves everything untouched while admin_settings/gradebook_index is off', async () => {
    const stub = seed({ 'admin_settings/gradebook_index': { enabled: false } });
    vi.mocked(admin.firestore).mockReturnValue(stub.db as never);
    await (gradeIndexQuizResponse as unknown as Handler)({
      params: { sessionId: 'qs1', docId: 'u1' },
      data: {
        before: { exists: false, data: () => undefined },
        after: { exists: true, data: () => completed() },
      },
    });
    await (gradeIndexQuizSession as unknown as Handler)({
      params: { sessionId: 'qs1' },
      data: {
        before: { exists: false, data: () => undefined },
        after: { exists: true, data: () => quizSession },
      },
    });
    await runGradeIndexRecompute(stub.db as never);
    expect(stub.writes).toEqual([]);
  });

  it('runs the triggers once it is on', async () => {
    const stub = seed({ 'quiz_sessions/qs1/responses/u1': completed() });
    vi.mocked(admin.firestore).mockReturnValue(stub.db as never);
    await (gradeIndexQuizResponse as unknown as Handler)({
      params: { sessionId: 'qs1', docId: 'u1' },
      data: {
        before: { exists: false, data: () => undefined },
        after: { exists: true, data: () => completed() },
      },
    });
    expect(stub.has('grade_index/qs1__u1')).toBe(true);
  });
});
