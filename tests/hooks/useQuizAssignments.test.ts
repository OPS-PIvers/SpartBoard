import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import type {
  QuizPublicQuestion,
  QuizSession,
  SharedQuizAssignment,
} from '@/types';

// `deleteField()` and `serverTimestamp()` return Firestore sentinels; the
// production code stores the sentinel in the patch object and Firestore SDK
// interprets it on the wire. For tests we use unique branded markers so
// assertions can verify the sentinel landed in the right field without
// depending on the real SDK.
const DELETE_FIELD_SENTINEL = Symbol('test:deleteField()');
const SERVER_TIMESTAMP_SENTINEL = Symbol('test:serverTimestamp()');
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteField: vi.fn(() => DELETE_FIELD_SENTINEL),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => SERVER_TIMESTAMP_SENTINEL),
  // Timestamp.fromMillis is used by resumeAssignment to compute the
  // idle-refresh cutoff filter. Return a branded object so tests can
  // verify the value flowed through to the query() args without pulling
  // in the real SDK Timestamp class.
  Timestamp: {
    fromMillis: vi.fn((ms: number) => ({ __testTimestamp: ms })),
  },
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

// Mock the synced-quiz integration so the hook tests don't pull a real
// Firestore listener or Cloud Function callable into scope. The mocks
// expose `vi.fn()` shims so individual tests can override per-call
// behavior (e.g. canonical content for syncAssignmentToLatest).
vi.mock('@/hooks/useSyncedQuizGroups', () => ({
  callJoinSyncedQuizGroup: vi.fn(),
  callLeaveSyncedQuizGroup: vi.fn(),
  createSyncedQuizGroup: vi.fn(),
  pullSyncedQuizContent: vi.fn(),
  publishSyncedQuiz: vi.fn(),
  useSyncedQuizGroupsByIds: vi.fn(() => ({
    groups: new Map(),
    loading: false,
  })),
  SyncedQuizVersionConflictError: class extends Error {},
}));

// `useQuizAssignments.createAssignment` reads `auth.currentUser` to
// snapshot the owner's display name + email into the PLC assignment
// index when the new assignment opts into PLC mode. Hold the user object
// in a mutable cell so individual PLC-side-effect tests can swap it.
const authMock: {
  currentUser: { displayName?: string; email?: string } | null;
} = {
  currentUser: null,
};
vi.mock('@/config/firebase', () => ({
  db: {},
  get auth() {
    return authMock;
  },
}));

// PLC dashboard index — `createAssignment` calls this best-effort when
// `settings.plc` is set. Mocked so tests can assert the canonical payload
// (assignmentId, ownerUid/Name/Email, title, sheetUrl, createdAt) lands
// without exercising the helper's own setDoc path. Resolves to a Promise
// so the production code's `void` discard is safe.
const writePlcAssignmentIndexEntryMock = vi
  .fn<(plcId: string, entry: Record<string, unknown>) => Promise<void>>()
  .mockResolvedValue(undefined);
const mirrorPlcAssignmentStatusMock = vi
  .fn<(plcId: string, assignmentId: string, status: string) => Promise<void>>()
  .mockResolvedValue(undefined);
vi.mock('@/hooks/usePlcAssignmentIndex', () => ({
  writePlcAssignmentIndexEntry: (
    plcId: string,
    entry: Record<string, unknown>
  ) => writePlcAssignmentIndexEntryMock(plcId, entry),
  mirrorPlcAssignmentStatus: (
    plcId: string,
    assignmentId: string,
    status: string
  ) => mirrorPlcAssignmentStatusMock(plcId, assignmentId, status),
}));

const writePlcAssignmentTemplateMock = vi
  .fn<
    (
      plcId: string,
      uid: string,
      input: Record<string, unknown>
    ) => Promise<void>
  >()
  .mockResolvedValue(undefined);
vi.mock('@/hooks/usePlcAssignments', () => ({
  writePlcAssignmentTemplate: (
    plcId: string,
    uid: string,
    input: Record<string, unknown>
  ) => writePlcAssignmentTemplateMock(plcId, uid, input),
}));

// PLC contribution cleanup — `deleteAssignment` and
// `updateAssignmentSettings({plc: undefined})` call this so orphan
// contribution docs don't keep distorting teammates' PlcTab aggregates.
// Tests assert it's invoked with the right args; we don't need a real
// Firestore write here.
const deletePlcContributionMock = vi
  .fn<
    (args: {
      plcId: string;
      quizId: string;
      teacherUid: string;
    }) => Promise<void>
  >()
  .mockResolvedValue(undefined);
vi.mock('@/utils/plcContributions', () => ({
  deletePlcContribution: (args: {
    plcId: string;
    quizId: string;
    teacherUid: string;
  }) => deletePlcContributionMock(args),
}));

const mockCollection = collection as Mock;
const mockDeleteField = deleteField as Mock;
const mockDoc = doc as Mock;
const mockGetDoc = getDoc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockWriteBatch = writeBatch as Mock;

const TEACHER_UID = 'teacher-1';
const ASSIGNMENT_ID = 'assignment-1';

function makePublicQuestions(n: number): QuizPublicQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    type: 'MC',
    text: `Question ${i}`,
    timeLimit: 30,
    choices: ['a', 'b', 'c', 'd'],
  }));
}

