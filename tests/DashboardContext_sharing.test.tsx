import React, { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardProvider } from '../context/DashboardContext';
import { useDashboard } from '../context/useDashboard';
import { Dashboard } from '../types';

// Mock dependencies
const mockUser = {
  uid: 'test-user',
  displayName: 'Test User',
  email: 'test@example.com',
};

vi.mock('../context/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    isAdmin: false,
    featurePermissions: [],
    selectedBuildings: [],
    savedWidgetConfigs: {},
    saveWidgetConfig: vi.fn(),
    refreshGoogleToken: vi.fn().mockResolvedValue('mock-token'),
  }),
}));

const mockLoadSharedDashboard = vi.fn();
const mockSaveDashboard = vi.fn().mockResolvedValue(undefined);
const mockJoinSharedBoard = vi.fn().mockResolvedValue(undefined);
const mockSubscribeToSharedBoard = vi.fn(() => () => undefined);

type SubscribeCallback = (
  dashboards: Dashboard[],
  hasPendingWrites: boolean
) => void;

const mockSubscribeToDashboards = vi.fn((cb: SubscribeCallback) => {
  // Immediate callback with empty list to simulate loaded state
  cb([], false);
  return () => {
    // no-op
  };
});

vi.mock('../hooks/useFirestore', () => ({
  useFirestore: () => ({
    saveDashboard: mockSaveDashboard,
    saveDashboards: vi.fn().mockResolvedValue(undefined),
    deleteDashboard: vi.fn().mockResolvedValue(undefined),
    subscribeToDashboards: mockSubscribeToDashboards,
    shareDashboard: vi.fn(),
    loadSharedDashboard: mockLoadSharedDashboard,
    mirrorSharedBoard: vi.fn().mockResolvedValue(undefined),
    subscribeToSharedBoard: mockSubscribeToSharedBoard,
    joinSharedBoard: mockJoinSharedBoard,
    leaveSharedBoard: vi.fn().mockResolvedValue(undefined),
    stopSharingBoard: vi.fn().mockResolvedValue(undefined),
    rosters: [],
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    deleteRoster: vi.fn(),
    setActiveRoster: vi.fn(),
    activeRosterId: null,
  }),
}));

