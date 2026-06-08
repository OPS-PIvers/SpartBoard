import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import {
  useGuidedLearningAssignments,
  formatCanonicalAnswer,
} from '@/hooks/useGuidedLearningAssignments';
import type {
  GuidedLearningSet,
  GuidedLearningStep,
  GuidedLearningQuestion,
} from '@/types';

// Mirror the Quiz test's sentinel pattern so we can assert deleteField()
// landed in the right column without a real Firestore SDK in scope.
const DELETE_FIELD_SENTINEL = Symbol('test:deleteField()');

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteField: vi.fn(() => DELETE_FIELD_SENTINEL),
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

vi.mock('./useSessionViewCount', () => ({
  invalidateSessionViewCount: vi.fn(),
}));

// `isAnswerCorrect` is re-exported by the assignments module from
// useGuidedLearningSession; the test imports the real implementation
// (the question-type branches are pure functions of the answer key).
vi.mock('./useGuidedLearningSession', async () => {
  const actual = await vi.importActual<
    typeof import('@/hooks/useGuidedLearningSession')
  >('@/hooks/useGuidedLearningSession');
  return { isAnswerCorrect: actual.isAnswerCorrect };
});

const TEACHER_UID = 'teacher-1';
const ASSIGNMENT_ID = 'assignment-xyz';

const mockDoc = doc as Mock;
const mockCollection = collection as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockWriteBatch = writeBatch as Mock;
const mockGetDocs = getDocs as Mock;