describe('useQuizAssignments - reopenAssignment', () => {
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();
  const mockGetDocs = getDocs as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    // Address docs as path strings so assertions can inspect which
    // collection+doc the batch.update targeted.
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockReturnValue('coll-ref');
    mockOnSnapshot.mockReturnValue(() => undefined);
    batchUpdate.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    });
    // `resumeAssignment` now batch-refreshes `lastWriteAt` on every
    // joined/in-progress response so the idle-finalize cron doesn't
    // force-finalize students on the next tick after resume. The
    // reopen + resume tests don't seed any live responses, so an
    // empty snapshot is the right default; tests that exercise the
    // refresh behavior override this with their own mock.
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
  });

  function findSessionPatch(): Record<string, unknown> {
    // The session doc path is `quiz_sessions/<id>` (see
    // QUIZ_SESSIONS_COLLECTION). Locate that call among the two
    // batch.update invocations (assignment doc + session doc).
    const sessionCall = batchUpdate.mock.calls.find(
      ([ref]) => typeof ref === 'string' && ref.startsWith('quiz_sessions/')
    );
    if (!sessionCall)
      throw new Error('expected batch.update on quiz_sessions/*');
    return sessionCall[1] as Record<string, unknown>;
  }

  function findAssignmentPatch(): Record<string, unknown> {
    const assignmentCall = batchUpdate.mock.calls.find(
      ([ref]) =>
        typeof ref === 'string' &&
        ref.startsWith(`users/${TEACHER_UID}/quiz_assignments/`)
    );
    if (!assignmentCall)
      throw new Error(
        'expected batch.update on users/<uid>/quiz_assignments/*'
      );
    return assignmentCall[1] as Record<string, unknown>;
  }

  it('resets currentQuestionIndex to -1 and questionPhase to "answering" for a teacher-paced session that auto-ended', async () => {
    const totalQuestions = 5;
    const session: Partial<QuizSession> = {
      id: ASSIGNMENT_ID,
      sessionMode: 'teacher',
      status: 'ended',
      // Natural auto-end: advanceQuestion set index to totalQuestions.
      currentQuestionIndex: totalQuestions,
      totalQuestions,
      publicQuestions: makePublicQuestions(totalQuestions),
      startedAt: 1000,
      endedAt: 2000,
    };
    mockGetDoc.mockResolvedValueOnce({ data: () => session });

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));

    await act(async () => {
      await result.current.reopenAssignment(ASSIGNMENT_ID);
    });

    const sessionPatch = findSessionPatch();
    expect(sessionPatch).toMatchObject({
      status: 'paused',
      autoProgressAt: null,
      endedAt: null,
      currentQuestionIndex: -1,
      questionPhase: 'answering',
    });

    const assignmentPatch = findAssignmentPatch();
    expect(assignmentPatch).toMatchObject({ status: 'paused' });

    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('resets currentQuestionIndex to 0 for a student-paced session that auto-ended (defensive)', async () => {
    const totalQuestions = 3;
    const session: Partial<QuizSession> = {
      id: ASSIGNMENT_ID,
      sessionMode: 'student',
      status: 'ended',
      // Even though student-paced sessions don't call advanceQuestion in
      // practice, be defensive: any session that somehow ended with an
      // out-of-bounds index should resume at the start.
      currentQuestionIndex: totalQuestions,
      totalQuestions,
      publicQuestions: makePublicQuestions(totalQuestions),
      startedAt: 1000,
      endedAt: 2000,
    };
    mockGetDoc.mockResolvedValueOnce({ data: () => session });

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));

    await act(async () => {
      await result.current.reopenAssignment(ASSIGNMENT_ID);
    });

    const sessionPatch = findSessionPatch();
    expect(sessionPatch).toMatchObject({
      status: 'paused',
      autoProgressAt: null,
      endedAt: null,
      currentQuestionIndex: 0,
      questionPhase: 'answering',
    });
  });

  it('does NOT touch currentQuestionIndex when the session was manually stopped mid-quiz', async () => {
    // deactivateAssignment sets status='ended' but leaves currentQuestionIndex alone.
    // Re-opening should leave the teacher on the same question they stopped on.
    const session: Partial<QuizSession> = {
      id: ASSIGNMENT_ID,
      sessionMode: 'teacher',
      status: 'ended',
      currentQuestionIndex: 2,
      totalQuestions: 5,
      publicQuestions: makePublicQuestions(5),
      startedAt: 1000,
      endedAt: 2000,
    };
    mockGetDoc.mockResolvedValueOnce({ data: () => session });

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));

    await act(async () => {
      await result.current.reopenAssignment(ASSIGNMENT_ID);
    });

    const sessionPatch = findSessionPatch();
    expect(sessionPatch).toMatchObject({
      status: 'paused',
      autoProgressAt: null,
      endedAt: null,
    });
    expect(sessionPatch).not.toHaveProperty('currentQuestionIndex');
    expect(sessionPatch).not.toHaveProperty('questionPhase');
  });

  it('leaves the session usable: after reopen+resume, student-side polling at index 0 returns a real question', async () => {
    // End-to-end coverage for the bug: a teacher-paced session that
    // auto-ended used to leave currentQuestionIndex = totalQuestions, so
    // any subsequent resume flipped to 'active' and students looked up
    // publicQuestions[totalQuestions] === undefined → stalled loading UI.
    // After the fix, reopen resets to -1 so resumeAssignment routes to
    // 'waiting'; once the teacher advances, students land on question 0.
    const totalQuestions = 4;
    const publicQuestions = makePublicQuestions(totalQuestions);
    // Mutable shared state so resumeAssignment reads what reopenAssignment wrote.
    const sessionState: Partial<QuizSession> = {
      id: ASSIGNMENT_ID,
      sessionMode: 'teacher',
      status: 'ended',
      currentQuestionIndex: totalQuestions, // natural auto-end
      totalQuestions,
      publicQuestions,
      startedAt: 1000,
      endedAt: 2000,
    };

    mockGetDoc.mockImplementation(() =>
      Promise.resolve({ data: () => sessionState })
    );

    // Stitch the batch through sessionState so the second call (resume)
    // sees the state written by the first (reopen).
    batchUpdate.mockImplementation(
      (ref: string, patch: Record<string, unknown>) => {
        if (ref.startsWith('quiz_sessions/')) {
          Object.assign(sessionState, patch);
        }
      }
    );

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));

    await act(async () => {
      await result.current.reopenAssignment(ASSIGNMENT_ID);
    });

    // After reopen: index is back in a sane resume point and publicQuestions[0]
    // is the real first question — the session is no longer stalled.
    expect(sessionState.currentQuestionIndex).toBe(-1);
    expect(sessionState.questionPhase).toBe('answering');
    expect(sessionState.status).toBe('paused');
    expect(sessionState.endedAt).toBeNull();
    // The bug was `publicQuestions[currentQuestionIndex]` being undefined;
    // question 0 must still be there and available for students to see once
    // the teacher advances.
    expect(publicQuestions[0]).toBeDefined();
    expect(publicQuestions[0].id).toBe('q0');

    batchUpdate.mockClear();
    batchCommit.mockClear();

    await act(async () => {
      await result.current.resumeAssignment(ASSIGNMENT_ID);
    });

    // resumeAssignment sees `currentQuestionIndex < 0` and routes to
    // 'waiting' rather than 'active'. That means a student polling the
    // session sees the waiting room instead of a missing question — and
    // publicQuestions[0] is still intact for the teacher's first advance.
    const resumeSessionCall = batchUpdate.mock.calls.find(([ref]) =>
      (ref as string).startsWith('quiz_sessions/')
    );
    if (!resumeSessionCall)
      throw new Error('expected resume batch.update on quiz_sessions/*');
    expect(resumeSessionCall[1]).toMatchObject({ status: 'waiting' });
  });

  it('resumeAssignment refreshes lastWriteAt on every joined/in-progress response BEFORE flipping session status, so a concurrent cron tick still sees paused and skips', async () => {
    // Regression shield for PR #1736 review finding: the cron
    // (functions/src/finalizeIdleQuizAttempts.ts) skips parent-status
    // 'paused' / 'waiting', but if a teacher pauses on Friday and
    // resumes Monday, `session.status` flips to 'active' while every
    // response's `lastWriteAt` is still 48h+ stale. The refresh stamps
    // `lastWriteAt: serverTimestamp()` on each joined/in-progress
    // response so the cron's idle threshold restarts from now.
    //
    // Critically, the refresh MUST commit before the status flip so a
    // cron tick landing between the two operations still reads
    // status='paused' and skips. This test pins both the field value
    // (sentinel identity), the commit call (mock.commit invoked at
    // least once for the response batch), and the ORDER (response
    // batches before the session-flip batch).
    const session: Partial<QuizSession> = {
      id: ASSIGNMENT_ID,
      sessionMode: 'teacher',
      status: 'paused',
      currentQuestionIndex: 2,
      totalQuestions: 5,
      startedAt: 1000,
    };
    mockGetDoc.mockResolvedValueOnce({ data: () => session });

    // Three live responses (2 joined, 1 in-progress) and one already-
    // completed response that should NOT be touched. Snapshot `ref` is
    // a DocumentReference in production; we mock it as an object with
    // a `path` getter so assertions can inspect the path while still
    // exercising the same shape the production code passes through to
    // `batch.update(respSnap.ref, ...)`.
    const respRefs = {
      r1: { path: 'quiz_sessions/asg-1/responses/r1' },
      r2: { path: 'quiz_sessions/asg-1/responses/r2' },
      r3: { path: 'quiz_sessions/asg-1/responses/r3' },
    };
    mockGetDocs.mockResolvedValueOnce({
      empty: false,
      docs: [{ ref: respRefs.r1 }, { ref: respRefs.r2 }, { ref: respRefs.r3 }],
    });

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));

    await act(async () => {
      await result.current.resumeAssignment(ASSIGNMENT_ID);
    });

    // Every live response got a lastWriteAt: serverTimestamp() update.
    // Asserting on the sentinel identity AND that serverTimestamp() was
    // actually called proves the production code didn't substitute a
    // client-side Date.now() or hard-code the sentinel literal — the
    // firestore.rules predicate `lastWriteAt == request.time` would
    // reject anything that's not the server-resolved timestamp.
    const responseUpdates = batchUpdate.mock.calls.filter(
      ([ref]) =>
        ref &&
        typeof ref === 'object' &&
        typeof (ref as { path?: string }).path === 'string' &&
        (ref as { path: string }).path.includes('/responses/')
    );
    expect(responseUpdates).toHaveLength(3);
    for (const [, patch] of responseUpdates) {
      expect(patch).toEqual({ lastWriteAt: SERVER_TIMESTAMP_SENTINEL });
    }
    expect(serverTimestamp).toHaveBeenCalled();

    // Order invariant: every response-doc batch.update must precede
    // the session-doc batch.update. If a refactor reverses the order,
    // a cron tick between the flip and the refresh would force-
    // finalize the very students the refresh is meant to protect.
    const callIndex = batchUpdate.mock.calls.findIndex(([ref]) => {
      const refObj = ref as { path?: string } | string;
      if (typeof refObj === 'object' && refObj?.path) return false; // response ref
      return (
        typeof refObj === 'string' &&
        refObj.startsWith('quiz_sessions/') &&
        !refObj.includes('/responses/')
      );
    });
    const lastResponseIndex = batchUpdate.mock.calls.reduce<number>(
      (max, [ref], i) => {
        if (
          ref &&
          typeof ref === 'object' &&
          typeof (ref as { path?: string }).path === 'string' &&
          (ref as { path: string }).path.includes('/responses/')
        ) {
          return i;
        }
        return max;
      },
      -1
    );
    expect(callIndex).toBeGreaterThan(-1);
    expect(lastResponseIndex).toBeGreaterThan(-1);
    expect(lastResponseIndex).toBeLessThan(callIndex);

    // The response batch must commit (not just stage) — a refactor
    // that forgets the trailing `if (opsInBatch > 0) await
    // batch.commit()` would leave staged writes uncommitted and the
    // next cron tick would force-finalize the unrefreshed responses.
    // With 3 responses < BATCH_LIMIT=450, the tail commit is the only
    // commit path that fires for the response batch.
    expect(batchCommit).toHaveBeenCalled();
  });
});

