import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import { Dashboard, WidgetData } from '@/types';

// ---------------------------------------------------------------------------
// Mocks (mirrors DashboardContext.widgetHistory.test.tsx)
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
  canAccessFeature: vi.fn((_feature: string) => false),
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

type Ctx = ReturnType<typeof useDashboard>;

const TestConsumer: React.FC<{
  stateRef: { current: Ctx | null };
}> = ({ stateRef }) => {
  const ctx = useDashboard();
  useEffect(() => {
    stateRef.current = ctx;
  });
  return null;
};

function setup() {
  const stateRef: { current: Ctx | null } = { current: null };
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

async function settle(
  stateRef: { current: Ctx | null },
  dashboards: Dashboard[]
): Promise<void> {
  await pushSnapshot(dashboards);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  if (!stateRef.current?.activeDashboard)
    throw new Error('active dashboard not loaded');
}

const flushSaves = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
};

const savedWidgetIds = () =>
  saveDashboardMock.mock.calls.map((call) =>
    (call[0] as Dashboard).widgets.map((w) => w.id)
  );

const LAYOUT = { xProp: 0.5, yProp: 0.25, wProp: 0.2, hProp: 0.3 };

describe('DashboardContext tour layer', () => {
  beforeEach(() => {
    capturedSnapshotCb = null;
    saveDashboardMock.mockClear();
    saveDashboardMock.mockResolvedValue(Date.now());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds a tour widget at its layout, in front, without saving or recording history', async () => {
    const stateRef = setup();
    await settle(stateRef, [makeDashboard([makeWidget('w1', 4)])]);
    let id: string | null = null;
    act(() => {
      id = stateRef.current?.addTourWidget?.('clock', LAYOUT) ?? null;
    });
    const added = stateRef.current?.activeDashboard?.widgets.find(
      (w) => w.id === id
    );
    expect(added).toMatchObject({ type: 'clock', transient: true, ...LAYOUT });
    expect(added?.z).toBe(5);
    expect(stateRef.current?.canUndo).toBe(false);
    await flushSaves();
    expect(savedWidgetIds().flat()).not.toContain(id);
  });

  it('keeps a tour widget out of history, so undo leaves it in place', async () => {
    const stateRef = setup();
    await settle(stateRef, [makeDashboard([makeWidget('w1')])]);
    let id: string | null = null;
    act(() => {
      id = stateRef.current?.addTourWidget?.('clock', LAYOUT) ?? null;
    });
    act(() => stateRef.current?.removeWidget('w1'));
    act(() => stateRef.current?.undoWidgets());
    const ids = stateRef.current?.activeDashboard?.widgets.map((w) => w.id);
    expect(ids).toEqual(expect.arrayContaining(['w1', id]));
  });

  it('survives a server snapshot without being written back', async () => {
    const stateRef = setup();
    await settle(stateRef, [makeDashboard([makeWidget('w1')])]);
    let id: string | null = null;
    act(() => {
      id = stateRef.current?.addTourWidget?.('clock', LAYOUT) ?? null;
    });
    await pushSnapshot([makeDashboard([makeWidget('w1'), makeWidget('w9')])]);
    const ids = stateRef.current?.activeDashboard?.widgets.map((w) => w.id);
    expect(ids).toEqual(expect.arrayContaining(['w1', 'w9', id]));
  });

  it('strips a tour widget that reached the server', async () => {
    const stateRef = setup();
    await settle(stateRef, [
      makeDashboard([
        makeWidget('w1'),
        { ...makeWidget('t1'), transient: true },
      ]),
    ]);
    expect(stateRef.current?.activeDashboard?.widgets.map((w) => w.id)).toEqual(
      ['w1']
    );
  });

  it('Keep clears the flag and saves the widget', async () => {
    const stateRef = setup();
    await settle(stateRef, [makeDashboard([makeWidget('w1')])]);
    let id = '';
    act(() => {
      id = stateRef.current?.addTourWidget?.('clock', LAYOUT) ?? '';
    });
    act(() => stateRef.current?.commitTourWidgets?.([id]));
    const kept = stateRef.current?.activeDashboard?.widgets.find(
      (w) => w.id === id
    );
    expect(kept?.transient).toBeUndefined();
    await flushSaves();
    expect(savedWidgetIds().at(-1)).toContain(id);
  });

  it('discards a tour widget without an undo entry or a save', async () => {
    const stateRef = setup();
    await settle(stateRef, [makeDashboard([makeWidget('w1')])]);
    let id = '';
    act(() => {
      id = stateRef.current?.addTourWidget?.('clock', LAYOUT) ?? '';
    });
    act(() => stateRef.current?.discardTourWidgets?.([id]));
    expect(stateRef.current?.activeDashboard?.widgets.map((w) => w.id)).toEqual(
      ['w1']
    );
    expect(stateRef.current?.canUndo).toBe(false);
    await flushSaves();
    expect(saveDashboardMock).not.toHaveBeenCalled();
  });

  it('never discards a saved widget', async () => {
    const stateRef = setup();
    await settle(stateRef, [makeDashboard([makeWidget('w1')])]);
    act(() => stateRef.current?.discardTourWidgets?.(['w1']));
    expect(stateRef.current?.activeDashboard?.widgets.map((w) => w.id)).toEqual(
      ['w1']
    );
  });
});
