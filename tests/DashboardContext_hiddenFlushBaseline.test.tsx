/**
 * Regression test: a hidden-tab flush (backgrounding the tab mid-edit) must
 * advance the save baseline on success, the same way the normal debounced
 * autosave does. Without that, `lastSavedFieldsRef` stays pinned to the
 * pre-edit snapshot forever, so the per-widget merge in the onSnapshot
 * handler keeps comparing every future incoming snapshot against a stale
 * baseline — permanently treating the already-synced widget as "changed
 * locally" and discarding any later legitimate edit another device makes to
 * that same widget, until this device happens to make another edit of its
 * own (which is the only remaining path that refreshes the baseline).
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

describe('DashboardContext hidden-tab flush baseline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveDashboard.mockResolvedValue(Date.now());
    capturedSnapshotCb = null;
  });

  it('REGRESSION: a successful hidden-tab flush lets a later remote edit to the same widget land', async () => {
    const stateRef = setup();

    const initialDashboard = makeDashboard([
      makeWidget('wA', 'original-A'),
      makeWidget('wB', 'original-B'),
    ]);
    await pushSnapshot([initialDashboard]);
    await waitFor(() =>
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-1')
    );
    await pushSnapshot([initialDashboard]);

    // Local edit on widget A.
    await act(async () => {
      stateRef.current?.updateWidget('wA', {
        config: { text: 'local-A' } as WidgetData['config'],
      });
      await Promise.resolve();
    });
    await waitFor(() => {
      const wA = stateRef.current?.activeDashboard?.widgets.find(
        (w) => w.id === 'wA'
      );
      expect(wA?.config).toMatchObject({ text: 'local-A' });
    });

    // Background the tab — this fires the hidden-tab flush, which saves
    // widget A's edit via the baselined merge write (saveDashboard resolves
    // through the mock, simulating a successful Firestore transaction).
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden');
    try {
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await Promise.resolve();
      });
    } finally {
      visibility.mockRestore();
    }
    expect(mockSaveDashboard).toHaveBeenCalledTimes(1);

    // A co-teacher, on another device, now makes a *later* legitimate edit to
    // the very widget this device already flushed — well after the flush
    // landed, so it is not this device's own echo.
    await pushSnapshot([
      {
        ...makeDashboard([
          makeWidget('wA', 'other-device-A-update'),
          makeWidget('wB', 'original-B'),
        ]),
        updatedAt: 999_999_999,
      },
    ]);

    // The flushed widget was already synced — this device should accept the
    // co-teacher's newer edit to it, exactly as it would for any other
    // widget it hasn't touched since its last confirmed save.
    await waitFor(() => {
      const wA = stateRef.current?.activeDashboard?.widgets.find(
        (w) => w.id === 'wA'
      );
      expect(wA?.config).toMatchObject({ text: 'other-device-A-update' });
    });
  });
});
