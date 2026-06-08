/**
 * Regression tests for duplicate-answer deduplication in
 * useGuidedLearningAssignments.publishAssignmentScores.
 *
 * Bug: the grading loop iterated over the raw `answers` array without
 * guarding against duplicate stepId entries. An arrayUnion race (or any other
 * path that writes the same stepId twice into `answers`) caused `correctCount`
 * to be incremented once per duplicate entry, inflating the numerator and
 * producing an incorrect published score (e.g., 100% instead of 50%).
 *
 * Fix: added a `scoredStepIds` Set inside the grading map — identical to the
 * guard already present in `useVideoActivityAssignments.publishAssignmentScores`
 * and `useQuizAssignments.publishAssignmentScores`. Only the first occurrence
 * of a stepId contributes to `correctCount`; subsequent duplicates still
 * receive an `isCorrect` flag for the student review screen but are excluded
 * from score arithmetic.
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
import { useGuidedLearningAssignments } from '@/hooks/useGuidedLearningAssignments';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteField: vi.fn(() => ({ __deleteFieldSentinel: true })),
  doc: vi.fn(),
  documentId: vi.fn(() => '__documentId'),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  startAfter: vi.fn(),
  orderBy: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
}));

vi.mock('@/hooks/useSessionViewCount', () => ({
  invalidateSessionViewCount: vi.fn(),
}));

// Use the real isAnswerCorrect — it's pure and the test data targets it
// through a specific MC answer key so its behaviour is deterministic.
vi.mock('@/hooks/useGuidedLearningSession', async () => {
  const actual = await vi.importActual<
    typeof import('@/hooks/useGuidedLearningSession')
  >('@/hooks/useGuidedLearningSession');
  return { isAnswerCorrect: actual.isAnswerCorrect };
});

const TEACHER_UID = 'teacher-dedup';
const ASSIGNMENT_ID = 'assign-dedup-gl';

const mockDoc = doc as Mock;
const mockCollection = collection as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockWriteBatch = writeBatch as Mock;
const mockGetDocs = getDocs as Mock;

function mcStep(
  id: string,
  correct: string,
  choices: string[]
): GuidedLearningStep {
  return {
    id,
    xPct: 0,
    yPct: 0,
    imageIndex: 0,
    interactionType: 'question',
    question: {
      type: 'multiple-choice',
      text: `Question ${id}`,
      choices,
      correctAnswer: correct,
    },
  };
}

function mcSet(steps: GuidedLearningStep[]): GuidedLearningSet {
  return {
    id: 'set-dedup',
    title: 'Dedup Test Set',
    imageUrls: [],
    steps,
    mode: 'guided',
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('useGuidedLearningAssignments — publishAssignmentScores duplicate-answer dedup', () => {
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
    mockOnSnapshot.mockImplementation(
      (_q: unknown, onNext: (snap: { docs: [] }) => void) => {
        onNext({ docs: [] });
        return () => undefined;
      }
    );
    batchUpdate.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    });
  });

  it('scores correctly when answers has no duplicates (baseline)', async () => {
    // Two-step set: s0 correct='a', s1 correct='b'.
    // Student answered s0 correctly, s1 incorrectly → score 50%.
    const set = mcSet([
      mcStep('s0', 'a', ['a', 'b']),
      mcStep('s1', 'b', ['a', 'b']),
    ]);
    const refStudent = { id: 'r-baseline' };
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          ref: refStudent,
          data: () => ({
            studentAnonymousId: 'u1',
            startedAt: 1,
            completedAt: 2,
            score: null,
            answers: [
              { stepId: 's0', answer: 'a', isCorrect: null },
              { stepId: 's1', answer: 'wrong', isCorrect: null },
            ],
          }),
        },
      ],
    });

    const { result } = renderHook(() =>
      useGuidedLearningAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        set,
        'score-only'
      );
    });

    const responseCall = batchUpdate.mock.calls.find(
      ([ref]) => ref === refStudent
    );
    if (!responseCall) throw new Error('expected batch.update on response ref');
    expect((responseCall[1] as { score: number }).score).toBe(50);
  });

  it('does NOT inflate score when answers array has a duplicate stepId (arrayUnion race)', async () => {
    // Scenario: arrayUnion race wrote s0 twice into `answers`.
    // Student answered s0 correctly (duplicated) and s1 incorrectly.
    //
    // WITHOUT the scoredStepIds guard (the bug):
    //   grading loop sees [s0, s0_dup, s1]:
    //     s0:     correctCount += 1   ← correct
    //     s0_dup: correctCount += 1   ← double-counted (BUG)
    //     s1:     no increment (wrong answer)
    //   numerator=2, denominator=2 → round(2/2*100) = 100  ← WRONG
    //
    // WITH the fix (scoredStepIds Set):
    //   s0_dup is skipped for score arithmetic (still gets isCorrect)
    //   numerator=1, denominator=2 → round(1/2*100) = 50  ← CORRECT
    const set = mcSet([
      mcStep('s0', 'a', ['a', 'b']),
      mcStep('s1', 'b', ['a', 'b']),
    ]);
    const refStudent = { id: 'r-dup-answer' };
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          ref: refStudent,
          data: () => ({
            studentAnonymousId: 'u1',
            startedAt: 1,
            completedAt: 2,
            score: null,
            answers: [
              { stepId: 's0', answer: 'a', isCorrect: null },
              // Exact duplicate — simulates arrayUnion race.
              { stepId: 's0', answer: 'a', isCorrect: null },
              { stepId: 's1', answer: 'wrong', isCorrect: null },
            ],
          }),
        },
      ],
    });

    const { result } = renderHook(() =>
      useGuidedLearningAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        set,
        'score-only'
      );
    });

    const responseCall = batchUpdate.mock.calls.find(
      ([ref]) => ref === refStudent
    );
    if (!responseCall) throw new Error('expected batch.update on response ref');
    // Bug produces 100; correct answer is 50.
    expect((responseCall[1] as { score: number }).score).toBe(50);
  });

  it('preserves isCorrect on all duplicate answer entries even though only the first contributes to the score', async () => {
    // Both entries in the duplicated array should receive an isCorrect
    // annotation so the student review screen can render the
    // correct/incorrect indicator for every row. Only score arithmetic
    // is deduplicated.
    const set = mcSet([
      mcStep('s0', 'a', ['a', 'b']),
      mcStep('s1', 'b', ['a', 'b']),
    ]);
    const refStudent = { id: 'r-dup-isCorrect' };
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          ref: refStudent,
          data: () => ({
            studentAnonymousId: 'u1',
            startedAt: 1,
            completedAt: 2,
            score: null,
            answers: [
              { stepId: 's0', answer: 'a', isCorrect: null },
              { stepId: 's0', answer: 'a', isCorrect: null }, // duplicate
            ],
          }),
        },
      ],
    });

    const { result } = renderHook(() =>
      useGuidedLearningAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        set,
        'score-only'
      );
    });

    const responseCall = batchUpdate.mock.calls.find(
      ([ref]) => ref === refStudent
    );
    if (!responseCall) throw new Error('expected batch.update on response ref');
    const patch = responseCall[1] as {
      score: number;
      answers: Array<{ stepId: string; isCorrect: boolean }>;
    };

    // Both entries get an isCorrect annotation.
    expect(patch.answers).toHaveLength(2);
    expect(patch.answers[0].isCorrect).toBe(true);
    expect(patch.answers[1].isCorrect).toBe(true);

    // Score uses the deduplicated total: s0 answered correctly once
    // (earned=1), s1 unanswered (denom=2) → score=50.
    expect(patch.score).toBe(50);
  });

  it('handles multiple distinct duplicate stepIds in the same response', async () => {
    // Both s0 and s1 appear twice. Student answered both correctly.
    // Without fix: correctCount=4, denom=2 → 200% (clamped to 200 by
    // Math.round) — clearly wrong. With fix: correctCount=2, denom=2 → 100%.
    const set = mcSet([
      mcStep('s0', 'a', ['a', 'b']),
      mcStep('s1', 'b', ['a', 'b']),
    ]);
    const refStudent = { id: 'r-both-dup' };
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          ref: refStudent,
          data: () => ({
            studentAnonymousId: 'u1',
            startedAt: 1,
            completedAt: 2,
            score: null,
            answers: [
              { stepId: 's0', answer: 'a', isCorrect: null },
              { stepId: 's0', answer: 'a', isCorrect: null }, // dup
              { stepId: 's1', answer: 'b', isCorrect: null },
              { stepId: 's1', answer: 'b', isCorrect: null }, // dup
            ],
          }),
        },
      ],
    });

    const { result } = renderHook(() =>
      useGuidedLearningAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        set,
        'score-only'
      );
    });

    const responseCall = batchUpdate.mock.calls.find(
      ([ref]) => ref === refStudent
    );
    if (!responseCall) throw new Error('expected batch.update on response ref');
    expect((responseCall[1] as { score: number }).score).toBe(100);
  });
});

describe('useGuidedLearningAssignments — publishAssignmentScores bounded paging', () => {
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();

  // Mirrors RESPONSES_PAGE_SIZE in useGuidedLearningAssignments — a full page
  // means the publish path must request a second page to finish reading the
  // subcollection. Constructing exactly this many docs in page 1 forces the
  // cursor loop to run more than once.
  const RESPONSES_PAGE_SIZE = 500;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockOnSnapshot.mockImplementation(
      (_q: unknown, onNext: (snap: { docs: [] }) => void) => {
        onNext({ docs: [] });
        return () => undefined;
      }
    );
    batchUpdate.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    });
  });

  it('scores every response across more than one page (limit + cursor paging)', async () => {
    // One-step set; every response answers s0 correctly → each scores 100%.
    const set = mcSet([mcStep('s0', 'a', ['a', 'b'])]);

    // Build a response doc whose ref is uniquely identifiable so we can
    // confirm each one received a graded batch.update.
    const makeDoc = (i: number) => {
      const ref = { id: `r-${i}` };
      return {
        ref,
        data: () => ({
          studentAnonymousId: `u${i}`,
          startedAt: 1,
          completedAt: 2,
          score: null,
          answers: [{ stepId: 's0', answer: 'a', isCorrect: null }],
        }),
      };
    };

    // Page 1 is a FULL page (length === page size) so the paging loop must
    // fetch a second page; page 2 is short (< page size) so it terminates.
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

    const { result } = renderHook(() =>
      useGuidedLearningAssignments(TEACHER_UID)
    );
    let publishResult: { responsesUpdated: number } | undefined;
    await act(async () => {
      publishResult = await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        set,
        'score-only'
      );
    });

    // Two reads = two pages: the unbounded single-read path would have called
    // getDocs once. The cursor loop is what bounds each Firestore read.
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

    // Spot-check a response from each page got a 100% score.
    const firstPageCall = batchUpdate.mock.calls.find(
      ([ref]) => (ref as { id: string }).id === 'r-0'
    );
    const secondPageCall = batchUpdate.mock.calls.find(
      ([ref]) => (ref as { id: string }).id === `r-${RESPONSES_PAGE_SIZE}`
    );
    expect((firstPageCall?.[1] as { score: number }).score).toBe(100);
    expect((secondPageCall?.[1] as { score: number }).score).toBe(100);
  });
});
