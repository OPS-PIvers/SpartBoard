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
  namesFileId?: string;
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

/** A /shared_collections parent with no sub-docs to reap. */
function makeCollectionSnap(share: FakeShare) {
  const { id, ...data } = share;
  return {
    id,
    ref: {
      id,
      parent: { id: 'shared_collections' },
    } as unknown as firestore.DocumentReference,
    data: () => data,
  };
}

function makeDriveService() {
  const deletePermission = vi.fn().mockResolvedValue(undefined);
  const trashFile = vi.fn().mockResolvedValue(undefined);
  const getPermission = vi.fn((_fileId: string, permissionId: string) =>
    Promise.resolve({
      id: permissionId,
      type: 'user',
      role: 'reader',
      emailAddress: 's@x',
    })
  );
  const getFileNameIfExists = vi.fn((fileId: string): Promise<string | null> =>
    Promise.resolve(`${fileId.replace(/^names-/, '')}-names.json`)
  );
  const driveService = {
    deletePermission,
    trashFile,
    getPermission,
    getFileNameIfExists,
  } as unknown as GoogleDriveService;
  return {
    driveService,
    deletePermission,
    trashFile,
    getPermission,
    getFileNameIfExists,
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
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ docs: [] });
  });

  it('reads shares via readAllDocsPaged (bounded) for BOTH share surfaces, never an unbounded getDocs', async () => {
    (
      paging.readAllDocsPaged as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);

    renderHook(() =>
      useReconcileExpiredSubShares({
        uid: 'teacher-1',
        driveService: makeDriveService().driveService,
      })
    );

    // One paged read per surface: /shared_boards + /shared_collections.
    await waitFor(() =>
      expect(paging.readAllDocsPaged).toHaveBeenCalledTimes(2)
    );
    // The unbounded path must not be used for the share LISTING — getDocs is
    // only used to reap a Collection's `boards/` subcollection on delete,
    // which doesn't happen when there are no expired docs.
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
    (paging.readAllDocsPaged as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([expired, active]) // /shared_boards
      .mockResolvedValueOnce([]); // /shared_collections
    const { driveService, deletePermission } = makeDriveService();

    renderHook(() =>
      useReconcileExpiredSubShares({ uid: 'teacher-1', driveService })
    );

    await waitFor(() =>
      expect(deletePermission).toHaveBeenCalledWith('file-1', 'perm-1')
    );
    // Active share's permission is never revoked.
    expect(deletePermission).not.toHaveBeenCalledWith('file-2', 'perm-2');
    // Only the expired share doc is deleted.
    expect(firestore.deleteDoc).toHaveBeenCalledTimes(1);
    expect(firestore.deleteDoc).toHaveBeenCalledWith(expired.ref);
  });

  // The names file holds a class list and belongs to this share alone, so it
  // goes with the share rather than sitting in the teacher's Drive.
  it('trashes an expired share’s names file and keeps an active one', async () => {
    const now = Date.now();
    const expired = makeCollectionSnap({
      id: 'expired',
      expiresAt: now - 1000,
      namesFileId: 'names-expired',
    });
    const active = makeCollectionSnap({
      id: 'active',
      expiresAt: now + 60_000,
      namesFileId: 'names-active',
    });
    (paging.readAllDocsPaged as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([expired, active]);
    const { driveService, trashFile } = makeDriveService();

    renderHook(() =>
      useReconcileExpiredSubShares({ uid: 'teacher-1', driveService })
    );

    await waitFor(() =>
      expect(trashFile).toHaveBeenCalledWith('names-expired')
    );
    expect(trashFile).not.toHaveBeenCalledWith('names-active');
    expect(firestore.deleteDoc).toHaveBeenCalledWith(expired.ref);
  });

  // Otherwise the share doc goes and nothing is left to say the file exists.
  it('keeps the share doc when its names file cannot be trashed', async () => {
    const now = Date.now();
    const expired = makeCollectionSnap({
      id: 'expired',
      expiresAt: now - 1000,
      namesFileId: 'names-expired',
    });
    (paging.readAllDocsPaged as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([expired]);
    const { driveService, trashFile } = makeDriveService();
    trashFile.mockRejectedValue(new Error('drive down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    renderHook(() =>
      useReconcileExpiredSubShares({ uid: 'teacher-1', driveService })
    );

    await waitFor(() => expect(trashFile).toHaveBeenCalled());
    expect(firestore.deleteDoc).not.toHaveBeenCalled();
  });

  // A doc the teacher did not write must not steer their Drive token at other files.
  it('never trashes a names file on a board share or one not named for the share', async () => {
    const now = Date.now();
    const boardShare = makeShareSnap({
      id: 'planted-board',
      expiresAt: now - 1000,
      namesFileId: 'victim-roster',
    });
    const collectionShare = makeCollectionSnap({
      id: 'planted-coll',
      expiresAt: now - 1000,
      namesFileId: 'victim-roster-2',
    });
    (paging.readAllDocsPaged as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([boardShare])
      .mockResolvedValueOnce([collectionShare]);
    const { driveService, trashFile, getFileNameIfExists } = makeDriveService();
    getFileNameIfExists.mockResolvedValue('Period 3 roster.json');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    renderHook(() =>
      useReconcileExpiredSubShares({ uid: 'teacher-1', driveService })
    );

    await waitFor(() => expect(firestore.deleteDoc).toHaveBeenCalledTimes(2));
    expect(getFileNameIfExists).toHaveBeenCalledTimes(1);
    expect(getFileNameIfExists).toHaveBeenCalledWith('victim-roster-2');
    expect(trashFile).not.toHaveBeenCalled();
  });

  it('never revokes a permission that is not a reader grant to the recorded email', async () => {
    const now = Date.now();
    const planted = makeShareSnap({
      id: 'planted',
      expiresAt: now - 1000,
      driveGrants: [
        { email: 's@x', fileId: 'file-1', permissionId: 'perm-owner' },
        { email: 's@x', fileId: 'file-2', permissionId: 'perm-coteacher' },
        { email: 'x', fileId: 'file-3', permissionId: 'perm-x' },
      ],
    });
    (paging.readAllDocsPaged as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([planted])
      .mockResolvedValueOnce([]);
    const { driveService, deletePermission, getPermission } =
      makeDriveService();
    getPermission.mockImplementation((_fileId, permissionId) =>
      Promise.resolve(
        permissionId === 'perm-owner'
          ? {
              id: permissionId,
              type: 'user',
              role: 'owner',
              emailAddress: 's@x',
            }
          : permissionId === 'perm-coteacher'
            ? {
                id: permissionId,
                type: 'user',
                role: 'reader',
                emailAddress: 'coteacher@x',
              }
            : { id: permissionId, type: 'anyone', role: 'reader' }
      )
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    renderHook(() =>
      useReconcileExpiredSubShares({ uid: 'teacher-1', driveService })
    );

    await waitFor(() => expect(firestore.deleteDoc).toHaveBeenCalledTimes(1));
    expect(getPermission).toHaveBeenCalledTimes(3);
    expect(deletePermission).not.toHaveBeenCalled();
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
    (paging.readAllDocsPaged as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([expired, active]) // /shared_boards
      .mockResolvedValueOnce([]); // /shared_collections
    const { driveService, deletePermission } = makeDriveService();

    renderHook(() =>
      useReconcileExpiredSubShares({ uid: 'teacher-1', driveService })
    );

    // Wait for the sweep to finish (expired doc deleted) — the shared
    // permission must be skipped because an active share still references it.
    await waitFor(() => expect(firestore.deleteDoc).toHaveBeenCalledTimes(1));
    expect(deletePermission).not.toHaveBeenCalled();
  });

  it('reaps a Collection share boards/ subcollection before deleting the parent, and refcounts grants across both surfaces', async () => {
    const now = Date.now();
    // Active board share references perm-shared — the expired Collection share
    // references the SAME permissionId, so it must NOT be revoked.
    const activeBoard = makeShareSnap({
      id: 'active-board',
      expiresAt: now + 60_000,
      driveGrants: [
        { email: 's@x', fileId: 'file-1', permissionId: 'perm-shared' },
      ],
    });
    // Expired collection parent with a `boards/` subcollection. Its ref carries
    // a `parent.id === 'shared_collections'` marker + a `collection('boards')`
    // accessor so the production code can reap board sub-docs.
    const boardDocRefs = [
      { __board: 'b1' } as unknown as firestore.DocumentReference,
      { __board: 'b2' } as unknown as firestore.DocumentReference,
    ];
    const collectionRef = {
      id: 'expired-coll',
      parent: { id: 'shared_collections' },
      collection: vi.fn(() => ({ __boardsCol: true })),
    } as unknown as firestore.DocumentReference;
    const expiredCollection = {
      id: 'expired-coll',
      ref: collectionRef,
      data: () => ({
        expiresAt: now - 1000,
        driveGrants: [
          { email: 's@x', fileId: 'file-1', permissionId: 'perm-shared' },
        ],
      }),
    };

    (paging.readAllDocsPaged as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([activeBoard]) // /shared_boards
      .mockResolvedValueOnce([expiredCollection]); // /shared_collections

    // getDocs is used to enumerate the boards/ subcollection on delete.
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ docs: boardDocRefs.map((ref) => ({ ref })) });

    const { driveService, deletePermission } = makeDriveService();
    renderHook(() =>
      useReconcileExpiredSubShares({ uid: 'teacher-1', driveService })
    );

    // The parent doc is deleted once the (shared) grant is correctly skipped.
    await waitFor(() =>
      expect(firestore.deleteDoc).toHaveBeenCalledWith(collectionRef)
    );
    // Shared permission must NOT be revoked — an active board share still holds it.
    expect(deletePermission).not.toHaveBeenCalled();
    // Both board sub-docs were deleted before the parent.
    expect(firestore.deleteDoc).toHaveBeenCalledWith(boardDocRefs[0]);
    expect(firestore.deleteDoc).toHaveBeenCalledWith(boardDocRefs[1]);
  });

  // Bundled content and answer keys are read-gated by the parent's expiresAt,
  // so a parent deleted without them leaves docs nothing will ever reap.
  it('reaps content/ and keys/ alongside boards/', async () => {
    const now = Date.now();
    const collectionRef = {
      id: 'expired-coll',
      parent: { id: 'shared_collections' },
      collection: vi.fn((_ref: unknown, name: string) => ({ __col: name })),
    } as unknown as firestore.DocumentReference;
    const expiredCollection = {
      id: 'expired-coll',
      ref: collectionRef,
      data: () => ({ expiresAt: now - 1000 }),
    };

    (paging.readAllDocsPaged as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // /shared_boards
      .mockResolvedValueOnce([expiredCollection]); // /shared_collections

    // One doc per sub-collection, named after the collection asked for.
    (
      firestore.collection as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((_ref: unknown, name: string) => ({ __col: name }));
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((col: { __col: string }) =>
      Promise.resolve({ docs: [{ ref: { __sub: col.__col } }] })
    );

    renderHook(() =>
      useReconcileExpiredSubShares({
        uid: 'teacher-1',
        driveService: makeDriveService().driveService,
      })
    );

    await waitFor(() =>
      expect(firestore.deleteDoc).toHaveBeenCalledWith(collectionRef)
    );
    for (const name of ['boards', 'content', 'keys']) {
      expect(firestore.deleteDoc).toHaveBeenCalledWith({ __sub: name });
    }
  });

  it('honours the once-per-session guard for a given uid', async () => {
    window.sessionStorage.setItem('spart_sub_reconcile_teacher-1', '1');
    (
      paging.readAllDocsPaged as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);

    renderHook(() =>
      useReconcileExpiredSubShares({
        uid: 'teacher-1',
        driveService: makeDriveService().driveService,
      })
    );

    // Give any pending microtasks a chance to run; the guard should short-circuit.
    await Promise.resolve();
    expect(paging.readAllDocsPaged).not.toHaveBeenCalled();
  });
});
