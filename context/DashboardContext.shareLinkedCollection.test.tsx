import React, { useEffect } from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import type { Collection, Dashboard } from '@/types';

// ---------------------------------------------------------------------------
// Mocks (mirrors DashboardContext.bringToFront.test.tsx)
// ---------------------------------------------------------------------------

vi.mock('./useAuth', () => ({
  useAuth: () => ({
    user: {
      uid: 'test-user',
      displayName: 'Test User',
      email: 'test@example.com',
    },
    isAdmin: false,
    featurePermissions: [],
    selectedBuildings: [],
    savedWidgetConfigs: {},
    saveWidgetConfig: vi.fn(),
    refreshGoogleToken: vi.fn(),
    remoteControlEnabled: true,
    profileLoaded: true,
  }),
}));

const {
  shareDashboardMock,
  stopSharingBoardMock,
  setCollectionLinkMock,
  createLinkMock,
} = vi.hoisted(() => ({
  shareDashboardMock: vi.fn(),
  stopSharingBoardMock: vi.fn(),
  setCollectionLinkMock: vi.fn(),
  createLinkMock: vi.fn(),
}));

type SnapshotCb = (dashboards: Dashboard[], hasPendingWrites: boolean) => void;
let capturedSnapshotCb: SnapshotCb | null = null;

vi.mock('@/hooks/useFirestore', () => ({
  useFirestore: () => ({
    saveDashboard: vi.fn().mockResolvedValue(Date.now()),
    saveDashboards: vi.fn().mockResolvedValue(undefined),
    deleteDashboard: vi.fn().mockResolvedValue(undefined),
    subscribeToDashboards: vi.fn((cb: SnapshotCb) => {
      capturedSnapshotCb = cb;
      return () => {
        // cleanup
      };
    }),
    shareDashboard: shareDashboardMock,
    stopSharingBoard: stopSharingBoardMock,
    subscribeToSharedBoard: vi.fn(() => () => undefined),
    mirrorSharedBoard: vi.fn().mockResolvedValue(undefined),
    loadSharedDashboard: vi.fn().mockResolvedValue(null),
    rosters: [],
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    deleteRoster: vi.fn(),
    setActiveRoster: vi.fn(),
    activeRosterId: null,
  }),
}));

