/** A Settings window edit must reach accommodated students' pointer docs, not only the assignment and session. */

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

const ACCOMMODATED = {
  id: 'a-1',
  createdAt: 1,
  quizTitle: 'Sample Quiz',
  targetMode: 'class',
  targetStudents: [{ kind: 'test', email: 's@example.org' }],
  overridesBySourcedId: {
    'test:s@example.org': { language: 'ru', readAloud: true },
  },
};
const CLASS_ONLY = { id: 'a-2', createdAt: 2, quizTitle: 'Plain' };

const OPEN = Date.UTC(2026, 9, 7, 13);
const CLOSE = Date.UTC(2026, 9, 16, 13, 48);

describe('useQuizAssignments.updateAssignmentSettings — pointer windows', () => {
  const batchUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    setAssignmentTargets.mockResolvedValue({
      written: 0,
      removed: 0,
      skipped: [],
    });
    (doc as Mock).mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    (collection as Mock).mockReturnValue('coll-ref');
    (onSnapshot as Mock).mockImplementation(
      (_q: unknown, onNext: (snap: unknown) => void) => {
        onNext({
          docs: [ACCOMMODATED, CLASS_ONLY].map(({ id, ...data }) => ({
            id,
            data: () => data,
          })),
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

  async function edit(
    id: string,
    patch: Parameters<
      ReturnType<typeof useQuizAssignments>['updateAssignmentSettings']
    >[1]
  ) {
    const { result } = renderHook(() => useQuizAssignments('teacher-1'));
    await waitFor(() => expect(result.current.assignments).toHaveLength(2));
    await act(async () => {
      await result.current.updateAssignmentSettings(id, patch);
    });
  }

  it('pushes a changed window to existing pointer docs', async () => {
    await edit('a-1', { openAt: OPEN, closeAt: CLOSE, dueAt: CLOSE });

    expect(setAssignmentTargets).toHaveBeenCalledWith({
      assignmentId: 'a-1',
      kind: 'quiz',
      sessionId: 'a-1',
      targetMode: 'class',
      add: [],
      remove: [],
      overridesBySourcedId: {},
      window: { openAt: OPEN, closeAt: CLOSE, dueAt: CLOSE },
    });
  });

  it('sends only the fields the edit changed, with null for a cleared one', async () => {
    await edit('a-1', { closeAt: null });

    expect(setAssignmentTargets).toHaveBeenCalledWith(
      expect.objectContaining({ window: { closeAt: null } })
    );
  });

  it('skips the call for a settings edit without a window change', async () => {
    await edit('a-1', { attemptLimit: 2 });
    expect(setAssignmentTargets).not.toHaveBeenCalled();
  });

  it('skips the call for an assignment with no pointer docs', async () => {
    await edit('a-2', { openAt: OPEN, closeAt: CLOSE });
    expect(setAssignmentTargets).not.toHaveBeenCalled();
    expect(batchUpdate).toHaveBeenCalled();
  });
});
