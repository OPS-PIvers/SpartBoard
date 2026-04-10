/**
 * Tests for the per-widget surgical merge logic in DashboardContext.
 *
 * When the desktop has unsaved local changes and a Firestore snapshot arrives,
 * the onSnapshot handler performs a per-widget merge:
 *   - Widgets whose config/layout changed locally keep their local values.
 *   - Widgets untouched locally accept the incoming server values.
 *
 * These tests document the merge outcomes for three scenarios called out by
 * code review:
 *   1. Local config change on one widget + remote config change on another.
 *   2. Remote deletion of a previously-synced widget while local edits exist.
 *   3. Local changes to non-config, non-layout widget fields (customTitle,
 *      maximized, transparency).
 */

import React, { useEffect } from 'react';
import { render, act, waitFor } from '@testing-library/react';
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

const mockSaveDashboard = vi.fn().mockResolvedValue(Date.now());

vi.mock('../hooks/useFirestore', () => ({
  useFirestore: () => ({
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
  }),
}));

// ---------------------------------------------------------------------------
// Test consumer — exposes context values outside React tree
// ---------------------------------------------------------------------------

interface ContextSnapshot {
  dashboards: Dashboard[];
  activeDashboard: Dashboard | null;
  updateWidget: ReturnType<typeof useDashboard>['updateWidget'];
}

/**
 * Renders inside DashboardProvider and writes the latest context values into
 * a plain-object ref after each commit (via useEffect), which tests can read.
 */
const TestConsumer: React.FC<{
  stateRef: { current: ContextSnapshot | null };
}> = ({ stateRef }) => {
  const ctx = useDashboard();
  // Write to the ref AFTER render (in an effect) to satisfy react-hooks/refs.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal WidgetData stub. */
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

/** Build a minimal dashboard with the given widgets. */
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

/**
 * Simulate a Firestore snapshot arriving and wait for the React tree to settle.
 */
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

describe('DashboardContext per-widget merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSnapshotCb = null;
  });

  it('preserves local config on widget A while accepting server config on widget B', async () => {
    const stateRef = setup();

    const widgetA = makeWidget('wA', 'original-A');
    const widgetB = makeWidget('wB', 'original-B');
    const initialDashboard = makeDashboard([widgetA, widgetB]);

    // --- Step 1: establish the active dashboard ---
    await pushSnapshot([initialDashboard]);
    await waitFor(() =>
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-1')
    );

    // --- Step 2: second snapshot initialises lastSaved refs ---
    await pushSnapshot([initialDashboard]);

    // --- Step 3: local edit on widget A ---
    await act(async () => {
      stateRef.current?.updateWidget('wA', {
        config: { text: 'local-A' } as WidgetData['config'],
      });
      await Promise.resolve();
    });

    // Confirm local state reflects the edit
    await waitFor(() => {
      const wA = stateRef.current?.activeDashboard?.widgets.find(
        (w) => w.id === 'wA'
      );
      expect(wA?.config).toMatchObject({ text: 'local-A' });
    });

    // --- Step 4: server snapshot arrives with a different change on widget B ---
    const serverDashboard = makeDashboard([
      makeWidget('wA', 'original-A'), // server doesn't know about local-A yet
      makeWidget('wB', 'server-B'), // server changed widget B
    ]);
    await pushSnapshot([{ ...serverDashboard, updatedAt: 2000 }]);

    // --- Assert: both local and remote changes are preserved ---
    await waitFor(() => {
      const widgets = stateRef.current?.activeDashboard?.widgets;
      expect(widgets).toBeDefined();
      const wA = widgets?.find((w) => w.id === 'wA');
      const wB = widgets?.find((w) => w.id === 'wB');
      // Local edit wins for widget A
      expect(wA?.config).toMatchObject({ text: 'local-A' });
      // Server value wins for widget B (untouched locally)
      expect(wB?.config).toMatchObject({ text: 'server-B' });
    });
  });

  it('removes a remotely-deleted widget even when the client has other unsaved changes', async () => {
    const stateRef = setup();

    const widgetA = makeWidget('wA', 'original-A');
    const widgetC = makeWidget('wC', 'original-C');
    const initialDashboard = makeDashboard([widgetA, widgetC]);

    await pushSnapshot([initialDashboard]);
    await waitFor(() =>
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-1')
    );
    await pushSnapshot([initialDashboard]);

    // Local edit on widget A so the merge path is taken
    await act(async () => {
      stateRef.current?.updateWidget('wA', {
        config: { text: 'local-A' } as WidgetData['config'],
      });
      await Promise.resolve();
    });

    // Server snapshot: widget C has been deleted, widget A is unchanged
    const serverWithoutC = makeDashboard([makeWidget('wA', 'original-A')]);
    await pushSnapshot([{ ...serverWithoutC, updatedAt: 2000 }]);

    // Widget C was synced from the server (not locally added), so the merge
    // correctly treats it as remotely deleted and removes it.
    await waitFor(() => {
      const widgets = stateRef.current?.activeDashboard?.widgets;
      expect(widgets?.some((w) => w.id === 'wC')).toBe(false);
      // Local edit on widget A is preserved
      const wA = widgets?.find((w) => w.id === 'wA');
      expect(wA?.config).toMatchObject({ text: 'local-A' });
    });
  });

  it('preserves local changes to style fields including customTitle', async () => {
    const stateRef = setup();

    const widgetA = makeWidget('wA', 'original-A');
    const widgetB = makeWidget('wB', 'original-B');
    const initialDashboard = makeDashboard([widgetA, widgetB]);

    await pushSnapshot([initialDashboard]);
    await waitFor(() =>
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-1')
    );
    await pushSnapshot([initialDashboard]);

    // Local changes to style fields on widget A
    await act(async () => {
      stateRef.current?.updateWidget('wA', {
        customTitle: 'My Custom Title',
        transparency: 0.5,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      const wA = stateRef.current?.activeDashboard?.widgets.find(
        (w) => w.id === 'wA'
      );
      expect(wA?.customTitle).toBe('My Custom Title');
    });

    // Server snapshot: widget B config changed; widget A unchanged on server
    const serverDashboard = makeDashboard([
      makeWidget('wA', 'original-A'), // server unaware of local customTitle / transparency
      makeWidget('wB', 'server-B'),
    ]);
    await pushSnapshot([{ ...serverDashboard, updatedAt: 2000 }]);

    await waitFor(() => {
      const wA = stateRef.current?.activeDashboard?.widgets.find(
        (w) => w.id === 'wA'
      );
      // customTitle is preserved since it is now in STYLE_FIELDS
      expect(wA?.customTitle).toBe('My Custom Title');
      // transparency is preserved since it is in STYLE_FIELDS
      expect(wA?.transparency).toBe(0.5);
      // Widget B's server config is still accepted
      const wB = stateRef.current?.activeDashboard?.widgets.find(
        (w) => w.id === 'wB'
      );
      expect(wB?.config).toMatchObject({ text: 'server-B' });
    });
  });
});
