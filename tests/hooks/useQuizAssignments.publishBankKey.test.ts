/** Publishing a bank-draw assignment refreshes the key the server graders read. */

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

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockGetDoc = getDoc as Mock;
const mockGetDocs = getDocs as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockWriteBatch = writeBatch as Mock;

const TEACHER_UID = 'teacher-1';
const ASSIGNMENT_ID = 'assign-bank-1';
const KEY_PATH = `users/${TEACHER_UID}/quiz_assignments/${ASSIGNMENT_ID}/key/answers`;

const quizData = {
  id: 'quiz-bank-1',
  title: 'Vocab',
  questions: [
    {
      id: 'b1',
      text: 'Studies of identical twins are called ____.',
      type: 'FIB' as const,
      correctAnswer: 'Twin studies',
      incorrectAnswers: [],
      alternateAnswers: ['Twins studies'],
      timeLimit: 0,
      points: 1,
    },
  ],
  createdAt: 0,
  updatedAt: 0,
} satisfies QuizData;

describe('useQuizAssignments — publish refreshes a bank draw’s server key', () => {
  const batchUpdate = vi.fn();
  const batchSet = vi.fn();
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
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      update: batchUpdate,
      set: batchSet,
      commit: batchCommit,
    });
  });

  const publish = async (
    assignmentDoc: Record<string, unknown>,
    keyExists: boolean
  ) => {
    mockGetDoc.mockImplementation((ref: string) =>
      Promise.resolve(
        ref === KEY_PATH
          ? { exists: () => keyExists, data: () => ({ questions: [] }) }
          : { exists: () => true, data: () => assignmentDoc }
      )
    );
    mockGetDocs.mockResolvedValue({ docs: [] });
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        quizData,
        'score-only'
      );
    });
  };

  it('rewrites the key with the answer key it published with', async () => {
    await publish({ resolvedDriveFileId: 'frozen-1' }, true);
    expect(batchSet).toHaveBeenCalledWith(KEY_PATH, {
      questions: [
        expect.objectContaining({
          id: 'b1',
          correctAnswer: 'Twin studies',
          alternateAnswers: ['Twins studies'],
        }),
      ],
    });
  });

  it('never creates a key the assignment did not have', async () => {
    await publish({ resolvedDriveFileId: 'frozen-1' }, false);
    expect(batchSet).not.toHaveBeenCalled();
  });

  it('leaves a quiz without bank draws alone', async () => {
    await publish({}, true);
    expect(batchSet).not.toHaveBeenCalled();
  });
});
