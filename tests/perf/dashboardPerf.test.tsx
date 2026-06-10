/**
 * Performance baseline harness for the dashboard canvas
 * (DashboardContext → BoardCanvas → WidgetRenderer → DraggableWindow).
 *
 * Mounts the REAL DashboardProvider (real reducer/callback surface, mocked
 * Firestore transport) and the real BoardCanvas/WidgetRenderer/DraggableWindow
 * stack inside a <React.Profiler>, seeds a board with 15 widgets of mixed
 * types at realistic positions/sizes, and scripts the highest-frequency
 * teacher interactions:
 *
 *   (1) mount15        — mount provider + board, push the 15-widget snapshot
 *   (2) drag.press / drag.move30 / drag.release
 *                      — pointer-drag one widget 30 × 5px (key metric:
 *                        does every move commit the whole board, or zero?)
 *   (3) resize.press / resize.move30 / resize.release
 *                      — same gesture on the SE resize handle
 *   (4) bringToFront5  — pointer-down on 5 different non-top widgets
 *   (5) addWidget / removeWidget
 *   (6) minimize / restore
 *
 * For each scenario we record:
 *   - Profiler commit COUNT (primary metric — must be identical run-to-run)
 *   - summed actualDuration (indicative only; machine-dependent)
 *   - PER-SHELL RENDER COUNTS: every DraggableWindow render invocation is
 *     counted per widget id (via a counting wrapper around the real
 *     component), recorded as totalShellRenders + a per-widget breakdown.
 *     This is the ruler for the context-split refactor, and the contract is
 *     now ASSERTED: a single-widget mutation (bringToFront / add / remove /
 *     minimize / restore) must parent-drive renders of ONLY the affected
 *     shell(s) — untouched shells must show 0 in the per-scenario diff.
 *     The wrapper observes parent-driven (WidgetRenderer-driven) renders;
 *     selector-driven internal re-renders inside DraggableWindow are pinned
 *     separately by context/dashboardCanvasStore.test.tsx, so together the
 *     two layers cover the whole metric.
 *
 * Results are written to tests/perf/results/dashboard-baseline.json. The
 * test asserts only that metrics were produced and that the gestures had
 * their expected behavioral outcome — NO duration thresholds, so this can
 * never be flaky on slow CI machines.
 *
 * Run: pnpm exec vitest run tests/perf/dashboardPerf.test.tsx
 *
 * Mocking strategy (matches neighboring tests, e.g.
 * tests/DashboardContext_removeWidgets.test.tsx and
 * tests/components/common/DraggableWindow.test.tsx):
 *   - useAuth / useFirestore / useRosters / useCollections /
 *     useSharedCollection: stubbed hooks (no Firebase network).
 *   - firebase/firestore: partial mock of the functions DashboardContext
 *     calls outside the useFirestore abstraction (dock hydration path).
 *   - useDialog + @/config/firebase: already mocked globally in tests/setup.ts.
 *   - WidgetRegistry + WidgetLayout: lightweight synchronous stub widgets so
 *     the harness measures the canvas machinery (DraggableWindow /
 *     WidgetRenderer / context fan-out), not individual widget internals.
 *   - useScreenshot: stubbed (html2canvas is irrelevant to canvas perf).
 *   - Fake timers (incl. requestAnimationFrame + Date) so the provider's
 *     debounced-save timers and DraggableWindow's rAF-coalesced pointermove
 *     handling flush deterministically inside each scenario's window.
 *   - PointerEvent / pointer capture / ResizeObserver / canvas getContext:
 *     stubbed globally in tests/setup.ts; document.elementsFromPoint is
 *     stubbed here (jsdom does not implement it).
 *
 * jsdom caveat (recorded as skipped in the results file): snap-overlay edge
 * detection and the snap-layout menu need real viewport geometry, so the drag
 * path deliberately stays >EDGE_THRESHOLD px away from every screen edge and
 * the snap menu is never opened.
 */

import React, { Profiler, useEffect } from 'react';
import type { ProfilerOnRenderCallback } from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { act, fireEvent, render } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DashboardProvider } from '@/context/DashboardContext';
import { useDashboard } from '@/context/useDashboard';
import { BoardCanvas } from '@/components/layout/BoardCanvas';
import type {
  Dashboard,
  LiveSession,
  LiveStudent,
  WidgetData,
  WidgetType,
} from '@/types';

