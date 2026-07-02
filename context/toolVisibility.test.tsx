/**
 * Contract tests for the tool-visibility context split (F9) against the REAL
 * DashboardProvider (context/ToolVisibilityContextValue.ts +
 * context/useToolVisibility.ts).
 *
 * DashboardProvider builds two memoized values from the same underlying state:
 * the big `contextValue` (DashboardContext) and the narrow `toolVisibilityValue`
 * (ToolVisibilityContext). Splitting tool visibility out means:
 *
 *   1. Tool-visibility isolation — a `useDashboard()` consumer does NOT
 *      re-render when only tool visibility changes (toggle / reorder). Before
 *      the split, visibleTools/dockItems/libraryOrder were in contextValue's
 *      useMemo deps, so a toggle recreated that value and fanned out to every
 *      consumer; now it recreates only toolVisibilityValue.
 *   2. Canvas isolation — a `useToolVisibility()` consumer does NOT re-render
 *      when only widget/canvas state changes (addWidget / updateWidget). The
 *      tool-vis value's deps are exactly the 17 tool-vis fields, none of which
 *      a widget mutation touches.
 *   3. Correctness — tool-visibility mutations still produce the right state
 *      AND the same localStorage persistence (classroom_visible_tools /
 *      classroom_dock_items) they did before the split.
 *
 * Render-count probes mirror dashboardCanvasStore.test.tsx's ShellProbe: each
 * probe bumps a per-id counter in its render body, and we assert ZERO delta on
 * the untouched probe across the mutation under test. The mocking strategy is
 * copied verbatim from dashboardCanvasStore.test.tsx (same neighbor harness).
 */

import React, { useEffect } from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import { useToolVisibility } from './useToolVisibility';
import { Dashboard, WidgetData, WidgetType, DockItem } from '../types';

// ---------------------------------------------------------------------------
// Mocks (mirrors context/dashboardCanvasStore.test.tsx)
// ---------------------------------------------------------------------------

// ONE stable value object (mirrors tests/perf/dashboardPerf.test.tsx). A fresh
// object per call would hand the provider unstable user/featurePermissions, so
// getDefaultDockTools — and through it resetDockToDefaults, a dep of the
// toolVisibilityValue memo — would churn identity on every provider render.
// That would recreate the tool-vis value on a plain widget mutation and mask
// the canvas-isolation guarantee under test.
vi.mock('./useAuth', () => {
  const stableAuthValue = {
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
    setupCompleted: true,
  };
  return { useAuth: () => stableAuthValue };
});

type SnapshotCb = (dashboards: Dashboard[], hasPendingWrites: boolean) => void;
let capturedSnapshotCb: SnapshotCb | null = null;

// Each hook mock returns a STABLE singleton — the real hooks memoize their
// result, so their identity survives an unrelated provider re-render. A fresh
// object per call would make useFirestore/rosters/collections/share* churn
// identity on EVERY provider render, recomputing the big contextValue (those
// feed its callbacks' deps) even on a pure tool-vis change — which would mask
// the isolation guarantee under test. Same rationale as the useAuth mock above
// and tests/perf/dashboardPerf.test.tsx.
vi.mock('@/hooks/useFirestore', () => {
  const value = {
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
  };
  return { useFirestore: () => value };
});

vi.mock('@/hooks/useRosters', () => {
  const value = {
    rosters: [],
    activeRosterId: null,
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    deleteRoster: vi.fn(),
    setActiveRoster: vi.fn(),
    setAbsentStudents: vi.fn(),
  };
  return { useRosters: () => value };
});

vi.mock('@/hooks/useCollections', () => {
  const value = {
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
  };
  return { useCollections: () => value };
});

vi.mock('@/hooks/useSharedCollection', () => {
  const value = {
    shareCollection: vi.fn().mockResolvedValue('mock-collection-share-id'),
    shareSubstituteCollection: vi
      .fn()
      .mockResolvedValue('mock-collection-sub-share-id'),
    loadSharedCollection: vi
      .fn()
      .mockResolvedValue({ ok: false, reason: 'not-found' }),
    loadSharedCollectionBoards: vi.fn().mockResolvedValue([]),
  };
  return { useSharedCollection: () => value };
});

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

