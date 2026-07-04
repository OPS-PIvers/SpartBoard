import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import { Dashboard, WidgetData } from '../types';

// ---------------------------------------------------------------------------
// Mocks (mirrors DashboardContext.bringToFront.test.tsx)
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
    opts?: { immediate?: boolean }
  ) => void;
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

function makeWidget(id: string): WidgetData {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    z: 1,
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

describe('DashboardContext immediate-write fast-path', () => {
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

  it('flushes an immediate config write before the 800ms debounce, while a normal write waits', async () => {
    const stateRef = setup();
    await settleSnapshot(stateRef, [makeDashboard([makeWidget('w1')])]);
    saveDashboardMock.mockClear();

    // Normal config write: should NOT have persisted within ~20ms.
    act(() => {
      stateRef.current?.updateWidget('w1', {
        config: { text: 'normal' } as WidgetData['config'],
      });
    });
    // Sanity: the write mutated context state.
    expect(
      stateRef.current?.activeDashboard?.widgets[0].config as { text: string }
    ).toMatchObject({ text: 'normal' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(saveDashboardMock).not.toHaveBeenCalled();

    // Let the 800ms config debounce flush so we start clean for the
    // immediate-write assertion.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(saveDashboardMock).toHaveBeenCalled(); // normal write did eventually flush
    saveDashboardMock.mockClear();

    // Immediate config write: should persist within ~20ms.
    act(() => {
      stateRef.current?.updateWidget(
        'w1',
        { config: { text: 'immediate' } as WidgetData['config'] },
        { immediate: true }
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(saveDashboardMock).toHaveBeenCalledTimes(1);
  });

  it('does not let an immediate write leak its 0ms fast-path onto a following normal write', async () => {
    const stateRef = setup();
    await settleSnapshot(stateRef, [makeDashboard([makeWidget('w1')])]);
    saveDashboardMock.mockClear();

    // 1) Immediate write — schedules a 0ms flush.
    act(() => {
      stateRef.current?.updateWidget(
        'w1',
        { config: { text: 'immediate' } as WidgetData['config'] },
        { immediate: true }
      );
    });

    // 2) Normal write lands BEFORE the 0ms timer fires. This re-runs the
    //    auto-save effect, clearing the immediate write's pending timer. If the
    //    immediate flag were still set at this point, the normal write would
    //    inherit the 0ms fast-path and flush immediately, defeating its debounce.
    act(() => {
      stateRef.current?.updateWidget('w1', {
        config: { text: 'normal' } as WidgetData['config'],
      });
    });
    expect(
      stateRef.current?.activeDashboard?.widgets[0].config as { text: string }
    ).toMatchObject({ text: 'normal' });

    // 3) After ~20ms the normal write must NOT have persisted (still in its
    //    800ms debounce). No leak means saveDashboard is untouched here.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(saveDashboardMock).not.toHaveBeenCalled();

    // 4) Only after the full 800ms config debounce does it persist.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(saveDashboardMock).toHaveBeenCalled();
  });
});