vi.mock('../hooks/useRosters', () => ({
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

describe('DashboardContext Sharing Logic', () => {
  const originalPathname = window.location.pathname;
  let replaceStateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Simulate visiting the share URL by updating the history state
    window.history.pushState({}, '', '/share/test-share-id');

    // Mock history.replaceState
    replaceStateMock = vi.fn();
    window.history.replaceState =
      replaceStateMock as typeof window.history.replaceState;
  });

  afterEach(() => {
    // Restore original pathname after each test
    window.history.pushState({}, '', originalPathname);
  });

  it('should fetch shared dashboard and open the import picker (no auto-copy)', async () => {
    const sharedDashboard: Dashboard = {
      id: 'original-id',
      name: 'Shared Board',
      background: 'bg-slate-900',
      widgets: [],
      createdAt: 1234567890,
    };

    mockLoadSharedDashboard.mockResolvedValue(sharedDashboard);

    type CapturedImport = ReturnType<typeof useDashboard>['pendingShareImport'];
    let capturedPendingImport: CapturedImport = null;

    const Probe: React.FC = () => {
      const { pendingShareImport } = useDashboard();
      useEffect(() => {
        capturedPendingImport = pendingShareImport;
      }, [pendingShareImport]);
      return <div>Test App</div>;
    };

    render(
      <DashboardProvider>
        <Probe />
      </DashboardProvider>
    );

    // Verify loadSharedDashboard is called
    await waitFor(
      () => {
        expect(mockLoadSharedDashboard).toHaveBeenCalledWith('test-share-id');
      },
      { timeout: 2000 }
    );

    // The picker should be open (pendingShareImport set with the snapshot).
    await waitFor(() => {
      expect(capturedPendingImport).not.toBeNull();
      expect(capturedPendingImport?.shareId).toBe('test-share-id');
      expect(capturedPendingImport?.preview?.name).toBe('Shared Board');
      // Firestore-style id (no `drive-` prefix) → all 3 modes available.
      expect(capturedPendingImport?.driveBacked).toBe(false);
    });

    // No auto-import: saveDashboard is NOT called for a shared board copy.
    const sharedSave = (
      mockSaveDashboard.mock.calls as Array<[Dashboard]>
    ).find((c) => /Shared Board/.test(c[0].name));
    expect(sharedSave).toBeUndefined();
  });

  it('importSharedBoard("copy") saves a (Copy) duplicate without join', async () => {
    const sharedDashboard: Dashboard = {
      id: 'original-id',
      name: 'Shared Board',
      background: 'bg-slate-900',
      widgets: [],
      createdAt: 1234567890,
    };
    mockLoadSharedDashboard.mockResolvedValue(sharedDashboard);

    type Importer = ReturnType<typeof useDashboard>['importSharedBoard'];
    let importer: Importer | null = null;

    const Probe: React.FC = () => {
      const { pendingShareImport, importSharedBoard } = useDashboard();
      useEffect(() => {
        if (pendingShareImport) importer = importSharedBoard;
      }, [pendingShareImport, importSharedBoard]);
      return <div>Test App</div>;
    };

    render(
      <DashboardProvider>
        <Probe />
      </DashboardProvider>
    );

    await waitFor(() => expect(importer).not.toBeNull());
    await act(async () => {
      if (importer) await importer('copy');
    });

    const copySave = (mockSaveDashboard.mock.calls as Array<[Dashboard]>).find(
      (c) => c[0].name === 'Shared Board (Copy)'
    );
    expect(copySave).toBeDefined();
    expect(copySave?.[0].id).not.toBe('original-id');
    // Copy mode does NOT establish a live link.
    expect(copySave?.[0].linkedShareId).toBeUndefined();
    expect(copySave?.[0].linkedShareRole).toBeUndefined();
    // Copy mode never joins participants.
    expect(mockJoinSharedBoard).not.toHaveBeenCalled();
    // URL cleanup runs.
    await waitFor(() => {
      expect(replaceStateMock).toHaveBeenCalledWith(null, '', '/');
    });
  });

  it('importSharedBoard("synced") tags the local board as collaborator and joins', async () => {
    const sharedDashboard: Dashboard = {
      id: 'original-id',
      name: 'Shared Board',
      background: 'bg-slate-900',
      widgets: [],
      createdAt: 1234567890,
    };
    mockLoadSharedDashboard.mockResolvedValue(sharedDashboard);

    type Importer = ReturnType<typeof useDashboard>['importSharedBoard'];
    let importer: Importer | null = null;

    const Probe: React.FC = () => {
      const { pendingShareImport, importSharedBoard } = useDashboard();
      useEffect(() => {
        if (pendingShareImport) importer = importSharedBoard;
      }, [pendingShareImport, importSharedBoard]);
      return <div>Test App</div>;
    };

    render(
      <DashboardProvider>
        <Probe />
      </DashboardProvider>
    );

    await waitFor(() => expect(importer).not.toBeNull());
    await act(async () => {
      if (importer) await importer('synced');
    });

    const syncedSave = (
      mockSaveDashboard.mock.calls as Array<[Dashboard]>
    ).find((c) => c[0].name === 'Shared Board (Synced)');
    expect(syncedSave).toBeDefined();
    expect(syncedSave?.[0].linkedShareId).toBe('test-share-id');
    expect(syncedSave?.[0].linkedShareRole).toBe('collaborator');
    expect(mockJoinSharedBoard).toHaveBeenCalledWith(
      'test-share-id',
      'collaborator',
      expect.any(String)
    );
  });

  it('importSharedBoard("view-only") tags the local board as viewer', async () => {
    const sharedDashboard: Dashboard = {
      id: 'original-id',
      name: 'Shared Board',
      background: 'bg-slate-900',
      widgets: [],
      createdAt: 1234567890,
    };
    mockLoadSharedDashboard.mockResolvedValue(sharedDashboard);

    type Importer = ReturnType<typeof useDashboard>['importSharedBoard'];
    let importer: Importer | null = null;

    const Probe: React.FC = () => {
      const { pendingShareImport, importSharedBoard } = useDashboard();
      useEffect(() => {
        if (pendingShareImport) importer = importSharedBoard;
      }, [pendingShareImport, importSharedBoard]);
      return <div>Test App</div>;
    };

    render(
      <DashboardProvider>
        <Probe />
      </DashboardProvider>
    );

    await waitFor(() => expect(importer).not.toBeNull());
    await act(async () => {
      if (importer) await importer('view-only');
    });

    const viewSave = (mockSaveDashboard.mock.calls as Array<[Dashboard]>).find(
      (c) => c[0].name === 'Shared Board (View-Only)'
    );
    expect(viewSave).toBeDefined();
    expect(viewSave?.[0].linkedShareRole).toBe('viewer');
    expect(mockJoinSharedBoard).toHaveBeenCalledWith(
      'test-share-id',
      'viewer',
      expect.any(String)
    );
  });
});