describe('useQuizAssignments - importSharedAssignment', () => {
  const batchSet = vi.fn();
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();
  const mockGetDocs = getDocs as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockReturnValue('coll-ref');
    mockOnSnapshot.mockReturnValue(() => undefined);
    // allocateJoinCode probes for code collisions; return empty so the
    // first generated code wins.
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    batchSet.mockReset();
    batchUpdate.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      set: batchSet,
      update: batchUpdate,
      commit: batchCommit,
    });
  });

  function findAssignmentSet(): Record<string, unknown> {
    const call = batchSet.mock.calls.find(
      ([ref]) =>
        typeof ref === 'string' &&
        ref.startsWith(`users/${TEACHER_UID}/quiz_assignments/`)
    );
    if (!call) throw new Error('expected batch.set on assignment doc');
    return call[1] as Record<string, unknown>;
  }

  it('clears the originator-scoped PLC linkage (plc sub-object) so the importer is not bound to the originator’s PLC', async () => {
    // Pre-PlcLinkage docs were flat; the migration mapper folds them into
    // `plc` on read. Use the LEGACY shape here to exercise the mapper
    // path inside importSharedAssignment.
    const sharedDoc = {
      title: 'Quiz Title',
      questions: [],
      createdAt: 1000,
      updatedAt: 1000,
      assignmentSettings: {
        sessionMode: 'teacher',
        sessionOptions: {},
        plcMode: true,
        plcId: 'originator-plc',
        plcName: 'Originator PLC',
        plcSheetUrl:
          'https://docs.google.com/spreadsheets/d/originator-sheet-id',
        plcMemberEmails: ['origA@example.com', 'origB@example.com'],
        className: "Mrs. Smith's 3rd Period",
        teacherName: 'Originator Teacher',
        periodNames: ['Period 1'],
      },
      originalAuthor: 'originator-uid',
      sharedAt: 1000,
    } as unknown as SharedQuizAssignment;
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => sharedDoc,
    });

    const saveQuiz = vi.fn().mockResolvedValue({
      id: 'importer-quiz-id',
      driveFileId: 'importer-drive-id',
    });

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.importSharedAssignment('share-id', saveQuiz);
    });

    const assignment = findAssignmentSet();
    // After refactor: a single `plc` sub-object replaces the flat fields.
    // For a non-member importer the linkage is stripped entirely, AND
    // the legacy fields must not leak through onto the imported doc.
    expect(assignment.plc).toBeUndefined();
    expect(assignment.plcMode).toBeUndefined();
    expect(assignment.plcSheetUrl).toBeUndefined();
    expect(assignment.plcMemberEmails).toBeUndefined();
    // className / teacherName / periodNames are also originator-scoped:
    expect(assignment.className).toBeUndefined();
    expect(assignment.teacherName).toBeUndefined();
    expect(assignment.periodNames).toBeUndefined();
    // The teacherUid on the assignment must be the importer, not the originator:
    expect(assignment.teacherUid).toBe(TEACHER_UID);
  });

  it('preserves the PLC linkage for an importer that is a current member of the share’s PLC', async () => {
    const sharedDoc = {
      title: 'Quiz Title',
      questions: [],
      createdAt: 1,
      updatedAt: 1,
      assignmentSettings: {
        sessionMode: 'teacher',
        sessionOptions: {},
        plc: {
          id: 'plc-shared',
          name: 'Shared PLC',
          sheetUrl: 'https://docs.google.com/spreadsheets/d/shared-sheet',
          memberEmails: ['a@example.com', 'b@example.com'],
        },
      },
      originalAuthor: 'originator-uid',
      sharedAt: 1,
    } as unknown as SharedQuizAssignment;
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => sharedDoc,
    });

    const saveQuiz = vi.fn().mockResolvedValue({ id: 'q', driveFileId: 'd' });
    const onNonMember = vi.fn();

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.importSharedAssignment(
        'share-id',
        saveQuiz,
        undefined,
        {
          isMember: (id) => id === 'plc-shared',
          onNonMember,
        }
      );
    });

    const assignment = findAssignmentSet();
    expect(assignment.plc).toEqual({
      id: 'plc-shared',
      name: 'Shared PLC',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/shared-sheet',
      memberEmails: ['a@example.com', 'b@example.com'],
    });
    // Member path: the non-member nudge must NOT fire.
    expect(onNonMember).not.toHaveBeenCalled();
  });

  it('creates the imported assignment in paused state so students cannot join before the teacher targets it', async () => {
    const sharedDoc: Partial<SharedQuizAssignment> = {
      title: 'Quiz',
      questions: [],
      createdAt: 1,
      updatedAt: 1,
      assignmentSettings: { sessionMode: 'teacher', sessionOptions: {} },
      originalAuthor: 'originator-uid',
      sharedAt: 1,
    };
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => sharedDoc,
    });

    const saveQuiz = vi.fn().mockResolvedValue({
      id: 'q',
      driveFileId: 'd',
    });

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.importSharedAssignment('share-id', saveQuiz);
    });

    const assignment = findAssignmentSet();
    expect(assignment.status).toBe('paused');

    // The session doc set in the same batch must also be non-active —
    // for a teacher-paced session with initialStatus='paused', the
    // session status maps to 'paused' (see createAssignment session
    // status branch).
    const sessionCall = batchSet.mock.calls.find(
      ([ref]) => typeof ref === 'string' && ref.startsWith('quiz_sessions/')
    );
    if (!sessionCall) throw new Error('expected batch.set on session doc');
    expect(sessionCall[1]).toMatchObject({ status: 'paused' });
  });

  it('does not carry classIds/rosterIds onto the importer session even when the shared doc carries them', async () => {
    // shareAssignment doesn't write these fields today, but a future
    // bug or migration could. Defend at the import layer so a
    // regression doesn't silently send the importer's students to the
    // ORIGINATOR's ClassLink classes.
    const sharedDoc: Record<string, unknown> = {
      title: 'Quiz',
      questions: [],
      createdAt: 1,
      updatedAt: 1,
      assignmentSettings: {
        sessionMode: 'teacher',
        sessionOptions: {},
        // simulate a defensively-tested polluted shared doc
        classIds: ['originator-cl-class-A'],
        rosterIds: ['originator-roster-1'],
      },
      originalAuthor: 'originator-uid',
      sharedAt: 1,
    };
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => sharedDoc,
    });

    const saveQuiz = vi.fn().mockResolvedValue({ id: 'q', driveFileId: 'd' });
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.importSharedAssignment('share-id', saveQuiz);
    });

    const sessionCall = batchSet.mock.calls.find(
      ([ref]) => typeof ref === 'string' && ref.startsWith('quiz_sessions/')
    );
    if (!sessionCall) throw new Error('expected batch.set on session doc');
    const session = sessionCall[1] as Record<string, unknown>;
    // createAssignment only writes classIds/classId when targetClassIds
    // is non-empty. importSharedAssignment passes neither classIds nor
    // rosterIds, so these fields must not appear on the session.
    expect(session.classIds).toBeUndefined();
    expect(session.classId).toBeUndefined();
    expect(session.rosterIds).toBeUndefined();
  });

  it('rolls back the just-saved quiz when assignment creation fails', async () => {
    const sharedDoc: Partial<SharedQuizAssignment> = {
      title: 'Q',
      questions: [],
      createdAt: 1,
      updatedAt: 1,
      assignmentSettings: { sessionMode: 'teacher', sessionOptions: {} },
      originalAuthor: 'orig',
      sharedAt: 1,
    };
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => sharedDoc,
    });
    // Make the batch commit fail to simulate the assignment-create error.
    batchCommit.mockReset().mockRejectedValueOnce(new Error('Firestore down'));

    const saveQuiz = vi.fn().mockResolvedValue({
      id: 'orphan-quiz',
      driveFileId: 'orphan-drive',
    });
    const rollbackQuiz = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await expect(
        result.current.importSharedAssignment(
          'share-id',
          saveQuiz,
          rollbackQuiz
        )
      ).rejects.toThrow('Firestore down');
    });

    expect(rollbackQuiz).toHaveBeenCalledTimes(1);
    expect(rollbackQuiz).toHaveBeenCalledWith({
      id: 'orphan-quiz',
      driveFileId: 'orphan-drive',
    });
  });
});