// ─── Shared fixtures (hoisted so vi.mock factories can use them) ────────────

const { STUB_WIDGET_TYPES, shellRenderCounts, countShellRender } = vi.hoisted(
  () => {
    // Render-invocation counts of the DraggableWindow shell, keyed by widget
    // id. Widgets added mid-test get random UUIDs, so those are normalized to
    // a stable label to keep the results JSON identical run-to-run.
    const counts = new Map<string, number>();
    return {
      shellRenderCounts: counts,
      countShellRender: (widgetId: string) => {
        const key = /^w-\d+$/.test(widgetId) ? widgetId : 'added-widget';
        counts.set(key, (counts.get(key) ?? 0) + 1);
      },
      // 15 widgets across 8 distinct types — all on the standard (non-position-
      // aware) drag path, which is what every widget except the 3 catalyst types
      // uses. All are registered skipScaling so the container-query branch of
      // WidgetRenderer is exercised (the majority path per WidgetRegistry).
      STUB_WIDGET_TYPES: [
        'clock',
        'text',
        'checklist',
        'poll',
        'weather',
        'schedule',
        'dice',
        'scoreboard',
        'clock',
        'text',
        'checklist',
        'poll',
        'weather',
        'schedule',
        'dice',
      ] as const,
    };
  }
);

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/context/useAuth', () => {
  // ONE stable value object, mirroring the real AuthContext where the
  // callbacks are useCallbacks and the value is memoized. A fresh object per
  // call would hand DashboardContext an unstable `saveWidgetConfig`, making
  // `updateWidget` (deps: [saveWidgetConfig]) churn identity every provider
  // render and pierce every shell's memo() — a mock artifact, not production
  // behavior — which would mask the per-shell render metric below.
  const stableAuthValue = {
    user: {
      uid: 'perf-user',
      displayName: 'Perf Teacher',
      email: 'perf@example.com',
    },
    isAdmin: false,
    roleId: null,
    isStudentRole: false,
    roleResolved: true,
    refreshGoogleToken: vi.fn(),
    featurePermissions: [],
    selectedBuildings: [],
    savedWidgetConfigs: {},
    saveWidgetConfig: vi.fn(),
    profileLoaded: true,
    setupCompleted: true,
    lastActiveCollectionId: null,
    lastBoardIdByCollection: {},
    remoteControlEnabled: true,
    canAccessFeature: () => false,
    canAccessWidget: () => true,
    disableCloseConfirmation: false,
  };
  return { useAuth: () => stableAuthValue };
});

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
  // Real module reference so any unmocked Firestore function still resolves
  // to its real implementation. We override only the functions
  // DashboardContext calls directly outside the useFirestore abstraction —
  // primarily the dock-hydration path that reads userProfile via
  // doc()/getDoc() and persists via setDoc().
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

// Stub widget bodies: a synchronous div instead of the lazy-loaded real
// widget, so the harness measures DraggableWindow/WidgetRenderer/context
// machinery rather than individual widget internals.
vi.mock('@/components/widgets/WidgetLayout', async () => {
  const ReactActual = await import('react');
  const Stub = ({ widget }: { widget: { id: string; type: string } }) =>
    ReactActual.createElement(
      'div',
      { 'data-testid': `stub-widget-${widget.id}` },
      widget.type
    );
  return { WidgetLayout: Stub, WidgetLayoutWrapper: Stub };
});

vi.mock('@/components/widgets/WidgetRegistry', () => {
  const scaling: Record<string, { skipScaling: boolean }> = {};
  for (const type of STUB_WIDGET_TYPES) {
    scaling[type] = { skipScaling: true };
  }
  return {
    WIDGET_COMPONENTS: {},
    WIDGET_SETTINGS_COMPONENTS: {},
    WIDGET_APPEARANCE_COMPONENTS: {},
    DEFAULT_SCALING_CONFIG: {
      baseWidth: 300,
      baseHeight: 200,
      canSpread: true,
    },
    WIDGET_SCALING_CONFIG: scaling,
  };
});

