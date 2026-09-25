import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
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
  runTransaction: vi.fn(),
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

const authMock: {
  currentUser: { displayName?: string; email?: string } | null;
} = {
  currentUser: null,
};
vi.mock('@/config/firebase', () => ({
  db: {},
  get auth() {
    return authMock;
  },
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
const mockOnSnapshot = onSnapshot as Mock;
const mockWriteBatch = writeBatch as Mock;
const mockGetDocs = getDocs as Mock;

const TEACHER_UID = 'teacher-1';
const ASSIGNMENT_ID = 'assignment-1';

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
      points: 2,
    },
  ],
  createdAt: 0,
  updatedAt: 0,
} satisfies QuizData;

const RESPONSES = `quiz_sessions/${ASSIGNMENT_ID}/responses`;

const typedResponse = {
  studentUid: 's-typed',
  status: 'completed',
  answers: [{ questionId: 'q0', answer: 'a', answeredAt: 1 }],
};
const paperPending = {
  studentUid: 's-paper',
  status: 'completed',
  paperBatchId: 'batch-1',
  answers: [
    { questionId: 'q0', answer: 'a', answeredAt: 1 },
    {
      questionId: 'q1',
      answer: '',
      answeredAt: 1,
      paperScanId: 'scan-1',
      paperTranscript: 'pending',
    },
  ],
};
const paperDone = {
  ...paperPending,
  answers: [
    paperPending.answers[0],
    {
      ...paperPending.answers[1],
      answer: 'Photosynthesis makes sugar',
      paperTranscript: 'done',
    },
  ],
};

function snap(key: string, data: Record<string, unknown>) {
  return {
    id: key,
    ref: `${RESPONSES}/${key}`,
    exists: () => true,
    data: () => data,
  };
}

describe('useQuizAssignments — handwritten paper answers on publish', () => {
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();
  const txUpdate = vi.fn();
  // What the transaction reads: the worker's transcript has landed since the page read.
  let liveDocs: Record<string, Record<string, unknown>> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockOnSnapshot.mockReturnValue(() => undefined);
    batchCommit.mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    });
    liveDocs = {};
    (runTransaction as Mock).mockImplementation(
      async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          get: (ref: string) => {
            const data = liveDocs[ref.slice(RESPONSES.length + 1)];
            return Promise.resolve({
              ref,
              exists: () => data != null,
              data: () => data,
            });
          },
          update: txUpdate,
        })
    );
  });

  function patchFor(ref: string): Record<string, unknown> | undefined {
    return batchUpdate.mock.calls.find(([r]) => r === ref)?.[1] as
      | Record<string, unknown>
      | undefined;
  }

  it('copies the mode onto the assignment and session', async () => {
    (getDoc as Mock).mockResolvedValue({ data: () => ({}) });
    mockGetDocs.mockResolvedValue({ docs: [] });
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        quizData,
        'score-and-responses',
        undefined,
        'typed'
      );
    });
    expect(
      patchFor(`users/${TEACHER_UID}/quiz_assignments/${ASSIGNMENT_ID}`)
    ).toMatchObject({ writtenReturnMode: 'typed' });
    expect(patchFor(`quiz_sessions/${ASSIGNMENT_ID}`)).toMatchObject({
      writtenReturnMode: 'typed',
    });
  });

  it('leaves the mode untouched when the caller omits it', async () => {
    (getDoc as Mock).mockResolvedValue({ data: () => ({}) });
    mockGetDocs.mockResolvedValue({ docs: [] });
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        quizData,
        'score-only'
      );
    });
    expect(
      patchFor(`users/${TEACHER_UID}/quiz_assignments/${ASSIGNMENT_ID}`)
    ).not.toHaveProperty('writtenReturnMode');
    expect(patchFor(`quiz_sessions/${ASSIGNMENT_ID}`)).not.toHaveProperty(
      'writtenReturnMode'
    );
  });

  it('clears the mode on unpublish', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.unpublishAssignmentScores(ASSIGNMENT_ID);
    });
    expect(
      patchFor(`users/${TEACHER_UID}/quiz_assignments/${ASSIGNMENT_ID}`)
    ).toMatchObject({ writtenReturnMode: DELETE_FIELD_SENTINEL });
    expect(patchFor(`quiz_sessions/${ASSIGNMENT_ID}`)).toMatchObject({
      writtenReturnMode: DELETE_FIELD_SENTINEL,
    });
  });

  it('keeps a transcript that landed between the read and the publish', async () => {
    (getDoc as Mock).mockResolvedValue({ data: () => ({}) });
    mockGetDocs.mockResolvedValue({
      docs: [snap('s-typed', typedResponse), snap('s-paper', paperPending)],
    });
    liveDocs = { 's-paper': paperDone };
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    let outcome: { responsesUpdated: number } | undefined;
    await act(async () => {
      outcome = await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        quizData,
        'score-and-responses'
      );
    });
    expect(outcome?.responsesUpdated).toBe(2);
    // Typed rows keep the batched path.
    expect(patchFor(`${RESPONSES}/s-typed`)).toBeDefined();
    expect(patchFor(`${RESPONSES}/s-paper`)).toBeUndefined();
    expect(txUpdate).toHaveBeenCalledTimes(1);
    const [ref, patch] = txUpdate.mock.calls[0] as [
      string,
      { answers: Array<{ questionId: string; answer: string }> },
    ];
    expect(ref).toBe(`${RESPONSES}/s-paper`);
    expect(patch.answers.find((a) => a.questionId === 'q1')).toMatchObject({
      answer: 'Photosynthesis makes sugar',
      paperTranscript: 'done',
    });
  });

  it('publishes to chosen students through the same transaction', async () => {
    (getDoc as Mock).mockImplementation((path: string) => {
      if (path === `${RESPONSES}/s-paper`)
        return Promise.resolve(snap('s-paper', paperPending));
      return Promise.resolve({ data: () => ({}) });
    });
    liveDocs = { 's-paper': paperDone };
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    let outcome: { responsesUpdated: number; skipped: number } | undefined;
    await act(async () => {
      outcome = await result.current.publishResultsForStudents(
        ASSIGNMENT_ID,
        quizData,
        ['s-paper'],
        'score-and-responses',
        null
      );
    });
    expect(outcome).toEqual({ responsesUpdated: 1, skipped: 0 });
    expect(batchCommit).not.toHaveBeenCalled();
    const [, patch] = txUpdate.mock.calls[0] as [
      string,
      {
        answers: Array<{ questionId: string; answer: string }>;
        resultsOverride: { mode: string };
      },
    ];
    expect(patch.resultsOverride.mode).toBe('shown');
    expect(patch.answers.find((a) => a.questionId === 'q1')?.answer).toBe(
      'Photosynthesis makes sugar'
    );
  });

  it('counts pending transcripts', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        snap('s-typed', typedResponse),
        snap('s-paper', paperPending),
        snap('s-done', paperDone),
      ],
    });
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    let count = -1;
    await act(async () => {
      count = await result.current.countPendingPaperTranscripts(ASSIGNMENT_ID);
    });
    expect(count).toBe(1);
  });
});
