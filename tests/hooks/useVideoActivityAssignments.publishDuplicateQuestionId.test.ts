/**
 * Regression test: useVideoActivityAssignments.publishAssignmentScores
 * resolved a duplicate question id (same id, differing content) with
 * LAST-occurrence-wins semantics via a raw `new Map(questions.map(...))`,
 * while every other duplicate-id path in this codebase (session creation,
 * videoActivityMaxPoints, the identical Quiz-hook fix) uses the canonical
 * FIRST-occurrence-wins `dedupeQuestionsById`.
 *
 * Bug: a Drive-sync/arrayUnion race can write the same question id twice
 * into an activity's `questions` array. The student is served and answers
 * against the FIRST occurrence (session creation dedupes first-wins). At
 * publish time, the raw `Map.set`-via-array-map construction kept the LAST
 * occurrence — so if the duplicate carries a different `correctAnswer`/
 * `points`, the student is silently graded against a question they were
 * never actually served, producing a wrong score.
 *
 * Fix: dedupe first-wins (via the shared `dedupeQuestionsById`) before
 * indexing into `questionsById`.
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

// q0 appears twice (Drive-sync/arrayUnion race): the FIRST occurrence is the
// version session creation served to the student (correctAnswer 'a', 1 pt);
// the duplicate carries a different correctAnswer AND points. q1 is a normal
// 1-point question the student answers wrong.
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
    // Student answered q0 with 'a' — correct against the version they were
    // actually served (the first occurrence) — and q1 wrong.
    //
    // Buggy (last-wins) resolution grades q0 against the duplicate
    // (correctAnswer 'b', 4 pts): 'a' !== 'b' → isCorrect false, 0/4.
    // Combined with q1 (0/1): earned=0, max=5 → score = 0.
    //
    // Correct (first-wins) resolution grades q0 against the served version
    // (correctAnswer 'a', 1 pt): isCorrect true, 1/1. Combined with q1
    // (0/1): earned=1, max=2 → score = 50.
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

    // Bug grades this 0 (against the duplicate's correctAnswer 'b'); fix
    // grades it 50 (against the served version's correctAnswer 'a').
    expect(patch.score).toBe(50);
    const q0Answer = patch.answers.find((a) => a.questionId === 'q0');
    expect(q0Answer?.isCorrect).toBe(true);
  });
});
