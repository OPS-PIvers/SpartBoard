import React, { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardProvider } from '@/context/DashboardContext';
import { useDashboard } from '@/context/useDashboard';
import { Dashboard } from '@/types';

// Mock dependencies
const mockUser = {
  uid: 'test-user',
  displayName: 'Test User',
  email: 'test@example.com',
};

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    isAdmin: false,
    featurePermissions: [],
    selectedBuildings: [],
    savedWidgetConfigs: {},
    saveWidgetConfig: vi.fn(),
    refreshGoogleToken: vi.fn().mockResolvedValue('mock-token'),
    profileLoaded: true,
  }),
}));

const mockLoadSharedDashboard = vi.fn();
const mockSaveDashboard = vi.fn().mockResolvedValue(undefined);
const mockDeleteDashboard = vi.fn().mockResolvedValue(undefined);
const mockJoinSharedBoard = vi.fn().mockResolvedValue(undefined);
type SharedBoardSubscribeCallback = (remote: Dashboard | null) => void;
const mockSubscribeToSharedBoard = vi.fn(
  (_shareId: string, _cb: SharedBoardSubscribeCallback) => () => undefined
);
const mockMirrorSharedBoard = vi.fn().mockResolvedValue(undefined);
const mockStopSharingBoard = vi.fn().mockResolvedValue(undefined);
const mockLeaveSharedBoard = vi.fn().mockResolvedValue(undefined);
const mockShareDashboardFirestore = vi.fn().mockResolvedValue('mock-share-id');

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

