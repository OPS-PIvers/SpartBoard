// Unit tests for the paper answer-sheet import callable (docs/plans/QUIZ_PAPER_ANSWER_SHEETS.md §7).
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: () => 'SERVER_TS' },
  }),
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
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./classlinkShared')>()),
  ALLOWED_ORIGINS: [],
}));

import {
  PAPER_SETTINGS_PATH,
  handleImportPaperResponses,
  handlePublishPaperResults,
  parseImportPaperResponsesInput,
  type ImportPaperCaller,
} from './importPaperResponses';

type Doc = Record<string, unknown>;
type Db = Parameters<typeof handleImportPaperResponses>[0];

function makeDb(docs: Record<string, Doc>) {
  const committed: string[][] = [];
  const refFor = (path: string) => ({
    path,
    get: () =>
      Promise.resolve({
        exists: docs[path] !== undefined,
        data: () => docs[path],
      }),
  });
  // Only the `where(field, '>', '')` shape the publish path uses: direct
  // children of the collection carrying a non-empty string at `field`.
  const collectionRef = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
    where: (field: string) => ({
      get: () =>
        Promise.resolve({
          docs: Object.entries(docs)
            .filter(
              ([p, d]) =>
                p.startsWith(`${path}/`) &&
                !p.slice(path.length + 1).includes('/') &&
                typeof d[field] === 'string' &&
                d[field] > ''
            )
            .map(([p, d]) => ({ id: p.slice(path.length + 1), data: () => d })),
        }),
    }),
  });
  const docRef = (
    path: string
  ): ReturnType<typeof refFor> & {
    collection: (sub: string) => ReturnType<typeof collectionRef>;
  } => ({
    ...refFor(path),
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
  });
  const db = {
    doc: (path: string) => refFor(path),
    collection: (c: string) => collectionRef(c),
    batch: () => {
      const staged: Array<{ path: string; data: Doc; merge: boolean }> = [];
      return {
        set: (ref: { path: string }, data: Doc, opts?: { merge?: boolean }) => {
          staged.push({ path: ref.path, data, merge: opts?.merge === true });
        },
        commit: () => {
          for (const s of staged) {
            docs[s.path] = s.merge ? { ...docs[s.path], ...s.data } : s.data;
          }
          committed.push(staged.map((s) => s.path));
          return Promise.resolve();
        },
      };
    },
  } as unknown as Db;
  return { db, docs, committed };
}

const NOW = Date.UTC(2026, 8, 18, 15, 0, 0);
const UID = 'teacher-1';
const ASSIGNMENT = 'a1';
const BATCH = 'b1';
const teacher: ImportPaperCaller = {
  uid: UID,
  studentRole: false,
  anonymous: false,
};

const baseDocs = (): Record<string, Doc> => ({
  [PAPER_SETTINGS_PATH]: { enabled: true },
  [`users/${UID}/quiz_assignments/${ASSIGNMENT}`]: { quizId: 'quiz-1' },
  [`quiz_sessions/${ASSIGNMENT}`]: {
    teacherUid: UID,
    publicQuestions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }],
  },
  [`users/${UID}/paper_batches/${BATCH}`]: {
    quizId: 'quiz-1',
    seats: {
      1: { rosterId: 'r1', studentId: 's1' },
      2: { rosterId: 'r1', studentId: 's2' },
    },
    spareSeats: [3],
    keySheetSeat: 4,
  },
  [`users/${UID}/rosters/r1`]: { name: 'Period 1' },
  [`users/${UID}/rosters/r2`]: { name: 'Period 2' },
  [`users/${UID}/rosters/r1/pin_index/period_1__0002`]: {
    pseudonym: 'pseudo-s2',
    classId: 'class-1',
  },
});

