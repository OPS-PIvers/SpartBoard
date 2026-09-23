// Regression: a duplicated question id used to grade last-wins instead of the first-wins semantics every other path in this codebase uses.

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
import { useVideoActivityAssignments } from '@/hooks/useVideoActivityAssignments';

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteField: vi.fn(() => ({ __deleteFieldSentinel: true })),
  doc: vi.fn(),
  documentId: vi.fn(() => '__documentId'),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  startAfter: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
}));

vi.mock('@/hooks/useSessionViewCount', () => ({
  invalidateSessionViewCount: vi.fn(),
}));

vi.mock('@/hooks/useSyncedVideoActivityGroups', () => ({
  callJoinSyncedVideoActivityGroup: vi.fn(),
  callLeaveSyncedVideoActivityGroup: vi.fn(),
  createSyncedVideoActivityGroup: vi.fn(),
  pullSyncedVideoActivityContent: vi.fn(),
}));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockWriteBatch = writeBatch as Mock;
const mockGetDocs = getDocs as Mock;

const TEACHER_UID = 'teacher-1';
const ASSIGNMENT_ID = 'assign-va-dup-qid-1';

// q0 appears twice with differing correctAnswer/points (Drive-sync race) — the FIRST occurrence is what session creation served.
const activityData = {
  id: 'act-dup-qid-1',
  title: 'Duplicate Question Id Test Activity',
  youtubeUrl: 'https://youtube.com/watch?v=test',
  questions: [
    {
      id: 'q0',
      text: 'Q0',
      type: 'MC' as const,
      correctAnswer: 'a',
      incorrectAnswers: ['b', 'c'],
      timeLimit: 30,
      timestamp: 10,
      points: 1,
    },
    {
      id: 'q0',
      text: 'Q0',
      type: 'MC' as const,
      correctAnswer: 'b',
      incorrectAnswers: ['a', 'c'],
      timeLimit: 30,
      timestamp: 10,
      points: 4,
    },
    {
      id: 'q1',
      text: 'Q1',
      type: 'MC' as const,
      correctAnswer: 'x',
      incorrectAnswers: ['a', 'b'],
      timeLimit: 30,
      timestamp: 60,
      points: 1,
    },
  ],
  createdAt: 0,
  updatedAt: 0,
};

describe('useVideoActivityAssignments — publishAssignmentScores duplicate question id (differing content)', () => {
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

  it('grades against the FIRST occurrence of a duplicated question id, not the last', async () => {
    // Student answered q0 'a' (correct vs. the served first occurrence) and q1 wrong — first-wins scores 50, last-wins scores 0.
    const refStudent = { id: 'r-dup-qid' };
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          ref: refStudent,
          data: () => ({
            studentUid: 's1',
            answers: [
              { questionId: 'q0', answer: 'a', answeredAt: 1 },
              { questionId: 'q1', answer: 'wrong', answeredAt: 2 },
            ],
          }),
        },
      ],
    });

    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        activityData,
        'score-only'
      );
    });

    const responseCall = batchUpdate.mock.calls.find(
      ([ref]) => ref === refStudent
    );
    if (!responseCall) throw new Error('expected update on response ref');
    const patch = responseCall[1] as {
      score: number;
      answers: Array<{ questionId: string; isCorrect: boolean }>;
    };

    // Bug grades this 0 (duplicate's correctAnswer 'b'); fix grades it 50 (served version's correctAnswer 'a').
    expect(patch.score).toBe(50);
    const q0Answer = patch.answers.find((a) => a.questionId === 'q0');
    expect(q0Answer?.isCorrect).toBe(true);
  });

  it('reveals the answer for the same occurrence the student was graded against', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] });

    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        activityData,
        'score-responses-and-answers'
      );
    });

    const sessionCall = batchUpdate.mock.calls.find(
      ([, patch]) =>
        !!(patch as { revealedAnswers?: unknown }).revealedAnswers &&
        typeof (patch as { revealedAnswers?: unknown }).revealedAnswers ===
          'object'
    );
    if (!sessionCall) throw new Error('expected batch.update on session ref');
    const sessionPatch = sessionCall[1] as {
      revealedAnswers: Record<string, string>;
    };

    // Revealed answer must match the FIRST occurrence's correctAnswer ('a'), the one the student was actually graded against — not the duplicate's 'b'.
    expect(sessionPatch.revealedAnswers.q0).toBe('a');
  });
});
