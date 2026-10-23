import React, { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardProvider } from '@/context/DashboardContext';
import { useDashboard } from '@/context/useDashboard';
import { Dashboard } from '@/types';

// Mock dependencies
const mockUser = {
  uid: 'test-user',
  displayName: 'Test User',
  email: 'test@example.com',
};

const { mockCanAccessFeature, mockCloseWallsToBoard } = vi.hoisted(() => ({
  mockCanAccessFeature: vi.fn(() => true),
  mockCloseWallsToBoard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/activityWallBoardAccess', () => ({
  closeWallsToBoard: mockCloseWallsToBoard,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    canAccessFeature: mockCanAccessFeature,
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

const mockUpdateSubstituteShare = vi.fn((_input: unknown) => Promise.resolve());

vi.mock('@/hooks/useSharedCollection', () => ({
  useSharedCollection: () => ({
    shareCollection: vi.fn().mockResolvedValue('mock-collection-share-id'),
    shareSubstituteCollection: vi
      .fn()
      .mockResolvedValue('mock-collection-sub-share-id'),
    updateSubstituteShare: mockUpdateSubstituteShare,
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

const widget = (
  id: string,
  extra: Partial<Dashboard['widgets'][number]> = {}
): Dashboard['widgets'][number] => ({
  id,
  type: 'text',
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  xProp: 0.1,
  yProp: 0.1,
  wProp: 0.2,
  hProp: 0.2,
  aspectRatio: 0.5,
  z: 1,
  flipped: false,
  config: {},
  ...extra,
});

describe('Synced board concurrent edits', () => {
  let emit: SharedBoardSubscribeCallback | null = null;
  type Ctx = ReturnType<typeof useDashboard>;
  let ctx: Ctx | null = null;
  const board = (): Dashboard | undefined =>
    ctx?.dashboards.find((d) => d.id === 'race-board');

  const Probe: React.FC = () => {
    const value = useDashboard();
    useEffect(() => {
      ctx = value;
    });
    return <div />;
  };

  const mount = async (linked: Dashboard) => {
    initialDashboardsSeed = [linked];
    render(
      <DashboardProvider>
        <Probe />
      </DashboardProvider>
    );
    await waitFor(() => {
      expect(ctx).not.toBeNull();
      expect(emit).not.toBeNull();
    });
    act(() => {
      ctx?.loadDashboard('race-board');
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    emit = null;
    ctx = null;
    window.history.pushState({}, '', '/');
    mockSubscribeToSharedBoard.mockImplementation(
      (_id: string, cb: SharedBoardSubscribeCallback) => {
        emit = cb;
        return () => undefined;
      }
    );
  });

  const linkedBoard = (widgets: Dashboard['widgets']): Dashboard => ({
    id: 'race-board',
    name: 'Co-taught',
    background: 'bg-slate-800',
    widgets,
    createdAt: 1,
    linkedShareId: 'share-race',
    linkedShareRole: 'collaborator',
  });

  // Two open tabs echoed every applied snapshot back as a write, so they kept
  // rewriting the board at each other and a fresh local edit was overwritten.
  it('does not write a received snapshot back to the share', async () => {
    const used = widget('w1', { lastUse: { uid: 'test-user', at: 5 } });
    const linked = linkedBoard([used]);
    await mount(linked);

    act(() => {
      emit?.({
        ...linked,
        widgets: [widget('w1', { xProp: 0.5 })],
        updatedBy: 'other-user',
      } as unknown as Dashboard);
    });
    await waitFor(() => expect(board()?.widgets[0].xProp).toBe(0.5));
    await new Promise((r) => setTimeout(r, 800));
    expect(mockMirrorSharedBoard).not.toHaveBeenCalled();
  });

  it("keeps a just-added widget when a colleague's move lands first", async () => {
    const linked = linkedBoard([widget('w1')]);
    await mount(linked);
    act(() => {
      emit?.({ ...linked, updatedBy: 'other-user' } as unknown as Dashboard);
    });

    act(() => {
      ctx?.addWidget('clock');
    });
    await waitFor(() => expect(board()?.widgets).toHaveLength(2));
    const clockId = board()?.widgets.find((w) => w.type === 'clock')?.id;

    // The colleague's move was written before they saw the clock.
    act(() => {
      emit?.({
        ...linked,
        widgets: [widget('w1', { xProp: 0.6 })],
        updatedBy: 'other-user',
      } as unknown as Dashboard);
    });

    await waitFor(() => {
      expect(board()?.widgets.map((w) => w.id)).toEqual(['w1', clockId]);
      expect(board()?.widgets[0].xProp).toBe(0.6);
    });
    await waitFor(() => expect(mockMirrorSharedBoard).toHaveBeenCalled(), {
      timeout: 2000,
    });
    const written = mockMirrorSharedBoard.mock.calls.at(-1)?.[1] as Dashboard;
    expect(written.widgets.map((w) => w.id)).toEqual(['w1', clockId]);
    expect(written.widgets[0].xProp).toBe(0.6);
  });

  it("keeps a colleague's widget removal when this tab has not touched it", async () => {
    const linked = linkedBoard([widget('w1'), widget('w2')]);
    await mount(linked);
    act(() => {
      emit?.({ ...linked, updatedBy: 'other-user' } as unknown as Dashboard);
    });
    act(() => {
      ctx?.updateWidget('w1', { z: 7 });
    });
    act(() => {
      emit?.({
        ...linked,
        widgets: [widget('w1')],
        updatedBy: 'other-user',
      } as unknown as Dashboard);
    });
    await waitFor(() => {
      expect(board()?.widgets.map((w) => w.id)).toEqual(['w1']);
      expect(board()?.widgets[0].z).toBe(7);
    });
  });
  it('keeps an edit undone before our own echo arrives', async () => {
    mockMirrorSharedBoard.mockImplementation((_id: string, d: Dashboard) =>
      Promise.resolve(d)
    );
    const linked = linkedBoard([widget('w1')]);
    await mount(linked);
    act(() => {
      emit?.({ ...linked, updatedBy: 'other-user' } as unknown as Dashboard);
    });
    act(() => {
      ctx?.updateWidget('w1', { z: 5 });
    });
    await waitFor(() => expect(mockMirrorSharedBoard).toHaveBeenCalled(), {
      timeout: 2000,
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      ctx?.updateWidget('w1', { z: 1 });
    });
    // The echo of the first write lands after the change back.
    act(() => {
      emit?.({
        ...linked,
        widgets: [widget('w1', { z: 5 })],
        updatedBy: 'test-user',
      } as unknown as Dashboard);
    });
    await waitFor(() => expect(board()?.widgets[0].z).toBe(1));
    await waitFor(
      () => {
        const last = mockMirrorSharedBoard.mock.calls.at(-1)?.[1] as Dashboard;
        expect(last.widgets[0].z).toBe(1);
      },
      { timeout: 2000 }
    );
  });
});
