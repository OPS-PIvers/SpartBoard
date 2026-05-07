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
const mockMirrorSharedBoard = vi.fn().mockResolvedValue(undefined);
const mockStopSharingBoard = vi.fn().mockResolvedValue(undefined);
const mockLeaveSharedBoard = vi.fn().mockResolvedValue(undefined);

type SubscribeCallback = (
  dashboards: Dashboard[],
  hasPendingWrites: boolean
) => void;

// Mutable seed for the initial dashboards-list snapshot. Tests that need
// the provider to start with a pre-existing linked board override this in
// their setup before render. Default = empty list so legacy tests are
// unaffected.
let initialDashboardsSeed: Dashboard[] = [];

const mockSubscribeToDashboards = vi.fn((cb: SubscribeCallback) => {
  // Immediate callback with the seeded list to simulate loaded state
  cb(initialDashboardsSeed, false);
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
    mirrorSharedBoard: mockMirrorSharedBoard,
    subscribeToSharedBoard: mockSubscribeToSharedBoard,
    joinSharedBoard: mockJoinSharedBoard,
    leaveSharedBoard: mockLeaveSharedBoard,
    stopSharingBoard: mockStopSharingBoard,
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
    initialDashboardsSeed = [];

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

  // ───────────────────────────────────────────────────────────────────────
  // Live-share lifecycle: detach during debounce + host-side stopSharing.
  //
  // Both paths share a failure mode: the 500ms mirror debounce can fire
  // AFTER the user already detached, which would write a stale snapshot
  // into /shared_boards/{shareId} (or worse, a snapshot for a doc that no
  // longer exists / a participant that no longer has write access). The
  // mirror effect is supposed to cancel those pending timers when a
  // shareId leaves the live linked-set; these tests pin that behavior.
  // ───────────────────────────────────────────────────────────────────────
  describe('mirror cancellation on detach', () => {
    beforeEach(() => {
      // No share URL for these tests — they exercise the linked-board
      // lifecycle, not the import flow.
      window.history.pushState({}, '', '/');
    });

    it('host stopSharingDashboard cancels a pending mirror write within the 500ms debounce window', async () => {
      // Seed a Synced board this user owns. The mirror effect is meant
      // to push edits to /shared_boards/{shareId} on a 500ms debounce.
      const linkedDashboard: Dashboard = {
        id: 'local-dash-1',
        name: 'My Linked Board',
        background: 'bg-slate-800',
        widgets: [
          {
            id: 'w1',
            type: 'clock',
            x: 0,
            y: 0,
            w: 100,
            h: 100,
            z: 1,
            flipped: false,
            config: {},
          },
        ],
        createdAt: 1234567890,
        linkedShareId: 'test-share-id',
        linkedShareRole: 'owner',
      };
      initialDashboardsSeed = [linkedDashboard];

      type Stop = ReturnType<typeof useDashboard>['stopSharingDashboard'];
      type Update = ReturnType<typeof useDashboard>['updateWidget'];
      type Load = ReturnType<typeof useDashboard>['loadDashboard'];
      let stop: Stop | null = null;
      let update: Update | null = null;
      let load: Load | null = null;

      const Probe: React.FC = () => {
        const { stopSharingDashboard, updateWidget, loadDashboard } =
          useDashboard();
        useEffect(() => {
          stop = stopSharingDashboard;
          update = updateWidget;
          load = loadDashboard;
        }, [stopSharingDashboard, updateWidget, loadDashboard]);
        return <div>Test App</div>;
      };

      vi.useFakeTimers();
      try {
        render(
          <DashboardProvider>
            <Probe />
          </DashboardProvider>
        );

        // Wait for the provider to settle and capture handles.
        await vi.waitFor(() => {
          expect(stop).not.toBeNull();
          expect(update).not.toBeNull();
          expect(load).not.toBeNull();
        });

        // The seeded board has an initial mirror write queued by the
        // first effect pass (because lastMirroredRef has no entry yet).
        // Activate it so updateWidget targets it, then trigger an edit
        // to refresh the debounce window.
        act(() => {
          if (load) load('local-dash-1');
        });
        act(() => {
          if (update) update('w1', { x: 50 });
        });

        // BEFORE 500ms elapses, the host stops sharing.
        await act(async () => {
          if (stop) await stop('local-dash-1');
        });

        // Now advance past the debounce window. The cancellation logic
        // should have cleared the pending timer, so no mirror write
        // fires for the detached share.
        mockMirrorSharedBoard.mockClear();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000);
        });

        expect(mockMirrorSharedBoard).not.toHaveBeenCalled();
        // Host detach also tears down the shared doc.
        expect(mockStopSharingBoard).toHaveBeenCalledWith('test-share-id');
      } finally {
        vi.useRealTimers();
      }
    });

    it('host stopSharingDashboard clears linkedShareId on the local board', async () => {
      // After stop-sharing, the local copy keeps its content but loses
      // the live-share link metadata so banner / mirror effects detach.
      const linkedDashboard: Dashboard = {
        id: 'local-dash-2',
        name: 'My Linked Board',
        background: 'bg-slate-800',
        widgets: [],
        createdAt: 1234567890,
        linkedShareId: 'test-share-id',
        linkedShareRole: 'owner',
        linkedShareHostName: 'Test User',
      };
      initialDashboardsSeed = [linkedDashboard];

      type Stop = ReturnType<typeof useDashboard>['stopSharingDashboard'];
      let stop: Stop | null = null;
      let observed: Dashboard | undefined;

      const Probe: React.FC = () => {
        const { stopSharingDashboard, dashboards } = useDashboard();
        useEffect(() => {
          stop = stopSharingDashboard;
          observed = dashboards.find((d) => d.id === 'local-dash-2');
        }, [stopSharingDashboard, dashboards]);
        return <div>Test App</div>;
      };

      render(
        <DashboardProvider>
          <Probe />
        </DashboardProvider>
      );

      await waitFor(() => {
        expect(stop).not.toBeNull();
        expect(observed?.linkedShareId).toBe('test-share-id');
      });

      await act(async () => {
        if (stop) await stop('local-dash-2');
      });

      await waitFor(() => {
        expect(observed?.linkedShareId).toBeUndefined();
        expect(observed?.linkedShareRole).toBeUndefined();
      });
      // The shared doc was deleted on the firestore side.
      expect(mockStopSharingBoard).toHaveBeenCalledWith('test-share-id');
      // saveDashboard was called with the detached (cleared-link) snapshot.
      const detachedSave = (
        mockSaveDashboard.mock.calls as Array<[Dashboard]>
      ).find(
        (c) => c[0].id === 'local-dash-2' && c[0].linkedShareId === undefined
      );
      expect(detachedSave).toBeDefined();
    });

    it('guest stopSharingDashboard calls leaveSharedBoard, not stopSharingBoard', async () => {
      // Guests can leave but cannot tear down the host's shared doc.
      const linkedDashboard: Dashboard = {
        id: 'guest-dash',
        name: 'Joined Board',
        background: 'bg-slate-800',
        widgets: [],
        createdAt: 1234567890,
        linkedShareId: 'test-share-id',
        linkedShareRole: 'collaborator',
      };
      initialDashboardsSeed = [linkedDashboard];

      type Stop = ReturnType<typeof useDashboard>['stopSharingDashboard'];
      let stop: Stop | null = null;

      const Probe: React.FC = () => {
        const { stopSharingDashboard } = useDashboard();
        useEffect(() => {
          stop = stopSharingDashboard;
        }, [stopSharingDashboard]);
        return <div>Test App</div>;
      };

      render(
        <DashboardProvider>
          <Probe />
        </DashboardProvider>
      );

      await waitFor(() => expect(stop).not.toBeNull());

      await act(async () => {
        if (stop) await stop('guest-dash');
      });

      expect(mockLeaveSharedBoard).toHaveBeenCalledWith('test-share-id');
      expect(mockStopSharingBoard).not.toHaveBeenCalled();
    });
  });
});
