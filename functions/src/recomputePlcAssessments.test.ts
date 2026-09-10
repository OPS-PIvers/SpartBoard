import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: vi.fn(() => 'SERVER_TS') },
  }),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: () => Promise<void>) => handler,
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import {
  parseCompletedResponse,
  recomputeOnePlcAssessment,
  runRecomputePlcAssessments,
  teacherNamesFromPlc,
} from './recomputePlcAssessments';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

type Db = Parameters<typeof runRecomputePlcAssessments>[0];

const NOW = 1_700_000_000_000;

const publicQuestions = [
  { id: 'q1', type: 'MC', text: 'Capital?', choices: ['Duluth', 'St. Paul'] },
  { id: 'q2', type: 'FIB', text: 'Sum?' },
];

function seedPipeline(overrides: Record<string, StubData> = {}) {
  return makeStubFirestore({
    'plcs/plc-1': {
      name: 'English 9',
      members: {
        tA: {
          displayName: 'Ada',
          email: 'a@x',
          role: 'lead',
          status: 'active',
        },
        tB: {
          displayName: 'Bea',
          email: 'b@x',
          role: 'member',
          status: 'active',
        },
      },
    },
    'plcs/plc-1/assessments/grp-1': {
      id: 'grp-1',
      title: 'Unit 4 CFA',
      kind: 'quiz',
      syncGroupId: 'grp-1',
      status: 'active',
      dirtyAt: NOW - 1000,
    },
    'synced_quizzes/grp-1': {
      title: 'Unit 4 CFA',
      questions: [
        {
          id: 'q1',
          type: 'MC',
          text: 'Capital?',
          correctAnswer: 'St. Paul',
          incorrectAnswers: ['Duluth'],
        },
        { id: 'q2', type: 'FIB', text: 'Sum?', correctAnswer: '4' },
      ],
    },
    'quiz_sessions/sess-a': {
      teacherUid: 'tA',
      quizId: 'quiz-a',
      quizTitle: 'Unit 4 CFA',
      status: 'ended',
      plcId: 'plc-1',
      syncGroupId: 'grp-1',
      scorePublishedAt: NOW - 500,
      publicQuestions,
    },
    'quiz_sessions/sess-a/responses/r1': {
      studentUid: 'stu-1',
      status: 'completed',
      score: 100,
      classPeriod: 'P1',
      answers: [
        {
          questionId: 'q1',
          answer: 'St. Paul',
          answeredAt: 1,
          isCorrect: true,
        },
        { questionId: 'q2', answer: '4', answeredAt: 2, isCorrect: true },
      ],
    },
    'quiz_sessions/sess-a/responses/r2': {
      studentUid: 'stu-2',
      status: 'in-progress',
      score: null,
      answers: [{ questionId: 'q1', answer: 'Duluth', answeredAt: 1 }],
    },
    'quiz_sessions/sess-b': {
      teacherUid: 'tB',
      quizId: 'quiz-b',
      quizTitle: 'Unit 4 CFA',
      status: 'active',
      plcId: 'plc-1',
      syncGroupId: 'grp-1',
      publicQuestions,
    },
    'quiz_sessions/sess-b/responses/r1': {
      studentUid: 'stu-3',
      status: 'completed',
      score: 0,
      classId: 'class-7',
      answers: [
        { questionId: 'q1', answer: 'Duluth', answeredAt: 1, isCorrect: false },
      ],
    },
    'quiz_sessions/sess-other': {
      teacherUid: 'tA',
      quizId: 'quiz-z',
      quizTitle: 'Unrelated',
      status: 'ended',
      plcId: 'plc-1',
      syncGroupId: 'grp-9',
      publicQuestions,
    },
    'quiz_sessions/sess-other/responses/r1': {
      studentUid: 'stu-9',
      status: 'completed',
      score: 100,
      answers: [{ questionId: 'q1', answer: 'St. Paul', isCorrect: true }],
    },
    ...overrides,
  });
}

describe('teacherNamesFromPlc', () => {
  it('reads displayName per member uid and tolerates junk', () => {
    const names = teacherNamesFromPlc({
      members: { a: { displayName: 'Ada' }, b: 'junk', c: {} },
    });
    expect(names.get('a')).toBe('Ada');
    expect(names.has('b')).toBe(false);
    expect(names.get('c')).toBe('');
    expect(teacherNamesFromPlc(undefined).size).toBe(0);
    expect(teacherNamesFromPlc({ members: null }).size).toBe(0);
  });
});