// Tiny test-data factory: a 2-step MC set so the publish math is easy
// to assert (two questions, both 1 point, total = 2 → percentage easy).
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
    id: 'set-1',
    title: 'Test Set',
    imageUrls: [],
    steps,
    mode: 'guided',
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('useGuidedLearningAssignments — publish / unpublish', () => {
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
    // The assignments-list listener fires once during render with an
    // empty snapshot so the hook reaches "loaded" state without us
    // having to set up dashboard data.
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

  it('unpublishAssignmentScores clears flags via deleteField on both docs', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.unpublishAssignmentScores(ASSIGNMENT_ID);
    });

    // Single batch (assignment + session) — no response reads on unpublish.
    expect(mockGetDocs).not.toHaveBeenCalled();
    expect(batchCommit).toHaveBeenCalledTimes(1);

    const assignmentCall = batchUpdate.mock.calls.find(
      ([ref]) =>
        typeof ref === 'string' &&
        ref.startsWith(`users/${TEACHER_UID}/guided_learning_assignments/`)
    );
    if (!assignmentCall)
      throw new Error('expected batch.update on assignment doc');
    expect(assignmentCall[1]).toMatchObject({
      scoreVisibility: DELETE_FIELD_SENTINEL,
      scorePublishedAt: DELETE_FIELD_SENTINEL,
    });

    const sessionCall = batchUpdate.mock.calls.find(
      ([ref]) =>
        typeof ref === 'string' && ref.startsWith('guided_learning_sessions/')
    );
    if (!sessionCall) throw new Error('expected batch.update on session doc');
    expect(sessionCall[1]).toMatchObject({
      scoreVisibility: DELETE_FIELD_SENTINEL,
      revealedAnswers: DELETE_FIELD_SENTINEL,
    });
  });

  it('unpublishAssignmentScores is idempotent', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.unpublishAssignmentScores(ASSIGNMENT_ID);
      await result.current.unpublishAssignmentScores(ASSIGNMENT_ID);
    });
    expect(mockGetDocs).not.toHaveBeenCalled();
    expect(batchCommit).toHaveBeenCalledTimes(2);
  });

  it("publishAssignmentScores rejects visibility 'none' at runtime", async () => {
    const { result } = renderHook(() =>
      useGuidedLearningAssignments(TEACHER_UID)
    );
    await act(async () => {
      await expect(
        (
          result.current.publishAssignmentScores as unknown as (
            id: string,
            data: unknown,
            v: string
          ) => Promise<unknown>
        )(ASSIGNMENT_ID, mcSet([]), 'none')
      ).rejects.toThrow(/unpublishAssignmentScores/);
    });
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('grades responses and writes per-step isCorrect on score-only publish', async () => {
    const set = mcSet([
      mcStep('s0', 'a', ['a', 'b']),
      mcStep('s1', 'b', ['a', 'b']),
    ]);
    const refPerfect = { id: 'r-perfect' };
    const refPartial = { id: 'r-partial' };
    const refBlank = { id: 'r-blank' };
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          ref: refPerfect,
          data: () => ({
            studentAnonymousId: 'u1',
            startedAt: 1,
            completedAt: 2,
            score: null,
            answers: [
              { stepId: 's0', answer: 'a', isCorrect: null },
              { stepId: 's1', answer: 'b', isCorrect: null },
            ],
          }),
        },
        {
          ref: refPartial,
          data: () => ({
            studentAnonymousId: 'u2',
            startedAt: 1,
            completedAt: 2,
            score: null,
            answers: [
              { stepId: 's0', answer: 'a', isCorrect: null },
              { stepId: 's1', answer: 'wrong', isCorrect: null },
            ],
          }),
        },
        // Student who joined but never answered — both gradable steps
        // count toward the denominator so the score is 0%.
        {
          ref: refBlank,
          data: () => ({
            studentAnonymousId: 'u3',
            startedAt: 1,
            completedAt: 2,
            score: null,
            answers: [],
          }),
        },
      ],
    });

    const { result } = renderHook(() =>
      useGuidedLearningAssignments(TEACHER_UID)
    );
    await act(async () => {
      const outcome = await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        set,
        'score-only'
      );
      expect(outcome).toEqual({ responsesUpdated: 3 });
    });

    expect(batchCommit).toHaveBeenCalledTimes(1);

    // Session patch should NOT carry revealedAnswers on 'score-only'.
    const sessionCall = batchUpdate.mock.calls.find(
      ([ref]) =>
        typeof ref === 'string' && ref.startsWith('guided_learning_sessions/')
    );
    if (!sessionCall) throw new Error('expected session update');
    expect(sessionCall[1]).toMatchObject({
      scoreVisibility: 'score-only',
      revealedAnswers: DELETE_FIELD_SENTINEL,
    });

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
      expect.objectContaining({ stepId: 's0', isCorrect: true }),
      expect.objectContaining({ stepId: 's1', isCorrect: true }),
    ]);
    expect(partialCall[1]).toMatchObject({ score: 50 });
    expect(
      (partialCall[1] as { answers: { isCorrect: boolean }[] }).answers
    ).toEqual([
      expect.objectContaining({ stepId: 's0', isCorrect: true }),
      expect.objectContaining({ stepId: 's1', isCorrect: false }),
    ]);
    expect(blankCall[1]).toMatchObject({ score: 0, answers: [] });
  });

  it('populates revealedAnswers on score-responses-and-answers, formatting matching/sorting too', async () => {
    const matching: GuidedLearningQuestion = {
      type: 'matching',
      text: 'Match',
      matchingPairs: [
        { left: 'A', right: '1' },
        { left: 'B', right: '2' },
      ],
    };
    const sorting: GuidedLearningQuestion = {
      type: 'sorting',
      text: 'Sort',
      sortingItems: ['x', 'y', 'z'],
    };
    const set = mcSet([
      mcStep('s0', 'a', ['a', 'b']),
      {
        id: 's1',
        xPct: 0,
        yPct: 0,
        imageIndex: 0,
        interactionType: 'question',
        question: matching,
      },
      {
        id: 's2',
        xPct: 0,
        yPct: 0,
        imageIndex: 0,
        interactionType: 'question',
        question: sorting,
      },
      // Info hotspot (no question) — must NOT appear in revealedAnswers.
      {
        id: 's3-info',
        xPct: 0,
        yPct: 0,
        imageIndex: 0,
        interactionType: 'text-popover',
      },
    ]);
    mockGetDocs.mockResolvedValueOnce({ docs: [] });

    const { result } = renderHook(() =>
      useGuidedLearningAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        set,
        'score-responses-and-answers'
      );
    });

    const sessionCall = batchUpdate.mock.calls.find(
      ([ref]) =>
        typeof ref === 'string' && ref.startsWith('guided_learning_sessions/')
    );
    if (!sessionCall) throw new Error('expected session update');
    expect(sessionCall[1]).toMatchObject({
      scoreVisibility: 'score-responses-and-answers',
      revealedAnswers: {
        s0: 'a',
        s1: 'A → 1\nB → 2',
        s2: 'x → y → z',
      },
    });
    // Info hotspot is omitted.
    expect(
      (sessionCall[1] as { revealedAnswers: Record<string, string> })
        .revealedAnswers['s3-info']
    ).toBeUndefined();
  });

  it('clears stale isCorrect when a step no longer exists', async () => {
    const set = mcSet([mcStep('s-keep', 'a', ['a', 'b'])]);
    const refStale = { id: 'r-stale' };
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          ref: refStale,
          data: () => ({
            studentAnonymousId: 'u',
            startedAt: 1,
            completedAt: 2,
            score: 100,
            answers: [
              { stepId: 's-keep', answer: 'a', isCorrect: true },
              // Step that was removed from the canonical set after submission.
              { stepId: 's-deleted', answer: 'whatever', isCorrect: true },
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
        'score-and-responses'
      );
    });

    const staleCall = batchUpdate.mock.calls.find(([ref]) => ref === refStale);
    if (!staleCall) throw new Error('expected update on stale response');
    expect(
      (staleCall[1] as { answers: { stepId: string; isCorrect: unknown }[] })
        .answers
    ).toEqual([
      expect.objectContaining({ stepId: 's-keep', isCorrect: true }),
      // Stale step's correctness must be cleared (null) so the response
      // doesn't carry a claim the canonical set no longer supports.
      expect.objectContaining({ stepId: 's-deleted', isCorrect: null }),
    ]);
  });

  it('surfaces a structured "partial publish" error if a chunk batch fails', async () => {
    // 500 responses → first batch holds 398, second chunk holds 102.
    // Force the second commit to reject and assert the error message
    // calls out how many were graded so the teacher knows to re-run.
    const set = mcSet([mcStep('s0', 'a', ['a', 'b'])]);
    const responseDocs = Array.from({ length: 500 }, (_, i) => ({
      ref: { id: `r${i}` },
      data: () => ({
        studentAnonymousId: `u${i}`,
        startedAt: 1,
        completedAt: 2,
        score: null,
        answers: [{ stepId: 's0', answer: 'a', isCorrect: null }],
      }),
    }));
    // The publish read pages with limit(500): a first full 500-doc page is
    // followed by a second (empty) page that terminates the cursor loop.
    mockGetDocs
      .mockResolvedValueOnce({ docs: responseDocs })
      .mockResolvedValueOnce({ docs: [] });
    batchCommit.mockReset();
    batchCommit
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('quota exceeded'));

    const { result } = renderHook(() =>
      useGuidedLearningAssignments(TEACHER_UID)
    );
    await act(async () => {
      await expect(
        result.current.publishAssignmentScores(ASSIGNMENT_ID, set, 'score-only')
      ).rejects.toThrow(/Partial publish: \d+ of 500/);
    });
  });
});