// Render-invocation counts keyed by probe label. A Map (mutated via .set, as
// in dashboardCanvasStore.test.tsx's ShellProbe) sidesteps the
// react-hooks/immutability rule that forbids reassigning an outer scalar from a
// render body.
const probeRenders = new Map<string, number>();
const bumpProbe = (label: string): void => {
  probeRenders.set(label, (probeRenders.get(label) ?? 0) + 1);
};
const probeCount = (label: string): number => probeRenders.get(label) ?? 0;

/**
 * Legacy DashboardContext consumer. Reads two fields that SURVIVE the F9 split
 * (updateWidget callback + activeDashboard) so the subscription is real and not
 * tree-shaken. Bumps a render counter in the body — the ruler for "did a
 * tool-visibility change leak a re-render into a plain useDashboard() consumer?"
 *
 * Wrapped in React.memo with no props (mirrors the perf harness's
 * BystanderProbe) so the ONLY thing that can re-render it is a DashboardContext
 * value-identity change — a re-render of the DashboardProvider itself is bailed
 * out by memo, isolating the metric to the context fan-out under test.
 */
const DashboardProbe: React.FC = React.memo(() => {
  const { updateWidget, activeDashboard } = useDashboard();
  bumpProbe('dashboard');
  void updateWidget;
  void activeDashboard;
  return null;
});
DashboardProbe.displayName = 'DashboardProbe';

/**
 * Tool-visibility consumer. Reads visibleTools + toggleToolVisibility so its
 * subscription is real. Bumps a render counter — the ruler for "did a widget /
 * canvas mutation leak a re-render into a useToolVisibility() consumer?"
 *
 * Also React.memo-wrapped so only a ToolVisibilityContext value-identity change
 * (not a provider re-render) can re-render it.
 */
const ToolVisProbe: React.FC = React.memo(() => {
  const { visibleTools, toggleToolVisibility } = useToolVisibility();
  bumpProbe('toolVis');
  void visibleTools;
  void toggleToolVisibility;
  return null;
});
ToolVisProbe.displayName = 'ToolVisProbe';

// ---------------------------------------------------------------------------
// Capture harness — grab both context values so tests can drive mutations.
// ---------------------------------------------------------------------------

interface Captured {
  dashboard: ReturnType<typeof useDashboard> | null;
  toolVis: ReturnType<typeof useToolVisibility> | null;
}

const captured: Captured = { dashboard: null, toolVis: null };

const CaptureProbe: React.FC = () => {
  const dashboard = useDashboard();
  const toolVis = useToolVisibility();
  // Capture into the module-level holder from a post-commit effect, NOT the
  // render body: the `react-hooks/immutability` rule fires on any module-level
  // mutation inside a render function (see tests/context/
  // AuthContext.quizMonitorPrefs.test.tsx for the same pattern). Tests read
  // captured.* inside act() after the commit settles, so a post-commit write is
  // exactly when the value is needed.
  useEffect(() => {
    captured.dashboard = dashboard;
    captured.toolVis = toolVis;
  });
  return null;
};

function getDashboard(): ReturnType<typeof useDashboard> {
  if (!captured.dashboard) throw new Error('Dashboard context not captured');
  return captured.dashboard;
}

