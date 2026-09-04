/**
 * Regression test: the snapshot merge adopts our own save echo with Firestore's
 * key order; change detection must be key-stable or the board saves forever.
 * Mocks mirror DashboardContext_hiddenFlushBaseline.test.tsx.
 */

import React, { useEffect } from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardProvider } from '@/context/DashboardContext';
import { useDashboard } from '@/context/useDashboard';
import { Dashboard, WidgetData } from '@/types';

// ---------------------------------------------------------------------------
// Mocks (mirrors DashboardContext_merge.test.tsx)
// ---------------------------------------------------------------------------

// Stable singleton — a fresh object per render would churn the `user`
// dependency on the dashboards-subscription effect and reset `loading` to
// true on every commit, trapping the flush effect's `!loading` gate.
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
  remoteControlEnabled: true,
  profileLoaded: true,
};

vi.mock('@/context/useAuth', () => ({
  useAuth: () => authMock,
}));

type SnapshotCb = (dashboards: Dashboard[], hasPendingWrites: boolean) => void;
let capturedSnapshotCb: SnapshotCb | null = null;

const mockSaveDashboard = vi.fn().mockResolvedValue(Date.now());

// Stable singleton objects — a fresh object (or fresh vi.fn() inside one) per
// render churns the mount effect's `subscribeToDashboards`/`saveDashboard`
// deps, re-triggering `setLoading(true)` on every commit and permanently
// trapping any effect gated on `!loading` (the hidden/teardown flush).
const firestoreMock = {
  saveDashboard: mockSaveDashboard,
  saveDashboards: vi.fn().mockResolvedValue(undefined),
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
  updateWidget: ReturnType<typeof useDashboard>['updateWidget'];
}

const TestConsumer: React.FC<{
  stateRef: { current: ContextSnapshot | null };
}> = ({ stateRef }) => {
  const ctx = useDashboard();
  useEffect(() => {
    stateRef.current = {
      dashboards: ctx.dashboards,
      activeDashboard: ctx.activeDashboard,
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
    config: { text: configValue } as WidgetData['config'],
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

async function pushSnapshot(
  dashboards: Dashboard[],
  hasPendingWrites = false
): Promise<void> {
  if (!capturedSnapshotCb) {
    throw new Error(
      'subscribeToDashboards was not called — DashboardProvider did not mount'
    );
  }
  const cb = capturedSnapshotCb;
  await act(async () => {
    cb(dashboards, hasPendingWrites);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

// ---------------------------------------------------------------------------
// Tests

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Firestore returns a document with its own key order.
const reorder = <T extends object>(o: T): T =>
  Object.fromEntries(
    Object.keys(o)
      .sort()
      .reverse()
      .map((k) => [k, (o as Record<string, unknown>)[k]])
  ) as T;

describe('DashboardContext autosave echo loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveDashboard.mockResolvedValue(3000);
    capturedSnapshotCb = null;
  });

  it('REGRESSION: a key-reordered echo of our own save does not trigger another save', async () => {
    const stateRef = setup();

    const initialDashboard = makeDashboard([makeWidget('wA', 'a')]);
    await pushSnapshot([initialDashboard]);
    await waitFor(() =>
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-1')
    );
    await pushSnapshot([initialDashboard]);

    await act(async () => {
      stateRef.current?.updateWidget('wA', { w: 400, h: 200 });
      await Promise.resolve();
    });
    await waitFor(() => expect(mockSaveDashboard).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    const saved = mockSaveDashboard.mock.calls[0][0] as Dashboard;

    const echo: Dashboard = reorder({
      ...saved,
      widgets: saved.widgets.map((w) => reorder(w)),
      updatedAt: 3000,
    });
    await pushSnapshot([echo]);

    await new Promise((r) => setTimeout(r, 1500));
    expect(mockSaveDashboard).toHaveBeenCalledTimes(1);
  });
});
