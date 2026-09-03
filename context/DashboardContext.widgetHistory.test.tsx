import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import { Dashboard, WidgetData } from '@/types';

// ---------------------------------------------------------------------------
// Mocks (mirrors DashboardContext.immediate.test.tsx)
// ---------------------------------------------------------------------------

// Stable singleton — see firestoreMock note. Returning a fresh object/fns each
// render churns identity-sensitive deps (driveService memo, load effect) and
// keeps `loading` pinned true.
const authMock = {
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
  googleAccessToken: null,
  remoteControlEnabled: true,
  profileLoaded: true,
};

vi.mock('./useAuth', () => ({
  useAuth: () => authMock,
}));

const driveMock = {
  driveService: null,
  userDomain: 'example.com',
  isConnected: false,
};

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => driveMock,
}));

type SnapshotCb = (dashboards: Dashboard[], hasPendingWrites: boolean) => void;
let capturedSnapshotCb: SnapshotCb | null = null;
// Latest dashboards pushed via the snapshot. Replayed synchronously on every
// (re)subscribe, mirroring real Firestore — without this the load effect's
// re-subscriptions leave `loading` stuck true (no snapshot to clear it).
const saveDashboardMock = vi.fn().mockResolvedValue(Date.now());

// IMPORTANT: the mock returns a STABLE singleton object. The DashboardProvider
// load effect depends on `subscribeToDashboards`, so returning fresh function
// identities each render (as a naive `() => ({...})` mock does) would make that
// effect re-run every render, re-calling `setLoading(true)` forever and
// trapping the auto-save effect behind its `loading` guard.
const firestoreMock = {
  saveDashboard: saveDashboardMock,
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
};

