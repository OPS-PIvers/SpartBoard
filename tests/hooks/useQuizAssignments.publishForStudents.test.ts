import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import {
  classPublishPatch,
  useQuizAssignments,
} from '@/hooks/useQuizAssignments';
import type { QuizData } from '@/types';

const DELETE_FIELD_SENTINEL = Symbol('test:deleteField()');
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteField: vi.fn(() => DELETE_FIELD_SENTINEL),
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

const TEACHER_UID = 'teacher-1';
const ASSIGNMENT_ID = 'assignment-1';
const RESPONSES = `quiz_sessions/${ASSIGNMENT_ID}/responses`;

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
      type: 'free-response' as const,
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 30,
      points: 1,
    },
  ],
  createdAt: 0,
  updatedAt: 0,
} satisfies QuizData;

const responseDocs: Record<string, Record<string, unknown> | null> = {};

describe('useQuizAssignments — per-student results publishing', () => {
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(responseDocs)) delete responseDocs[k];
    (doc as Mock).mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    (collection as Mock).mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    (onSnapshot as Mock).mockReturnValue(() => undefined);
    batchCommit.mockReset().mockResolvedValue(undefined);
    (writeBatch as Mock).mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    });
    (getDoc as Mock).mockImplementation((path: string) => {
      if (path.startsWith(`${RESPONSES}/`)) {
        const data = responseDocs[path.slice(RESPONSES.length + 1)];
        return Promise.resolve({
          ref: path,
          exists: () => data != null,
          data: () => data ?? undefined,
        });
      }
      return Promise.resolve({ data: () => ({}) });
    });
  });

  const patchFor = (key: string): unknown =>
    (batchUpdate.mock.calls as unknown[][]).find(
      ([ref]) => ref === `${RESPONSES}/${key}`
    )?.[1];

  it('grades only the chosen completed responses and writes a Shown override with the answer key', async () => {
    responseDocs['pin-a'] = {
      studentUid: 's1',
      status: 'completed',
      answers: [{ questionId: 'q0', answer: 'a', answeredAt: 1 }],
    };
    responseDocs['pin-b'] = {
      studentUid: 's2',
      status: 'in-progress',
      answers: [],
    };
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    let outcome: { responsesUpdated: number; skipped: number } | undefined;
    await act(async () => {
      outcome = await result.current.publishResultsForStudents(
        ASSIGNMENT_ID,
        quizData,
        ['pin-a', 'pin-b', 'pin-missing'],
        'score-responses-and-answers',
        5000
      );
    });
    expect(outcome).toEqual({ responsesUpdated: 1, skipped: 2 });
    const patch = patchFor('pin-a') as Record<string, unknown>;
    expect(patch).toMatchObject({
      score: 50,
      resultsOverride: {
        mode: 'shown',
        visibility: 'score-responses-and-answers',
        expiresAt: 5000,
        revealedAnswers: { q0: 'a', q1: '' },
      },
    });
    expect((patch.answers as { isCorrect?: boolean }[])[0].isCorrect).toBe(
      true
    );
    expect(patchFor('pin-b')).toBeUndefined();
    // Never touches the session or assignment publication flags (D3, D9).
    expect(
      batchUpdate.mock.calls.some(
        ([ref]) =>
          ref === `quiz_sessions/${ASSIGNMENT_ID}` ||
          String(ref).startsWith(`users/${TEACHER_UID}`)
      )
    ).toBe(false);
  });

  it('leaves score unset while a written answer awaits a grade and omits the key below the answers level', async () => {
    responseDocs['pin-a'] = {
      studentUid: 's1',
      status: 'completed',
      answers: [
        { questionId: 'q0', answer: 'a', answeredAt: 1 },
        { questionId: 'q1', answer: 'An essay', answeredAt: 2 },
      ],
    };
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.publishResultsForStudents(
        ASSIGNMENT_ID,
        quizData,
        ['pin-a'],
        'score-only',
        null
      );
    });
    const patch = patchFor('pin-a') as Record<string, unknown>;
    expect(patch.score).toBe(DELETE_FIELD_SENTINEL);
    const override = patch.resultsOverride as Record<string, unknown>;
    expect(override).toMatchObject({
      mode: 'shown',
      visibility: 'score-only',
      expiresAt: null,
    });
    expect(override).not.toHaveProperty('revealedAnswers');
    // Score-only keeps right/wrong off the doc the student reads.
    for (const a of patch.answers as Record<string, unknown>[])
      expect(a).not.toHaveProperty('isCorrect');
  });

  it('keeps isCorrect at score-only while the class level shows responses', async () => {
    responseDocs['pin-a'] = {
      studentUid: 's1',
      status: 'completed',
      answers: [{ questionId: 'q0', answer: 'a', answeredAt: 1 }],
    };
    (getDoc as Mock).mockImplementation((path: string) => {
      if (path === `quiz_sessions/${ASSIGNMENT_ID}`)
        return Promise.resolve({
          data: () => ({ scoreVisibility: 'score-and-responses' }),
        });
      const data = responseDocs[path.slice(RESPONSES.length + 1)];
      return Promise.resolve({
        ref: path,
        exists: () => data != null,
        data: () => data ?? {},
      });
    });
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    const publish = (expiresAt: number | null) =>
      act(async () => {
        await result.current.publishResultsForStudents(
          ASSIGNMENT_ID,
          quizData,
          ['pin-a'],
          'score-only',
          expiresAt
        );
      });
    // The student returns to the class level when the override is cleared or lapses.
    await publish(5000);
    expect(
      (patchFor('pin-a') as { answers: { isCorrect?: boolean }[] }).answers[0]
        .isCorrect
    ).toBe(true);
    batchUpdate.mockClear();
    await publish(null);
    expect(
      (patchFor('pin-a') as { answers: { isCorrect?: boolean }[] }).answers[0]
        .isCorrect
    ).toBe(true);
  });

  it('rejects the none level', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await expect(
        (
          result.current.publishResultsForStudents as unknown as (
            ...args: unknown[]
          ) => Promise<unknown>
        )(ASSIGNMENT_ID, quizData, ['pin-a'], 'none', null)
      ).rejects.toThrow(/hideResultsForStudents/);
    });
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('hideResultsForStudents writes a Hidden override and pulls the key and verdicts', async () => {
    responseDocs['pin-a'] = {
      studentUid: 's1',
      status: 'completed',
      answers: [{ questionId: 'q0', answer: 'a', isCorrect: true }],
      revealedAnswers: { q0: 'a' },
    };
    responseDocs['pin-b'] = { studentUid: 's2', status: 'completed' };
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.hideResultsForStudents(ASSIGNMENT_ID, [
        'pin-a',
        'pin-b',
        'pin-a',
      ]);
    });
    expect(batchUpdate).toHaveBeenCalledTimes(2);
    expect(patchFor('pin-a')).toEqual({
      resultsOverride: { mode: 'hidden', publishedAt: expect.any(Number) },
      revealedAnswers: DELETE_FIELD_SENTINEL,
      revealedRubricExamples: DELETE_FIELD_SENTINEL,
      revealedExplanations: DELETE_FIELD_SENTINEL,
      answers: [{ questionId: 'q0', answer: 'a' }],
    });
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('clearResultsOverride deletes the override', async () => {
    responseDocs['pin-a'] = { studentUid: 's1', status: 'completed' };
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.clearResultsOverride(ASSIGNMENT_ID, ['pin-a']);
    });
    expect(patchFor('pin-a')).toEqual({
      resultsOverride: DELETE_FIELD_SENTINEL,
    });
  });

  it('clearResultsOverride with the quiz restores what the class publish shows', async () => {
    responseDocs['pin-a'] = {
      studentUid: 's1',
      status: 'completed',
      answers: [{ questionId: 'q0', answer: 'a', answeredAt: 1 }],
      resultsOverride: { mode: 'hidden', publishedAt: 1 },
    };
    (getDoc as Mock).mockImplementation((path: string) => {
      if (path.startsWith(`${RESPONSES}/`)) {
        const data = responseDocs[path.slice(RESPONSES.length + 1)];
        return Promise.resolve({
          ref: path,
          exists: () => data != null,
          data: () => data ?? undefined,
        });
      }
      if (path === `quiz_sessions/${ASSIGNMENT_ID}`)
        return Promise.resolve({
          data: () => ({ scoreVisibility: 'score-responses-and-answers' }),
        });
      return Promise.resolve({ data: () => ({}) });
    });
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.clearResultsOverride(
        ASSIGNMENT_ID,
        ['pin-a'],
        quizData
      );
    });
    expect(patchFor('pin-a')).toMatchObject({
      resultsOverride: DELETE_FIELD_SENTINEL,
      revealedAnswers: { q0: 'a' },
      answers: [{ questionId: 'q0', answer: 'a', isCorrect: true }],
    });
  });
});

