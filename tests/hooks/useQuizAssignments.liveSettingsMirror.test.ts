/** Settings edited on a live assignment must reach its session doc, which students read. */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { collection, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';

const setAssignmentTargets = vi.fn();

vi.mock('@/hooks/useSetAssignmentTargets', () => ({
  useSetAssignmentTargets: () => ({ setAssignmentTargets }),
}));

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

const LIVE = {
  id: 'a-1',
  createdAt: 1,
  quizTitle: 'Live Quiz',
  sessionOptions: { tabWarningsEnabled: true, shuffleQuestions: true },
  attemptLimit: 1,
};

describe('useQuizAssignments.updateAssignmentSettings — live session mirror', () => {
  const batchUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (doc as Mock).mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    (collection as Mock).mockReturnValue('coll-ref');
    (onSnapshot as Mock).mockImplementation(
      (_q: unknown, onNext: (snap: unknown) => void) => {
        onNext({
          docs: [LIVE].map(({ id, ...data }) => ({ id, data: () => data })),
        });
        return () => undefined;
      }
    );
    (writeBatch as Mock).mockReturnValue({
      set: vi.fn(),
      update: batchUpdate,
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('copies edited rules to the session students are working in', async () => {
    const { result } = renderHook(() => useQuizAssignments('teacher-1'));
    await waitFor(() => expect(result.current.assignments).toHaveLength(1));
    await act(async () => {
      await result.current.updateAssignmentSettings('a-1', {
        attemptLimit: 3,
        sessionOptions: {
          tabWarningsEnabled: true,
          shuffleQuestions: true,
          blockCopyPaste: true,
          showResultToStudent: true,
        },
      });
    });

    const sessionPatch = batchUpdate.mock.calls.find(
      ([ref]) => ref === 'quiz_sessions/a-1'
    )?.[1] as Record<string, unknown>;
    expect(sessionPatch).toEqual(
      expect.objectContaining({
        attemptLimit: 3,
        blockCopyPaste: true,
        showResultToStudent: true,
        // Mirrored even though unchanged on the assignment, so a session the old monitor switch changed is corrected.
        tabWarningsEnabled: true,
      })
    );
    // Unchanged keys stay off the session patch.
    expect(sessionPatch).not.toHaveProperty('shuffleQuestions');
  });
});
