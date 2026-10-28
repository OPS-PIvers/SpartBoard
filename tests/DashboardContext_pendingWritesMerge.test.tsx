/**
 * The onSnapshot merge while this tab has its own writes pending (D25): the
 * local board still wins, except for widgets another device has moved to a
 * higher version and widgets another device added.
 */

import React, { useEffect } from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardProvider } from '@/context/DashboardContext';
import { useDashboard } from '@/context/useDashboard';
import { Dashboard, WidgetData } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mutable so a test can flip the phone-remote toggle off.
const authState = { remoteControlEnabled: true };

// Stable singleton — a fresh object per render would churn the `user`
// dependency on the dashboards-subscription effect and reset `loading` to
// true on every commit, trapping any effect gated on `!loading` (e.g. the
// autosave effect), even between renders that changed nothing relevant.
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
  get remoteControlEnabled() {
    return authState.remoteControlEnabled;
  },
  profileLoaded: true,
};

vi.mock('@/context/useAuth', () => ({
  useAuth: () => authMock,
}));

type SnapshotCb = (
  dashboards: Dashboard[],
  hasPendingWrites: boolean,
  pendingDashboardIds?: ReadonlySet<string>
) => void;
let capturedSnapshotCb: SnapshotCb | null = null;

const mockSaveDashboard = vi.fn().mockResolvedValue(Date.now());

