/**
 * Contract tests for the canvas hot-path store + stable actions surface
 * (context/dashboardCanvasStore.ts) against the REAL DashboardProvider.
 *
 * These pin the four guarantees the hot-path shells (DraggableWindow /
 * WidgetRenderer / BoardCanvas) were migrated onto:
 *
 *   1. Actions identity stability — `useDashboardActions()` returns the same
 *      object (and same methods) across every provider commit after mount.
 *   2. Latest-closure dispatch — a method captured at mount still executes
 *      the freshest provider closure (no stale-closure hazard).
 *   3. Untouched-subscriber isolation — a component subscribed via
 *      `useDashboardCanvasSelector` re-renders ONLY when its own selection
 *      changes, not on foreign widget mutations. (The parent-driven half of
 *      this metric is asserted in tests/perf/dashboardPerf.test.tsx.)
 *   4. Legacy fallback — under a bare DashboardContext.Provider (the
 *      subs/student/test hosts), all three hooks resolve off the legacy
 *      value without throwing.
 *
 * Plus StrictMode safety for (1) and (3a).
 */

import React, { useEffect } from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import {
  useDashboardActions,
  useDashboardCanvasSelector,
  useDashboardCanvasStateGetter,
  type DashboardActions,
  type DashboardCanvasState,
} from './dashboardCanvasStore';
import {
  DashboardContext,
  type DashboardContextValue,
} from './DashboardContextValue';
import { Dashboard, WidgetData } from '../types';

// ---------------------------------------------------------------------------
// Mocks (mirrors context/DashboardContext.bringToFront.test.tsx)
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