describe('useQuizAssignments - setAssignmentRosters', () => {
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockReturnValue('coll-ref');
    mockOnSnapshot.mockReturnValue(() => undefined);
    batchUpdate.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    });
  });

  it('mirrors targets to BOTH the assignment doc and the session doc so the student class-gate stays in sync', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));

    await act(async () => {
      await result.current.setAssignmentRosters(ASSIGNMENT_ID, {
        rosterIds: ['roster-1', 'roster-2'],
        classIds: ['cl-class-A'],
        periodNames: ['Period 1', 'Period 2'],
        classPeriodByClassId: { 'cl-class-A': 'Period 1' },
      });
    });

    const assignmentCall = batchUpdate.mock.calls.find(
      ([ref]) =>
        typeof ref === 'string' &&
        ref.startsWith(`users/${TEACHER_UID}/quiz_assignments/`)
    );
    if (!assignmentCall)
      throw new Error('expected batch.update on assignment doc');
    expect(assignmentCall[1]).toMatchObject({
      rosterIds: ['roster-1', 'roster-2'],
      periodNames: ['Period 1', 'Period 2'],
      periodName: 'Period 1',
    });

    const sessionCall = batchUpdate.mock.calls.find(
      ([ref]) => typeof ref === 'string' && ref.startsWith('quiz_sessions/')
    );
    if (!sessionCall) throw new Error('expected batch.update on session doc');
    expect(sessionCall[1]).toMatchObject({
      rosterIds: ['roster-1', 'roster-2'],
      classIds: ['cl-class-A'],
      classId: 'cl-class-A',
      periodNames: ['Period 1', 'Period 2'],
      classPeriodByClassId: { 'cl-class-A': 'Period 1' },
    });

    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('drops empty-string entries from rosterIds/classIds/periodNames before writing', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.setAssignmentRosters(ASSIGNMENT_ID, {
        rosterIds: ['r1', '', 'r2'],
        classIds: ['', 'cl-A'],
        periodNames: ['', 'Period 2'],
        classPeriodByClassId: { 'cl-A': 'Period 2' },
      });
    });

    const sessionCall = batchUpdate.mock.calls.find(
      ([ref]) => typeof ref === 'string' && ref.startsWith('quiz_sessions/')
    );
    if (!sessionCall) throw new Error('expected batch.update on session doc');
    expect(sessionCall[1]).toMatchObject({
      rosterIds: ['r1', 'r2'],
      classIds: ['cl-A'],
      classId: 'cl-A',
      periodNames: ['Period 2'],
    });
  });

  it('writes empty arrays + empty classId/periodName when all inputs are empty (untargeted)', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.setAssignmentRosters(ASSIGNMENT_ID, {
        rosterIds: [],
        classIds: [],
        periodNames: [],
        classPeriodByClassId: {},
      });
    });

    const sessionCall = batchUpdate.mock.calls.find(
      ([ref]) => typeof ref === 'string' && ref.startsWith('quiz_sessions/')
    );
    if (!sessionCall) throw new Error('expected batch.update on session doc');
    expect(sessionCall[1]).toMatchObject({
      classId: '',
      rosterIds: [],
      classIds: [],
      classPeriodByClassId: {},
    });

    const assignmentCall = batchUpdate.mock.calls.find(
      ([ref]) =>
        typeof ref === 'string' &&
        ref.startsWith(`users/${TEACHER_UID}/quiz_assignments/`)
    );
    if (!assignmentCall)
      throw new Error('expected batch.update on assignment doc');
    expect(assignmentCall[1]).toMatchObject({
      periodName: '',
      rosterIds: [],
    });
  });
});

