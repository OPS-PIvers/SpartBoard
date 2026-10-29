import React, { useEffect } from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import type { Collection, Dashboard } from '@/types';

// ---------------------------------------------------------------------------
// Mocks (mirrors DashboardContext.shareLinkedCollection.test.tsx)
// ---------------------------------------------------------------------------

vi.mock('./useAuth', () => {
  // Stable across renders, like the real hooks, so listener effects don't churn.
  const auth = {
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
  };
  return { useAuth: () => auth };
});

const { subscribeSharedMock, mirrorMock, collectionsRef } = vi.hoisted(() => ({
  subscribeSharedMock: vi.fn(),
  mirrorMock: vi.fn(),
  collectionsRef: { current: [] as Collection[] },
}));

type SnapshotCb = (dashboards: Dashboard[], hasPendingWrites: boolean) => void;
let capturedSnapshotCb: SnapshotCb | null = null;

vi.mock('@/hooks/useFirestore', () => {
  const api = {
    saveDashboard: vi.fn().mockResolvedValue(Date.now()),
    saveDashboards: vi.fn().mockResolvedValue(undefined),
    deleteDashboard: vi.fn().mockResolvedValue(undefined),
    subscribeToDashboards: vi.fn((cb: SnapshotCb) => {
      capturedSnapshotCb = cb;
      return () => {
        // cleanup
      };
    }),
    shareDashboard: vi.fn(),
    stopSharingBoard: vi.fn(),
    subscribeToSharedBoard: subscribeSharedMock,
    mirrorSharedBoard: mirrorMock,
    loadSharedDashboard: vi.fn().mockResolvedValue(null),
    rosters: [],
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    deleteRoster: vi.fn(),
    setActiveRoster: vi.fn(),
    activeRosterId: null,
  };
  return { useFirestore: () => api };
});

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
    collections: collectionsRef.current,
    loading: false,
    error: null,
    createCollection: vi.fn(),
    renameCollection: vi.fn(),
    moveCollection: vi.fn(),
    deleteCollection: vi.fn(),
    reorderSiblings: vi.fn(),
    setCollectionMetadata: vi.fn(),
    setCollectionLink: vi.fn(),
    setCollectionDefaultBoard: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLinkedCollection', () => ({
  useLinkedCollection: () => ({
    createLinkedCollection: vi.fn(),
    subscribeLinkedCollection: vi.fn(() => () => {}),
  }),
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

const linked = (
  id: string,
  collectionId: string | null,
  shareId: string
): Dashboard => ({
  id,
  name: `Board ${id}`,
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 1000,
  updatedAt: 1000,
  collectionId,
  order: Number(id.replace(/\D/g, '')) || 0,
  linkedShareId: shareId,
  linkedShareRole: 'collaborator',
  linkedShareEnded: false,
});

const week: Collection = {
  id: 'week',
  name: 'Week',
  parentCollectionId: null,
  order: 0,
  createdAt: 0,
  linkedCollectionId: 'L1',
  linkedCollectionRole: 'collaborator',
};
const mon: Collection = {
  id: 'mon',
  name: 'Monday',
  parentCollectionId: 'week',
  order: 0,
  createdAt: 0,
  linkedSectionId: 'S-mon',
};

type SharedCb = (remote: Dashboard | null) => void;
const subscribed = () =>
  subscribeSharedMock.mock.calls.map((c) => c[0] as string);
let active: Set<string>;

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
  collectionsRef.current = [week, mon];
  active = new Set();
  mirrorMock.mockResolvedValue(undefined);
  subscribeSharedMock.mockImplementation((shareId: string, _cb: SharedCb) => {
    active.add(shareId);
    return () => active.delete(shareId);
  });
});

describe('boards in a shared collection listen only while open (D3)', () => {
  const boards = [
    linked('b1', 'week', 's1'),
    linked('b2', 'week', 's2'),
    linked('b3', 'mon', 's3'),
    linked('solo', null, 'solo-share'),
  ];

  it('holds one listener for the open board plus each board shared on its own', async () => {
    const ctx = await setup(boards);
    const open = ctx.current?.activeDashboard?.linkedShareId;
    await waitFor(() => expect(active.has('solo-share')).toBe(true));
    const inCollection = ['s1', 's2', 's3'].filter((s) => active.has(s));
    expect(inCollection).toEqual(open && open !== 'solo-share' ? [open] : []);
  });

  it('moves the one collection listener with the open board', async () => {
    const ctx = await setup(boards);
    act(() => ctx.current?.loadDashboard('b3'));
    await waitFor(() => expect(active.has('s3')).toBe(true));
    expect(active.has('s1')).toBe(false);
    expect(active.has('s2')).toBe(false);
    act(() => ctx.current?.loadDashboard('b2'));
    await waitFor(() => expect(active.has('s2')).toBe(true));
    expect(active.has('s3')).toBe(false);
    // The board shared on its own never re-subscribed on the switches.
    expect(subscribed().filter((s) => s === 'solo-share')).toHaveLength(1);
  });

  it('doesn’t mirror an open collection board before its share has been read', async () => {
    const ctx = await setup(boards);
    act(() => ctx.current?.loadDashboard('b1'));
    await waitFor(() => expect(active.has('s1')).toBe(true));
    act(() => ctx.current?.updateDashboard({ background: 'bg-red-500' }));
    await new Promise((r) => setTimeout(r, 700));
    expect(mirrorMock.mock.calls.map((c) => c[0] as string)).not.toContain(
      's1'
    );

    const cb = subscribeSharedMock.mock.calls
      .filter((c) => c[0] === 's1')
      .at(-1)?.[1] as SharedCb;
    await act(async () => {
      cb({ ...linked('b1', 'week', 's1'), updatedBy: 'someone' } as Dashboard);
      await Promise.resolve();
    });
    act(() => ctx.current?.updateDashboard({ background: 'bg-blue-500' }));
    await waitFor(
      () =>
        expect(mirrorMock.mock.calls.map((c) => c[0] as string)).toContain(
          's1'
        ),
      { timeout: 2000 }
    );
  });

  it('every board shared on its own keeps its listener', async () => {
    collectionsRef.current = [];
    await setup(boards);
    await waitFor(() => expect(active.size).toBe(4));
  });
});

describe('a board share ending inside a shared collection', () => {
  it('leaves a viewer’s open board for the collection’s own sync to remove', async () => {
    const viewerBoard = {
      ...linked('b1', 'week', 's1'),
      linkedShareRole: 'viewer' as const,
    };
    const ctx = await setup([viewerBoard]);
    act(() => ctx.current?.loadDashboard('b1'));
    await waitFor(() => expect(active.has('s1')).toBe(true));
    const cb = subscribeSharedMock.mock.calls
      .filter((c) => c[0] === 's1')
      .at(-1)?.[1] as SharedCb;
    await act(async () => {
      cb(null);
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(ctx.current?.dashboards[0]?.linkedShareEnded).toBe(true)
    );
    expect(ctx.current?.dashboards).toHaveLength(1);
  });
});
