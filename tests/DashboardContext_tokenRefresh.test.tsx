// Regression: a Drive token refresh re-ran the dashboards subscription, flashing the loader and reloading every embed.

import React, { useEffect } from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardProvider } from '@/context/DashboardContext';
import { useDashboard } from '@/context/useDashboard';
import { Dashboard } from '@/types';

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

const makeDriveService = () => ({
  listFiles: vi.fn().mockResolvedValue([]),
  downloadFile: vi.fn(),
  uploadFile: vi.fn().mockResolvedValue({ id: 'f', name: 'f' }),
  updateFileContent: vi.fn().mockResolvedValue(undefined),
  exportDashboard: vi.fn().mockResolvedValue('drive-file-id'),
});

const driveMock: {
  driveService: object | null;
  userDomain: string;
  isConnected: boolean;
} = {
  driveService: makeDriveService(),
  userDomain: 'example.com',
  isConnected: true,
};

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => driveMock,
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
// Tests
// ---------------------------------------------------------------------------

const loadingHistory: boolean[] = [];

const LoadingProbe: React.FC = () => {
  const { loading } = useDashboard();
  useEffect(() => {
    loadingHistory.push(loading);
  }, [loading]);
  return null;
};

const dashboard: Dashboard = {
  id: 'dash-1',
  name: 'Test Board',
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 1000,
  updatedAt: 1000,
};

describe('DashboardContext Drive token refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSnapshotCb = null;
    loadingHistory.length = 0;
    driveMock.driveService = makeDriveService();
  });

  it('REGRESSION: a new Drive service does not re-subscribe or flash loading', async () => {
    const { rerender } = render(
      <DashboardProvider>
        <LoadingProbe />
      </DashboardProvider>
    );
    const cb = capturedSnapshotCb;
    if (!cb) throw new Error('subscribeToDashboards was not called');
    await act(async () => {
      cb([dashboard], false);
      await Promise.resolve();
    });
    await waitFor(() => expect(loadingHistory.at(-1)).toBe(false));
    expect(firestoreMock.subscribeToDashboards).toHaveBeenCalledTimes(1);
    const historyBefore = loadingHistory.length;

    driveMock.driveService = makeDriveService();
    rerender(
      <DashboardProvider>
        <LoadingProbe />
      </DashboardProvider>
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(firestoreMock.subscribeToDashboards).toHaveBeenCalledTimes(1);
    expect(loadingHistory.slice(historyBefore)).not.toContain(true);
  });
});