// Stable singleton objects — a fresh object (or fresh vi.fn() inside one) per
// render churns the mount effect's `subscribeToDashboards`/`saveDashboard`
// deps, re-triggering `setLoading(true)` on every commit (see authMock above).
const firestoreMock = {
  saveDashboard: mockSaveDashboard,
  saveDashboards: vi.fn().mockResolvedValue(undefined),
  hasDeferredSave: vi.fn((_id: string) => false),
  deferredSaveBaseline: vi.fn((_id: string) => undefined as unknown),
  deleteDashboard: vi.fn().mockResolvedValue(undefined),
  subscribeToDashboards: vi.fn((cb: SnapshotCb) => {
    capturedSnapshotCb = cb;
    return () => {
      // unsubscribe no-op
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

const rostersMock = {
  rosters: [],
  activeRosterId: null,
  addRoster: vi.fn(),
  updateRoster: vi.fn(),
  deleteRoster: vi.fn(),
  setActiveRoster: vi.fn(),
  setAbsentStudents: vi.fn(),
};

vi.mock('@/hooks/useRosters', () => ({
  useRosters: () => rostersMock,
}));

const collectionsMock = {
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
};

vi.mock('@/hooks/useCollections', () => ({
  useCollections: () => collectionsMock,
}));

const sharedCollectionMock = {
  shareCollection: vi.fn().mockResolvedValue('mock-collection-share-id'),
  shareSubstituteCollection: vi
    .fn()
    .mockResolvedValue('mock-collection-sub-share-id'),
  loadSharedCollection: vi
    .fn()
    .mockResolvedValue({ ok: false, reason: 'not-found' }),
  loadSharedCollectionBoards: vi.fn().mockResolvedValue([]),
};

vi.mock('@/hooks/useSharedCollection', () => ({
  useSharedCollection: () => sharedCollectionMock,
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  // Real module reference so any unmocked Firestore function (e.g. helpers
  // imported transitively by deeper modules) still resolves to its real
  // implementation. We override only the functions DashboardContext calls
  // directly outside the useFirestore abstraction — primarily the
  // dock-hydration path that reads userProfile via doc()/getDoc() and
  // persists via setDoc().
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
// Test consumer — exposes context values outside React tree
// ---------------------------------------------------------------------------

interface ContextSnapshot {
  dashboards: Dashboard[];
  activeDashboard: Dashboard | null;
  updateWidget: ReturnType<typeof useDashboard>['updateWidget'];
  updateWidgets: ReturnType<typeof useDashboard>['updateWidgets'];
  setGlobalStyle: ReturnType<typeof useDashboard>['setGlobalStyle'];
  pinBoard: ReturnType<typeof useDashboard>['pinBoard'];
  updateDashboard: ReturnType<typeof useDashboard>['updateDashboard'];
}

/**
 * Renders inside DashboardProvider and writes the latest context values into
 * a plain-object ref after each commit (via useEffect), which tests can read.
 */
const TestConsumer: React.FC<{
  stateRef: { current: ContextSnapshot | null };
}> = ({ stateRef }) => {
  const ctx = useDashboard();
  // Write to the ref AFTER render (in an effect) to satisfy react-hooks/refs.
  useEffect(() => {
    stateRef.current = {
      dashboards: ctx.dashboards,
      activeDashboard: ctx.activeDashboard,
      updateWidget: ctx.updateWidget,
      updateWidgets: ctx.updateWidgets,
      setGlobalStyle: ctx.setGlobalStyle,
      pinBoard: ctx.pinBoard,
      updateDashboard: ctx.updateDashboard,
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

/** A minimal WidgetData stub. */
function makeWidget(id: string, configValue: unknown): WidgetData {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    w: 200,
    h: 100,
    z: 1,
    flipped: false,
    config: { text: configValue },
  };
}

/** Build a minimal dashboard with the given widgets. */
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

/**
 * Simulate a Firestore snapshot arriving and wait for the React tree to settle.
 */
async function pushSnapshot(
  dashboards: Dashboard[],
  hasPendingWrites = false,
  pendingDashboardIds?: ReadonlySet<string>
): Promise<void> {
  if (!capturedSnapshotCb) {
    throw new Error(
      'subscribeToDashboards was not called — DashboardProvider did not mount'
    );
  }
  const cb = capturedSnapshotCb;
  await act(async () => {
    cb(dashboards, hasPendingWrites, pendingDashboardIds);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const textOf = (w: WidgetData | undefined) =>
  (w?.config as { text?: unknown } | undefined)?.text;

const widgetById = (
  stateRef: { current: ContextSnapshot | null },
  id: string
) => stateRef.current?.activeDashboard?.widgets.find((w) => w.id === id);

async function setupBoard(widgets: WidgetData[]) {
  const stateRef = setup();
  const initial = makeDashboard(widgets);
  await pushSnapshot([initial]);
  await waitFor(() =>
    expect(stateRef.current?.activeDashboard?.id).toBe('dash-1')
  );
  // The second snapshot initialises the saved baseline.
  await pushSnapshot([initial]);
  return stateRef;
}

async function editLocally(
  stateRef: { current: ContextSnapshot | null },
  id: string,
  config: Record<string, unknown>
) {
  await act(async () => {
    stateRef.current?.updateWidget(id, { config });
    await Promise.resolve();
  });
}

describe('DashboardContext merge with pending writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSnapshotCb = null;
    authState.remoteControlEnabled = true;
  });

  it("keeps a pending local edit and takes another device's newer edit to a different widget", async () => {
    const stateRef = await setupBoard([
      { ...makeWidget('wA', 'A0'), version: 1 },
      { ...makeWidget('wB', 'B0'), version: 1 },
    ]);
    await editLocally(stateRef, 'wA', { text: 'local-A' });

    await pushSnapshot(
      [
        {
          ...makeDashboard([
            { ...makeWidget('wA', 'A0'), version: 1 },
            { ...makeWidget('wB', 'claude-B'), version: 2 },
          ]),
          updatedAt: 2000,
        },
      ],
      true
    );

    await waitFor(() => {
      expect(textOf(widgetById(stateRef, 'wA'))).toBe('local-A');
      expect(textOf(widgetById(stateRef, 'wB'))).toBe('claude-B');
    });
  });

  it('REGRESSION: local still wins for the same widget when the server is not ahead', async () => {
    const stateRef = await setupBoard([
      { ...makeWidget('wA', 'A0'), version: 1 },
    ]);
    await editLocally(stateRef, 'wA', { text: 'local-A' });
    expect(widgetById(stateRef, 'wA')?.version).toBe(2);

    // Same version as the local edit: an echo or a concurrent edit, never newer.
    await pushSnapshot(
      [
        {
          ...makeDashboard([{ ...makeWidget('wA', 'other-A'), version: 2 }]),
          updatedAt: 2000,
        },
      ],
      true
    );

    await waitFor(() =>
      expect(textOf(widgetById(stateRef, 'wA'))).toBe('local-A')
    );
  });

  it('keeps a stale copy from replacing an untouched widget', async () => {
    const stateRef = await setupBoard([
      { ...makeWidget('wA', 'A0'), version: 3 },
    ]);
    await pushSnapshot(
      [
        {
          ...makeDashboard([{ ...makeWidget('wA', 'older'), version: 2 }]),
          updatedAt: 2000,
        },
      ],
      true
    );
    expect(textOf(widgetById(stateRef, 'wA'))).toBe('A0');
  });

  it('merges a same-widget conflict per key when the server is ahead', async () => {
    const stateRef = await setupBoard([
      {
        ...makeWidget('wA', 'A0'),
        config: { text: 'A0', color: 'red' },
        version: 1,
      },
    ]);
    await editLocally(stateRef, 'wA', { text: 'local-A', color: 'red' });

    await pushSnapshot(
      [
        {
          ...makeDashboard([
            {
              ...makeWidget('wA', 'A0'),
              config: { text: 'A0', color: 'blue' },
              version: 3,
            },
          ]),
          updatedAt: 2000,
        },
      ],
      true
    );

    await waitFor(() =>
      expect(widgetById(stateRef, 'wA')?.config).toMatchObject({
        text: 'local-A',
        color: 'blue',
      })
    );
  });

  it('leaves deletes on either side as they were', async () => {
    const stateRef = await setupBoard([
      { ...makeWidget('wA', 'A0'), version: 1 },
      { ...makeWidget('wB', 'B0'), version: 1 },
      { ...makeWidget('wC', 'C0'), version: 1 },
    ]);
    await act(async () => {
      stateRef.current?.updateDashboard({
        widgets: (stateRef.current?.activeDashboard?.widgets ?? []).filter(
          (w) => w.id !== 'wC'
        ),
      });
      await Promise.resolve();
    });

    // The server dropped wB and still has wC, at a newer version.
    await pushSnapshot(
      [
        {
          ...makeDashboard([
            { ...makeWidget('wA', 'A0'), version: 1 },
            { ...makeWidget('wC', 'C-newer'), version: 5 },
          ]),
          updatedAt: 2000,
        },
      ],
      true
    );

    const ids = stateRef.current?.activeDashboard?.widgets.map((w) => w.id);
    expect(ids).toEqual(['wA', 'wB']);
  });

  it('adds a widget another device added when only other boards have pending writes', async () => {
    const stateRef = await setupBoard([
      { ...makeWidget('wA', 'A0'), version: 1 },
    ]);
    await pushSnapshot(
      [
        {
          ...makeDashboard([
            { ...makeWidget('wA', 'A0'), version: 1 },
            { ...makeWidget('wNew', 'from-claude'), version: 1 },
          ]),
          updatedAt: 2000,
        },
      ],
      true,
      new Set(['other-board'])
    );

    await waitFor(() =>
      expect(textOf(widgetById(stateRef, 'wNew'))).toBe('from-claude')
    );
  });

  it("does not add server-only widgets while this board's own copy is unconfirmed", async () => {
    const stateRef = await setupBoard([
      { ...makeWidget('wA', 'A0'), version: 1 },
    ]);
    await pushSnapshot(
      [
        {
          ...makeDashboard([
            { ...makeWidget('wA', 'A0'), version: 1 },
            { ...makeWidget('wGone', 'maybe-deleted-here'), version: 1 },
          ]),
          updatedAt: 2000,
        },
      ],
      true,
      new Set(['dash-1'])
    );

    expect(widgetById(stateRef, 'wGone')).toBeUndefined();
  });

  it('treats a board with a queued offline save like one with pending writes', async () => {
    const stateRef = await setupBoard([
      { ...makeWidget('wA', 'A0'), version: 1 },
      { ...makeWidget('wB', 'B0'), version: 1 },
    ]);
    await act(async () => {
      stateRef.current?.updateDashboard({
        widgets: (stateRef.current?.activeDashboard?.widgets ?? []).filter(
          (w) => w.id !== 'wB'
        ),
      });
      await Promise.resolve();
    });
    await editLocally(stateRef, 'wA', { text: 'offline-A' });
    firestoreMock.hasDeferredSave.mockImplementation(
      (id: string) => id === 'dash-1'
    );
    firestoreMock.deferredSaveBaseline.mockImplementation(() => ({
      widgets: [makeWidget('wA', 'A0'), makeWidget('wB', 'B0')],
    }));

    // Reconnected: the server still has wB (deleted offline here) and another device's new widget.
    await pushSnapshot(
      [
        {
          ...makeDashboard([
            { ...makeWidget('wA', 'A0'), version: 1 },
            { ...makeWidget('wB', 'B0'), version: 1 },
            { ...makeWidget('wNew', 'from-claude'), version: 1 },
          ]),
          updatedAt: 3000,
        },
      ],
      false,
      new Set()
    );

    await waitFor(() =>
      expect(textOf(widgetById(stateRef, 'wNew'))).toBe('from-claude')
    );
    expect(textOf(widgetById(stateRef, 'wA'))).toBe('offline-A');
    expect(widgetById(stateRef, 'wB')).toBeUndefined();
    firestoreMock.hasDeferredSave.mockImplementation(() => false);
    firestoreMock.deferredSaveBaseline.mockImplementation(() => undefined);
  });
});
