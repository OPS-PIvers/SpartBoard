import React, { useEffect } from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import type { Dashboard } from '@/types';

const authMock = {
  user: { uid: 'teacher-1', displayName: 'Teacher', email: 't@example.com' },
  isAdmin: false,
  featurePermissions: [],
  selectedBuildings: [],
  savedWidgetConfigs: {},
  saveWidgetConfig: vi.fn(),
  refreshGoogleToken: vi.fn(),
  googleAccessToken: null,
  remoteControlEnabled: true,
  profileLoaded: true,
  canAccessFeature: () => true,
};

vi.mock('./useAuth', () => ({
  useAuth: () => authMock,
}));

const uploadFileMock = vi
  .fn()
  .mockResolvedValue({ id: 'share-copy-1', name: 'Board.spart' });
const exportDashboardMock = vi.fn().mockResolvedValue('backup-file-1');
const makePublicMock = vi.fn().mockResolvedValue(undefined);

const driveMock = {
  driveService: {
    uploadFile: uploadFileMock,
    updateFileContent: vi.fn().mockResolvedValue(undefined),
    exportDashboard: exportDashboardMock,
    makePublic: makePublicMock,
    listFiles: vi.fn().mockResolvedValue([]),
    downloadFile: vi.fn(),
  },
  userDomain: 'example.com',
  isConnected: true,
};

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => driveMock,
}));

type SnapshotCb = (dashboards: Dashboard[], hasPendingWrites: boolean) => void;
let capturedSnapshotCb: SnapshotCb | null = null;
const saveDashboardMock = vi.fn().mockResolvedValue(Date.now());
const saveDashboardsMock = vi.fn().mockResolvedValue(undefined);

const firestoreMock = {
  saveDashboard: saveDashboardMock,
  saveDashboards: saveDashboardsMock,
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

const board: Dashboard = {
  id: 'board-1',
  name: 'Board',
  background: 'bg-slate-900',
  createdAt: 1000,
  updatedAt: 1000,
  driveFileId: 'backup-file-1',
  widgets: [
    {
      id: 'r',
      type: 'random',
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      z: 1,
      flipped: false,
      config: { mode: 'single', firstNames: 'Ada\nBo', lastResult: 'Ada' },
    },
  ],
} as unknown as Dashboard;

describe('Drive board share', () => {
  it('shares a separate copy without student names, never the board backup', async () => {
    type Share = ReturnType<typeof useDashboard>['shareDashboard'];
    let share: Share | null = null;
    const Probe: React.FC = () => {
      const { shareDashboard } = useDashboard();
      useEffect(() => {
        share = shareDashboard;
      }, [shareDashboard]);
      return null;
    };
    render(
      <DashboardProvider>
        <Probe />
      </DashboardProvider>
    );
    await act(async () => {
      capturedSnapshotCb?.([board], false);
      await Promise.resolve();
    });
    await waitFor(() => expect(share).not.toBeNull());
    exportDashboardMock.mockClear();

    let shareId = '';
    await act(async () => {
      if (share) shareId = await share(board, 'copy');
    });

    expect(shareId).toBe('drive-share-copy-1');
    expect(makePublicMock).toHaveBeenCalledWith('share-copy-1', 'example.com');
    expect(makePublicMock).not.toHaveBeenCalledWith(
      'backup-file-1',
      expect.anything()
    );
    expect(exportDashboardMock).not.toHaveBeenCalled();
    const call = uploadFileMock.mock.calls.find(
      (c) => c[2] === 'Shared Boards'
    );
    expect(call).toBeDefined();
    const text = await (call?.[0] as Blob).text();
    expect(text).not.toContain('Ada');
    expect(JSON.parse(text)).not.toHaveProperty('driveFileId');
  });
});
