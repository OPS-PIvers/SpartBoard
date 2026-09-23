/** Per-period sessions keep their questions in content/questions (PER_PERIOD_ASSIGNMENT_ACCESS.md). */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import type { PeriodAccess, QuizQuestion } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
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
  isAuthBypass: false,
  auth: { currentUser: { displayName: 'Alice', email: 'alice@example.com' } },
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

const QUIZ = {
  id: 'quiz-1',
  title: 'Cells',
  driveFileId: 'drive-1',
  questions: [
    {
      id: 'q1',
      type: 'MC',
      text: 'What is a cell?',
      timeLimit: 30,
      correctAnswer: 'a',
      incorrectAnswers: ['b'],
      stimulusIds: ['s1'],
    } as QuizQuestion,
  ],
  stimuli: [
    { id: 's1', kind: 'text', text: 'Passage', readAloudText: 'Passage' },
  ],
} as unknown as Parameters<
  ReturnType<typeof useQuizAssignments>['createAssignment']
>[0];

const period = (label: string): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label,
});
const PERIODS = { 'cl-1': period('P1'), 'cl-3': period('P3') };

describe('useQuizAssignments — per-period sessions', () => {
  const batchSet = vi.fn();
  const batchDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockReturnValue('coll-ref');
    mockOnSnapshot.mockReturnValue(() => undefined);
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    (getDoc as Mock).mockResolvedValue({ data: () => ({}) });
    (deleteDoc as Mock).mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      set: batchSet,
      update: vi.fn(),
      delete: batchDelete,
      commit: vi.fn().mockResolvedValue(undefined),
    });
  });

  const setAt = (path: string): Record<string, unknown> | undefined =>
    batchSet.mock.calls.find(([ref]) => ref === path)?.[1] as
      | Record<string, unknown>
      | undefined;

  async function create(withPeriods: boolean): Promise<string> {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    let id = '';
    await act(async () => {
      ({ id } = await result.current.createAssignment(
        QUIZ,
        { sessionMode: 'student', sessionOptions: {} },
        withPeriods
          ? { accessMode: 'assessment', periodAccess: PERIODS }
          : undefined
      ));
    });
    return id;
  }

  it('moves the questions into the content doc in the same batch', async () => {
    const id = await create(true);
    const session = setAt(`quiz_sessions/${id}`);
    const content = setAt(`quiz_sessions/${id}/content/questions`);
    expect(session).toMatchObject({
      publicQuestions: [],
      questionsInContent: true,
      accessMode: 'assessment',
      periodAccess: PERIODS,
      totalQuestions: 1,
    });
    expect(session).not.toHaveProperty('stimuli');
    expect(session).not.toHaveProperty('readAloudTextByStimulusId');
    expect(content?.publicQuestions).toEqual([
      expect.objectContaining({ id: 'q1', text: 'What is a cell?' }),
    ]);
    expect(content?.stimuli).toEqual([expect.objectContaining({ id: 's1' })]);
    expect(setAt(`users/${TEACHER_UID}/quiz_assignments/${id}`)).toMatchObject({
      accessMode: 'assessment',
      periodAccess: PERIODS,
    });
  });

  it('keeps a legacy session unchanged', async () => {
    const id = await create(false);
    const session = setAt(`quiz_sessions/${id}`);
    expect(session?.publicQuestions).toHaveLength(1);
    expect(session).not.toHaveProperty('questionsInContent');
    expect(setAt(`quiz_sessions/${id}/content/questions`)).toBeUndefined();
  });

  it('deletes the content doc before the session goes', async () => {
    (getDoc as Mock).mockResolvedValue({
      data: () => ({ code: 'ABC123', questionsInContent: true }),
    });
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.deleteAssignment('a-1');
    });
    expect(deleteDoc).toHaveBeenCalledWith(
      'quiz_sessions/a-1/content/questions'
    );
    expect(batchDelete).toHaveBeenCalledWith('quiz_sessions/a-1');
  });
});
