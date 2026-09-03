import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import { Dashboard, WidgetData } from '@/types';

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
  loadDashboard: (id: string) => void;
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
      loadDashboard: ctx.loadDashboard,
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

function makeDashboard(widgets: WidgetData[], id = 'dash-1'): Dashboard {
  return {
    id,
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

// Regression: the auto-save effect re-runs on every `dashboards` change and
// cancels its pending timer, so edits arriving closer together than the 800ms
// config debounce postponed the write indefinitely. A teacher typing steadily
// into a Note persisted nothing until they stopped, and the only backstop was
// a beforeunload flush that can't reliably complete. MAX_UNSAVED_EDIT_AGE_MS
// caps how long an edit may sit unsaved while edits keep arriving.
describe('DashboardContext auto-save starvation ceiling', () => {
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

  /** Types `count` characters 200ms apart — well inside the 800ms debounce. */
  async function typeSteadily(
    stateRef: { current: ContextSnapshot | null },
    count: number
  ): Promise<void> {
    for (let i = 0; i < count; i++) {
      act(() => {
        stateRef.current?.updateWidget('w1', {
          config: { text: `keystroke-${i}` } as WidgetData['config'],
        });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
    }
  }

  it('persists during sustained typing instead of waiting for a pause', async () => {
    const stateRef = setup();
    await settleSnapshot(stateRef, [makeDashboard([makeWidget('w1')])]);
    saveDashboardMock.mockClear();

    // 20 keystrokes × 200ms = 4s of continuous typing, never idle for the
    // full 800ms debounce. Before the ceiling this saved zero times.
    await typeSteadily(stateRef, 20);

    expect(saveDashboardMock).toHaveBeenCalled();
  });

  it('still coalesces — sustained typing writes on the ceiling, not per keystroke', async () => {
    const stateRef = setup();
    await settleSnapshot(stateRef, [makeDashboard([makeWidget('w1')])]);
    saveDashboardMock.mockClear();

    // 6s of typing at 200ms intervals = 30 edits. Bounded by the 3s ceiling,
    // that is a small number of writes, not one per keystroke.
    await typeSteadily(stateRef, 30);

    expect(saveDashboardMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(saveDashboardMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('leaves the normal debounce intact for an isolated edit', async () => {
    const stateRef = setup();
    await settleSnapshot(stateRef, [makeDashboard([makeWidget('w1')])]);
    saveDashboardMock.mockClear();

    act(() => {
      stateRef.current?.updateWidget('w1', {
        config: { text: 'once' } as WidgetData['config'],
      });
    });

    // A single edit must still wait out its full 800ms debounce — the ceiling
    // only ever shortens the wait once edits have been queued that long.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(saveDashboardMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(saveDashboardMock).toHaveBeenCalledTimes(1);
  });

  it('opens a fresh ceiling window after a write, not a permanently overdue one', async () => {
    const stateRef = setup();
    await settleSnapshot(stateRef, [makeDashboard([makeWidget('w1')])]);
    saveDashboardMock.mockClear();

    await typeSteadily(stateRef, 20);
    expect(saveDashboardMock).toHaveBeenCalled();

    // Go idle long enough for everything to settle, then make one more edit.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    saveDashboardMock.mockClear();

    act(() => {
      stateRef.current?.updateWidget('w1', {
        config: { text: 'after-idle' } as WidgetData['config'],
      });
    });
    // If the window were never reset, this would flush instantly at 0ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(saveDashboardMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(saveDashboardMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the unsaved marker when a save rejects so beforeunload still flushes', async () => {
    const stateRef = setup();
    await settleSnapshot(stateRef, [makeDashboard([makeWidget('w1')])]);
    saveDashboardMock.mockClear();
    saveDashboardMock.mockRejectedValueOnce(new Error('offline'));

    act(() => {
      stateRef.current?.updateWidget('w1', {
        config: { text: 'unsaved' } as WidgetData['config'],
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(saveDashboardMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await Promise.resolve();
    });

    saveDashboardMock.mockClear();
    await act(async () => {
      window.dispatchEvent(new Event('beforeunload'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(saveDashboardMock).toHaveBeenCalled();
  });

  it('keeps the normal debounce after a rejected save instead of firing per keystroke', async () => {
    const stateRef = setup();
    await settleSnapshot(stateRef, [makeDashboard([makeWidget('w1')])]);
    saveDashboardMock.mockClear();
    saveDashboardMock.mockRejectedValueOnce(new Error('offline'));

    act(() => {
      stateRef.current?.updateWidget('w1', {
        config: { text: 'a' } as WidgetData['config'],
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
      await Promise.resolve();
    });
    expect(saveDashboardMock).toHaveBeenCalledTimes(1);

    saveDashboardMock.mockClear();
    act(() => {
      stateRef.current?.updateWidget('w1', {
        config: { text: 'ab' } as WidgetData['config'],
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(saveDashboardMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(saveDashboardMock).toHaveBeenCalledTimes(1);
  });

  it('flushes the outgoing board when switching boards mid-debounce', async () => {
    const stateRef = setup();
    await settleSnapshot(stateRef, [
      makeDashboard([makeWidget('w1')], 'dash-1'),
      makeDashboard([makeWidget('w2')], 'dash-2'),
    ]);
    saveDashboardMock.mockClear();

    act(() => {
      stateRef.current?.updateWidget('w1', {
        config: { text: 'typed-then-switched' } as WidgetData['config'],
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(saveDashboardMock).not.toHaveBeenCalled();

    act(() => {
      stateRef.current?.loadDashboard('dash-2');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const savedIds = saveDashboardMock.mock.calls.map(
      (c) => (c[0] as Dashboard).id
    );
    expect(savedIds).toContain('dash-1');
  });
});
