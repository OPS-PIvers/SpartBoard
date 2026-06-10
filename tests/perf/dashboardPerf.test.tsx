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

const { STUB_WIDGET_TYPES } = vi.hoisted(() => ({
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
}));

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
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
}

const metrics: ScenarioMetric[] = [];

function createRecorder() {
  let commits = 0;
  let duration = 0;
  const onRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
    commits += 1;
    duration += actualDuration;
  };
  return {
    onRender,
    start() {
      commits = 0;
      duration = 0;
    },
    record(scenario: string) {
      metrics.push({
        scenario,
        commits,
        actualDurationMs: Number(duration.toFixed(3)),
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
 * DraggableWindow additionally reads useDashboard() directly.
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
      selectedWidgetId={ctx.selectedWidgetId}
      zoom={ctx.zoom}
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
    }
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
          'Profiler commit counts are the deterministic primary metric and ' +
          'must be identical across runs. actualDurationMs is machine-' +
          'dependent and indicative only — compare medians of 3 runs.',
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