// Per-shell render counter: re-export the REAL DraggableWindow wrapped in a
// component that bumps a per-widget-id counter on every render invocation.
// The wrapper renders exactly when WidgetRenderer re-creates the shell's
// element, so its count is the "did this untouched shell re-render?" ruler —
// it stays put when the canvas bails out above the shell and drops to ~0 for
// untouched widgets once the context split lands.
vi.mock('@/components/common/DraggableWindow', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/components/common/DraggableWindow')
    >();
  const ReactActual = await import('react');
  const RealDraggableWindow = actual.DraggableWindow;
  const CountingDraggableWindow: typeof actual.DraggableWindow = (props) => {
    countShellRender(props.widget.id);
    return ReactActual.createElement(RealDraggableWindow, props);
  };
  return { ...actual, DraggableWindow: CountingDraggableWindow };
});

vi.mock('@/components/widgets/LiveControl', () => ({
  LiveControl: () => null,
}));

vi.mock('@/components/widgets/stickers/StickerItemWidget', () => ({
  StickerItemWidget: () => null,
}));

vi.mock('@/hooks/useScreenshot', () => ({
  useScreenshot: () => ({
    takeScreenshot: vi.fn(),
    isFlashing: false,
    isCapturing: false,
  }),
}));

// ─── jsdom environment stubs ─────────────────────────────────────────────────

const originalElementsFromPointDescriptor = Object.getOwnPropertyDescriptor(
  Document.prototype,
  'elementsFromPoint'
);

beforeAll(() => {
  // jsdom does not implement elementsFromPoint; DraggableWindow uses it for
  // resize-handle / inner-edge pass-through checks. Returning [] means "no
  // interactive element beneath", which keeps the gesture on the handle.
  Object.defineProperty(Document.prototype, 'elementsFromPoint', {
    configurable: true,
    value: () => [],
  });
  // Fake timers (incl. rAF + Date) make the provider's debounced-save timers
  // and the drag handlers' rAF coalescing flush deterministically inside each
  // scenario window. performance/queueMicrotask stay real so Profiler
  // durations remain meaningful and awaits flush naturally.
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'Date',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
});

afterAll(() => {
  vi.useRealTimers();
  if (originalElementsFromPointDescriptor) {
    Object.defineProperty(
      Document.prototype,
      'elementsFromPoint',
      originalElementsFromPointDescriptor
    );
  } else {
    Reflect.deleteProperty(Document.prototype, 'elementsFromPoint');
  }
});

// ─── Profiler recorder ───────────────────────────────────────────────────────

interface ScenarioMetric {
  scenario: string;
  commits: number;
  actualDurationMs: number;
  totalShellRenders: number;
  shellRendersByWidget: Record<string, number>;
}

const metrics: ScenarioMetric[] = [];

/** Per-widget delta of shellRenderCounts since the given baseline snapshot. */
function shellRenderDeltas(
  baseline: ReadonlyMap<string, number>
): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const key of [...shellRenderCounts.keys()].sort()) {
    const delta = (shellRenderCounts.get(key) ?? 0) - (baseline.get(key) ?? 0);
    if (delta > 0) deltas[key] = delta;
  }
  return deltas;
}

function createRecorder() {
  let commits = 0;
  let duration = 0;
  let shellBaseline: ReadonlyMap<string, number> = new Map();
  const onRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
    commits += 1;
    duration += actualDuration;
  };
  return {
    onRender,
    start() {
      commits = 0;
      duration = 0;
      shellBaseline = new Map(shellRenderCounts);
    },
    record(scenario: string) {
      const shellRendersByWidget = shellRenderDeltas(shellBaseline);
      metrics.push({
        scenario,
        commits,
        actualDurationMs: Number(duration.toFixed(3)),
        totalShellRenders: Object.values(shellRendersByWidget).reduce(
          (sum, n) => sum + n,
          0
        ),
        shellRendersByWidget,
      });
    },
  };
}

/**
 * Flush everything the scenario scheduled — debounced Firestore saves
 * (showSaving setTimeout(0) + 100–2500ms save debounces + post-save timers),
 * pending rAF callbacks, and the promise chains they resolve — so commit
 * attribution is identical run-to-run.
 */
