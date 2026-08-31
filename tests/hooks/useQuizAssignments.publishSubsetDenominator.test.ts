/**
 * M17 C3/C4: publishAssignmentScores must compute each student's denominator
 * from their served subset (`override.questionIds`), read off the teacher's
 * own assignment doc as `overridesByStudentUid`. Before the fix, questions
 * outside a targeted student's subset counted as unanswered and deflated the
 * published score.
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

vi.mock('@/utils/plcContributions', () => ({
  deletePlcContribution: vi.fn().mockResolvedValue(undefined),
}));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockGetDoc = getDoc as Mock;
const mockGetDocs = getDocs as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockWriteBatch = writeBatch as Mock;

const TEACHER_UID = 'teacher-1';
const ASSIGNMENT_ID = 'assign-subset-1';
const SUBSET_UID = 'student-subset-uid';
const FULL_UID = 'student-full-uid';

// Four MC questions, 1 point each. `q0`/`q1` form the served subset.
const quizData = {
  id: 'quiz-subset-1',
  title: 'Subset Quiz',
  questions: ['q0', 'q1', 'q2', 'q3'].map((id) => ({
    id,
    text: id.toUpperCase(),
    type: 'MC' as const,
    correctAnswer: 'a',
    incorrectAnswers: ['b', 'c', 'd'],
    timeLimit: 30,
    points: 1,
  })),
  createdAt: 0,
  updatedAt: 0,
} satisfies QuizData;

describe('useQuizAssignments — publishAssignmentScores served-subset denominator', () => {
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

  const responseRefs = { subset: { id: 'r-subset' }, full: { id: 'r-full' } };

  const publish = async (
    overridesByStudentUid: Record<string, { questionIds?: string[] }>
  ) => {
    mockGetDoc.mockResolvedValue({ data: () => ({ overridesByStudentUid }) });
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          ref: responseRefs.subset,
          data: () => ({
            studentUid: SUBSET_UID,
            answers: [
              { questionId: 'q0', answer: 'a', answeredAt: 1 },
              { questionId: 'q1', answer: 'a', answeredAt: 2 },
            ],
          }),
        },
        {
          ref: responseRefs.full,
          data: () => ({
            studentUid: FULL_UID,
            answers: [
              { questionId: 'q0', answer: 'a', answeredAt: 1 },
              { questionId: 'q1', answer: 'a', answeredAt: 2 },
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

    const scoreFor = (ref: { id: string }) => {
      const call = batchUpdate.mock.calls.find(([r]) => r === ref);
      if (!call) throw new Error(`expected batch.update on ${ref.id}`);
      return (call[1] as { score: number }).score;
    };
    return {
      subset: scoreFor(responseRefs.subset),
      full: scoreFor(responseRefs.full),
    };
  };

  it('scores a subset student out of their served questions only', async () => {
    const scores = await publish({
      [SUBSET_UID]: { questionIds: ['q0', 'q1'] },
    });
    expect(scores.subset).toBe(100);
  });

  it('leaves non-override students scored against the full question set', async () => {
    const scores = await publish({
      [SUBSET_UID]: { questionIds: ['q0', 'q1'] },
    });
    expect(scores.full).toBe(50);
  });

  it('uses the full set when no overrides are stored at all', async () => {
    const scores = await publish({});
    expect(scores).toEqual({ subset: 50, full: 50 });
  });

  it('ignores an override that carries no question subset', async () => {
    const scores = await publish({ [SUBSET_UID]: {} });
    expect(scores.subset).toBe(50);
  });
});
