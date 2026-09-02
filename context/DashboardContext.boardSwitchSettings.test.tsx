import React, { useEffect } from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import { Dashboard, WidgetData } from '@/types';

// ---------------------------------------------------------------------------
// Mocks (mirrors DashboardContext.bringToFront.test.tsx)
// ---------------------------------------------------------------------------

vi.mock('./useAuth', () => ({
  useAuth: () => ({
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
  }),
}));

type SnapshotCb = (dashboards: Dashboard[], hasPendingWrites: boolean) => void;
let capturedSnapshotCb: SnapshotCb | null = null;

vi.mock('@/hooks/useFirestore', () => ({
  useFirestore: () => ({
    saveDashboard: vi.fn().mockResolvedValue(Date.now()),
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
  loadDashboard: (id: string) => void;
}

const TestConsumer: React.FC<{
  stateRef: { current: ContextSnapshot | null };
}> = ({ stateRef }) => {
  const ctx = useDashboard();
  useEffect(() => {
    stateRef.current = {
      dashboards: ctx.dashboards,
      activeDashboard: ctx.activeDashboard,
      loadDashboard: ctx.loadDashboard,
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

function makeWidget(id: string, extra: Partial<WidgetData> = {}): WidgetData {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    z: 1,
    flipped: false,
    config: { text: 'test' } as WidgetData['config'],
    ...extra,
  };
}

function makeDashboard(
  id: string,
  widgets: WidgetData[],
  extra: Partial<Dashboard> = {}
): Dashboard {
  return {
    id,
    name: `Board ${id}`,
    background: 'bg-slate-900',
    widgets,
    createdAt: 1000,
    updatedAt: 1000,
    ...extra,
  };
}

async function pushSnapshot(dashboards: Dashboard[]): Promise<void> {
  if (!capturedSnapshotCb) throw new Error('Provider not mounted');
  const cb = capturedSnapshotCb;
  await act(async () => {
    cb(dashboards, false);
    await Promise.resolve();
  });
}

function findWidget(
  stateRef: ReturnType<typeof setup>,
  boardId: string,
  widgetId: string
) {
  const w = stateRef.current?.dashboards
    .find((d) => d.id === boardId)
    ?.widgets.find((w) => w.id === widgetId);
  if (!w) throw new Error(`widget ${widgetId} not found on ${boardId}`);
  return w;
}

describe('DashboardContext board switch closes open settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSnapshotCb = null;
  });

  it('unflips widgets on the outgoing board when switching boards', async () => {
    const stateRef = setup();
    await pushSnapshot([
      makeDashboard('dash-1', [
        makeWidget('w1', { flipped: true }),
        makeWidget('w2'),
      ]),
      makeDashboard('dash-2', [makeWidget('w3', { flipped: true })]),
    ]);
    await waitFor(() => {
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-1');
    });
    const w2Before = findWidget(stateRef, 'dash-1', 'w2');

    act(() => {
      stateRef.current?.loadDashboard('dash-2');
    });

    await waitFor(() => {
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-2');
    });
    expect(findWidget(stateRef, 'dash-1', 'w1').flipped).toBe(false);
    // Untouched widgets keep identity; the incoming board is left alone.
    expect(findWidget(stateRef, 'dash-1', 'w2')).toBe(w2Before);
    expect(findWidget(stateRef, 'dash-2', 'w3').flipped).toBe(true);
  });

  it('leaves the outgoing board untouched when nothing is flipped', async () => {
    const stateRef = setup();
    await pushSnapshot([
      makeDashboard('dash-1', [makeWidget('w1')]),
      makeDashboard('dash-2', [makeWidget('w2')]),
    ]);
    await waitFor(() => {
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-1');
    });
    const dash1Before = stateRef.current?.dashboards.find(
      (d) => d.id === 'dash-1'
    );

    act(() => {
      stateRef.current?.loadDashboard('dash-2');
    });

    await waitFor(() => {
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-2');
    });
    expect(stateRef.current?.dashboards.find((d) => d.id === 'dash-1')).toBe(
      dash1Before
    );
  });

  it('does not write to a read-only viewer board', async () => {
    const stateRef = setup();
    await pushSnapshot([
      makeDashboard('dash-1', [makeWidget('w1', { flipped: true })], {
        linkedShareRole: 'viewer',
      }),
      makeDashboard('dash-2', [makeWidget('w2')]),
    ]);
    await waitFor(() => {
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-1');
    });
    const dash1Before = stateRef.current?.dashboards.find(
      (d) => d.id === 'dash-1'
    );

    act(() => {
      stateRef.current?.loadDashboard('dash-2');
    });

    await waitFor(() => {
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-2');
    });
    expect(stateRef.current?.dashboards.find((d) => d.id === 'dash-1')).toBe(
      dash1Before
    );
  });
});
