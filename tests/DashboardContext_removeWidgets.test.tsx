import React, { useEffect } from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardProvider } from '../context/DashboardContext';
import { useDashboard } from '../context/useDashboard';
import { Dashboard, WidgetData } from '../types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../context/useAuth', () => ({
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
  }),
}));

type SnapshotCb = (dashboards: Dashboard[], hasPendingWrites: boolean) => void;
let capturedSnapshotCb: SnapshotCb | null = null;

vi.mock('../hooks/useFirestore', () => ({
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

// ---------------------------------------------------------------------------
// Test consumer
// ---------------------------------------------------------------------------

interface ContextSnapshot {
  dashboards: Dashboard[];
  activeDashboard: Dashboard | null;
  removeWidgets: (ids: string[]) => void;
}

const TestConsumer: React.FC<{
  stateRef: { current: ContextSnapshot | null };
}> = ({ stateRef }) => {
  const ctx = useDashboard();
  useEffect(() => {
    stateRef.current = {
      dashboards: ctx.dashboards,
      activeDashboard: ctx.activeDashboard,
      removeWidgets: ctx.removeWidgets,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWidget(id: string, groupId?: string): WidgetData {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    z: 1,
    flipped: false,
    groupId,
    config: { text: 'test' } as WidgetData['config'],
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

async function pushSnapshot(dashboards: Dashboard[]): Promise<void> {
  if (!capturedSnapshotCb) throw new Error('Provider not mounted');
  const cb = capturedSnapshotCb;
  await act(async () => {
    cb(dashboards, false);
    await Promise.resolve();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardContext removeWidgets regression tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSnapshotCb = null;
  });

  it('removes non-grouped widgets correctly', async () => {
    const stateRef = setup();
    const w1 = makeWidget('w1');
    const w2 = makeWidget('w2');
    await pushSnapshot([makeDashboard([w1, w2])]);

    act(() => {
      stateRef.current?.removeWidgets(['w1']);
    });

    await waitFor(() => {
      const widgets = stateRef.current?.activeDashboard?.widgets;
      expect(widgets?.length).toBe(1);
      expect(widgets?.[0].id).toBe('w2');
    });
  });

  it('dissolves a group when only one member remains', async () => {
    const stateRef = setup();
    const w1 = makeWidget('w1', 'group-1');
    const w2 = makeWidget('w2', 'group-1');
    await pushSnapshot([makeDashboard([w1, w2])]);

    act(() => {
      stateRef.current?.removeWidgets(['w1']);
    });

    await waitFor(() => {
      const widgets = stateRef.current?.activeDashboard?.widgets;
      expect(widgets?.length).toBe(1);
      expect(widgets?.[0].id).toBe('w2');
      expect(widgets?.[0].groupId).toBeUndefined(); // Dissolved
    });
  });

  it('preserves a group when more than one member remains', async () => {
    const stateRef = setup();
    const w1 = makeWidget('w1', 'group-1');
    const w2 = makeWidget('w2', 'group-1');
    const w3 = makeWidget('w3', 'group-1');
    await pushSnapshot([makeDashboard([w1, w2, w3])]);

    act(() => {
      stateRef.current?.removeWidgets(['w1']);
    });

    await waitFor(() => {
      const widgets = stateRef.current?.activeDashboard?.widgets;
      expect(widgets?.length).toBe(2);
      expect(widgets?.every((w) => w.groupId === 'group-1')).toBe(true);
    });
  });

  it('handles multiple groups and mixed removal', async () => {
    const stateRef = setup();
    // Group A: 2 members -> will dissolve if 1 removed
    const wA1 = makeWidget('wA1', 'group-A');
    const wA2 = makeWidget('wA2', 'group-A');
    // Group B: 3 members -> will preserve if 1 removed
    const wB1 = makeWidget('wB1', 'group-B');
    const wB2 = makeWidget('wB2', 'group-B');
    const wB3 = makeWidget('wB3', 'group-B');
    // No group
    const wC1 = makeWidget('wC1');

    await pushSnapshot([makeDashboard([wA1, wA2, wB1, wB2, wB3, wC1])]);

    act(() => {
      stateRef.current?.removeWidgets(['wA1', 'wB1', 'wC1']);
    });

    await waitFor(() => {
      const widgets = stateRef.current?.activeDashboard?.widgets;
      expect(widgets?.length).toBe(3);

      const resA2 = widgets?.find((w) => w.id === 'wA2');
      const resB2 = widgets?.find((w) => w.id === 'wB2');
      const resB3 = widgets?.find((w) => w.id === 'wB3');

      expect(resA2?.groupId).toBeUndefined(); // Dissolved
      expect(resB2?.groupId).toBe('group-B'); // Preserved
      expect(resB3?.groupId).toBe('group-B'); // Preserved
    });
  });

  it('handles dissolving multiple groups at once', async () => {
    const stateRef = setup();
    const wA1 = makeWidget('wA1', 'group-A');
    const wA2 = makeWidget('wA2', 'group-A');
    const wB1 = makeWidget('wB1', 'group-B');
    const wB2 = makeWidget('wB2', 'group-B');

    await pushSnapshot([makeDashboard([wA1, wA2, wB1, wB2])]);

    act(() => {
      stateRef.current?.removeWidgets(['wA1', 'wB1']);
    });

    await waitFor(() => {
      const widgets = stateRef.current?.activeDashboard?.widgets;
      expect(widgets?.length).toBe(2);
      expect(widgets?.every((w) => w.groupId === undefined)).toBe(true);
    });
  });

  it('does nothing when ids array is empty', async () => {
    const stateRef = setup();
    const w1 = makeWidget('w1');
    await pushSnapshot([makeDashboard([w1])]);

    act(() => {
      stateRef.current?.removeWidgets([]);
    });

    await waitFor(() => {
      const widgets = stateRef.current?.activeDashboard?.widgets;
      expect(widgets?.length).toBe(1);
    });
  });
});
