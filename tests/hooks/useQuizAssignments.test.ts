import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import type { QuizPublicQuestion, QuizSession } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
}));

const mockCollection = collection as Mock;
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
});
