import React, { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardProvider } from '@/context/DashboardContext';
import { useDashboard } from '@/context/useDashboard';
import type { Dashboard, SharedCollection } from '@/types';

/**
 * importSharedCollection rollback + partial-failure pinning.
 *
 * The path under test (`DashboardContext.importSharedCollection`) is the
 * most complex new mutation in the Collections feature: it creates a
 * recipient Collection, then fans out N `createNewDashboard` calls in a
 * `Promise.allSettled`, then decides whether to (a) return the first
 * fulfilled board id, (b) surface a "X imported, Y failed" toast, or
 * (c) roll back the empty Collection via `deleteCollection(id,
 * 'delete-all')` when every board failed. These tests pin each branch so
 * a future refactor can't silently regress the rollback / partial-success
 * accounting (the consequence would be orphan empty Collections in
 * recipients' sidebars or a stale "Imported" toast claiming success).
 *
 * The test drives `importSharedCollection` through the real provider with
 * mocked seams: `saveDashboard` (selectively rejects to simulate per-board
 * failure), `useSharedCollection.loadSharedCollection` (returns a copy
 * share), `loadSharedCollectionBoards` (returns N board snapshots), and
 * `useCollections.{createCollection, deleteCollection}` (track calls).
 */

const mockUser = {
  uid: 'recipient-uid',
  displayName: 'Recipient',
  email: 'recipient@example.com',
};

vi.mock('../context/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    isAdmin: false,
    featurePermissions: [],
    selectedBuildings: [],
    savedWidgetConfigs: {},
    saveWidgetConfig: vi.fn(),
    refreshGoogleToken: vi.fn().mockResolvedValue('mock-token'),
    profileLoaded: true,
  }),
}));

const mockSaveDashboard = vi.fn().mockResolvedValue(undefined);
const mockDeleteDashboardFirestore = vi.fn().mockResolvedValue(undefined);
type SubscribeCb = (dashboards: Dashboard[], hasPendingWrites: boolean) => void;
const mockSubscribeToDashboards = vi.fn((cb: SubscribeCb) => {
  cb([], false);
  return () => undefined;
});

vi.mock('../hooks/useFirestore', () => ({
  useFirestore: () => ({
    saveDashboard: mockSaveDashboard,
    saveDashboards: vi.fn().mockResolvedValue(undefined),
    deleteDashboard: mockDeleteDashboardFirestore,
    subscribeToDashboards: mockSubscribeToDashboards,
    shareDashboard: vi.fn().mockResolvedValue('mock-share-id'),
    loadSharedDashboard: vi.fn().mockResolvedValue(null),
    mirrorSharedBoard: vi.fn().mockResolvedValue(undefined),
    subscribeToSharedBoard: vi.fn(() => () => undefined),
    joinSharedBoard: vi.fn().mockResolvedValue(undefined),
    leaveSharedBoard: vi.fn().mockResolvedValue(undefined),
    stopSharingBoard: vi.fn().mockResolvedValue(undefined),
    rosters: [],
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    deleteRoster: vi.fn(),
    setActiveRoster: vi.fn(),
    activeRosterId: null,
  }),
}));

vi.mock('../hooks/useRosters', () => ({
  useRosters: () => ({
    rosters: [],
    activeRosterId: null,
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    deleteRoster: vi.fn(),
    setActiveRoster: vi.fn(),
    setAbsentStudents: vi.fn(),
  }),
}));

// Module-scoped collection mocks so individual tests can assert calls.
const mockCreateCollection = vi.fn().mockResolvedValue('new-collection-id');
const mockDeleteCollection = vi.fn().mockResolvedValue(undefined);

vi.mock('../hooks/useCollections', () => ({
  useCollections: () => ({
    collections: [],
    loading: false,
    error: null,
    createCollection: mockCreateCollection,
    renameCollection: vi.fn(),
    moveCollection: vi.fn(),
    deleteCollection: mockDeleteCollection,
    reorderSiblings: vi.fn(),
    setCollectionMetadata: vi.fn(),
    setCollectionDefaultBoard: vi.fn(),
  }),
}));

// Module-scoped shared-collection mocks. Defaults satisfy the
// "valid copy share with three boards" happy-path scenario; individual
// tests override before render.
const mockLoadSharedCollection = vi.fn();
const mockLoadSharedCollectionBoards = vi.fn();

vi.mock('../hooks/useSharedCollection', () => ({
  useSharedCollection: () => ({
    shareCollection: vi.fn().mockResolvedValue('mock-share-id'),
    shareSubstituteCollection: vi.fn().mockResolvedValue('mock-sub-share-id'),
    loadSharedCollection: mockLoadSharedCollection,
    loadSharedCollectionBoards: mockLoadSharedCollectionBoards,
  }),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  // Mirror the seam-shape from DashboardContext_sharing.test.tsx — we only
  // override the top-level functions DashboardContext touches directly
  // outside the useFirestore abstraction.
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({
      __path: segments.join('/'),
    })),
    getDoc: vi.fn().mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    }),
    setDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    writeBatch: vi.fn(() => ({
      update: vi.fn(),
      delete: vi.fn(),
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
    onSnapshot: vi.fn(() => () => undefined),
    serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  };
});

const SHARE_ID = 'col-share-abc';
const HOST_NAME = 'Host Teacher';

function makeBoard(id: string, name: string): Dashboard {
  return {
    id,
    name,
    background: 'bg-slate-800',
    widgets: [],
    createdAt: 1700000000000,
  };
}