describe('classPublishPatch', () => {
  const opts = {
    visibility: 'score-responses-and-answers' as const,
    now: 10,
    answerKey: { q0: 'a' },
    rubricExamples: null,
    explanations: null,
  };
  const graded = {
    score: 100,
    answers: [{ questionId: 'q0', answer: 'a', isCorrect: true }],
  };

  it('keeps the key and verdicts off open attempts', () => {
    for (const status of ['joined', 'in-progress'] as const) {
      const patch = classPublishPatch(
        { studentUid: 's', status } as never,
        graded,
        opts
      );
      expect(patch.revealedAnswers).toBe(DELETE_FIELD_SENTINEL);
      expect(patch.answers).toEqual([{ questionId: 'q0', answer: 'a' }]);
    }
  });

  it('keeps the key and verdicts off a hidden student', () => {
    const patch = classPublishPatch(
      {
        studentUid: 's',
        status: 'completed',
        resultsOverride: { mode: 'hidden', publishedAt: 1 },
      } as never,
      graded,
      opts
    );
    expect(patch.revealedAnswers).toBe(DELETE_FIELD_SENTINEL);
    expect(patch.revealedRubricExamples).toBe(DELETE_FIELD_SENTINEL);
    expect(patch.answers).toEqual([{ questionId: 'q0', answer: 'a' }]);
  });

  it('writes the key and verdicts for a completed student', () => {
    const patch = classPublishPatch(
      { studentUid: 's', status: 'completed' } as never,
      graded,
      opts
    );
    expect(patch.revealedAnswers).toEqual({ q0: 'a' });
    expect(patch.answers).toEqual(graded.answers);
    expect(patch.score).toBe(100);
  });
});
