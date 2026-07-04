import React, { useEffect } from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import { Dashboard, WidgetData } from '@/types';

// ---------------------------------------------------------------------------
// Mocks (mirrors tests/DashboardContext_removeWidgets.test.tsx)
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
    shareDashboard: vi.fn(),
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
    setCollectionDefaultBoard: vi.fn(),
  }),
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

// ---------------------------------------------------------------------------
// Test consumer
// ---------------------------------------------------------------------------

interface ContextSnapshot {
  dashboards: Dashboard[];
  activeDashboard: Dashboard | null;
  bringToFront: (id: string) => void;
  minimizeAllWidgets: () => void;
  restoreAllWidgets: () => void;
  isActiveBoardReadOnly: boolean;
}

const TestConsumer: React.FC<{
  stateRef: { current: ContextSnapshot | null };
}> = ({ stateRef }) => {
  const ctx = useDashboard();
  useEffect(() => {
    stateRef.current = {
      dashboards: ctx.dashboards,
      activeDashboard: ctx.activeDashboard,
      bringToFront: ctx.bringToFront,
      minimizeAllWidgets: ctx.minimizeAllWidgets,
      restoreAllWidgets: ctx.restoreAllWidgets,
      isActiveBoardReadOnly: ctx.isActiveBoardReadOnly,
    };
  });
  return null;
};

function setup() {
  const stateRef: { current: ContextSnapshot | null } = { current: null };
  render(
    <DashboardProvider>
      <TestConsumer stateRef={stateRef} />
    </DashboardProvider>
  );
  return stateRef;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWidget(
  id: string,
  z: number,
  extra: Partial<WidgetData> = {}
): WidgetData {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    z,
    flipped: false,
    config: { text: 'test' } as WidgetData['config'],
    ...extra,
  };
}

function makeDashboard(widgets: WidgetData[]): Dashboard {
  return {
    id: 'dash-1',
    name: 'Test Board',
    background: 'bg-slate-900',
    widgets,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

async function pushSnapshot(dashboards: Dashboard[]): Promise<void> {
  if (!capturedSnapshotCb) throw new Error('Provider not mounted');
  const cb = capturedSnapshotCb;
  await act(async () => {
    cb(dashboards, false);
    await Promise.resolve();
  });
}

function getWidget(stateRef: ReturnType<typeof setup>, id: string) {
  const w = stateRef.current?.activeDashboard?.widgets.find((w) => w.id === id);
  if (!w) throw new Error(`widget ${id} not found`);
  return w;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardContext bringToFront', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSnapshotCb = null;
  });

  it('raises a non-frontmost widget to maxZ + 1 and preserves untouched widget identity', async () => {
    const stateRef = setup();
    await pushSnapshot([
      makeDashboard([
        makeWidget('w1', 1),
        makeWidget('w2', 2),
        makeWidget('w3', 3),
      ]),
    ]);

    const w2Before = getWidget(stateRef, 'w2');
    const w3Before = getWidget(stateRef, 'w3');

    act(() => {
      stateRef.current?.bringToFront('w1');
    });

    await waitFor(() => {
      expect(getWidget(stateRef, 'w1').z).toBe(4);
    });
    // Untouched widgets keep the SAME object reference (memoization contract)
    expect(getWidget(stateRef, 'w2')).toBe(w2Before);
    expect(getWidget(stateRef, 'w3')).toBe(w3Before);
  });

  it('is a state no-op when the clicked widget is already frontmost', async () => {
    const stateRef = setup();
    await pushSnapshot([
      makeDashboard([makeWidget('w1', 1), makeWidget('w2', 2)]),
    ]);

    const dashboardsBefore = stateRef.current?.dashboards;

    act(() => {
      stateRef.current?.bringToFront('w2');
    });

    // Returning the previous state object means the dashboards array
    // identity is unchanged — no commit, no consumer re-render.
    expect(stateRef.current?.dashboards).toBe(dashboardsBefore);
  });

  it('raises an entire group above the non-group max, preserving internal z-order', async () => {
    const stateRef = setup();
    await pushSnapshot([
      makeDashboard([
        makeWidget('g1', 1, { groupId: 'group-A' }),
        makeWidget('g2', 3, { groupId: 'group-A' }),
        makeWidget('solo', 5),
      ]),
    ]);

    const soloBefore = getWidget(stateRef, 'solo');

    act(() => {
      stateRef.current?.bringToFront('g2');
    });

    await waitFor(() => {
      // maxZ was 5; group members stack at 6, 7 in their original order
      expect(getWidget(stateRef, 'g1').z).toBe(6);
      expect(getWidget(stateRef, 'g2').z).toBe(7);
    });
    // Non-group widget object is untouched
    expect(getWidget(stateRef, 'solo')).toBe(soloBefore);
  });

  it('is a no-op on a read-only (viewer) board — never writes a z-order change', async () => {
    const stateRef = setup();
    await pushSnapshot([
      {
        ...makeDashboard([makeWidget('w1', 1), makeWidget('w2', 2)]),
        // viewer + not ended ⇒ isActiveBoardReadOnly. No linkedShareId, so the
        // share-subscription/mirror machinery stays dormant in this harness.
        linkedShareRole: 'viewer',
        linkedShareEnded: false,
      },
    ]);

    // Guard is only meaningful if the board really is read-only.
    expect(stateRef.current?.isActiveBoardReadOnly).toBe(true);

    const dashboardsBefore = stateRef.current?.dashboards;

    act(() => {
      // w1 is NOT frontmost — on a writable board this would raise it to z=3.
      stateRef.current?.bringToFront('w1');
    });

    // The read-only guard returns before setDashboards: identity is unchanged
    // (no commit, no Firestore write) and w1's z stays put.
    expect(stateRef.current?.dashboards).toBe(dashboardsBefore);
    expect(getWidget(stateRef, 'w1').z).toBe(1);
  });

  it('is a state no-op when the entire group is already on top', async () => {
    const stateRef = setup();
    await pushSnapshot([
      makeDashboard([
        makeWidget('solo', 1),
        makeWidget('g1', 2, { groupId: 'group-A' }),
        makeWidget('g2', 3, { groupId: 'group-A' }),
      ]),
    ]);

    const dashboardsBefore = stateRef.current?.dashboards;

    act(() => {
      stateRef.current?.bringToFront('g1');
    });

    expect(stateRef.current?.dashboards).toBe(dashboardsBefore);
  });
});

describe('DashboardContext minimize/restore identity preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSnapshotCb = null;
  });

  it('minimizeAllWidgets keeps object identity for already-minimized widgets', async () => {
    const stateRef = setup();
    await pushSnapshot([
      makeDashboard([
        makeWidget('open', 1),
        makeWidget('mini', 2, { minimized: true }),
      ]),
    ]);

    const miniBefore = getWidget(stateRef, 'mini');

    act(() => {
      stateRef.current?.minimizeAllWidgets();
    });

    await waitFor(() => {
      expect(getWidget(stateRef, 'open').minimized).toBe(true);
    });
    expect(getWidget(stateRef, 'mini')).toBe(miniBefore);
  });

  it('restoreAllWidgets is a dashboard no-op when nothing is minimized/flipped/maximized', async () => {
    const stateRef = setup();
    await pushSnapshot([
      makeDashboard([makeWidget('w1', 1), makeWidget('w2', 2)]),
    ]);

    const activeBefore = stateRef.current?.activeDashboard;

    act(() => {
      stateRef.current?.restoreAllWidgets();
    });

    expect(stateRef.current?.activeDashboard).toBe(activeBefore);
  });
});