describe('formatCanonicalAnswer', () => {
  it('returns the correctAnswer for multiple-choice', () => {
    expect(
      formatCanonicalAnswer(mcStep('s', 'banana', ['apple', 'banana']))
    ).toBe('banana');
  });

  it('joins matching pairs with " → " and newline separators', () => {
    expect(
      formatCanonicalAnswer({
        id: 's',
        xPct: 0,
        yPct: 0,
        imageIndex: 0,
        interactionType: 'question',
        question: {
          type: 'matching',
          text: 'Match',
          matchingPairs: [
            { left: 'cat', right: 'meow' },
            { left: 'dog', right: 'bark' },
          ],
        },
      })
    ).toBe('cat → meow\ndog → bark');
  });

  it('joins sorting items with " → "', () => {
    expect(
      formatCanonicalAnswer({
        id: 's',
        xPct: 0,
        yPct: 0,
        imageIndex: 0,
        interactionType: 'question',
        question: {
          type: 'sorting',
          text: 'Sort',
          sortingItems: ['first', 'second', 'third'],
        },
      })
    ).toBe('first → second → third');
  });

  it('returns null for steps without a question (info hotspots)', () => {
    expect(
      formatCanonicalAnswer({
        id: 's',
        xPct: 0,
        yPct: 0,
        imageIndex: 0,
        interactionType: 'question',
      })
    ).toBeNull();
  });

  it('returns null for matching with no pairs and sorting with no items', () => {
    expect(
      formatCanonicalAnswer({
        id: 's',
        xPct: 0,
        yPct: 0,
        imageIndex: 0,
        interactionType: 'question',
        question: { type: 'matching', text: '', matchingPairs: [] },
      })
    ).toBeNull();
    expect(
      formatCanonicalAnswer({
        id: 's',
        xPct: 0,
        yPct: 0,
        imageIndex: 0,
        interactionType: 'question',
        question: { type: 'sorting', text: '', sortingItems: [] },
      })
    ).toBeNull();
  });
});