describe('parseCompletedResponse', () => {
  it('normalizes answers and coerces score', () => {
    const r = parseCompletedResponse({
      studentUid: 's',
      score: '90',
      classPeriod: '',
      classId: 'c1',
      answers: [
        { questionId: 'q1', answer: 'x', isCorrect: 'yes', status: 'draft' },
        { answer: 'no-id' },
        'garbage',
      ],
    });
    expect(r.score).toBeNull();
    expect(r.classPeriod).toBeUndefined();
    expect(r.classId).toBe('c1');
    expect(r.answers).toEqual([
      {
        questionId: 'q1',
        answer: 'x',
        answeredAt: undefined,
        isCorrect: undefined,
        status: 'draft',
        unresponded: undefined,
        takeIndex: undefined,
      },
    ]);
  });
});

describe('recomputeOnePlcAssessment', () => {
  it('writes a pooled aggregate from completed responses and clears dirtyAt', async () => {
    const stub = seedPipeline();
    await recomputeOnePlcAssessment(stub.db as unknown as Db, 'plc-1', 'grp-1');

    const agg = stub.get('plcs/plc-1/aggregates/grp-1');
    expect(agg).toMatchObject({
      assessmentId: 'grp-1',
      schemaVersion: 2,
      title: 'Unit 4 CFA',
      kind: 'quiz',
      teacherCount: 2,
      studentCount: 2,
      teamAveragePercent: 50,
      scoredStudentCount: 2,
      sessionCount: 2,
      linkedSessionCount: 2,
      publishedSessionCount: 1,
      computedFromSessionIds: ['sess-a', 'sess-b'],
      alignment: 'byId',
      ranAt: 'SERVER_TS',
    });
    const perQuestion = agg!.perQuestion as Array<Record<string, unknown>>;
    expect(perQuestion[0]).toMatchObject({
      questionId: 'q1',
      answered: 2,
      graded: 2,
      correct: 1,
      incorrectPercent: 50,
    });
    expect(perQuestion[0].choiceDistribution).toEqual([
      { label: 'St. Paul', count: 1, isCorrect: true },
      { label: 'Duluth', count: 1, isCorrect: false },
    ]);
    expect(agg!.perTeacher).toEqual([
      {
        teacherUid: 'tA',
        teacherName: 'Ada',
        classCount: 1,
        averagePercent: 100,
        studentCount: 1,
      },
      {
        teacherUid: 'tB',
        teacherName: 'Bea',
        classCount: 1,
        averagePercent: 0,
        studentCount: 1,
      },
    ]);
    expect(JSON.stringify(agg)).not.toContain('stu-');
    expect(stub.get('plcs/plc-1/assessments/grp-1')?.dirtyAt).toBeNull();
  });

  it('falls back to session public questions when no synced doc exists', async () => {
    const stub = seedPipeline();
    stub.store.delete('synced_quizzes/grp-1');
    await recomputeOnePlcAssessment(stub.db as unknown as Db, 'plc-1', 'grp-1');
    const perQuestion = stub.get('plcs/plc-1/aggregates/grp-1')!
      .perQuestion as Array<Record<string, unknown>>;
    expect(perQuestion[0].choiceDistribution).toEqual([
      { label: 'Duluth', count: 1, isCorrect: false },
      { label: 'St. Paul', count: 1, isCorrect: true },
    ]);
  });

  it('leaves dirtyAt alone when a trigger re-dirtied it mid-run', async () => {
    const stub = seedPipeline();
    stub.hooks.beforeQuery = async (label) => {
      if (label !== 'quiz_sessions') return;
      stub.hooks.beforeQuery = undefined;
      await stub.db
        .doc('plcs/plc-1/assessments/grp-1')
        .update({ dirtyAt: NOW + 5 });
    };
    await recomputeOnePlcAssessment(stub.db as unknown as Db, 'plc-1', 'grp-1');
    expect(stub.get('plcs/plc-1/assessments/grp-1')?.dirtyAt).toBe(NOW + 5);
    expect(stub.has('plcs/plc-1/aggregates/grp-1')).toBe(true);
  });

  it('deletes the aggregate and clears dirtyAt for a tombstoned assessment', async () => {
    const stub = seedPipeline({
      'plcs/plc-1/assessments/grp-1': {
        id: 'grp-1',
        syncGroupId: 'grp-1',
        deletedAt: NOW - 10,
        dirtyAt: NOW - 5,
      },
      'plcs/plc-1/aggregates/grp-1': { assessmentId: 'grp-1', stale: true },
    });
    await recomputeOnePlcAssessment(stub.db as unknown as Db, 'plc-1', 'grp-1');
    expect(stub.has('plcs/plc-1/aggregates/grp-1')).toBe(false);
    expect(stub.get('plcs/plc-1/assessments/grp-1')?.dirtyAt).toBeNull();
  });

  it('drops an orphan aggregate when the assessment doc is gone', async () => {
    const stub = makeStubFirestore({
      'plcs/plc-1/aggregates/gone': { assessmentId: 'gone' },
    });
    await recomputeOnePlcAssessment(stub.db as unknown as Db, 'plc-1', 'gone');
    expect(stub.has('plcs/plc-1/aggregates/gone')).toBe(false);
  });

  it('writes a zeroed aggregate when no sessions are linked yet', async () => {
    const stub = seedPipeline();
    for (const key of Array.from(stub.store.keys())) {
      if (key.startsWith('quiz_sessions/')) stub.store.delete(key);
    }
    await recomputeOnePlcAssessment(stub.db as unknown as Db, 'plc-1', 'grp-1');
    expect(stub.get('plcs/plc-1/aggregates/grp-1')).toMatchObject({
      studentCount: 0,
      teacherCount: 0,
      sessionCount: 0,
      linkedSessionCount: 0,
      publishedSessionCount: 0,
      scoredStudentCount: 0,
      perTeacher: [],
    });
  });
});

