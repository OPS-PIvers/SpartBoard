import { describe, it, expect, vi, beforeEach } from 'vitest';

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
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock('./recomputePlcAssessments', async (orig) => ({
  ...(await orig<object>()),
  recomputeOnePlcAssessment: vi.fn(() => Promise.resolve()),
}));

import * as admin from 'firebase-admin';
import {
  applyDocWrite,
  __resetGradeIndexEnabledCache,
} from './gradebook/gradeIndex';
import { handleResponseWrite, markDirty } from './markPlcAssessmentDirty';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

type Db = Parameters<typeof applyDocWrite>[0];

const quizSession: StubData = {
  teacherUid: 't1',
  assignmentId: 'qs1',
  quizTitle: 'Fractions',
  rosterIds: ['r1'],
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
const response = (over: StubData = {}): StubData => ({
  studentUid: 'u1',
  status: 'completed',
  classId: 'c1',
  submittedAt: 1,
  completedAttempts: 1,
  answers: [{ questionId: 'q1', answer: 'A' }],
  ...over,
});

const snap = (d: StubData | null) => ({
  exists: d !== null,
  data: () => d ?? undefined,
});

beforeEach(() => __resetGradeIndexEnabledCache());

function gradeStub(docId: string, data: StubData) {
  return makeStubFirestore({
    'admin_settings/gradebook_index': { enabled: true },
    'quiz_sessions/qs1': quizSession,
    'users/t1/quiz_assignments/qs1': { questionSnapshot: [] },
    'users/t1/quiz_assignments/qs1/key/answers': key,
    [`quiz_sessions/qs1/responses/${docId}`]: data,
  });
}

describe('server read counts per trigger invocation', () => {
  it('grade index, signed-in student response', async () => {
    const stub = gradeStub('u1', response());
    await applyDocWrite(stub.db as unknown as Db, {
      kind: 'quiz',
      sessionId: 'qs1',
      docId: 'u1',
      before: response({ status: 'in-progress' }),
      after: response(),
    });
    console.log('READS grade signed-in', stub.reads.length);
    expect(stub.reads.length).toBeLessThanOrEqual(6);
  });

  it('grade index, PIN-joined response', async () => {
    const stub = gradeStub('pin-1234', response({ studentUid: undefined }));
    await applyDocWrite(stub.db as unknown as Db, {
      kind: 'quiz',
      sessionId: 'qs1',
      docId: 'pin-1234',
      before: response({ status: 'in-progress' }),
      after: response({ studentUid: undefined }),
    });
    console.log('READS grade PIN', stub.reads.length);
    expect(stub.reads.length).toBe(0);
    expect(stub.writes).toEqual([]);
  });

  it('PLC dirty marker, missing assessment', async () => {
    const stub = makeStubFirestore({
      'quiz_sessions/s': {
        plcId: 'p',
        syncGroupId: 'g',
        quizTitle: 'T',
        teacherUid: 't',
      },
    });
    vi.mocked(admin.firestore).mockReturnValue(stub.db as never);
    await handleResponseWrite(stub.db as never, 's', {
      before: snap(null),
      after: snap({ status: 'completed' }),
    });
    console.log('READS plc missing', stub.reads.length);
    expect(stub.get('plcs/p/assessments/g')?.dirtyAt).toBeTypeOf('number');
    expect(stub.reads.length).toBeLessThanOrEqual(2);
  });

  it('PLC dirty marker, assessment exists but clean', async () => {
    const stub = makeStubFirestore({
      'quiz_sessions/s': { plcId: 'p', syncGroupId: 'g' },
      'plcs/p/assessments/g': { syncGroupId: 'g', dirtyAt: null },
    });
    await markDirty(stub.db as never, 'p', 'g', {
      plcId: 'p',
      syncGroupId: 'g',
      quizId: '',
      quizTitle: '',
      teacherUid: '',
      status: '',
      scorePublishedAt: null,
    });
    console.log('READS plc existing', stub.reads.length);
    expect(stub.get('plcs/p/assessments/g')?.dirtyAt).toBeTypeOf('number');
  });
});