vi.mock('@/hooks/useFirestore', () => ({
  useFirestore: () => firestoreMock,
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
  loading: boolean;
  updateWidget: (
    id: string,
    updates: Partial<WidgetData>,
    opts?: { immediate?: boolean; skipHistory?: boolean }
  ) => void;
  updateWidgets: (
    updates: Array<{
      id: string;
      changes: Partial<Pick<WidgetData, 'x' | 'y' | 'w' | 'h'>>;
    }>,
    opts?: { skipHistory?: boolean }
  ) => void;
  removeWidget: (id: string) => void;
  clearAllWidgets: () => void;
  undoWidgets: (boardId?: string) => void;
  redoWidgets: (boardId?: string) => void;
  recordWidgetSnapshot: () => void;
  moveWidgetLayer: (id: string, direction: 'up' | 'down') => void;
  minimizeAllWidgets: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const TestConsumer: React.FC<{
  stateRef: { current: ContextSnapshot | null };
}> = ({ stateRef }) => {
  const ctx = useDashboard();
  useEffect(() => {
    stateRef.current = {
      dashboards: ctx.dashboards,
      activeDashboard: ctx.activeDashboard,
      loading: ctx.loading,
      updateWidget: ctx.updateWidget,
      updateWidgets: ctx.updateWidgets,
      removeWidget: ctx.removeWidget,
      clearAllWidgets: ctx.clearAllWidgets,
      undoWidgets: ctx.undoWidgets,
      redoWidgets: ctx.redoWidgets,
      recordWidgetSnapshot: ctx.recordWidgetSnapshot,
      moveWidgetLayer: ctx.moveWidgetLayer,
      minimizeAllWidgets: ctx.minimizeAllWidgets,
      canUndo: ctx.canUndo,
      canRedo: ctx.canRedo,
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

function makeWidget(id: string, z = 1): WidgetData {
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

// Deliver the snapshot and let effects flush so `loading` lands on false and
// an active dashboard is selected before the auto-save assertions run.
async function settleSnapshot(
  stateRef: { current: ContextSnapshot | null },
  dashboards: Dashboard[]
): Promise<void> {
  await pushSnapshot(dashboards);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  if (!stateRef.current?.activeDashboard)
    throw new Error('active dashboard not loaded');
  if (stateRef.current?.loading)
    throw new Error('loading did not settle to false');
}

describe('DashboardContext widget undo/redo', () => {
  beforeEach(() => {
    capturedSnapshotCb = null;
    saveDashboardMock.mockClear();
    saveDashboardMock.mockResolvedValue(Date.now());
    firestoreMock.subscribeToDashboards.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const widgetIds = (ref: { current: ContextSnapshot | null }) =>
    ref.current?.activeDashboard?.widgets.map((w) => w.id) ?? [];

  it('restores a closed widget on undo and removes it again on redo', async () => {
    const stateRef = setup();
    await settleSnapshot(stateRef, [
      makeDashboard([makeWidget('w1'), makeWidget('w2')]),
    ]);
    expect(stateRef.current?.canUndo).toBe(false);

    act(() => stateRef.current?.removeWidget('w2'));
    expect(widgetIds(stateRef)).toEqual(['w1']);
    expect(stateRef.current?.canUndo).toBe(true);

    act(() => stateRef.current?.undoWidgets());
    expect(widgetIds(stateRef)).toEqual(['w1', 'w2']);
    expect(stateRef.current?.canRedo).toBe(true);

    act(() => stateRef.current?.redoWidgets());
    expect(widgetIds(stateRef)).toEqual(['w1']);
    expect(stateRef.current?.canRedo).toBe(false);
  });

  it('undoes clear-all in one step', async () => {
    const stateRef = setup();
    await settleSnapshot(stateRef, [
      makeDashboard([makeWidget('w1'), makeWidget('w2')]),
    ]);
    act(() => stateRef.current?.clearAllWidgets());
    expect(widgetIds(stateRef)).toEqual([]);
    act(() => stateRef.current?.undoWidgets());
    expect(widgetIds(stateRef)).toEqual(['w1', 'w2']);
  });

  it('coalesces a burst of updates to one widget and bumps version on undo', async () => {
    const stateRef = setup();
    await settleSnapshot(stateRef, [makeDashboard([makeWidget('w1')])]);
    // Viewport hydration may shift the loaded position; undo restores that.
    const initialX = stateRef.current?.activeDashboard?.widgets[0].x;

    for (const x of [100, 200, 300]) {
      act(() => stateRef.current?.updateWidget('w1', { x }));
    }
    act(() => {
      stateRef.current?.updateWidget('w1', {
        config: { text: 'edited' } as WidgetData['config'],
      });
    });
    expect(stateRef.current?.activeDashboard?.widgets[0].x).toBe(300);

    act(() => stateRef.current?.undoWidgets());
    const restored = stateRef.current?.activeDashboard?.widgets[0];
    expect(restored?.x).toBe(initialX);
    expect(restored?.config).toEqual({ text: 'test' });
    expect(restored?.version).toBeGreaterThan(1);
    expect(stateRef.current?.canUndo).toBe(false);
  });

  it('skips history for updates flagged skipHistory', async () => {
    const stateRef = setup();
    await settleSnapshot(stateRef, [makeDashboard([makeWidget('w1')])]);
    act(() => {
      stateRef.current?.updateWidget('w1', { x: 5 }, { skipHistory: true });
    });
    expect(stateRef.current?.canUndo).toBe(false);
  });

  it('drops history when a remote change lands on the active board', async () => {
    const stateRef = setup();
    await settleSnapshot(stateRef, [makeDashboard([makeWidget('w1')])]);
    act(() => stateRef.current?.removeWidget('w1'));
    expect(stateRef.current?.canUndo).toBe(true);

    // Let the local-edit window and save debounce pass.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await pushSnapshot([makeDashboard([makeWidget('remote')])]);
    expect(widgetIds(stateRef)).toEqual(['remote']);
    expect(stateRef.current?.canUndo).toBe(false);
  });

  it('does not record a no-op layer move over the previous entry', async () => {
    const stateRef = setup();
    await settleSnapshot(stateRef, [
      makeDashboard([makeWidget('w1', 1), makeWidget('w2', 2)]),
    ]);
    const initialX = stateRef.current?.activeDashboard?.widgets[0].x;

    act(() => stateRef.current?.updateWidget('w1', { x: 300 }));
    // w2 is already top of the z-order, so this move changes nothing.
    act(() => stateRef.current?.moveWidgetLayer('w2', 'up'));

    act(() => stateRef.current?.undoWidgets());
    expect(stateRef.current?.activeDashboard?.widgets[0].x).toBe(initialX);
    expect(stateRef.current?.canUndo).toBe(false);
  });

  it('does not record minimize-all when every widget is already minimized', async () => {
    const stateRef = setup();
    const minimized = { ...makeWidget('w1'), minimized: true };
    await settleSnapshot(stateRef, [makeDashboard([minimized])]);
    act(() => stateRef.current?.minimizeAllWidgets());
    expect(stateRef.current?.canUndo).toBe(false);
  });

  it('collapses a snapshot plus skipHistory writes into one undo step', async () => {
    const stateRef = setup();
    await settleSnapshot(stateRef, [
      makeDashboard([makeWidget('w1'), makeWidget('w2')]),
    ]);
    const before = stateRef.current?.activeDashboard?.widgets.map((w) => w.x);

    // Mirrors a group drag: one snapshot, then leader + follower commits.
    act(() => stateRef.current?.recordWidgetSnapshot());
    act(() =>
      stateRef.current?.updateWidget('w1', { x: 400 }, { skipHistory: true })
    );
    act(() =>
      stateRef.current?.updateWidgets([{ id: 'w2', changes: { x: 400 } }], {
        skipHistory: true,
      })
    );
    expect(stateRef.current?.activeDashboard?.widgets.map((w) => w.x)).toEqual([
      400, 400,
    ]);

    act(() => stateRef.current?.undoWidgets());
    expect(stateRef.current?.activeDashboard?.widgets.map((w) => w.x)).toEqual(
      before
    );
    expect(stateRef.current?.canUndo).toBe(false);
  });

  it('ignores an undo pinned to a board that is no longer active', async () => {
    const stateRef = setup();
    await settleSnapshot(stateRef, [
      makeDashboard([makeWidget('w1'), makeWidget('w2')]),
    ]);
    act(() => stateRef.current?.removeWidget('w2'));
    act(() => stateRef.current?.undoWidgets('some-other-board'));
    expect(widgetIds(stateRef)).toEqual(['w1']);

    act(() => stateRef.current?.undoWidgets('dash-1'));
    expect(widgetIds(stateRef)).toEqual(['w1', 'w2']);
  });
});
