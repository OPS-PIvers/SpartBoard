import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import * as paging from '@/utils/firestorePaging';
import { useReconcileExpiredSubShares } from './useReconcileExpiredSubShares';
import type { GoogleDriveService } from '@/utils/googleDriveService';

vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/firestorePaging');

interface FakeShare {
  id: string;
  expiresAt?: number;
  driveGrants?: Array<{
    email?: string;
    fileId?: string;
    permissionId?: string;
  }>;
}

/** Build a QueryDocumentSnapshot stand-in for one shared_boards doc. */
function makeShareSnap(share: FakeShare) {
  const { id, ...data } = share;
  return {
    id,
    ref: { id } as unknown as firestore.DocumentReference,
    data: () => data,
  };
}

function makeDriveService() {
  return {
    deletePermission: vi.fn().mockResolvedValue(undefined),
  } as unknown as GoogleDriveService & {
    deletePermission: ReturnType<typeof vi.fn>;
  };
}

describe('useReconcileExpiredSubShares', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    (
      firestore.collection as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue('shared_boards');
    (firestore.where as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (...args: unknown[]) => ({ __where: args })
    );
    (firestore.query as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (...args: unknown[]) => ({ __query: args })
    );
    (
      firestore.deleteDoc as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
  });

  it('reads shares via readAllDocsPaged (bounded), never an unbounded getDocs', async () => {
    (
      paging.readAllDocsPaged as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);

    renderHook(() =>
      useReconcileExpiredSubShares({
        uid: 'teacher-1',
        driveService: makeDriveService(),
      })
    );

    await waitFor(() =>
      expect(paging.readAllDocsPaged).toHaveBeenCalledTimes(1)
    );
    // The unbounded path must not be used by this hook anymore.
    expect(firestore.getDocs).not.toHaveBeenCalled();
  });

  it('revokes grants for expired shares and deletes those docs, leaving active shares untouched', async () => {
    const now = Date.now();
    const expired = makeShareSnap({
      id: 'expired-1',
      expiresAt: now - 1000,
      driveGrants: [{ email: 's@x', fileId: 'file-1', permissionId: 'perm-1' }],
    });
    const active = makeShareSnap({
      id: 'active-1',
      expiresAt: now + 60_000,
      driveGrants: [{ email: 's@x', fileId: 'file-2', permissionId: 'perm-2' }],
    });
    (
      paging.readAllDocsPaged as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue([expired, active]);
    const driveService = makeDriveService();

    renderHook(() =>
      useReconcileExpiredSubShares({ uid: 'teacher-1', driveService })
    );

    await waitFor(() =>
      expect(driveService.deletePermission).toHaveBeenCalledWith(
        'file-1',
        'perm-1'
      )
    );
    // Active share's permission is never revoked.
    expect(driveService.deletePermission).not.toHaveBeenCalledWith(
      'file-2',
      'perm-2'
    );
    // Only the expired share doc is deleted.
    expect(firestore.deleteDoc).toHaveBeenCalledTimes(1);
    expect(firestore.deleteDoc).toHaveBeenCalledWith(expired.ref);
  });

  it('does NOT revoke a permissionId still referenced by an active share', async () => {
    const now = Date.now();
    // Both shares share permissionId perm-shared; only one is expired.
    const expired = makeShareSnap({
      id: 'expired-1',
      expiresAt: now - 1000,
      driveGrants: [
        { email: 's@x', fileId: 'file-1', permissionId: 'perm-shared' },
      ],
    });
    const active = makeShareSnap({
      id: 'active-1',
      expiresAt: now + 60_000,
      driveGrants: [
        { email: 's@x', fileId: 'file-1', permissionId: 'perm-shared' },
      ],
    });
    (
      paging.readAllDocsPaged as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue([expired, active]);
    const driveService = makeDriveService();

    renderHook(() =>
      useReconcileExpiredSubShares({ uid: 'teacher-1', driveService })
    );

    // Wait for the sweep to finish (expired doc deleted) — the shared
    // permission must be skipped because an active share still references it.
    await waitFor(() => expect(firestore.deleteDoc).toHaveBeenCalledTimes(1));
    expect(driveService.deletePermission).not.toHaveBeenCalled();
  });

  it('honours the once-per-session guard for a given uid', async () => {
    window.sessionStorage.setItem('spart_sub_reconcile_teacher-1', '1');
    (
      paging.readAllDocsPaged as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);

    renderHook(() =>
      useReconcileExpiredSubShares({
        uid: 'teacher-1',
        driveService: makeDriveService(),
      })
    );

    // Give any pending microtasks a chance to run; the guard should short-circuit.
    await Promise.resolve();
    expect(paging.readAllDocsPaged).not.toHaveBeenCalled();
  });
});