function getToolVis(): ReturnType<typeof useToolVisibility> {
  if (!captured.toolVis)
    throw new Error('Tool-visibility context not captured');
  return captured.toolVis;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWidget(id: string, z: number): WidgetData {
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

/**
 * Wait for the provider's async dock-init/hydration effects to finish seeding
 * the dock. Those effects fire after mount (getDoc hydration → setDockHydrated
 * → init effect seeds dockItems), and each setVisibleTools/setDockItems churns
 * the tool-vis value. The isolation tests must capture their render-count
 * baseline AFTER that settles, otherwise a late seed render lands inside the
 * measurement window and shows up as a phantom +1 against the mutation under
 * test. The empty-dock recovery effect seeds ~all accessible tools (empty
 * selectedBuildings = "show all"), so a non-empty, stable dock is the signal
 * that init is done.
 */
async function settleDock(): Promise<void> {
  await waitFor(() => {
    expect(getToolVis().dockItems.length).toBeGreaterThan(0);
  });
  // One more flush so any trailing state update from the seed commits before we
  // snapshot the render counts.
  await act(async () => {
    await Promise.resolve();
  });
}

function setup(): void {
  render(
    <DashboardProvider>
      <CaptureProbe />
      <DashboardProbe />
      <ToolVisProbe />
    </DashboardProvider>
  );
}

const TWO_WIDGETS = (): WidgetData[] => [
  makeWidget('w-1', 1),
  makeWidget('w-2', 2),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  capturedSnapshotCb = null;
  probeRenders.clear();
  captured.dashboard = null;
  captured.toolVis = null;
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tool-visibility isolation — useDashboard() consumers stay put', () => {
  it('does not re-render a useDashboard() consumer on toggleToolVisibility', async () => {
    setup();
    await pushSnapshot([makeDashboard(TWO_WIDGETS())]);
    await settleDock();

    const baseline = probeCount('dashboard');
    act(() => {
      getToolVis().toggleToolVisibility('clock');
    });

    // The tool-vis value churned, but the DashboardContext value identity did
    // not — so the plain useDashboard() consumer did not re-render.
    expect(probeCount('dashboard')).toBe(baseline);
  });

  it('does not re-render a useDashboard() consumer on reorderDockItems', async () => {
    setup();
    await pushSnapshot([makeDashboard(TWO_WIDGETS())]);
    await settleDock();

    const baseline = probeCount('dashboard');
    const reordered: DockItem[] = [
      { type: 'tool', toolType: 'text' },
      { type: 'tool', toolType: 'clock' },
    ];
    act(() => {
      getToolVis().reorderDockItems(reordered);
    });

    expect(probeCount('dashboard')).toBe(baseline);
  });

  // reorderLibrary is the ONE tool-vis action that is NOT isolated from the
  // dashboard — by design it dual-writes the new order onto the active
  // dashboard's `libraryOrder` (so a board carries its own library ordering
  // through share/export). It therefore legitimately churns `contextValue` and
  // re-renders useDashboard() consumers; that's correct behavior, not a leak.
  // The dedicated assertion below pins the dual-write is preserved post-split.
  it('reorderLibrary dual-writes order onto the active dashboard', async () => {
    setup();
    await pushSnapshot([makeDashboard(TWO_WIDGETS())]);
    await settleDock();

    const order: WidgetType[] = ['text', 'clock', 'poll'];
    act(() => {
      getToolVis().reorderLibrary(order);
    });

    await waitFor(() => {
      expect(getToolVis().libraryOrder).toEqual(order);
    });
    // The same order must be mirrored onto the active dashboard (the field
    // moved to ToolVisibilityContext, but the action body keeps the
    // setDashboards write intact — this is the F9 must-preserve invariant).
    expect(getDashboard().activeDashboard?.libraryOrder).toEqual(order);
  });
});

describe('canvas isolation — useToolVisibility() consumers stay put', () => {
  it('does not re-render a useToolVisibility() consumer on addWidget', async () => {
    setup();
    await pushSnapshot([makeDashboard(TWO_WIDGETS())]);
    await settleDock();

    const baseline = probeCount('toolVis');
    act(() => {
      getDashboard().addWidget('text');
    });

    await waitFor(() => {
      expect(getDashboard().activeDashboard?.widgets.length).toBe(3);
    });

    // A widget add churns DashboardContext but never touches the tool-vis
    // value's deps, so the tool-vis consumer did not re-render.
    expect(probeCount('toolVis')).toBe(baseline);
  });

  it('does not re-render a useToolVisibility() consumer on updateWidget', async () => {
    setup();
    await pushSnapshot([makeDashboard(TWO_WIDGETS())]);
    await settleDock();

    const baseline = probeCount('toolVis');
    act(() => {
      getDashboard().updateWidget('w-1', {
        config: { text: 'edited' } as WidgetData['config'],
      });
    });

    await waitFor(() => {
      const w = getDashboard().activeDashboard?.widgets.find(
        (x) => x.id === 'w-1'
      );
      expect((w?.config as { text?: string }).text).toBe('edited');
    });

    expect(probeCount('toolVis')).toBe(baseline);
  });
});

describe('correctness — tool-visibility state + persistence', () => {
  // The mock env (empty selectedBuildings + empty featurePermissions) makes the
  // provider's dock-init effect seed ALL accessible tools, so 'clock' may
  // already be visible at start. These tests therefore assert the toggle FLIPS
  // presence (direction-agnostic) and that both localStorage keys stay in sync
  // with state — the same contract the perf harness relies on.
  const dockHasClock = (items: DockItem[]): boolean =>
    items.some((i) => i.type === 'tool' && i.toolType === 'clock');

  it('toggleToolVisibility flips state and writes both localStorage keys', async () => {
    setup();
    await pushSnapshot([makeDashboard(TWO_WIDGETS())]);

    const visibleBefore = getToolVis().visibleTools.includes('clock');

    act(() => {
      getToolVis().toggleToolVisibility('clock');
    });

    await waitFor(() => {
      expect(getToolVis().visibleTools.includes('clock')).toBe(!visibleBefore);
    });

    // dockItems mirrors visibleTools for 'clock', and BOTH localStorage keys
    // are written — exactly the persistence behavior the action had pre-split.
    expect(dockHasClock(getToolVis().dockItems)).toBe(!visibleBefore);

    const visibleRaw = localStorage.getItem('classroom_visible_tools');
    const dockRaw = localStorage.getItem('classroom_dock_items');
    expect(visibleRaw).not.toBeNull();
    expect(dockRaw).not.toBeNull();
    expect(
      (JSON.parse(visibleRaw as string) as string[]).includes('clock')
    ).toBe(!visibleBefore);
    expect(dockHasClock(JSON.parse(dockRaw as string) as DockItem[])).toBe(
      !visibleBefore
    );

    // Toggling again restores the original presence (and persists it).
    act(() => {
      getToolVis().toggleToolVisibility('clock');
    });
    await waitFor(() => {
      expect(getToolVis().visibleTools.includes('clock')).toBe(visibleBefore);
    });
    expect(
      (
        JSON.parse(
          localStorage.getItem('classroom_visible_tools') as string
        ) as string[]
      ).includes('clock')
    ).toBe(visibleBefore);
  });

  it('reorderDockItems sets state and persists classroom_dock_items', async () => {
    setup();
    await pushSnapshot([makeDashboard(TWO_WIDGETS())]);

    // A bespoke, non-empty dock so the empty-dock recovery effect doesn't fire
    // and re-seed underneath us (that effect only refills when length === 0).
    const reordered: DockItem[] = [
      { type: 'tool', toolType: 'text' },
      { type: 'tool', toolType: 'clock' },
    ];
    act(() => {
      getToolVis().reorderDockItems(reordered);
    });

    await waitFor(() => {
      expect(getToolVis().dockItems).toEqual(reordered);
    });
    expect(
      JSON.parse(localStorage.getItem('classroom_dock_items') as string)
    ).toEqual(reordered);
  });

  it('reorderLibrary sets state and persists spartboard_library_order', async () => {
    setup();
    await pushSnapshot([makeDashboard(TWO_WIDGETS())]);

    const order: WidgetType[] = ['text', 'clock', 'poll'];
    act(() => {
      getToolVis().reorderLibrary(order);
    });

    await waitFor(() => {
      expect(getToolVis().libraryOrder).toEqual(order);
    });
    expect(
      JSON.parse(localStorage.getItem('spartboard_library_order') as string)
    ).toEqual(order);
  });
});

describe('useToolVisibility provider guard', () => {
  it('throws a clear error when used outside DashboardProvider', () => {
    const ThrowProbe: React.FC = () => {
      useToolVisibility();
      return null;
    };
    // Silence React's error boundary console noise for the expected throw.
    // The global afterEach (vi.restoreAllMocks) restores this spy.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<ThrowProbe />)).toThrow(
      'useToolVisibility must be used within DashboardProvider'
    );
  });
});
