import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { Dashboard } from '@/types';

// ---------------------------------------------------------------------------
// Mocks (default board creation)
// ---------------------------------------------------------------------------

// Stable singleton so identity-sensitive effect deps don't churn.
const authMock = {
  user: {
    uid: 'test-user',
    displayName: 'Test User',
    email: 'test@example.com',
    metadata: {},
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
  roleResolved: true,
  roleId: 'teacher',
  isStudentRole: false,
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
const saveDashboardMock = vi.fn().mockResolvedValue(Date.now());

// Stable singleton so the load effect doesn't re-subscribe every render.
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
// Tests
// ---------------------------------------------------------------------------

describe('DashboardProvider default board creation', () => {
  beforeEach(() => {
    capturedSnapshotCb = null;
    saveDashboardMock.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it('creates one default board when empty snapshots arrive twice before the save lands', async () => {
    render(
      <DashboardProvider>
        <div />
      </DashboardProvider>
    );
    expect(capturedSnapshotCb).not.toBeNull();
    await act(async () => {
      capturedSnapshotCb?.([], false);
      capturedSnapshotCb?.([], false);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(saveDashboardMock).toHaveBeenCalledTimes(1);
  });

  it('creates a new default board after the teacher deletes every board', async () => {
    render(
      <DashboardProvider>
        <div />
      </DashboardProvider>
    );
    const board: Dashboard = {
      id: 'b1',
      name: 'Existing',
      background: 'bg-slate-900',
      widgets: [],
      createdAt: 1,
    };
    await act(async () => {
      capturedSnapshotCb?.([], false);
      await new Promise((r) => setTimeout(r, 20));
      capturedSnapshotCb?.([board], false);
      await new Promise((r) => setTimeout(r, 20));
      capturedSnapshotCb?.([], false);
      await new Promise((r) => setTimeout(r, 20));
    });
    const created = saveDashboardMock.mock.calls.filter(
      ([db]) => (db as Dashboard).name === 'My First Board'
    );
    expect(created).toHaveLength(2);
  });
});