vi.mock('../hooks/useCollections', () => ({
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

vi.mock('../hooks/useSharedCollection', () => ({
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
// Probes
// ---------------------------------------------------------------------------

/** Captures the actions object on EVERY render so identity can be compared. */
const ActionsProbe: React.FC<{ captured: DashboardActions[] }> = ({
  captured,
}) => {
  const actions = useDashboardActions();
  captured.push(actions);
  return null;
};

/** Captures the full legacy context (to drive addWidget and read state). */
interface ContextSnapshot {
  activeDashboard: Dashboard | null;
  addWidget: ReturnType<typeof useDashboard>['addWidget'];
}

const ContextProbe: React.FC<{
  stateRef: { current: ContextSnapshot | null };
}> = ({ stateRef }) => {
  const ctx = useDashboard();
  useEffect(() => {
    stateRef.current = {
      activeDashboard: ctx.activeDashboard,
      addWidget: ctx.addWidget,
    };
  });
  return null;
};

/**
 * Replicates the DraggableWindow shell subscription: a per-widget selection
 * flag plus the read-only flag, with a render counter in the body. In
 * StrictMode the body runs twice per actual render — the assertions below
 * therefore check for ZERO delta (0 is 0 doubled) on untouched probes.
 */
const shellProbeRenders = new Map<string, number>();

const ShellProbe: React.FC<{ id: string }> = ({ id }) => {
  const isSelected = useDashboardCanvasSelector(
    (s) => s.selectedWidgetId === id
  );
  const isReadOnly = useDashboardCanvasSelector((s) => s.isActiveBoardReadOnly);
  shellProbeRenders.set(id, (shellProbeRenders.get(id) ?? 0) + 1);
  return <span data-selected={isSelected} data-readonly={isReadOnly} />;
};

function probeRenderDelta(
  baseline: ReadonlyMap<string, number>,
  id: string
): number {
  return (shellProbeRenders.get(id) ?? 0) - (baseline.get(id) ?? 0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWidget(
  id: string,
  z: number,
  extra: Partial<WidgetData> = {}
): WidgetData {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    z,
    flipped: false,
    config: { text: 'test' } as WidgetData['config'],
    ...extra,
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

function getWidget(
  stateRef: { current: ContextSnapshot | null },
  id: string
): WidgetData {
  const w = stateRef.current?.activeDashboard?.widgets.find((w) => w.id === id);
  if (!w) throw new Error(`widget ${id} not found`);
  return w;
}

interface Harness {
  captured: DashboardActions[];
  stateRef: { current: ContextSnapshot | null };
}

function setup(opts: { strictMode?: boolean } = {}): Harness {
  const captured: DashboardActions[] = [];
  const stateRef: { current: ContextSnapshot | null } = { current: null };
  const tree = (
    <DashboardProvider>
      <ActionsProbe captured={captured} />
      <ContextProbe stateRef={stateRef} />
      <ShellProbe id="w-1" />
      <ShellProbe id="w-2" />
      <ShellProbe id="w-3" />
    </DashboardProvider>
  );
  render(opts.strictMode ? <React.StrictMode>{tree}</React.StrictMode> : tree);
  return { captured, stateRef };
}

function latestActions(captured: DashboardActions[]): DashboardActions {
  const last = captured[captured.length - 1];
  if (!last) throw new Error('Actions never captured');
  return last;
}

const THREE_WIDGETS = (): WidgetData[] => [
  makeWidget('w-1', 1),
  makeWidget('w-2', 2),
  makeWidget('w-3', 3),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  capturedSnapshotCb = null;
  shellProbeRenders.clear();
});

describe('useDashboardActions identity stability', () => {
  it('returns the same actions object and methods across all mutations', async () => {
    const { captured, stateRef } = setup();
    await pushSnapshot([makeDashboard(THREE_WIDGETS())]);

    const first = captured[0];
    if (!first) throw new Error('Actions never captured');

    act(() => {
      stateRef.current?.addWidget('text');
    });
    act(() => {
      latestActions(captured).bringToFront('w-1');
    });
    act(() => {
      latestActions(captured).updateWidget('w-2', {
        config: { text: 'edited' } as WidgetData['config'],
      });
    });
    act(() => {
      latestActions(captured).setSelectedWidgetId('w-3');
    });

    await waitFor(() => {
      const config = getWidget(stateRef, 'w-2').config as { text?: string };
      expect(config.text).toBe('edited');
    });

    // The OBJECT identity never changed across any of the four mutations…
    for (const snapshot of captured) {
      expect(Object.is(snapshot, first)).toBe(true);
    }
    // …and neither did the individual methods.
    const last = latestActions(captured);
    expect(Object.is(last.updateWidget, first.updateWidget)).toBe(true);
    expect(Object.is(last.bringToFront, first.bringToFront)).toBe(true);
    expect(Object.is(last.removeWidget, first.removeWidget)).toBe(true);
    expect(Object.is(last.setSelectedWidgetId, first.setSelectedWidgetId)).toBe(
      true
    );
  });

  it('dispatches to the LATEST closure, not the mount-time one', async () => {
    const { captured, stateRef } = setup();

    // Capture bringToFront BEFORE any board exists — the mount-time closure
    // sees no active dashboard, so a stale-closure wrapper would no-op.
    const earlyBringToFront = captured[0]?.bringToFront;
    if (!earlyBringToFront) throw new Error('Actions never captured');

    await pushSnapshot([makeDashboard(THREE_WIDGETS())]);

    act(() => {
      earlyBringToFront('w-1');
    });

    await waitFor(() => {
      // maxZ was 3, so the raise proves the live closure ran.
      expect(getWidget(stateRef, 'w-1').z).toBe(4);
    });
  });
});

describe('useDashboardCanvasSelector untouched-subscriber isolation', () => {
  it('does not re-render foreign probes on bringToFront', async () => {
    const { captured } = setup();
    await pushSnapshot([makeDashboard(THREE_WIDGETS())]);

    const baseline = new Map(shellProbeRenders);
    act(() => {
      latestActions(captured).bringToFront('w-2');
    });

    expect(probeRenderDelta(baseline, 'w-1')).toBe(0);
    expect(probeRenderDelta(baseline, 'w-3')).toBe(0);
  });

  it('re-renders only the shedding and gaining probes on selection change', async () => {
    const { captured } = setup();
    await pushSnapshot([makeDashboard(THREE_WIDGETS())]);

    act(() => {
      latestActions(captured).setSelectedWidgetId('w-1');
    });

    const baseline = new Map(shellProbeRenders);
    act(() => {
      latestActions(captured).setSelectedWidgetId('w-3');
    });

    // w-1 sheds the selection, w-3 gains it — w-2 must stay untouched.
    expect(probeRenderDelta(baseline, 'w-1')).toBeGreaterThan(0);
    expect(probeRenderDelta(baseline, 'w-3')).toBeGreaterThan(0);
    expect(probeRenderDelta(baseline, 'w-2')).toBe(0);
  });

  it('does not re-render foreign probes on a widget config mutation', async () => {
    const { captured } = setup();
    await pushSnapshot([makeDashboard(THREE_WIDGETS())]);

    const baseline = new Map(shellProbeRenders);
    act(() => {
      latestActions(captured).updateWidget('w-2', { minimized: true });
    });

    expect(probeRenderDelta(baseline, 'w-1')).toBe(0);
    expect(probeRenderDelta(baseline, 'w-3')).toBe(0);
  });
});

describe('legacy fallback mode (subs/student/test hosts)', () => {
  it('resolves all three hooks off a bare DashboardContext.Provider', () => {
    const dashboard = makeDashboard(THREE_WIDGETS());
    // Minimal legacy value covering exactly what the hooks read. Alternate
    // hosts (SubsDashboardProvider, StudentContexts) supply the full value;
    // structurally the hooks only touch the hot slice + action fields.
    const legacyValue = {
      activeDashboard: dashboard,
      selectedWidgetId: 'w-2',
      selectedWidgetIds: [],
      groupBuildMode: false,
      zoom: 1.5,
      isActiveBoardReadOnly: true,
      updateWidget: vi.fn(),
      bringToFront: vi.fn(),
      removeWidget: vi.fn(),
      setSelectedWidgetId: vi.fn(),
    } as unknown as DashboardContextValue;

    const result: {
      actions?: DashboardActions;
      isSelected?: boolean;
      slice?: DashboardCanvasState;
    } = {};

    const FallbackProbe: React.FC = () => {
      const actions = useDashboardActions();
      const isSelected = useDashboardCanvasSelector(
        (s) => s.selectedWidgetId === 'w-2'
      );
      const getState = useDashboardCanvasStateGetter();
      useEffect(() => {
        result.actions = actions;
        result.isSelected = isSelected;
        result.slice = getState();
      });
      return null;
    };

    expect(() =>
      render(
        <DashboardContext.Provider value={legacyValue}>
          <FallbackProbe />
        </DashboardContext.Provider>
      )
    ).not.toThrow();

    // The legacy value structurally satisfies DashboardActions — the hook
    // hands it back as-is (no wrapping, no casts).
    expect(result.actions).toBe(legacyValue);
    expect(result.isSelected).toBe(true);
    expect(result.slice?.activeDashboard).toBe(dashboard);
    expect(result.slice?.zoom).toBe(1.5);
    expect(result.slice?.isActiveBoardReadOnly).toBe(true);
  });
});

describe('StrictMode safety', () => {
  it('keeps actions identity stable and untouched probes isolated', async () => {
    const { captured } = setup({ strictMode: true });
    await pushSnapshot([makeDashboard(THREE_WIDGETS())]);

    const first = captured[0];
    if (!first) throw new Error('Actions never captured');

    const baseline = new Map(shellProbeRenders);
    act(() => {
      latestActions(captured).bringToFront('w-2');
    });

    // (1) Identity stability holds through StrictMode's double rendering.
    for (const snapshot of captured) {
      expect(Object.is(snapshot, first)).toBe(true);
    }
    // (3a) Untouched probes did not re-render (double-notify from the
    // doubled post-commit effect bails on the unchanged snapshot).
    expect(probeRenderDelta(baseline, 'w-1')).toBe(0);
    expect(probeRenderDelta(baseline, 'w-3')).toBe(0);
  });
});