describe('useQuizAssignments - updateAssignmentSettings', () => {
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockReturnValue('coll-ref');
    mockOnSnapshot.mockReturnValue(() => undefined);
    batchUpdate.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    });
  });

  function findAssignmentPatch(): Record<string, unknown> {
    const call = batchUpdate.mock.calls.find(
      ([ref]) =>
        typeof ref === 'string' &&
        ref.startsWith(`users/${TEACHER_UID}/quiz_assignments/`)
    );
    if (!call) throw new Error('expected batch.update on assignment doc');
    return call[1] as Record<string, unknown>;
  }

  it('translates explicit-undefined plc into deleteField() so toggle-OFF actually clears the linkage', async () => {
    // Firestore is initialized with `ignoreUndefinedProperties: true`, so a
    // raw `{ plc: undefined }` patch would be silently dropped on the wire
    // and the existing `plc` field would stay on the doc. The hook must
    // translate explicit-undefined into the deleteField() sentinel.
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));

    await act(async () => {
      await result.current.updateAssignmentSettings(ASSIGNMENT_ID, {
        plc: undefined,
      });
    });

    const patch = findAssignmentPatch();
    expect(patch.plc).toBe(DELETE_FIELD_SENTINEL);
    expect(mockDeleteField).toHaveBeenCalledTimes(1);
  });

  it('passes a real plc patch through unchanged (no deleteField translation)', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    const linkage = {
      id: 'plc-1',
      name: 'Test PLC',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-id',
      memberEmails: ['a@example.com'],
    };

    await act(async () => {
      await result.current.updateAssignmentSettings(ASSIGNMENT_ID, {
        plc: linkage,
      });
    });

    const patch = findAssignmentPatch();
    expect(patch.plc).toEqual(linkage);
    // No clear-intent, so the deleteField sentinel was never minted.
    expect(mockDeleteField).not.toHaveBeenCalled();
  });

  it('does not translate to deleteField() when the plc key is absent from the patch (only explicit-undefined triggers clear)', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));

    await act(async () => {
      await result.current.updateAssignmentSettings(ASSIGNMENT_ID, {
        className: 'Period 3',
      });
    });

    const patch = findAssignmentPatch();
    expect(patch).not.toHaveProperty('plc');
    expect(mockDeleteField).not.toHaveBeenCalled();
  });
});