function makeCopyMeta(boardIds: string[]): SharedCollection {
  return {
    shareId: SHARE_ID,
    hostUid: 'host-uid',
    hostDisplayName: HOST_NAME,
    intendedMode: 'copy',
    collection: { name: 'Shared Folder' },
    boardIds,
    createdAt: 1700000000000,
  };
}

/**
 * Render the provider with a probe that captures `importSharedCollection`
 * so each test can invoke it directly. We block the share-URL auto-flow
 * by resetting pathname before render.
 */
function renderWithCaptured(): {
  callImport: () => Promise<{
    collectionId: string;
    firstBoardId: string | null;
  } | null>;
} {
  let captured: ReturnType<
    typeof useDashboard
  >['importSharedCollection'] = () => Promise.resolve(null);
  const Probe: React.FC = () => {
    const { importSharedCollection } = useDashboard();
    useEffect(() => {
      captured = importSharedCollection;
    }, [importSharedCollection]);
    return null;
  };
  render(
    <DashboardProvider>
      <Probe />
    </DashboardProvider>
  );
  return {
    callImport: () => act(() => captured(SHARE_ID)),
  };
}

describe('DashboardContext.importSharedCollection — rollback + partial-failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-seed defaults that vi.clearAllMocks blew away.
    mockSaveDashboard.mockResolvedValue(undefined);
    mockCreateCollection.mockResolvedValue('new-collection-id');
    mockDeleteCollection.mockResolvedValue(undefined);
    mockSubscribeToDashboards.mockImplementation((cb: SubscribeCb) => {
      cb([], false);
      return () => undefined;
    });
    // Quiet the share-URL auto-flow: this test invokes importSharedCollection
    // directly through the probe.
    window.history.pushState({}, '', '/');
  });

  it('rolls back the new Collection via deleteCollection("delete-all") when EVERY board fails', async () => {
    // Three boards in the share, saveDashboard rejects for all of them.
    const boards = [
      makeBoard('b1', 'Board One'),
      makeBoard('b2', 'Board Two'),
      makeBoard('b3', 'Board Three'),
    ];
    mockLoadSharedCollection.mockResolvedValue({
      ok: true,
      meta: makeCopyMeta(['b1', 'b2', 'b3']),
    });
    mockLoadSharedCollectionBoards.mockResolvedValue(boards);
    mockSaveDashboard.mockRejectedValue(new Error('Firestore write rejected'));

    const { callImport } = renderWithCaptured();
    let result: Awaited<ReturnType<typeof callImport>> | undefined;
    await waitFor(async () => {
      result = await callImport();
      expect(result).toBeDefined();
    });

    // Returned null because no boards landed.
    expect(result).toBeNull();
    // Cleanup invoked with the newly-created Collection id + delete-all mode.
    expect(mockDeleteCollection).toHaveBeenCalledWith(
      'new-collection-id',
      'delete-all'
    );
    // createCollection was called exactly once (the Phase 1 write).
    expect(mockCreateCollection).toHaveBeenCalledTimes(1);
  });

  it('does NOT roll back when at least one board succeeds (partial success)', async () => {
    const boards = [
      makeBoard('b1', 'Board One'),
      makeBoard('b2', 'Board Two'),
      makeBoard('b3', 'Board Three'),
    ];
    mockLoadSharedCollection.mockResolvedValue({
      ok: true,
      meta: makeCopyMeta(['b1', 'b2', 'b3']),
    });
    mockLoadSharedCollectionBoards.mockResolvedValue(boards);

    // saveDashboard succeeds for the first call, rejects for the rest.
    // The hook iterates in board-id order, so b1 lands and b2/b3 don't.
    mockSaveDashboard
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error('Firestore write rejected'));

    const { callImport } = renderWithCaptured();
    let result: Awaited<ReturnType<typeof callImport>> | undefined;
    await waitFor(async () => {
      result = await callImport();
      expect(result).toBeDefined();
    });

    // Result is non-null because b1 landed.
    expect(result).not.toBeNull();
    expect(result?.collectionId).toBe('new-collection-id');
    expect(typeof result?.firstBoardId).toBe('string');
    // CRITICAL: no rollback on partial success — the user keeps the
    // boards that did import, and the Collection stays.
    expect(mockDeleteCollection).not.toHaveBeenCalled();
    // saveDashboard called 3 times (one per board, regardless of outcome).
    expect(mockSaveDashboard).toHaveBeenCalledTimes(3);
  });

  it('returns null without creating a Collection when share is substitute-mode', async () => {
    // Substitute shares are view-only and cannot be imported — the path
    // should bail before Phase 1 creates anything.
    mockLoadSharedCollection.mockResolvedValue({
      ok: true,
      meta: {
        ...makeCopyMeta(['b1']),
        intendedMode: 'substitute' as const,
        expiresAt: Date.now() + 60_000,
        buildingId: 'OMS',
      },
    });

    const { callImport } = renderWithCaptured();
    let result: Awaited<ReturnType<typeof callImport>> | undefined;
    await waitFor(async () => {
      result = await callImport();
      expect(result).toBeDefined();
    });

    expect(result).toBeNull();
    expect(mockCreateCollection).not.toHaveBeenCalled();
    expect(mockDeleteCollection).not.toHaveBeenCalled();
    // We also did not call loadSharedCollectionBoards — substitute bail
    // happens immediately after the metadata check.
    expect(mockLoadSharedCollectionBoards).not.toHaveBeenCalled();
  });
});
