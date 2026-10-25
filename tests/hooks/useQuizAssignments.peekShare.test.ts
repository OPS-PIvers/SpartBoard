/** Peeking a synced share offers Synced only while its author is still in the group. */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook } from '@testing-library/react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import { isSyncedQuizGroupParticipant } from '@/hooks/useSyncedQuizGroups';

vi.mock('@/hooks/useSetAssignmentTargets', () => ({
  useSetAssignmentTargets: () => ({ setAssignmentTargets: vi.fn() }),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(),
  documentId: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  query: vi.fn(),
  startAfter: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { fromMillis: vi.fn() },
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('@/hooks/useSyncedQuizGroups', () => ({
  callJoinSyncedQuizGroup: vi.fn(),
  callLeaveSyncedQuizGroup: vi.fn(),
  createSyncedQuizGroup: vi.fn(),
  isSyncedQuizGroupParticipant: vi.fn(),
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
  auth: { currentUser: null },
}));

vi.mock('@/hooks/usePlcAssignmentIndex', () => ({
  writePlcAssignmentIndexEntry: vi.fn(),
  mirrorPlcAssignmentStatus: vi.fn(),
}));

vi.mock('@/hooks/usePlcAssignments', () => ({
  writePlcAssignmentTemplate: vi.fn(),
}));

describe('useQuizAssignments.peekSharedAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (doc as Mock).mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    (onSnapshot as Mock).mockReturnValue(() => undefined);
    (getDoc as Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        title: 'Quiz',
        originalAuthor: 'author-1',
        syncGroupId: 'group-1',
        assignmentSettings: {},
      }),
    });
  });

  it('offers sync while the author is a participant', async () => {
    (isSyncedQuizGroupParticipant as Mock).mockResolvedValue(true);
    const { result } = renderHook(() => useQuizAssignments('teacher-1'));
    const preview = await result.current.peekSharedAssignment('share-1');
    expect(preview.syncGroupId).toBe('group-1');
    expect(isSyncedQuizGroupParticipant).toHaveBeenCalledWith(
      'group-1',
      'author-1'
    );
  });

  it('drops sync once the author has left the group', async () => {
    (isSyncedQuizGroupParticipant as Mock).mockResolvedValue(false);
    const { result } = renderHook(() => useQuizAssignments('teacher-1'));
    const preview = await result.current.peekSharedAssignment('share-1');
    expect(preview.syncGroupId).toBeUndefined();
    expect(preview.title).toBe('Quiz');
  });
});