describe('useQuizAssignments - syncAssignmentToLatest', () => {
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();
  const mockGetDocs = getDocs as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockOnSnapshot.mockReturnValue(() => undefined);
    batchUpdate.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    });
  });

  it('returns updated:false without writing when the assignment is not synced', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        id: ASSIGNMENT_ID,
        teacherUid: TEACHER_UID,
        // no syncGroupId — copy-mode assignment
      }),
    });

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    let outcome: Awaited<
      ReturnType<typeof result.current.syncAssignmentToLatest>
    > = { updated: false, version: 0, taggedResponseCount: 0 };
    await act(async () => {
      outcome = await result.current.syncAssignmentToLatest(ASSIGNMENT_ID);
    });

    expect(outcome).toEqual({
      updated: false,
      version: 0,
      taggedResponseCount: 0,
    });
    // No batch should have been opened — the early return precedes any
    // write activity.
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('returns updated:false when the canonical version is not ahead of the assignment snapshot', async () => {
    // Pull the synced-quizzes module so we can override the per-call
    // mock without touching the global `vi.mock` factory.
    const { pullSyncedQuizContent } =
      await import('@/hooks/useSyncedQuizGroups');
    (pullSyncedQuizContent as Mock).mockResolvedValueOnce({
      title: 'Quiz Title',
      questions: [
        {
          id: 'q0',
          text: 'Q0',
          type: 'MC',
          correctAnswer: 'a',
          incorrectAnswers: ['b', 'c', 'd'],
          timeLimit: 30,
        },
      ],
      version: 3,
    });
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        id: ASSIGNMENT_ID,
        teacherUid: TEACHER_UID,
        sync: { groupId: 'group-1', syncedVersion: 3 },
      }),
    });

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    let outcome: Awaited<
      ReturnType<typeof result.current.syncAssignmentToLatest>
    > = { updated: false, version: 0, taggedResponseCount: 0 };
    await act(async () => {
      outcome = await result.current.syncAssignmentToLatest(ASSIGNMENT_ID);
    });

    expect(outcome).toEqual({
      updated: false,
      version: 3,
      taggedResponseCount: 0,
    });
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('rebuilds the session questions, bumps assignment.syncedVersion, and tags pre-existing responses', async () => {
    const { pullSyncedQuizContent } =
      await import('@/hooks/useSyncedQuizGroups');
    const newQuestions = [
      {
        id: 'q0',
        text: 'Q0',
        type: 'MC' as const,
        correctAnswer: 'a',
        incorrectAnswers: ['b', 'c', 'd'],
        timeLimit: 30,
      },
      {
        id: 'q1',
        text: 'Q1',
        type: 'MC' as const,
        correctAnswer: 'a',
        incorrectAnswers: ['b', 'c', 'd'],
        timeLimit: 30,
      },
    ];
    (pullSyncedQuizContent as Mock).mockResolvedValueOnce({
      title: 'Updated Title',
      questions: newQuestions,
      version: 4,
    });
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        id: ASSIGNMENT_ID,
        teacherUid: TEACHER_UID,
        quizTitle: 'Old Title',
        sync: { groupId: 'group-1', syncedVersion: 3 },
      }),
    });
    // Two existing responses: one in-progress, one completed. Both should
    // be tagged with the OLD syncedVersion (3) since neither is at or
    // beyond the new version.
    const responseRef1 = { id: 'r1' };
    const responseRef2 = { id: 'r2' };
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { ref: responseRef1, data: () => ({ status: 'in-progress' }) },
        { ref: responseRef2, data: () => ({ status: 'completed' }) },
      ],
    });

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    let outcome: Awaited<
      ReturnType<typeof result.current.syncAssignmentToLatest>
    > = { updated: false, version: 0, taggedResponseCount: 0 };
    await act(async () => {
      outcome = await result.current.syncAssignmentToLatest(ASSIGNMENT_ID);
    });

    expect(outcome).toEqual({
      updated: true,
      version: 4,
      taggedResponseCount: 2,
    });

    const assignmentCall = batchUpdate.mock.calls.find(
      ([ref]) =>
        typeof ref === 'string' &&
        ref.startsWith(`users/${TEACHER_UID}/quiz_assignments/`)
    );
    if (!assignmentCall) {
      throw new Error('expected batch.update on assignment doc');
    }
    // Title is intentionally NOT overwritten — the teacher's local
    // quiz title is independent of the canonical synced title.
    expect(assignmentCall[1]).toMatchObject({
      sync: { groupId: 'group-1', syncedVersion: 4 },
    });
    expect(assignmentCall[1]).not.toHaveProperty('quizTitle');

    const sessionCall = batchUpdate.mock.calls.find(
      ([ref]) => typeof ref === 'string' && ref.startsWith('quiz_sessions/')
    );
    if (!sessionCall) {
      throw new Error('expected batch.update on session doc');
    }
    expect(sessionCall[1]).toMatchObject({ totalQuestions: 2 });
    expect(sessionCall[1]).not.toHaveProperty('quizTitle');
    // publicQuestions is rebuilt — verify the count and the no-correctAnswer
    // shape (toPublicQuestion strips the answer key + shuffles MC choices).
    const publicQuestions = (sessionCall[1] as { publicQuestions: unknown[] })
      .publicQuestions;
    expect(publicQuestions).toHaveLength(2);

    // Both response docs must be tagged with the OLD syncedVersion so the
    // results UI can render the "answered before v4" chip.
    expect(batchUpdate).toHaveBeenCalledWith(responseRef1, {
      preSyncVersion: 3,
    });
    expect(batchUpdate).toHaveBeenCalledWith(responseRef2, {
      preSyncVersion: 3,
    });
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('queries only responses with preSyncVersion == 0 (server-side skip of already-tagged rows)', async () => {
    const { pullSyncedQuizContent } =
      await import('@/hooks/useSyncedQuizGroups');
    (pullSyncedQuizContent as Mock).mockResolvedValueOnce({
      title: 'T',
      questions: [],
      version: 5,
    });
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        id: ASSIGNMENT_ID,
        teacherUid: TEACHER_UID,
        sync: { groupId: 'group-1', syncedVersion: 4 },
      }),
    });
    const refFresh = { id: 'fresh' };
    // The server-side `where('preSyncVersion', '==', 0)` query returns
    // only responses that have never been tagged — already-tagged
    // docs are filtered out at the Firestore boundary, so they never
    // reach the client. We simulate that by only including the
    // untagged fresh response in the mock result.
    mockGetDocs.mockResolvedValueOnce({
      docs: [{ ref: refFresh, data: () => ({ status: 'completed' }) }],
    });

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    let outcome: Awaited<
      ReturnType<typeof result.current.syncAssignmentToLatest>
    > = { updated: false, version: 0, taggedResponseCount: 0 };
    await act(async () => {
      outcome = await result.current.syncAssignmentToLatest(ASSIGNMENT_ID);
    });

    expect(outcome.taggedResponseCount).toBe(1);
    // The query was called with the right where-clause: `== 0`.
    // Verifies the server-side filter shape, not just that the
    // function returned the right count.
    const { where } = await import('firebase/firestore');
    expect(where).toHaveBeenCalledWith('preSyncVersion', '==', 0);
    // The fresh untagged doc gets tagged.
    const updatedRefs = batchUpdate.mock.calls.map(
      (call: unknown[]) => call[0]
    );
    expect(updatedRefs).toContain(refFresh);
  });
});

