import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import { Dashboard, WidgetData } from '@/types';
import {
  mergeDashboardForSave,
  type SaveBaseline,
} from '@/utils/dashboardSaveMerge';

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
    config: { text: 'test' },
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

type Assignments = Record<string, string>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const assignmentsOf = (stateRef: { current: ContextSnapshot | null }) =>
  (
    stateRef.current?.activeDashboard?.widgets[0].config as {
      assignments: Assignments;
    }
  ).assignments;
const lunchBoard = (version: number) =>
  makeDashboard([
    {
      ...makeWidget('w1'),
      type: 'lunchCount',
      version,
      config: { assignments: {} },
    },
  ]);

// A transactional server: reads, waits, retries if another write landed, then echoes the commit.
function fakeServer(initial: Dashboard, readMs: number, commitMs: number) {
  const state = { board: clone(initial), rev: 0, ts: 5000 };
  saveDashboardMock.mockImplementation(
    async (local: Dashboard, baseline?: SaveBaseline) => {
      for (;;) {
        await new Promise((r) => setTimeout(r, readMs));
        const readRev = state.rev;
        const toWrite = baseline
          ? mergeDashboardForSave(local, clone(state.board), baseline)
          : local;
        await new Promise((r) => setTimeout(r, commitMs));
        if (state.rev !== readRev) continue;
        const updatedAt = ++state.ts;
        state.board = clone({ ...toWrite, updatedAt });
        state.rev++;
        capturedSnapshotCb?.([clone(state.board)], false);
        return updatedAt;
      }
    }
  );
  return state;
}

async function moveStudents(
  stateRef: { current: ContextSnapshot | null },
  count: number,
  gapMs: number
) {
  for (let i = 0; i < count; i++) {
    const current = assignmentsOf(stateRef);
    act(() => {
      stateRef.current?.updateWidget('w1', {
        config: { assignments: { ...current, [`s${i}`]: 'hot' } },
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(gapMs);
    });
  }
}

describe('Lunch Count moves survive concurrent saves', () => {
  beforeEach(() => {
    capturedSnapshotCb = null;
    saveDashboardMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps every move when saves overlap on a slow connection', async () => {
    const server = fakeServer(lunchBoard(1), 1500, 1500);
    const stateRef = setup();
    await settleSnapshot(stateRef, [clone(server.board)]);

    await moveStudents(stateRef, 8, 400);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    expect(Object.keys(assignmentsOf(stateRef))).toHaveLength(8);
    expect(
      Object.keys(
        (server.board.widgets[0].config as { assignments: Assignments })
          .assignments
      )
    ).toHaveLength(8);
  });

  it('keeps the moves when another device saves a menu refresh from an old copy', async () => {
    const initial = lunchBoard(3);
    const server = fakeServer(initial, 200, 0);
    const stateRef = setup();
    await settleSnapshot(stateRef, [clone(server.board)]);
    await moveStudents(stateRef, 5, 1500);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // The other device still holds the empty copy it loaded and saves only a new menu.
    const stale = clone(initial);
    stale.widgets[0] = {
      ...stale.widgets[0],
      version: 4,
      config: { assignments: {}, cachedMenu: 'today' },
    };
    server.board = {
      ...mergeDashboardForSave(stale, clone(server.board), {
        widgets: clone(initial.widgets),
        background: initial.background,
        name: initial.name,
        libraryOrder: '[]',
        settings: '{}',
        dashboardFields: {},
      }),
      updatedAt: ++server.ts,
    };
    await pushSnapshot([clone(server.board)]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(Object.keys(assignmentsOf(stateRef))).toHaveLength(5);
    expect(server.board.widgets[0].config).toMatchObject({
      cachedMenu: 'today',
    });
  });
});
