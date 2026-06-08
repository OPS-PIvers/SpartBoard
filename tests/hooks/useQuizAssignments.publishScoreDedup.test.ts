/**
 * Regression tests for duplicate-answer deduplication in
 * useQuizAssignments.publishAssignmentScores.
 *
 * Bug: the grading loop iterated over the raw `answers` array without
 * guarding against duplicate questionId entries. An arrayUnion race (or any
 * other path that writes the same questionId twice into `answers`) caused
 * `pointsEarned` and `pointsMax` to be incremented once per duplicate entry,
 * inflating both values and producing an incorrect published score.
 *
 * Fix: added a `scoredQuestionIds` Set inside the grading map — identical to
 * the guard already present in `useVideoActivityAssignments.publishAssignmentScores`
 * (#1728, #1787, #1803). Only the first occurrence of a questionId contributes
 * to the totals; subsequent duplicates still receive an `isCorrect` flag for
 * rendering but are excluded from score arithmetic.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  doc,
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
const ASSIGNMENT_ID = 'assign-dedup-1';

// Two-question quiz: q0 = 1 pt (MC, correct answer 'a'), q1 = 1 pt (MC, correct 'b').
const quizData = {
  id: 'quiz-dedup-1',
  title: 'Dedup Test Quiz',
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
} satisfies QuizData;

describe('useQuizAssignments — publishAssignmentScores duplicate-answer dedup', () => {
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

  it('scores correctly when answers has no duplicates (baseline)', async () => {
    // Student answered q0 correctly, q1 incorrectly.
    // Expected: pointsEarned=1, pointsMax=2, score=50.
    const refStudent = { id: 'r-baseline' };
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

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        quizData,
        'score-only'
      );
    });

    const responseCall = batchUpdate.mock.calls.find(
      ([ref]) => ref === refStudent
    );
    if (!responseCall) throw new Error('expected batch.update on response ref');
    expect((responseCall[1] as { score: number }).score).toBe(50);
  });

  it('does NOT inflate score when answers array has a duplicate questionId (arrayUnion race)', async () => {
    // Scenario: arrayUnion race wrote q0 twice into `answers`.
    // Student answered q0 correctly (duplicated) and q1 incorrectly.
    //
    // WITHOUT the scoredQuestionIds guard (the bug):
    //   grading map sees [q0, q0_dup, q1]:
    //     q0:     pointsEarned += 1, pointsMax += 1
    //     q0_dup: pointsEarned += 1, pointsMax += 1   ← double-counted
    //     q1:     pointsEarned += 0, pointsMax += 1
    //   totals: earned=2, max=3 → round(2/3*100)=67  ← WRONG
    //
    // WITH the fix (scoredQuestionIds Set):
    //   q0_dup is skipped for totals (still gets isCorrect for rendering)
    //   totals: earned=1, max=2 → round(1/2*100)=50  ← CORRECT
    const refStudent = { id: 'r-dup-answer' };
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          ref: refStudent,
          data: () => ({
            studentUid: 's1',
            answers: [
              { questionId: 'q0', answer: 'a', answeredAt: 1 },
              // Exact duplicate — simulates arrayUnion race.
              { questionId: 'q0', answer: 'a', answeredAt: 1 },
              { questionId: 'q1', answer: 'wrong', answeredAt: 2 },
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

    const responseCall = batchUpdate.mock.calls.find(
      ([ref]) => ref === refStudent
    );
    if (!responseCall) throw new Error('expected batch.update on response ref');
    // Bug produces 67; correct answer is 50.
    expect((responseCall[1] as { score: number }).score).toBe(50);
  });

  it('preserves isCorrect on all duplicate answer entries even though only the first contributes to totals', async () => {
    // Grading annotation (isCorrect) should be written on every entry in the
    // gradedAnswers array — including duplicates — so the student's review
    // screen renders the correct/incorrect indicator for each row.
    const refStudent = { id: 'r-dup-isCorrect' };
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          ref: refStudent,
          data: () => ({
            studentUid: 's1',
            answers: [
              { questionId: 'q0', answer: 'a', answeredAt: 1 },
              { questionId: 'q0', answer: 'a', answeredAt: 1 }, // duplicate
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

    const responseCall = batchUpdate.mock.calls.find(
      ([ref]) => ref === refStudent
    );
    if (!responseCall) throw new Error('expected batch.update on response ref');
    const patch = responseCall[1] as {
      score: number;
      answers: Array<{ questionId: string; isCorrect: boolean }>;
    };

    // Both entries get an isCorrect annotation.
    expect(patch.answers).toHaveLength(2);
    expect(patch.answers[0].isCorrect).toBe(true);
    expect(patch.answers[1].isCorrect).toBe(true);

    // But the score uses the deduplicated total (earned=1, max=1 for q0 only
    // — q1 is unanswered so it gets counted in the unanswered loop adding 1
    // to max → earned=1, max=2 → score=50).
    expect(patch.score).toBe(50);
  });
});

describe('useQuizAssignments — publishAssignmentScores bounded paging', () => {
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();

  // Mirrors RESPONSES_PAGE_SIZE in useQuizAssignments — a full page forces the
  // publish path to request a second page to finish reading the subcollection.
  const RESPONSES_PAGE_SIZE = 500;

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

  it('scores every response across more than one page (limit + cursor paging)', async () => {
    // Each response answers q0 correctly and leaves q1 blank → score 50%.
    const makeDoc = (i: number) => {
      const ref = { id: `r-${i}` };
      return {
        ref,
        data: () => ({
          studentUid: `s${i}`,
          answers: [{ questionId: 'q0', answer: 'a', answeredAt: 1 }],
        }),
      };
    };

    // Page 1 is a FULL page (length === page size) so the cursor loop must
    // fetch a second page; page 2 is short so the loop terminates.
    const page1 = Array.from({ length: RESPONSES_PAGE_SIZE }, (_, i) =>
      makeDoc(i)
    );
    const page2 = [
      makeDoc(RESPONSES_PAGE_SIZE),
      makeDoc(RESPONSES_PAGE_SIZE + 1),
    ];
    const totalResponses = page1.length + page2.length;

    mockGetDocs
      .mockResolvedValueOnce({ docs: page1 })
      .mockResolvedValueOnce({ docs: page2 });

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    let publishResult: { responsesUpdated: number } | undefined;
    await act(async () => {
      publishResult = await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        quizData,
        'score-only'
      );
    });

    // Two reads = two pages: the prior unbounded single-read path would have
    // called getDocs once. The cursor loop is what bounds each read.
    expect(mockGetDocs).toHaveBeenCalledTimes(2);

    // Every response across both pages is scored exactly once.
    expect(publishResult?.responsesUpdated).toBe(totalResponses);
    const scoredRefIds = new Set(
      batchUpdate.mock.calls
        .filter(([ref]) => (ref as { id?: string }).id?.startsWith('r-'))
        .map(([ref]) => (ref as { id: string }).id)
    );
    expect(scoredRefIds.size).toBe(totalResponses);
    for (let i = 0; i < totalResponses; i++) {
      expect(scoredRefIds.has(`r-${i}`)).toBe(true);
    }

    // Spot-check a response from each page got the expected 50% score.
    const firstPageCall = batchUpdate.mock.calls.find(
      ([ref]) => (ref as { id: string }).id === 'r-0'
    );
    const secondPageCall = batchUpdate.mock.calls.find(
      ([ref]) => (ref as { id: string }).id === `r-${RESPONSES_PAGE_SIZE}`
    );
    expect((firstPageCall?.[1] as { score: number }).score).toBe(50);
    expect((secondPageCall?.[1] as { score: number }).score).toBe(50);
  });
});