vi.mock('@/hooks/useFirestore', () => ({
  useFirestore: () => ({
    saveDashboard: mockSaveDashboard,
    saveDashboards: vi.fn().mockResolvedValue(undefined),
    deleteDashboard: mockDeleteDashboard,
    subscribeToDashboards: mockSubscribeToDashboards,
    shareDashboard: mockShareDashboardFirestore,
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

  // ───────────────────────────────────────────────────────────────────────
  // Host-picks-mode flow: the share doc carries `intendedMode`; the
  // recipient uses it to skip the 3-option picker and to drive the import.
  // ───────────────────────────────────────────────────────────────────────
  describe('intendedMode propagation', () => {
    it('pendingShareImport carries intendedMode when the share doc has one', async () => {
      const sharedDashboard = {
        id: 'orig',
        name: 'Picked View-Only',
        background: 'bg-slate-900',
        widgets: [],
        createdAt: 1,
        intendedMode: 'view-only' as const,
      };
      mockLoadSharedDashboard.mockResolvedValue(sharedDashboard);

      type CapturedImport = ReturnType<
        typeof useDashboard
      >['pendingShareImport'];
      let captured: CapturedImport = null;
      const Probe: React.FC = () => {
        const { pendingShareImport } = useDashboard();
        useEffect(() => {
          captured = pendingShareImport;
        }, [pendingShareImport]);
        return <div />;
      };
      render(
        <DashboardProvider>
          <Probe />
        </DashboardProvider>
      );

      await waitFor(() => {
        expect(captured).not.toBeNull();
        expect(captured?.intendedMode).toBe('view-only');
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // View-Only is ephemeral: when the host stops sharing OR the viewer
  // chooses to leave, the local copy is removed (not just marked ended).
  // ───────────────────────────────────────────────────────────────────────
  describe('view-only deletion lifecycle', () => {
    beforeEach(() => {
      window.history.pushState({}, '', '/');
    });

    it('viewer is detached from the dashboards list when host stops sharing', async () => {
      // Capture the subscribe callback so we can simulate `remote === null`
      // (host deletion).
      let subscribeCb: ((remote: Dashboard | null) => void) | null = null;
      mockSubscribeToSharedBoard.mockImplementation(
        (_id: string, cb: (remote: Dashboard | null) => void) => {
          subscribeCb = cb;
          return () => undefined;
        }
      );

      const linked: Dashboard = {
        id: 'view-board',
        name: 'View Only Board',
        background: 'bg-slate-800',
        widgets: [],
        createdAt: 1,
        linkedShareId: 'share-vo',
        linkedShareRole: 'viewer',
        linkedShareHostName: 'Other Teacher',
      };
      const otherBoard: Dashboard = {
        id: 'fallback',
        name: 'Fallback',
        background: 'bg-slate-900',
        widgets: [],
        createdAt: 2,
      };
      initialDashboardsSeed = [linked, otherBoard];

      let capturedDashboards: Dashboard[] = [];
      const Probe: React.FC = () => {
        const { dashboards } = useDashboard();
        useEffect(() => {
          capturedDashboards = dashboards;
        }, [dashboards]);
        return <div />;
      };

      render(
        <DashboardProvider>
          <Probe />
        </DashboardProvider>
      );

      await waitFor(() => {
        expect(subscribeCb).not.toBeNull();
        expect(capturedDashboards.length).toBe(2);
      });

      mockDeleteDashboard.mockClear();
      // Simulate the host deleting their share doc — subscribe fires null.
      act(() => {
        if (subscribeCb) subscribeCb(null);
      });

      await waitFor(() => {
        expect(capturedDashboards.find((d) => d.id === 'view-board')).toBe(
          undefined
        );
        expect(mockDeleteDashboard).toHaveBeenCalledWith('view-board');
      });
    });

    it('synced collaborator keeps their dashboard when host stops sharing (linkedShareEnded set)', async () => {
      let subscribeCb: ((remote: Dashboard | null) => void) | null = null;
      mockSubscribeToSharedBoard.mockImplementation(
        (_id: string, cb: (remote: Dashboard | null) => void) => {
          subscribeCb = cb;
          return () => undefined;
        }
      );

      const linked: Dashboard = {
        id: 'collab-board',
        name: 'Synced Board',
        background: 'bg-slate-800',
        widgets: [],
        createdAt: 1,
        linkedShareId: 'share-sync',
        linkedShareRole: 'collaborator',
        linkedShareHostName: 'Other Teacher',
      };
      initialDashboardsSeed = [linked];

      let capturedDashboards: Dashboard[] = [];
      const Probe: React.FC = () => {
        const { dashboards } = useDashboard();
        useEffect(() => {
          capturedDashboards = dashboards;
        }, [dashboards]);
        return <div />;
      };

      render(
        <DashboardProvider>
          <Probe />
        </DashboardProvider>
      );

      await waitFor(() => expect(subscribeCb).not.toBeNull());

      mockDeleteDashboard.mockClear();
      act(() => {
        if (subscribeCb) subscribeCb(null);
      });

      await waitFor(() => {
        const board = capturedDashboards.find((d) => d.id === 'collab-board');
        expect(board).toBeDefined();
        expect(board?.linkedShareEnded).toBe(true);
      });
      expect(mockDeleteDashboard).not.toHaveBeenCalled();
    });

    it('viewer leaving the board (Leave button) deletes the local copy', async () => {
      const linked: Dashboard = {
        id: 'view-board',
        name: 'View Only Board',
        background: 'bg-slate-800',
        widgets: [],
        createdAt: 1,
        linkedShareId: 'share-vo',
        linkedShareRole: 'viewer',
      };
      initialDashboardsSeed = [linked];

      type Stop = ReturnType<typeof useDashboard>['stopSharingDashboard'];
      let stop: Stop | null = null;
      const Probe: React.FC = () => {
        const { stopSharingDashboard } = useDashboard();
        useEffect(() => {
          stop = stopSharingDashboard;
        }, [stopSharingDashboard]);
        return <div />;
      };

      render(
        <DashboardProvider>
          <Probe />
        </DashboardProvider>
      );

      await waitFor(() => expect(stop).not.toBeNull());

      mockDeleteDashboard.mockClear();
      await act(async () => {
        if (stop) await stop('view-board');
      });

      // Viewer leave should call leaveSharedBoard AND deleteDashboard.
      expect(mockLeaveSharedBoard).toHaveBeenCalledWith('share-vo');
      expect(mockDeleteDashboard).toHaveBeenCalledWith('view-board');
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Annotation overlay sync — bidirectional. Per-author Undo: a user's
  // Undo only removes their own most recent stroke, not the other side's.
  // ───────────────────────────────────────────────────────────────────────
  describe('annotation sync', () => {
    beforeEach(() => {
      window.history.pushState({}, '', '/');
    });

    it("undoAnnotation only removes the local user's most recent stroke", async () => {
      const linked: Dashboard = {
        id: 'sync-board',
        name: 'Synced Board',
        background: 'bg-slate-800',
        widgets: [],
        createdAt: 1,
        linkedShareId: 'share-sync',
        linkedShareRole: 'collaborator',
        annotationOverlay: {
          objects: [
            {
              id: 'a1',
              kind: 'path',
              z: 1,
              points: [{ x: 0, y: 0 }],
              color: '#000',
              width: 2,
              authorUid: 'other-user',
            },
            {
              id: 'a2',
              kind: 'path',
              z: 2,
              points: [{ x: 1, y: 1 }],
              color: '#000',
              width: 2,
              authorUid: 'test-user',
            },
            {
              id: 'a3',
              kind: 'path',
              z: 3,
              points: [{ x: 2, y: 2 }],
              color: '#000',
              width: 2,
              authorUid: 'other-user',
            },
          ],
          updatedAt: 1,
        },
      };
      initialDashboardsSeed = [linked];

      type Undo = ReturnType<typeof useDashboard>['undoAnnotation'];
      type Load = ReturnType<typeof useDashboard>['loadDashboard'];
      let undo: Undo | null = null;
      let load: Load | null = null;
      let captured: Dashboard | undefined;

      const Probe: React.FC = () => {
        const { undoAnnotation, loadDashboard, dashboards } = useDashboard();
        useEffect(() => {
          undo = undoAnnotation;
          load = loadDashboard;
          captured = dashboards.find((d) => d.id === 'sync-board');
        }, [undoAnnotation, loadDashboard, dashboards]);
        return <div />;
      };

      render(
        <DashboardProvider>
          <Probe />
        </DashboardProvider>
      );

      await waitFor(() => {
        expect(undo).not.toBeNull();
        expect(load).not.toBeNull();
      });

      // Activate the linked board so undo targets it.
      act(() => {
        if (load) load('sync-board');
      });
      act(() => {
        if (undo) undo();
      });

      await waitFor(() => {
        const objects = captured?.annotationOverlay?.objects ?? [];
        // Only the local user's stroke ('a2') should be removed; both
        // 'other-user' strokes remain.
        const ids = objects.map((o) => o.id);
        expect(ids).toEqual(['a1', 'a3']);
      });
    });

    it('subscribe path applies remote annotationOverlay to local dashboard', async () => {
      let subscribeCb: ((remote: Dashboard | null) => void) | null = null;
      mockSubscribeToSharedBoard.mockImplementation(
        (_id: string, cb: (remote: Dashboard | null) => void) => {
          subscribeCb = cb;
          return () => undefined;
        }
      );

      const linked: Dashboard = {
        id: 'view-board',
        name: 'View Only Board',
        background: 'bg-slate-800',
        widgets: [],
        createdAt: 1,
        linkedShareId: 'share-vo',
        linkedShareRole: 'viewer',
      };
      initialDashboardsSeed = [linked];

      let captured: Dashboard | undefined;
      const Probe: React.FC = () => {
        const { dashboards } = useDashboard();
        useEffect(() => {
          captured = dashboards.find((d) => d.id === 'view-board');
        }, [dashboards]);
        return <div />;
      };

      render(
        <DashboardProvider>
          <Probe />
        </DashboardProvider>
      );

      await waitFor(() => expect(subscribeCb).not.toBeNull());

      // Host pushes a stroke; viewer should receive it via the subscribe
      // path. updatedBy is set to a different uid so the echo filter
      // doesn't suppress it.
      const remote = {
        ...linked,
        annotationOverlay: {
          objects: [
            {
              id: 'host-stroke',
              kind: 'path' as const,
              z: 1,
              points: [{ x: 5, y: 5 }],
              color: '#f00',
              width: 4,
              authorUid: 'other-user',
            },
          ],
          updatedAt: 99,
        },
        updatedBy: 'other-user',
      } as unknown as Dashboard;

      act(() => {
        if (subscribeCb) subscribeCb(remote);
      });

      await waitFor(() => {
        const objects = captured?.annotationOverlay?.objects ?? [];
        expect(objects.length).toBe(1);
        expect(objects[0].id).toBe('host-stroke');
      });
    });
  });
});
