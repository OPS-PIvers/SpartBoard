/**
 * PR4: publishAssignmentScores accepts a translated FIB answer, read off the
 * teacher-owned assignment doc's `localizedFibAnswers` snapshot.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import type { QuizData } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteField: vi.fn(() => ({ __deleteFieldSentinel: true })),
  doc: vi.fn(),
  documentId: vi.fn(() => '__documentId'),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  query: vi.fn(),
  startAfter: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  Timestamp: { fromMillis: vi.fn((ms: number) => ({ __ts: ms })) },
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

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

vi.mock('@/config/firebase', () => ({
  db: {},
  auth: { currentUser: null },
}));

vi.mock('@/hooks/usePlcAssignmentIndex', () => ({
  writePlcAssignmentIndexEntry: vi.fn().mockResolvedValue(undefined),
  mirrorPlcAssignmentStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/usePlcAssignments', () => ({
  writePlcAssignmentTemplate: vi.fn().mockResolvedValue(undefined),
}));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockGetDoc = getDoc as Mock;
const mockGetDocs = getDocs as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockWriteBatch = writeBatch as Mock;

const TEACHER_UID = 'teacher-1';
const ASSIGNMENT_ID = 'assign-fib-1';

const quizData = {
  id: 'quiz-fib-1',
  title: 'FIB Quiz',
  questions: [
    {
      id: 'q0',
      text: 'The capital of France is ____.',
      type: 'FIB' as const,
      correctAnswer: 'Paris',
      incorrectAnswers: [],
      timeLimit: 30,
      points: 1,
    },
  ],
  createdAt: 0,
  updatedAt: 0,
} satisfies QuizData;

describe('useQuizAssignments — publish grades localized FIB answers', () => {
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();

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

  const responseRef = { id: 'r-1' };

  const publish = async (
    assignmentDoc: Record<string, unknown>,
    answer: string
  ) => {
    mockGetDoc.mockResolvedValue({ data: () => assignmentDoc });
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          ref: responseRef,
          data: () => ({
            studentUid: 'student-1',
            answers: [
              { questionId: 'q0', answer, answeredAt: 1, locale: 'es' },
            ],
          }),
        },
      ],
    });
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        quizData,
        'score-only'
      );
    });
    const call = batchUpdate.mock.calls.find(([r]) => r === responseRef);
    if (!call) throw new Error('expected batch.update on the response');
    return call[1] as {
      score: number;
      answers: { isCorrect?: boolean }[];
    };
  };

  // The teacher-side override is what names the served locale; the response's
  // own `locale` field is client-asserted and must never widen grading.
  const snapshot = {
    localizedFibAnswers: { q0: { es: ['París'], so: ['Baariis'] } },
    overridesByStudentUid: { 'student-1': { language: 'es' } },
  };

  it('scores a translated answer correct against the snapshot', async () => {
    const patch = await publish(snapshot, 'parís');
    expect(patch.score).toBe(100);
    expect(patch.answers[0].isCorrect).toBe(true);
  });

  it('still scores the English answer correct', async () => {
    const patch = await publish(snapshot, 'Paris');
    expect(patch.score).toBe(100);
  });

  it('still scores a wrong answer wrong', async () => {
    const patch = await publish(snapshot, 'Lyon');
    expect(patch.score).toBe(0);
  });

  it('leaves older assignments without the snapshot unchanged', async () => {
    const patch = await publish({}, 'parís');
    expect(patch.score).toBe(0);
  });

  it('rejects a locale the teacher never served this student', async () => {
    const patch = await publish(snapshot, 'Baariis');
    expect(patch.score).toBe(0);
  });

  it('rejects a translation when no override names a served locale', async () => {
    const patch = await publish(
      { localizedFibAnswers: snapshot.localizedFibAnswers },
      'parís'
    );
    expect(patch.score).toBe(0);
  });

  it('still accepts English when no override names a served locale', async () => {
    const patch = await publish(
      { localizedFibAnswers: snapshot.localizedFibAnswers },
      'Paris'
    );
    expect(patch.score).toBe(100);
  });
});
