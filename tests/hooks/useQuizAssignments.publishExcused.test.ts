/**
 * Integration review INT-B2: excusing a capture-unavailable recording slot is
 * TERMINAL. It must publish (not delete the student's score forever) and leave
 * that question out of the student's own denominator.
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
const mockOnSnapshot = onSnapshot as Mock;
const mockWriteBatch = writeBatch as Mock;
const mockGetDocs = getDocs as Mock;

const TEACHER_UID = 'teacher-1';
const ASSIGNMENT_ID = 'assign-excused-1';

const RECORDING = {
  prepSeconds: 30,
  limitSeconds: 60,
  prepExpiry: 'armed' as const,
  takeLimit: null,
};

// One auto-graded MC (1 pt) plus one 3-pt spoken question.
const quizData = {
  id: 'quiz-excused-1',
  title: 'Spoken Quiz',
  questions: [
    {
      id: 'q0',
      text: 'Q0',
      type: 'MC' as const,
      correctAnswer: 'a',
      incorrectAnswers: ['b'],
      timeLimit: 30,
      points: 1,
    },
    {
      id: 'r1',
      text: 'Say it out loud',
      type: 'short' as const,
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 0,
      points: 3,
      recording: RECORDING,
    },
  ],
  createdAt: 0,
  updatedAt: 0,
} satisfies QuizData;

describe('useQuizAssignments — an excused slot is terminal', () => {
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
    (getDoc as Mock).mockResolvedValue({ data: () => ({}) });
  });

  async function publishOne(data: Record<string, unknown>) {
    const ref = { id: 'r-1' };
    mockGetDocs.mockResolvedValueOnce({ docs: [{ ref, data: () => data }] });
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        quizData,
        'score-only'
      );
    });
    const call = batchUpdate.mock.calls.find(([r]) => r === ref);
    if (!call) throw new Error('expected batch.update on the response ref');
    return call[1] as { score: unknown };
  }

  const captureUnavailable = {
    studentUid: 's1',
    answers: [
      { questionId: 'q0', answer: 'a', answeredAt: 1 },
      {
        questionId: 'r1',
        answer: '',
        answeredAt: 2,
        unresponded: 'capture-unavailable',
      },
    ],
  };

  it('withholds the score while the unavailable slot is unadjudicated', async () => {
    const patch = await publishOne(captureUnavailable);
    expect(patch.score).toEqual({ __deleteFieldSentinel: true });
  });

  it('publishes 100% once excused — the excused question leaves the denominator', async () => {
    const patch = await publishOne({
      ...captureUnavailable,
      grading: {
        r1: {
          pointsAwarded: 0,
          excused: true,
          gradedBy: TEACHER_UID,
          gradedAt: 1,
        },
      },
    });
    // 1 of 1 (q0 only). Before INT-B this deleted the score forever instead.
    expect(patch.score).toBe(100);
  });

  it('still scores a zero when the teacher chose Blank instead of Excuse', async () => {
    const patch = await publishOne({
      ...captureUnavailable,
      grading: {
        r1: { pointsAwarded: 0, gradedBy: TEACHER_UID, gradedAt: 1 },
      },
    });
    // 1 of 4 — Blank is a real 0 and keeps its points in the denominator.
    expect(patch.score).toBe(25);
  });
});