vi.mock('@/hooks/useRosters', () => ({
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

vi.mock('@/hooks/useCollections', () => ({
  useCollections: () => ({
    collections: [],
    loading: false,
    error: null,
    createCollection: vi.fn(),
    renameCollection: vi.fn(),
    moveCollection: vi.fn(),
    deleteCollection: vi.fn(),
    reorderSiblings: vi.fn(),
    setCollectionMetadata: vi.fn(),
    setCollectionLink: setCollectionLinkMock,
    setCollectionDefaultBoard: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLinkedCollection', () => ({
  useLinkedCollection: () => ({ createLinkedCollection: createLinkMock }),
  LINKED_COLLECTION_MAX_BOARDS: 200,
  LINKED_COLLECTION_MAX_SECTIONS: 200,
}));

vi.mock('@/hooks/useSharedCollection', () => ({
  useSharedCollection: () => ({
    shareCollection: vi.fn().mockResolvedValue('mock-collection-share-id'),
    shareSubstituteCollection: vi
      .fn()
      .mockResolvedValue('mock-collection-sub-share-id'),
    loadSharedCollection: vi
      .fn()
      .mockResolvedValue({ ok: false, reason: 'not-found' }),
    loadSharedCollectionBoards: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
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

type Ctx = ReturnType<typeof useDashboard>;

const Consumer: React.FC<{ ctxRef: { current: Ctx | null } }> = ({
  ctxRef,
}) => {
  const ctx = useDashboard();
  useEffect(() => {
    ctxRef.current = ctx;
  });
  return null;
};

const current = (ref: { current: Ctx | null }): Ctx => {
  if (!ref.current) throw new Error('Provider not mounted');
  return ref.current;
};

const board = (id: string, collectionId: string): Dashboard => ({
  id,
  name: `Board ${id}`,
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 1000,
  updatedAt: 1000,
  collectionId,
});

const week: Collection = {
  id: 'week',
  name: 'Week',
  parentCollectionId: null,
  order: 0,
  createdAt: 0,
};

const tree = {
  sections: [
    { id: 'week', name: 'Week' },
    { id: 'mon', name: 'Monday', parentId: 'week' },
  ],
  boardEntries: [
    { id: 'b1', name: 'Board b1', sectionId: 'week', order: 0 },
    { id: 'b2', name: 'Board b2', sectionId: 'mon', order: 1 },
  ],
};

async function setup(boards: Dashboard[]) {
  const ctxRef: { current: Ctx | null } = { current: null };
  render(
    <DashboardProvider>
      <Consumer ctxRef={ctxRef} />
    </DashboardProvider>
  );
  await waitFor(() => expect(capturedSnapshotCb).not.toBeNull());
  await act(async () => {
    capturedSnapshotCb?.(boards, false);
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(ctxRef.current?.dashboards.length).toBe(boards.length)
  );
  return ctxRef;
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedSnapshotCb = null;
  let n = 0;
  shareDashboardMock.mockImplementation(() => Promise.resolve(`share-${++n}`));
  stopSharingBoardMock.mockResolvedValue(undefined);
  setCollectionLinkMock.mockResolvedValue(undefined);
  createLinkMock.mockImplementation((input: { linkId: string }) =>
    Promise.resolve(input.linkId)
  );
});

describe('shareLinkedCollection', () => {
  it('stamps every board share with the link, then writes the link doc', async () => {
    const boards = [board('b1', 'week'), board('b2', 'mon')];
    const ctx = await setup(boards);

    let linkId = '';
    await act(async () => {
      linkId = await current(ctx).shareLinkedCollection({
        collection: week,
        boards,
        tree,
        mode: 'view-only',
      });
    });

    expect(shareDashboardMock).toHaveBeenCalledTimes(2);
    for (const call of shareDashboardMock.mock.calls) {
      expect(call[1]).toBe('view-only');
      expect(call[4]).toBe(linkId);
    }
    expect(createLinkMock).toHaveBeenCalledTimes(1);
    expect(createLinkMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      Math.max(...shareDashboardMock.mock.invocationCallOrder)
    );
    const link = createLinkMock.mock.calls[0][0] as {
      linkId: string;
      mode: string;
      boards: { shareId: string; sectionId?: string }[];
      sections: { id: string; parentId: string | null }[];
    };
    expect(link.linkId).toBe(linkId);
    expect(link.mode).toBe('view-only');
    expect(link.sections).toEqual([
      expect.objectContaining({ id: 'mon', parentId: null }),
    ]);
    expect(link.boards.map((b) => b.sectionId)).toEqual([undefined, 'mon']);
    expect(setCollectionLinkMock).toHaveBeenCalledWith('week', {
      linkedCollectionId: linkId,
      linkedCollectionRole: 'owner',
      linkedCollectionEnded: false,
    });
    await waitFor(() =>
      expect(
        current(ctx).dashboards.map((d) => [d.linkedShareId, d.linkedShareRole])
      ).toEqual([
        [link.boards[0].shareId, 'owner'],
        [link.boards[1].shareId, 'owner'],
      ])
    );
  });

  it('removes the board shares it made when one fails, and writes no link', async () => {
    const boards = [board('b1', 'week'), board('b2', 'mon')];
    shareDashboardMock
      .mockResolvedValueOnce('share-ok')
      .mockRejectedValueOnce(new Error('denied'));
    const ctx = await setup(boards);

    await expect(
      current(ctx).shareLinkedCollection({
        collection: week,
        boards,
        tree,
        mode: 'synced',
      })
    ).rejects.toThrow('denied');
    expect(createLinkMock).not.toHaveBeenCalled();
    expect(stopSharingBoardMock).toHaveBeenCalledWith('share-ok');
    expect(setCollectionLinkMock).not.toHaveBeenCalled();
  });

  it('removes the board shares when the link doc fails', async () => {
    const boards = [board('b1', 'week')];
    createLinkMock.mockRejectedValueOnce(new Error('rules'));
    const ctx = await setup(boards);

    await expect(
      current(ctx).shareLinkedCollection({
        collection: week,
        boards,
        tree,
        mode: 'synced',
      })
    ).rejects.toThrow('rules');
    expect(stopSharingBoardMock).toHaveBeenCalledWith('share-1');
    expect(setCollectionLinkMock).not.toHaveBeenCalled();
    // The host's board goes back to an ordinary board.
    await waitFor(() =>
      expect(current(ctx).dashboards[0].linkedShareId).toBeUndefined()
    );
  });

  it('keeps an ended share on a board when the live share rolls back', async () => {
    const ended = {
      ...board('b1', 'week'),
      linkedShareId: 'old-share',
      linkedShareRole: 'collaborator' as const,
      linkedShareEnded: true,
    };
    createLinkMock.mockRejectedValueOnce(new Error('rules'));
    const ctx = await setup([ended]);

    await expect(
      current(ctx).shareLinkedCollection({
        collection: week,
        boards: [ended],
        tree,
        mode: 'synced',
      })
    ).rejects.toThrow('rules');
    await waitFor(() =>
      expect(current(ctx).dashboards[0]).toMatchObject({
        linkedShareId: 'old-share',
        linkedShareRole: 'collaborator',
        linkedShareEnded: true,
      })
    );
  });

  it('still returns the link when only the collection tag fails', async () => {
    const boards = [board('b1', 'week')];
    setCollectionLinkMock.mockRejectedValueOnce(new Error('offline'));
    const ctx = await setup(boards);

    let linkId = '';
    await act(async () => {
      linkId = await current(ctx).shareLinkedCollection({
        collection: week,
        boards,
        tree,
        mode: 'synced',
      });
    });
    expect(linkId).not.toBe('');
    expect(stopSharingBoardMock).not.toHaveBeenCalled();
  });

  it('refuses a collection over the board cap before writing anything', async () => {
    const boards = Array.from({ length: 201 }, (_, i) =>
      board(`b${String(i)}`, 'week')
    );
    const ctx = await setup(boards);

    await expect(
      current(ctx).shareLinkedCollection({
        collection: week,
        boards,
        tree,
        mode: 'synced',
      })
    ).rejects.toThrow();
    expect(shareDashboardMock).not.toHaveBeenCalled();
  });

  it('refuses a collection holding a board that is already shared live', async () => {
    const boards = [
      {
        ...board('b1', 'week'),
        linkedShareId: 'x',
        linkedShareRole: 'collaborator' as const,
      },
    ];
    const ctx = await setup(boards);

    await expect(
      current(ctx).shareLinkedCollection({
        collection: week,
        boards,
        tree,
        mode: 'synced',
      })
    ).rejects.toThrow();
    expect(shareDashboardMock).not.toHaveBeenCalled();
  });
});
