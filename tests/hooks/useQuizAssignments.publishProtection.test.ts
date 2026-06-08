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
import type { QuizData, ResultsProtection } from '@/types';

// `deleteField()` returns a Firestore sentinel; the production code stores
// the sentinel in the patch object and Firestore SDK interprets it on the
// wire. For tests we use a unique branded marker so assertions can verify
// the sentinel landed in the right field without depending on the real SDK.
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

vi.mock('@/utils/plcContributions', () => ({
  deletePlcContribution: vi.fn().mockResolvedValue(undefined),
}));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockWriteBatch = writeBatch as Mock;
const mockGetDocs = getDocs as Mock;

const TEACHER_UID = 'teacher-1';
const ASSIGNMENT_ID = 'assignment-1';

// Minimal canonical quiz fixture — one MC question is enough; the
// protection plumbing doesn't depend on quiz content.
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
  ],
  createdAt: 0,
  updatedAt: 0,
} satisfies QuizData;

describe('useQuizAssignments — publishAssignmentScores protection mirroring', () => {
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
    // No responses — keep these tests focused on the assignment + session
    // doc writes, where the protection field is mirrored.
    mockGetDocs.mockResolvedValue({ docs: [] });
  });

  function findAssignmentPatch(): Record<string, unknown> {
    const call = batchUpdate.mock.calls.find(
      ([ref]) =>
        typeof ref === 'string' &&
        ref.startsWith(`users/${TEACHER_UID}/quiz_assignments/`)
    );
    if (!call) throw new Error('expected batch.update on assignment doc');
    return call[1] as Record<string, unknown>;
  }

  function findSessionPatch(): Record<string, unknown> {
    const call = batchUpdate.mock.calls.find(
      ([ref]) => typeof ref === 'string' && ref.startsWith('quiz_sessions/')
    );
    if (!call) throw new Error('expected batch.update on session doc');
    return call[1] as Record<string, unknown>;
  }

  it('writes protection to both assignment and session docs when supplied', async () => {
    const protection: ResultsProtection = {
      watermarkEnabled: true,
      tabWarningEnabled: true,
      tabWarningThreshold: 2,
    };

    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        quizData,
        'score-responses-and-answers',
        protection
      );
    });

    // The student app only reads the session doc, so the protection settings
    // MUST mirror onto the session — otherwise watermark + tab-warning
    // configuration is invisible to students. The teacher's archive view
    // reads the assignment doc, so it lives there too.
    expect(findAssignmentPatch()).toMatchObject({ protection });
    expect(findSessionPatch()).toMatchObject({ protection });
  });

  it('writes deleteField() for protection on both docs when caller omits it (back-compat + stale-settings clearing)', async () => {
    // Older publish callers won't supply protection. Re-publishing without
    // protection must wipe any prior protection settings rather than
    // silently leaving the stale values in place. `deleteField()` is the
    // Firestore sentinel that removes a field; we test for the test-only
    // marker the firebase/firestore mock returns.
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        quizData,
        'score-only'
      );
    });

    expect(findAssignmentPatch()).toMatchObject({
      protection: DELETE_FIELD_SENTINEL,
    });
    expect(findSessionPatch()).toMatchObject({
      protection: DELETE_FIELD_SENTINEL,
    });
  });

  it('unpublishAssignmentScores clears protection on both docs', async () => {
    // Unpublish is the "wipe everything related to publication" exit;
    // protection settings are part of that surface and must go with it.
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.unpublishAssignmentScores(ASSIGNMENT_ID);
    });

    expect(findAssignmentPatch()).toMatchObject({
      protection: DELETE_FIELD_SENTINEL,
    });
    expect(findSessionPatch()).toMatchObject({
      protection: DELETE_FIELD_SENTINEL,
    });
  });
});