describe('runRecomputePlcAssessments', () => {
  it('processes dirty assessments oldest-first across PLCs and skips clean ones', async () => {
    const stub = seedPipeline({
      'plcs/plc-1/assessments/clean': {
        id: 'clean',
        syncGroupId: 'grp-clean',
        dirtyAt: null,
      },
      'plcs/plc-2/assessments/older': {
        id: 'older',
        title: 'Older',
        syncGroupId: 'grp-older',
        dirtyAt: NOW - 50_000,
      },
    });
    const counts = await runRecomputePlcAssessments(stub.db as unknown as Db);
    expect(counts).toEqual({ scanned: 2, recomputed: 2, failed: 0 });
    expect(stub.has('plcs/plc-1/aggregates/grp-1')).toBe(true);
    expect(stub.has('plcs/plc-2/aggregates/older')).toBe(true);
    expect(stub.has('plcs/plc-1/aggregates/clean')).toBe(false);
    const order = stub.writes.filter((w) => w.op === 'set').map((w) => w.path);
    expect(order).toEqual([
      'plcs/plc-2/aggregates/older',
      'plcs/plc-1/aggregates/grp-1',
    ]);
  });

  it('honors the batch limit', async () => {
    const stub = seedPipeline({
      'plcs/plc-2/assessments/older': {
        id: 'older',
        syncGroupId: 'grp-older',
        dirtyAt: NOW - 50_000,
      },
    });
    const counts = await runRecomputePlcAssessments(stub.db as unknown as Db, {
      limit: 1,
    });
    expect(counts.scanned).toBe(1);
    expect(stub.get('plcs/plc-1/assessments/grp-1')?.dirtyAt).toBe(NOW - 1000);
  });

  it('counts a failed item and keeps going', async () => {
    const stub = seedPipeline({
      'plcs/plc-2/assessments/older': {
        id: 'older',
        syncGroupId: 'grp-older',
        dirtyAt: NOW - 50_000,
      },
    });
    stub.hooks.beforeWrite = (op, path) => {
      if (op === 'set' && path === 'plcs/plc-2/aggregates/older') {
        throw new Error('boom');
      }
    };
    const counts = await runRecomputePlcAssessments(stub.db as unknown as Db);
    expect(counts).toEqual({ scanned: 2, recomputed: 1, failed: 1 });
    expect(stub.has('plcs/plc-1/aggregates/grp-1')).toBe(true);
    expect(stub.get('plcs/plc-2/assessments/older')?.dirtyAt).toBe(
      NOW - 50_000
    );
  });
});