const sheet = (seat: number, over: Doc = {}) => ({
  seat,
  rosterId: 'r1',
  pin: String(seat).padStart(4, '0'),
  classPeriod: 'Period 1',
  answers: [
    { questionId: 'q1', answer: 'B' },
    { questionId: 'q2', answer: '', unresponded: 'passed' },
    { questionId: 'q3', answer: '', unresponded: 'paper-unclear' },
  ],
  ...over,
});

const call = (
  docs: Record<string, Doc>,
  sheets: unknown[],
  caller = teacher
) => {
  const { db, committed } = makeDb(docs);
  return handleImportPaperResponses(
    db,
    caller,
    { batchId: BATCH, assignmentId: ASSIGNMENT, sheets },
    NOW
  ).then((result) => ({ result, docs, committed }));
};

describe('handleImportPaperResponses', () => {
  it('keys an unindexed student by pin and period, as an anonymous joiner would be', async () => {
    const { result, docs } = await call(baseDocs(), [sheet(1)]);
    expect(result).toEqual({ written: [1], collisions: [] });
    const doc = docs[`quiz_sessions/${ASSIGNMENT}/responses/pin-period_1-0001`];
    expect(doc).toMatchObject({
      studentUid: 'pin-period_1-0001',
      pin: '0001',
      classPeriod: 'Period 1',
      status: 'completed',
      score: null,
      submittedAt: NOW,
      completedAttempts: 1,
      paperBatchId: BATCH,
      paperSeat: 1,
      lastWriteAt: 'SERVER_TS',
    });
    expect(doc.classId).toBeUndefined();
    expect(docs[`users/${UID}/quiz_assignments/${ASSIGNMENT}`]).toEqual({
      quizId: 'quiz-1',
      hasPaperResponses: true,
    });
    expect(doc.answers).toEqual([
      { questionId: 'q1', answer: 'B', answeredAt: NOW, status: 'submitted' },
      {
        questionId: 'q2',
        answer: '',
        answeredAt: NOW,
        status: 'submitted',
        unresponded: 'passed',
      },
      {
        questionId: 'q3',
        answer: '',
        answeredAt: NOW,
        status: 'submitted',
        unresponded: 'paper-unclear',
      },
    ]);
  });

  it('keys an indexed student by the SSO pseudonym so the result reaches My Assignments', async () => {
    const { docs } = await call(baseDocs(), [sheet(2)]);
    const doc = docs[`quiz_sessions/${ASSIGNMENT}/responses/pseudo-s2`];
    expect(doc).toMatchObject({
      studentUid: 'pseudo-s2',
      classId: 'class-1',
      pin: '0002',
    });
    expect(
      docs[`quiz_sessions/${ASSIGNMENT}/responses/pin-period_1-0002`]
    ).toBeUndefined();
  });

  it('replaces its own earlier import but reports a device response as a collision', async () => {
    const docs = baseDocs();
    docs[`quiz_sessions/${ASSIGNMENT}/responses/pin-period_1-0001`] = {
      studentUid: 'pin-period_1-0001',
      paperBatchId: BATCH,
      submittedAt: 1,
      answers: [],
    };
    docs[`quiz_sessions/${ASSIGNMENT}/responses/pseudo-s2`] = {
      studentUid: 'pseudo-s2',
      submittedAt: 12345,
      answers: [{ questionId: 'q1', answer: 'A' }],
    };
    const { result } = await call(docs, [sheet(1), sheet(2)]);
    expect(result.written).toEqual([1]);
    expect(result.collisions).toEqual([
      {
        seat: 2,
        responseKey: 'pseudo-s2',
        fromOtherBatch: false,
        existingSubmittedAt: 12345,
      },
    ]);
    expect(
      docs[`quiz_sessions/${ASSIGNMENT}/responses/pseudo-s2`].answers
    ).toEqual([{ questionId: 'q1', answer: 'A' }]);
    expect(
      docs[`quiz_sessions/${ASSIGNMENT}/responses/pin-period_1-0001`]
        .submittedAt
    ).toBe(NOW);
  });

  it('flags a response from another paper batch as such', async () => {
    const docs = baseDocs();
    docs[`quiz_sessions/${ASSIGNMENT}/responses/pin-period_1-0001`] = {
      paperBatchId: 'older-batch',
      submittedAt: 5,
    };
    const { result } = await call(docs, [sheet(1)]);
    expect(result.collisions[0]).toMatchObject({
      seat: 1,
      fromOtherBatch: true,
    });
  });

  it('overwrites a collision only when the teacher resolved it', async () => {
    const docs = baseDocs();
    docs[`quiz_sessions/${ASSIGNMENT}/responses/pseudo-s2`] = {
      submittedAt: 12345,
    };
    const { result } = await call(docs, [sheet(2, { replaceExisting: true })]);
    expect(result).toEqual({ written: [2], collisions: [] });
    expect(
      docs[`quiz_sessions/${ASSIGNMENT}/responses/pseudo-s2`].paperBatchId
    ).toBe(BATCH);
  });

  it('lets a spare be assigned to any roster the teacher owns, and no other', async () => {
    const ok = await call(baseDocs(), [
      sheet(3, { rosterId: 'r2', pin: '0009', classPeriod: 'Period 2' }),
    ]);
    expect(ok.result.written).toEqual([3]);
    expect(
      ok.docs[`quiz_sessions/${ASSIGNMENT}/responses/pin-period_2-0009`]
    ).toBeDefined();
    await expect(
      call(baseDocs(), [sheet(3, { rosterId: 'someone-elses' })])
    ).rejects.toMatchObject({ code: 'invalid-argument', message: /Roster/ });
  });

  it('rejects a student seat sent under a different roster', async () => {
    await expect(
      call(baseDocs(), [sheet(1, { rosterId: 'r2' })])
    ).rejects.toMatchObject({
      code: 'invalid-argument',
      message: /different roster/,
    });
  });

  it('rejects the key sheet, an unprinted seat, and an unknown question', async () => {
    await expect(call(baseDocs(), [sheet(4)])).rejects.toMatchObject({
      message: /answer key/,
    });
    await expect(call(baseDocs(), [sheet(9)])).rejects.toMatchObject({
      message: /not printed/,
    });
    await expect(
      call(baseDocs(), [
        sheet(1, { answers: [{ questionId: 'nope', answer: 'A' }] }),
      ])
    ).rejects.toMatchObject({ message: /not in this session/ });
  });

  it('refuses when the feature is off, whoever calls', async () => {
    const docs = baseDocs();
    docs[PAPER_SETTINGS_PATH] = { enabled: false };
    await expect(call(docs, [sheet(1)])).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    delete docs[PAPER_SETTINGS_PATH];
    await expect(call(docs, [sheet(1)])).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('refuses students, anonymous callers and the signed-out', async () => {
    await expect(
      call(baseDocs(), [sheet(1)], { ...teacher, studentRole: true })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      call(baseDocs(), [sheet(1)], { ...teacher, anonymous: true })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      handleImportPaperResponses(makeDb(baseDocs()).db, null, {}, NOW)
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('refuses a session the caller does not own and a batch for another quiz', async () => {
    const stolen = baseDocs();
    stolen[`quiz_sessions/${ASSIGNMENT}`] = {
      ...stolen[`quiz_sessions/${ASSIGNMENT}`],
      teacherUid: 'other',
    };
    await expect(call(stolen, [sheet(1)])).rejects.toMatchObject({
      code: 'permission-denied',
    });
    const wrongQuiz = baseDocs();
    wrongQuiz[`users/${UID}/paper_batches/${BATCH}`] = {
      ...wrongQuiz[`users/${UID}/paper_batches/${BATCH}`],
      quizId: 'quiz-2',
    };
    await expect(call(wrongQuiz, [sheet(1)])).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    const missing = baseDocs();
    delete missing[`users/${UID}/paper_batches/${BATCH}`];
    await expect(call(missing, [sheet(1)])).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('refuses two seats that resolve to the same student instead of overwriting one', async () => {
    const { db, docs, committed } = makeDb(baseDocs());
    await expect(
      handleImportPaperResponses(
        db,
        teacher,
        {
          batchId: BATCH,
          assignmentId: ASSIGNMENT,
          sheets: [sheet(1), sheet(3, { pin: '0001' })],
        },
        NOW
      )
    ).rejects.toMatchObject({
      code: 'invalid-argument',
      message: /Seats 1 and 3 resolve to the same student/,
    });
    expect(committed).toEqual([]);
    expect(Object.keys(docs).some((k) => k.includes('/responses/'))).toBe(
      false
    );
  });

  it('never writes a partial stack when validation fails', async () => {
    const { db, docs, committed } = makeDb(baseDocs());
    await expect(
      handleImportPaperResponses(
        db,
        teacher,
        {
          batchId: BATCH,
          assignmentId: ASSIGNMENT,
          sheets: [sheet(1), sheet(9)],
        },
        NOW
      )
    ).rejects.toBeDefined();
    expect(committed).toEqual([]);
    expect(Object.keys(docs).some((k) => k.includes('/responses/'))).toBe(
      false
    );
  });
});

describe('parseImportPaperResponsesInput', () => {
  it('rejects malformed payloads before any read', () => {
    expect(() => parseImportPaperResponsesInput({})).toThrow(/sheets/);
    expect(() =>
      parseImportPaperResponsesInput({
        batchId: 'b',
        assignmentId: 'a',
        sheets: [sheet(1), sheet(1)],
      })
    ).toThrow(/twice/);
    expect(() =>
      parseImportPaperResponsesInput({
        batchId: 'b',
        assignmentId: 'a',
        sheets: [
          sheet(1, {
            answers: [
              { questionId: 'q1', answer: 'A', unresponded: 'expired' },
            ],
          }),
        ],
      })
    ).toThrow(/unresponded/);
    expect(() =>
      parseImportPaperResponsesInput({
        batchId: 'b',
        assignmentId: 'a',
        sheets: [
          sheet(1, {
            answers: [
              { questionId: 'q1', answer: 'A' },
              { questionId: 'q1', answer: 'B' },
            ],
          }),
        ],
      })
    ).toThrow(/repeats/);
    expect(() =>
      parseImportPaperResponsesInput({
        batchId: 'b',
        assignmentId: 'a',
        sheets: [sheet(1, { pin: '  ' })],
      })
    ).toThrow(/pin/);
    expect(() =>
      parseImportPaperResponsesInput({
        batchId: 'b/c',
        assignmentId: 'a',
        sheets: [sheet(1)],
      })
    ).toThrow(/batchId/);
  });
});

describe('handlePublishPaperResults', () => {
  const publish = (docs: Record<string, Doc>, caller = teacher) => {
    const { db } = makeDb(docs);
    return handlePublishPaperResults(
      db,
      caller,
      { assignmentId: ASSIGNMENT },
      NOW
    ).then((result) => ({ result, docs }));
  };
  const withResponses = (): Record<string, Doc> => ({
    ...baseDocs(),
    [`quiz_sessions/${ASSIGNMENT}/responses/pseudo-s2`]: {
      studentUid: 'pseudo-s2',
      classId: 'class-1',
      paperBatchId: BATCH,
    },
    [`quiz_sessions/${ASSIGNMENT}/responses/pin-period_1-0001`]: {
      studentUid: 'pin-period_1-0001',
      paperBatchId: BATCH,
    },
    [`quiz_sessions/${ASSIGNMENT}/responses/device-kid`]: {
      studentUid: 'device-kid',
      classId: 'class-1',
    },
    [`quiz_sessions/${ASSIGNMENT}/responses/pseudo-s3`]: {
      studentUid: 'pseudo-s3',
      paperBatchId: BATCH,
    },
  });

  it('writes a pointer for every pseudonym-keyed paper response and counts the rest', async () => {
    const { result, docs } = await publish(withResponses());
    expect(result).toEqual({ pointersWritten: 1, unlinked: 1, unplaced: 1 });
    expect(docs[`student_assignments/pseudo-s2/items/${ASSIGNMENT}`]).toEqual({
      kind: 'quiz',
      sessionId: ASSIGNMENT,
      teacherUid: UID,
      classId: 'class-1',
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(
      docs[`student_assignments/device-kid/items/${ASSIGNMENT}`]
    ).toBeUndefined();
    expect(
      docs[`student_assignments/pin-period_1-0001/items/${ASSIGNMENT}`]
    ).toBeUndefined();
    expect(
      docs[`student_assignments/pseudo-s3/items/${ASSIGNMENT}`]
    ).toBeUndefined();
  });

  it('ends a paused paper-only administration so pointers lead to the review, and leaves a class session alone', async () => {
    const paperOnly = withResponses();
    paperOnly[`quiz_sessions/${ASSIGNMENT}`] = {
      ...paperOnly[`quiz_sessions/${ASSIGNMENT}`],
      status: 'paused',
    };
    paperOnly[`users/${UID}/quiz_assignments/${ASSIGNMENT}`] = {
      quizId: 'quiz-1',
      status: 'paused',
    };
    const ended = await publish(paperOnly);
    expect(ended.docs[`quiz_sessions/${ASSIGNMENT}`]).toMatchObject({
      status: 'ended',
      endedAt: NOW,
      teacherUid: UID,
    });
    expect(
      ended.docs[`users/${UID}/quiz_assignments/${ASSIGNMENT}`]
    ).toMatchObject({ status: 'inactive', updatedAt: NOW });

    const mixed = withResponses();
    mixed[`quiz_sessions/${ASSIGNMENT}`] = {
      ...mixed[`quiz_sessions/${ASSIGNMENT}`],
      status: 'paused',
      classIds: ['class-1'],
    };
    const kept = await publish(mixed);
    expect(kept.docs[`quiz_sessions/${ASSIGNMENT}`].status).toBe('paused');
  });

  it("keeps an existing pointer's createdAt and any stored override", async () => {
    const docs = withResponses();
    docs[`student_assignments/pseudo-s2/items/${ASSIGNMENT}`] = {
      kind: 'quiz',
      sessionId: ASSIGNMENT,
      teacherUid: UID,
      classId: 'class-1',
      createdAt: 7,
      updatedAt: 7,
      override: { timeMultiplier: 2 },
    };
    await publish(docs);
    expect(docs[`student_assignments/pseudo-s2/items/${ASSIGNMENT}`]).toEqual(
      expect.objectContaining({
        createdAt: 7,
        updatedAt: NOW,
        override: { timeMultiplier: 2 },
      })
    );
  });

  it('is a no-op for an administration with no paper responses', async () => {
    const { result } = await publish(baseDocs());
    expect(result).toEqual({ pointersWritten: 0, unlinked: 0, unplaced: 0 });
  });

  it('refuses the flag off, non-owners, students and the signed-out', async () => {
    const off = withResponses();
    off[PAPER_SETTINGS_PATH] = { enabled: false };
    await expect(publish(off)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    const stolen = withResponses();
    stolen[`quiz_sessions/${ASSIGNMENT}`] = {
      ...stolen[`quiz_sessions/${ASSIGNMENT}`],
      teacherUid: 'other',
    };
    await expect(publish(stolen)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(
      publish(withResponses(), { ...teacher, studentRole: true })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      handlePublishPaperResults(makeDb(withResponses()).db, null, {}, NOW)
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(
      handlePublishPaperResults(makeDb(withResponses()).db, teacher, {}, NOW)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
