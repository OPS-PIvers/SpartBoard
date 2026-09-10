/**
 * PR 2 of docs/plans/PLC_ASSESSMENT_DATA.md (D12): retroactive
 * "Share results with PLC" / "Stop sharing" write the session link fields
 * and the assignment's `plc` linkage together in one batch.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { collection, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import type { Plc } from '@/types';

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

const TEACHER_UID = 'teacher-1';
const ASSIGNMENT_ID = 'assign-1';
const DELETE = { __deleteFieldSentinel: true };

const PLC = {
  id: 'plc-42',
  name: 'Math PLC',
  leadUid: 'lead-1',
  memberUids: ['lead-1', TEACHER_UID],
  memberEmails: { 'lead-1': 'lead@x.com', [TEACHER_UID]: 'alice@x.com' },
  createdAt: 1,
  updatedAt: 1,
} as unknown as Plc;

describe('useQuizAssignments — retroactive PLC results sharing', () => {
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockReturnValue('coll-ref');
    mockOnSnapshot.mockReturnValue(() => undefined);
    batchUpdate.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      set: vi.fn(),
      update: batchUpdate,
      commit: batchCommit,
    });
  });

  function findUpdate(prefix: string): Record<string, unknown> {
    const call = batchUpdate.mock.calls.find(
      ([ref]) => typeof ref === 'string' && ref.startsWith(prefix)
    );
    if (!call) throw new Error(`${prefix} was not updated`);
    return call[1] as Record<string, unknown>;
  }

  it('shareAssignmentWithPlc stamps the session link and the assignment linkage in one batch', async () => {
    const before = Date.now();
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.shareAssignmentWithPlc(ASSIGNMENT_ID, {
        plc: PLC,
        poolSyncGroupId: 'pool-group-1',
      });
    });

    const session = findUpdate(`quiz_sessions/${ASSIGNMENT_ID}`);
    expect(session.plcId).toBe('plc-42');
    expect(session.syncGroupId).toBe('pool-group-1');
    expect(session.plcLinkedAt as number).toBeGreaterThanOrEqual(before);

    const assignment = findUpdate(
      `users/${TEACHER_UID}/quiz_assignments/${ASSIGNMENT_ID}`
    );
    expect(assignment.plc).toEqual({
      id: 'plc-42',
      name: 'Math PLC',
      memberEmails: expect.arrayContaining(['lead@x.com', 'alice@x.com']),
    });
    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('shareAssignmentWithPlc refuses an empty pool key', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await expect(
      result.current.shareAssignmentWithPlc(ASSIGNMENT_ID, {
        plc: PLC,
        poolSyncGroupId: '',
      })
    ).rejects.toThrow();
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('stopSharingAssignmentWithPlc deletes the link fields on both docs', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.stopSharingAssignmentWithPlc(ASSIGNMENT_ID);
    });

    const session = findUpdate(`quiz_sessions/${ASSIGNMENT_ID}`);
    expect(session).toEqual({
      plcId: DELETE,
      syncGroupId: DELETE,
      plcLinkedAt: DELETE,
    });

    const assignment = findUpdate(
      `users/${TEACHER_UID}/quiz_assignments/${ASSIGNMENT_ID}`
    );
    expect(assignment.plc).toEqual(DELETE);
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('both actions throw when signed out', async () => {
    const { result } = renderHook(() => useQuizAssignments(undefined));
    await expect(
      result.current.shareAssignmentWithPlc(ASSIGNMENT_ID, {
        plc: PLC,
        poolSyncGroupId: 'pool-group-1',
      })
    ).rejects.toThrow('Not authenticated');
    await expect(
      result.current.stopSharingAssignmentWithPlc(ASSIGNMENT_ID)
    ).rejects.toThrow('Not authenticated');
  });
});