describe('useQuizAssignments - publishAssignmentScores', () => {
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();
  const mockGetDocs = getDocs as Mock;

  // A small canonical quiz used across the publish tests. Two MC questions,
  // 1 point each, so the published-score arithmetic is easy to assert.
  const quizData = {
    id: 'quiz-1',
    title: 'Test Quiz',
    questions: [
      {
        id: 'q0',
        text: 'Q0',
        type: 'MC' as const,
        correctAnswer: 'a',
        incorrectAnswers: ['b', 'c', 'd'],
        timeLimit: 30,
        points: 1,
      },
      {
        id: 'q1',
        text: 'Q1',
        type: 'MC' as const,
        correctAnswer: 'b',
        incorrectAnswers: ['a', 'c', 'd'],
        timeLimit: 30,
        points: 1,
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockOnSnapshot.mockReturnValue(() => undefined);
    batchUpdate.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    });
  });

  it('unpublishAssignmentScores clears flags via deleteField on both docs', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.unpublishAssignmentScores(ASSIGNMENT_ID);
    });

    // Exactly one batch (assignment + session) — no response queries
    // (the unpublish path leaves per-response scores intact).
    expect(mockGetDocs).not.toHaveBeenCalled();
    expect(batchCommit).toHaveBeenCalledTimes(1);

    const assignmentCall = batchUpdate.mock.calls.find(
      ([ref]) =>
        typeof ref === 'string' &&
        ref.startsWith(`users/${TEACHER_UID}/quiz_assignments/`)
    );
    if (!assignmentCall) {
      throw new Error('expected batch.update on assignment doc');
    }
    expect(assignmentCall[1]).toMatchObject({
      scoreVisibility: DELETE_FIELD_SENTINEL,
      scorePublishedAt: DELETE_FIELD_SENTINEL,
    });

    const sessionCall = batchUpdate.mock.calls.find(
      ([ref]) => typeof ref === 'string' && ref.startsWith('quiz_sessions/')
    );
    if (!sessionCall) {
      throw new Error('expected batch.update on session doc');
    }
    expect(sessionCall[1]).toMatchObject({
      scoreVisibility: DELETE_FIELD_SENTINEL,
      scorePublishedAt: DELETE_FIELD_SENTINEL,
      revealedAnswers: DELETE_FIELD_SENTINEL,
    });
  });

  it('unpublishAssignmentScores is idempotent — second call still writes the same patch', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.unpublishAssignmentScores(ASSIGNMENT_ID);
      await result.current.unpublishAssignmentScores(ASSIGNMENT_ID);
    });
    // Two commits, no response reads in either pass.
    expect(mockGetDocs).not.toHaveBeenCalled();
    expect(batchCommit).toHaveBeenCalledTimes(2);
  });

  it("publishAssignmentScores rejects visibility 'none' at runtime", async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await expect(
        // Bypass the `Exclude<…, 'none'>` type guard at runtime.
        (
          result.current.publishAssignmentScores as unknown as (
            id: string,
            data: unknown,
            v: string
          ) => Promise<unknown>
        )(ASSIGNMENT_ID, quizData, 'none')
      ).rejects.toThrow(/unpublishAssignmentScores/);
    });
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('grades responses and writes per-answer isCorrect on score-only publish', async () => {
    // Two responses: a perfect 2/2 and a partial 1/2. Score is the percentage.
    const refPerfect = { id: 'r-perfect' };
    const refPartial = { id: 'r-partial' };
    const refBlank = { id: 'r-blank' };
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          ref: refPerfect,
          data: () => ({
            studentUid: 's1',
            answers: [
              { questionId: 'q0', answer: 'a', answeredAt: 1 },
              { questionId: 'q1', answer: 'b', answeredAt: 2 },
            ],
          }),
        },
        {
          ref: refPartial,
          data: () => ({
            studentUid: 's2',
            answers: [
              { questionId: 'q0', answer: 'a', answeredAt: 1 },
              { questionId: 'q1', answer: 'wrong', answeredAt: 2 },
            ],
          }),
        },
        // Student who joined but never answered — both questions count
        // toward the denominator so the score is 0 / 2 = 0%.
        {
          ref: refBlank,
          data: () => ({
            studentUid: 's3',
            answers: [],
          }),
        },
      ],
    });

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      const outcome = await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        quizData,
        'score-only'
      );
      expect(outcome).toEqual({ responsesUpdated: 3 });
    });

    expect(batchCommit).toHaveBeenCalledTimes(1);

    // Session should NOT carry revealedAnswers on score-only — the
    // implementation deleteField()s it for any visibility level below
    // the highest one.
    const sessionCall = batchUpdate.mock.calls.find(
      ([ref]) => typeof ref === 'string' && ref.startsWith('quiz_sessions/')
    );
    if (!sessionCall) throw new Error('expected session update');
    expect(sessionCall[1]).toMatchObject({
      scoreVisibility: 'score-only',
      revealedAnswers: DELETE_FIELD_SENTINEL,
    });
    // `scorePublishedAt` must mirror onto the session doc — the
    // student's `parsePublicationFields` rule requires BOTH fields,
    // and the student listener only sees the session doc. Skipping
    // this mirror leaves every student stuck on "Not graded".
    expect(
      (sessionCall[1] as { scorePublishedAt?: unknown }).scorePublishedAt
    ).toBeTypeOf('number');

    // Per-response patches carry the computed score plus answers with
    // isCorrect tagged. Locate by ref so the order in mock.calls
    // doesn't matter.
    const perfectCall = batchUpdate.mock.calls.find(
      ([ref]) => ref === refPerfect
    );
    const partialCall = batchUpdate.mock.calls.find(
      ([ref]) => ref === refPartial
    );
    const blankCall = batchUpdate.mock.calls.find(([ref]) => ref === refBlank);
    if (!perfectCall || !partialCall || !blankCall) {
      throw new Error('expected updates on all three response refs');
    }
    expect(perfectCall[1]).toMatchObject({ score: 100 });
    expect(
      (perfectCall[1] as { answers: { isCorrect: boolean }[] }).answers
    ).toEqual([
      expect.objectContaining({ questionId: 'q0', isCorrect: true }),
      expect.objectContaining({ questionId: 'q1', isCorrect: true }),
    ]);
    expect(partialCall[1]).toMatchObject({ score: 50 });
    expect(
      (partialCall[1] as { answers: { isCorrect: boolean }[] }).answers
    ).toEqual([
      expect.objectContaining({ questionId: 'q0', isCorrect: true }),
      expect.objectContaining({ questionId: 'q1', isCorrect: false }),
    ]);
    expect(blankCall[1]).toMatchObject({ score: 0, answers: [] });
  });

  it('populates session.revealedAnswers on score-responses-and-answers publish', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] });

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        quizData,
        'score-responses-and-answers'
      );
    });

    const sessionCall = batchUpdate.mock.calls.find(
      ([ref]) => typeof ref === 'string' && ref.startsWith('quiz_sessions/')
    );
    if (!sessionCall) throw new Error('expected session update');
    expect(sessionCall[1]).toMatchObject({
      scoreVisibility: 'score-responses-and-answers',
      revealedAnswers: { q0: 'a', q1: 'b' },
    });
  });

  it('chunks response writes across multiple batches when there are more than 398 responses', async () => {
    // 500 responses — exceeds the 400-write batch budget after the
    // assignment + session writes consume 2 slots, so the remaining
    // 102 spill into a second batch.
    const responseDocs = Array.from({ length: 500 }, (_, i) => ({
      ref: { id: `r${i}` },
      data: () => ({
        studentUid: `s${i}`,
        answers: [{ questionId: 'q0', answer: 'a', answeredAt: 1 }],
      }),
    }));
    mockGetDocs.mockResolvedValueOnce({ docs: responseDocs });

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      const outcome = await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        quizData,
        'score-only'
      );
      expect(outcome).toEqual({ responsesUpdated: 500 });
    });

    // First batch + at least one continuation batch.
    expect(batchCommit.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// createAssignment — PLC dashboard index side effect
// ---------------------------------------------------------------------------
//
// When the new assignment opts into PLC mode (`settings.plc` is present),
// `createAssignment` writes a snapshot under `plcs/{plcId}/assignment_index`
// so every PLC member sees the assignment on the PLC Dashboard's
// Completed Assignments tab. These tests pin the contract:
//
//   - The write fires only when `settings.plc` is set (no PLC linkage =
//     no index churn for solo assignments).
//   - The payload carries the assignment id (matches the source doc),
//     the per-assignment Google Sheets URL (which the security rule
//     validates against the trusted docs.google.com/spreadsheets prefix),
//     and a snapshot of the owner's identity from `auth.currentUser`.
//
// We mock `writePlcAssignmentIndexEntry` rather than hitting Firestore
// so the assertions describe the integration boundary, not the helper's
// internals. The helper itself is tested separately in
// `tests/hooks/usePlcAssignmentIndex.test.ts`.
describe('useQuizAssignments - createAssignment (PLC index side effect)', () => {
  const batchSet = vi.fn();
  const batchCommit = vi.fn();
  const mockGetDocs = getDocs as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockReturnValue('coll-ref');
    mockOnSnapshot.mockReturnValue(() => undefined);
    // allocateJoinCode probes for code collisions; return empty so the
    // first generated code wins.
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    batchSet.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      set: batchSet,
      update: vi.fn(),
      commit: batchCommit,
    });
    writePlcAssignmentIndexEntryMock.mockReset().mockResolvedValue(undefined);
    authMock.currentUser = {
      displayName: 'Alice Owner',
      email: 'Alice@Example.com',
    };
  });

  const QUIZ = {
    id: 'quiz-1',
    title: 'Fractions Quick Check',
    driveFileId: 'drive-1',
    questions: [],
  };

  function plcSettings() {
    return {
      sessionMode: 'teacher' as const,
      sessionOptions: {},
      plc: {
        id: 'plc-42',
        name: 'Math PLC',
        sheetUrl: 'https://docs.google.com/spreadsheets/d/plc-42-sheet',
        memberEmails: ['a@x.com', 'b@x.com'],
      },
    };
  }

  it('writes an index entry to the PLC subcollection when settings.plc is set', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    let returnedId = '';
    await act(async () => {
      const created = await result.current.createAssignment(
        QUIZ,
        plcSettings()
      );
      returnedId = created.id;
    });

    // Exactly one index write per assignment-create.
    expect(writePlcAssignmentIndexEntryMock).toHaveBeenCalledTimes(1);
    const [plcId, entry] = writePlcAssignmentIndexEntryMock.mock.calls[0];

    // Targets the PLC the assignment is linked to.
    expect(plcId).toBe('plc-42');

    // Pins the canonical payload shape. Each field matters:
    //   - `id` matches the source assignment so the dashboard can
    //     join back if it ever needs to.
    //   - `kind: 'quiz'` is the discriminator slot for future video-
    //     activity entries.
    //   - `ownerUid` matches the teacher running the assignment.
    //   - `ownerEmail` is lowercased so it matches across surfaces.
    //   - `sheetUrl` mirrors `settings.plc.sheetUrl` so the firestore
    //     rule's docs.google.com/spreadsheets domain check holds.
    //   - `createdAt` is a number (the same `now` the assignment doc
    //     uses).
    expect(entry).toMatchObject({
      id: returnedId,
      kind: 'quiz',
      ownerUid: TEACHER_UID,
      ownerName: 'Alice Owner',
      ownerEmail: 'alice@example.com',
      title: 'Fractions Quick Check',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/plc-42-sheet',
      // Phase 3: status is stamped on create so the In-progress sub-tab
      // shows the entry immediately. Defaults to 'active' for a fresh
      // assignment; later pause/deactivate/reopen calls mirror the new
      // status fire-and-forget.
      status: 'active',
    });
    expect(typeof entry.createdAt).toBe('number');
  });

  it('Phase 3: mirrors initialStatus into the index entry status field', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.createAssignment(QUIZ, plcSettings(), {
        initialStatus: 'paused',
      });
    });
    const [, entry] = writePlcAssignmentIndexEntryMock.mock.calls[0];
    // A teacher who creates a paused assignment should see it land in
    // the In-progress sub-tab pre-paused, not flicker through 'active'
    // on the way in. Stamping `initialStatus` on the index entry keeps
    // the dashboard consistent with the source assignment's status from
    // the very first snapshot.
    expect(entry.status).toBe('paused');
  });

  it('does NOT write an index entry when settings.plc is absent (solo assignment)', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.createAssignment(QUIZ, {
        sessionMode: 'teacher',
        sessionOptions: {},
        // No `plc` field — solo assignment, no PLC dashboard surfacing.
      });
    });

    // No PLC linkage = no churn on any PLC's assignment_index.
    // Without this guard, every solo assignment would either crash (no
    // plcId) or write to a phantom PLC.
    expect(writePlcAssignmentIndexEntryMock).not.toHaveBeenCalled();
    // Same posture for the Phase 3 template write — solo assignments
    // never become PLC-authored templates.
    expect(writePlcAssignmentTemplateMock).not.toHaveBeenCalled();
  });

  it('Phase 3: writes a PLC assignment template when settings.plc + plcTemplateSyncGroupId are set', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.createAssignment(QUIZ, plcSettings(), {
        plcTemplateSyncGroupId: 'sync-group-abc',
      });
    });

    // Single template write per PLC-mode assignment authored from
    // scratch. Teammates pick the template up from the Library sub-tab.
    expect(writePlcAssignmentTemplateMock).toHaveBeenCalledTimes(1);
    const [plcId, uid, input] = writePlcAssignmentTemplateMock.mock.calls[0];
    expect(plcId).toBe('plc-42');
    expect(uid).toBe(TEACHER_UID);
    expect(input).toMatchObject({
      quizId: 'quiz-1',
      quizTitle: 'Fractions Quick Check',
      syncGroupId: 'sync-group-abc',
      sessionMode: 'teacher',
      sharedByName: 'Alice Owner',
      sharedByEmail: 'alice@example.com',
    });
    // Template id must be a fresh uuid, not the source assignment id —
    // sharing the same quiz to multiple PLCs (or re-sharing after an
    // unshare) needs a unique id per template doc.
    expect(typeof input.plcAssignmentId).toBe('string');
    expect((input.plcAssignmentId as string).length).toBeGreaterThan(0);
  });

  it('Phase 3: skips the template write when skipPlcTemplateWrite is true (Library import re-entry)', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.createAssignment(QUIZ, plcSettings(), {
        plcTemplateSyncGroupId: 'sync-group-abc',
        skipPlcTemplateWrite: true,
      });
    });

    // Picking up an existing template from the PLC Library sub-tab must
    // NOT recursively author another template. The skip flag is the
    // contract that prevents the Library list from doubling on every
    // teammate import.
    expect(writePlcAssignmentTemplateMock).not.toHaveBeenCalled();
    // Index entry write still fires — every PLC-mode assignment, even
    // one created by importing a template, surfaces in the In-progress
    // / Completed sub-tabs.
    expect(writePlcAssignmentIndexEntryMock).toHaveBeenCalledTimes(1);
  });

  it('Phase 3: skips the template write when no syncGroupId is resolvable', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.createAssignment(QUIZ, plcSettings(), {
        // No `plcTemplateSyncGroupId`, no `syncedFrom` — the source quiz
        // isn't yet synced. The hook can't promote a Drive-only quiz to
        // a synced group from here (no Drive content in scope), so it
        // skips the template write rather than minting an unusable stub.
      });
    });

    expect(writePlcAssignmentTemplateMock).not.toHaveBeenCalled();
    // Index entry still fires — that doesn't depend on a synced group.
    expect(writePlcAssignmentIndexEntryMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to empty strings when auth.currentUser has no displayName / email', async () => {
    authMock.currentUser = { displayName: undefined, email: undefined };

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.createAssignment(QUIZ, plcSettings());
    });

    const [, entry] = writePlcAssignmentIndexEntryMock.mock.calls[0];
    // The Firestore schema lock requires both fields to be strings, so
    // the snapshot must coerce missing identity to '' rather than
    // omitting the keys (which would fail `keys().hasOnly([...])`).
    expect(entry.ownerName).toBe('');
    expect(entry.ownerEmail).toBe('');
  });
});