const SETTLE_MS = 8000;
async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
  });
}

/** Advance one rAF frame so DraggableWindow's coalesced pointermove runs. */
async function frame(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(16);
  });
}

function q<T extends Element>(selector: string): T {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el as T;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** 15 widgets of mixed stub types at realistic positions/sizes, z = 1..15. */
function buildWidgets(): WidgetData[] {
  return STUB_WIDGET_TYPES.map((type, i) => {
    const n = i + 1;
    return {
      id: `w-${n}`,
      type: type as WidgetType,
      x: 40 + (i % 5) * 190,
      y: 40 + Math.floor(i / 5) * 230,
      w: 260 + (i % 3) * 40,
      h: 180 + (i % 2) * 60,
      z: n,
      flipped: false,
      config: {} as WidgetData['config'],
    };
  });
}

function buildDashboard(widgets: WidgetData[]): Dashboard {
  return {
    id: 'perf-dash',
    name: 'Perf Baseline Board',
    background: 'bg-slate-900',
    widgets,
    createdAt: 1000,
    updatedAt: 1000,
    // Match the jsdom viewport so the provider's proportional-migration
    // hydration is an identity transform and the seeded geometry survives.
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
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

// ─── Harness component ───────────────────────────────────────────────────────

const EMPTY_STUDENTS: LiveStudent[] = [];
const noopAsync = (): Promise<void> => Promise.resolve();
const startSessionStub = (): Promise<LiveSession> => {
  throw new Error('startSession is not exercised by the perf harness');
};

const ctxRef: { current: ReturnType<typeof useDashboard> | null } = {
  current: null,
};

function getCtx(): ReturnType<typeof useDashboard> {
  if (!ctxRef.current) throw new Error('Dashboard context not captured');
  return ctxRef.current;
}

/**
 * Mirrors the production wiring in DashboardView → MountedBoardsLayer →
 * BoardCanvas: context state and callbacks flow down as props, while
 * DraggableWindow/WidgetRenderer read the stable actions context and the
 * canvas hot-slice selectors directly (context/dashboardCanvasStore.ts).
 */
const BoardHarness: React.FC = () => {
  const ctx = useDashboard();
  useEffect(() => {
    ctxRef.current = ctx;
  });
  if (!ctx.activeDashboard) return null;
  return (
    <BoardCanvas
      dashboard={ctx.activeDashboard}
      isActive
      isMinimized={false}
      animationClass=""
      session={null}
      students={EMPTY_STUDENTS}
      emptyStudents={EMPTY_STUDENTS}
      updateSessionConfig={noopAsync}
      updateSessionBackground={noopAsync}
      startSession={startSessionStub}
      endSession={noopAsync}
      removeStudent={noopAsync}
      toggleFreezeStudent={noopAsync}
      toggleGlobalFreeze={noopAsync}
      updateWidget={ctx.updateWidget}
      removeWidget={ctx.removeWidget}
      duplicateWidget={ctx.duplicateWidget}
      bringToFront={ctx.bringToFront}
      addToast={ctx.addToast}
      updateDashboardSettings={ctx.updateDashboardSettings}
    />
  );
};

// ─── Scenarios ───────────────────────────────────────────────────────────────

const MOUSE = { pointerType: 'mouse' } as const;

describe('dashboard canvas performance baseline', () => {
  it('mount15, drag30, resize30, bringToFront5, addRemove, minimizeRestore', async () => {
    const rec = createRecorder();
    const widgets = buildWidgets();

    // (1) mount15 — mount the provider + board and push the 15-widget snapshot.
    rec.start();
    render(
      <Profiler id="dashboard-canvas" onRender={rec.onRender}>
        <DashboardProvider>
          <BoardHarness />
        </DashboardProvider>
      </Profiler>
    );
    await pushSnapshot([buildDashboard(widgets)]);
    await settle();
    rec.record('mount15');
    expect(document.querySelectorAll('[data-widget-id]')).toHaveLength(15);

    // Post-mount geometry baselines (the provider's proportional-migration
    // hydration may round pixel values slightly on load).
    const mountedWidgets = getCtx().activeDashboard?.widgets ?? [];
    const w5Start = mountedWidgets.find((w) => w.id === 'w-5');
    const w7Start = mountedWidgets.find((w) => w.id === 'w-7');
    if (!w5Start || !w7Start) throw new Error('seed widgets missing');

    // (2) drag30 — press w-5's drag surface, 30 moves of 5px, release.
    // Coordinates stay >EDGE_THRESHOLD px from every screen edge so the
    // snap-zone preview never arms (see jsdom caveat in the header).
    const dragSurface = q<HTMLElement>(
      '[data-widget-id="w-5"] [data-testid="drag-surface"]'
    );
    rec.start();
    fireEvent.pointerDown(dragSurface, {
      ...MOUSE,
      pointerId: 11,
      clientX: 500,
      clientY: 300,
    });
    await settle();
    rec.record('drag.press');

    rec.start();
    for (let i = 1; i <= 30; i++) {
      fireEvent.pointerMove(dragSurface, {
        ...MOUSE,
        pointerId: 11,
        clientX: 500 + i * 5,
        clientY: 300,
      });
      await frame();
    }
    rec.record('drag.move30');

    rec.start();
    fireEvent.pointerUp(dragSurface, {
      ...MOUSE,
      pointerId: 11,
      clientX: 650,
      clientY: 300,
    });
    await settle();
    rec.record('drag.release');

    // Behavioral validity: the drag committed a 150px x-translation.
    const draggedW5 = getCtx().activeDashboard?.widgets.find(
      (w) => w.id === 'w-5'
    );
    expect(draggedW5?.x).toBe(w5Start.x + 150);
    expect(draggedW5?.y).toBe(w5Start.y);

    // (3) resize30 — press w-7's SE resize handle, 30 moves of 5px, release.
    const seHandle = q<HTMLElement>(
      '[data-widget-id="w-7"] .resize-handle.cursor-se-resize'
    );
    rec.start();
    fireEvent.pointerDown(seHandle, {
      ...MOUSE,
      pointerId: 22,
      clientX: 600,
      clientY: 500,
    });
    await settle();
    rec.record('resize.press');

    rec.start();
    for (let i = 1; i <= 30; i++) {
      fireEvent.pointerMove(seHandle, {
        ...MOUSE,
        pointerId: 22,
        clientX: 600 + i * 5,
        clientY: 500 + i * 5,
      });
      await frame();
    }
    rec.record('resize.move30');

    rec.start();
    fireEvent.pointerUp(seHandle, {
      ...MOUSE,
      pointerId: 22,
      clientX: 750,
      clientY: 650,
    });
    await settle();
    rec.record('resize.release');

    const resizedW7 = getCtx().activeDashboard?.widgets.find(
      (w) => w.id === 'w-7'
    );
    expect(resizedW7?.w).toBe(w7Start.w + 150);
    expect(resizedW7?.h).toBe(w7Start.h + 150);

    // (4) bringToFront5 — pointer-down on 5 widgets that are each below the
    // top of the z-stack at click time (w-5 holds the top z after the drag).
    rec.start();
    for (const id of ['w-1', 'w-2', 'w-3', 'w-4', 'w-6']) {
      const root = q<HTMLElement>(`[data-widget-id="${id}"]`);
      fireEvent.pointerDown(root, {
        ...MOUSE,
        pointerId: 33,
        clientX: 100,
        clientY: 100,
      });
      fireEvent.pointerUp(root, {
        ...MOUSE,
        pointerId: 33,
        clientX: 100,
        clientY: 100,
      });
      await settle();
    }
    rec.record('bringToFront5');
    const zOfW6 = getCtx().activeDashboard?.widgets.find(
      (w) => w.id === 'w-6'
    )?.z;
    const maxZ = Math.max(
      ...(getCtx().activeDashboard?.widgets.map((w) => w.z) ?? [0])
    );
    expect(zOfW6).toBe(maxZ); // last-raised widget ends on top

    // (5) addRemove — add one widget through the real context action, then
    // remove it.
    const seededIds = new Set(
      getCtx().activeDashboard?.widgets.map((w) => w.id)
    );
    rec.start();
    act(() => {
      getCtx().addWidget('text');
    });
    await settle();
    rec.record('addWidget');

    const added = getCtx().activeDashboard?.widgets.find(
      (w) => !seededIds.has(w.id)
    );
    if (!added) throw new Error('addWidget did not add a widget');
    rec.start();
    act(() => {
      getCtx().removeWidget(added.id);
    });
    await settle();
    rec.record('removeWidget');
    expect(getCtx().activeDashboard?.widgets).toHaveLength(15);

    // (6) minimizeRestore — same updateWidget payloads the Esc shortcut and
    // the dock's minimized tray use.
    rec.start();
    act(() => {
      getCtx().updateWidget('w-3', { minimized: true, flipped: false });
    });
    await settle();
    rec.record('minimize');

    rec.start();
    act(() => {
      getCtx().updateWidget('w-3', { minimized: false });
    });
    await settle();
    rec.record('restore');
    expect(
      getCtx().activeDashboard?.widgets.find((w) => w.id === 'w-3')?.minimized
    ).toBe(false);

    // The harness only asserts that metrics were produced — no duration
    // thresholds (CI machines vary; this must never be flaky).
    expect(metrics).toHaveLength(12);
    for (const m of metrics) {
      expect(m.commits).toBeGreaterThanOrEqual(0);
      expect(m.actualDurationMs).toBeGreaterThanOrEqual(0);
      expect(m.totalShellRenders).toBeGreaterThanOrEqual(0);
    }
    // The mount must have rendered all 15 shells at least once each.
    const mount = metrics.find((m) => m.scenario === 'mount15');
    expect(Object.keys(mount?.shellRendersByWidget ?? {})).toHaveLength(15);

    // Context-split contract (deterministic render-count facts, not
    // durations): a single-widget mutation parent-drives renders of ONLY
    // the affected shell(s). An untouched shell appearing in a scenario's
    // per-widget diff means something re-introduced a board-wide
    // subscription (or broke widget identity preservation) — exactly the
    // regression this ruler exists to catch.
    const shellDiff = (scenario: string): string[] => {
      const m = metrics.find((x) => x.scenario === scenario);
      if (!m) throw new Error(`scenario ${scenario} not recorded`);
      return Object.keys(m.shellRendersByWidget).sort();
    };
    // Each pointer-down raised one widget; only those five shells rendered.
    expect(shellDiff('bringToFront5')).toEqual([
      'w-1',
      'w-2',
      'w-3',
      'w-4',
      'w-6',
    ]);
    // Adding mounts only the new shell; removal unmounts without rendering
    // any surviving shell.
    expect(shellDiff('addWidget')).toEqual(['added-widget']);
    expect(shellDiff('removeWidget')).toEqual([]);
    // Minimize/restore touch only the targeted widget's shell.
    expect(shellDiff('minimize')).toEqual(['w-3']);
    expect(shellDiff('restore')).toEqual(['w-3']);
  });
});

// ─── Results file ────────────────────────────────────────────────────────────

afterAll(() => {
  // Vitest serves test modules over a non-file URL, so import.meta.url can't
  // be used for paths — resolve from the repo root (vitest's cwd) instead.
  const resultsDir = resolve(process.cwd(), 'tests/perf/results');
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(
    join(resultsDir, 'dashboard-baseline.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        runCommand: 'pnpm exec vitest run tests/perf/dashboardPerf.test.tsx',
        note:
          'Profiler commit counts and per-shell render counts are the ' +
          'deterministic primary metrics and must be identical across runs. ' +
          'totalShellRenders sums DraggableWindow render invocations across ' +
          'all widgets per scenario; shellRendersByWidget shows which shells ' +
          'rendered (widgets added mid-test are keyed "added-widget"). ' +
          'actualDurationMs is machine-dependent and indicative only — ' +
          'compare medians of 3 runs.',
        skipped:
          'Snap-overlay edge snapping and the snap-layout menu need real ' +
          'viewport geometry, so they are not exercised in jsdom; the drag ' +
          'path deliberately stays away from screen edges.',
        scenarios: metrics,
      },
      null,
      2
    ) + '\n'
  );
});
