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
import {
  useDashboardActions,
  useGlobalStyle,
  useIsActiveBoardReadOnly,
  useIsWidgetSelected,
} from '@/context/dashboardCanvasStore';
import { useToolVisibility } from '@/context/useToolVisibility';
import { BoardCanvas } from '@/components/layout/BoardCanvas';
import type {
  Dashboard,
  LiveSession,
  LiveStudent,
  WidgetData,
  WidgetType,
} from '@/types';

// ─── Shared fixtures (hoisted so vi.mock factories can use them) ────────────

const {
  STUB_WIDGET_TYPES,
  shellRenderCounts,
  countShellRender,
  bystanderRenderCounts,
  countBystanderRender,
  actionsProbeRenderCounts,
  countActionsProbeRender,
  globalStyleProbeRenderCounts,
  countGlobalStyleProbeRender,
  selectionProbeRenderCounts,
  countSelectionProbeRender,
  readOnlyProbeRenderCounts,
  countReadOnlyProbeRender,
} = vi.hoisted(() => {
  // Render-invocation counts of the DraggableWindow shell, keyed by widget
  // id. Widgets added mid-test get random UUIDs, so those are normalized to
  // a stable label to keep the results JSON identical run-to-run.
  const counts = new Map<string, number>();
  // Render-invocation counts of the BystanderProbe consumers, keyed by probe
  // id ('bystander-1'..'bystander-5'). These probes subscribe to the legacy
  // DashboardContext value (the one whose identity churns on every tool
  // toggle) and stand in for the ~189 real useDashboard() consumers that have
  // nothing to do with tool visibility. The shell counter above can't measure
  // this: shells read the isolated canvas store, so they intentionally do NOT
  // re-render on a tool toggle — a separate counter is required to prove the
  // context fan-out.
  const bystanderCounts = new Map<string, number>();
  // Render-invocation counts of the ActionsProbe consumers, keyed by probe id
  // ('actions-1'..'actions-5'). These probes stand in for a MIGRATED content
  // component: they call `useDashboardActions()` (the mount-stable actions
  // surface) instead of the legacy whole-value `useDashboard()`. Because the
  // actions object identity is fixed for the provider's lifetime, a discrete
  // widget op (bringToFront / drag-release) does NOT re-render them — that
  // 0-delta, contrasted against the legacy bystander's >0 delta on the same
  // scenarios, is the proof the migration eliminates the fan-out.
  const actionsProbeCounts = new Map<string, number>();
  // Render-invocation counts of the GlobalStyleProbe consumers, keyed by probe
  // id ('gs-1'..'gs-5'). These probes call `useGlobalStyle()` — a selector over
  // the canvas store that returns `activeDashboard.globalStyle`. Because a
  // discrete widget op (bringToFront / drag-release) spreads a new board +
  // widgets array but never touches the nested `globalStyle` object, the
  // selector's `Object.is` cache bails and these probes do NOT re-render. Only a
  // genuine `setGlobalStyle` allocates a new style identity and fires them. That
  // 0-delta on widget ops, contrasted against a 5-delta on a real style change,
  // proves the selector isolates style consumers from the per-op fan-out.
  const globalStyleProbeCounts = new Map<string, number>();
  // Render-invocation counts of the SelectionProbe consumers, keyed by probe id
  // ('sel-1'..'sel-5'). Each probe calls `useIsWidgetSelected(widgetId)` — a
  // PER-INSTANCE selector over the canvas store that projects the boolean
  // `selectedWidgetId === widgetId`. All 5 are bound to a FIXED widget id (w-8)
  // that no scenario touches, so selecting a DIFFERENT widget leaves the
  // projected boolean at `false` and the selector's `Object.is` cache bails —
  // the probes do NOT re-render (0 delta). Only selecting w-8 itself flips the
  // boolean to `true` and fires all 5. That 0-on-other / 5-on-self contrast is
  // the proof the per-instance selector isolates each widget's selection
  // subscription from unrelated selection changes — and the broader proof that
  // a discrete widget op (bringToFront / drag-release) never touches selection.
  const selectionProbeCounts = new Map<string, number>();
  // Render-invocation counts of the ReadOnlyProbe consumers, keyed by probe id
  // ('ro-1'..'ro-5'). Each probe calls `useIsActiveBoardReadOnly()` — a selector
  // over the canvas store that returns the active board's read-only boolean
  // (derived from `linkedShareRole === 'viewer' && !linkedShareEnded`). A
  // discrete widget op (bringToFront / drag-release) spreads a new board +
  // widgets array but never touches the `linkedShareRole`/`linkedShareEnded` the
  // flag is derived from, so the boolean is unchanged and the selector's
  // `Object.is` cache bails — the probes do NOT re-render (0 delta). Activating a
  // genuinely read-only board flips the boolean to `true` and fires all 5.
  const readOnlyProbeCounts = new Map<string, number>();
  return {
    shellRenderCounts: counts,
    countShellRender: (widgetId: string) => {
      const key = /^w-\d+$/.test(widgetId) ? widgetId : 'added-widget';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    },
    bystanderRenderCounts: bystanderCounts,
    countBystanderRender: (probeId: string) => {
      bystanderCounts.set(probeId, (bystanderCounts.get(probeId) ?? 0) + 1);
    },
    actionsProbeRenderCounts: actionsProbeCounts,
    countActionsProbeRender: (probeId: string) => {
      actionsProbeCounts.set(
        probeId,
        (actionsProbeCounts.get(probeId) ?? 0) + 1
      );
    },
    globalStyleProbeRenderCounts: globalStyleProbeCounts,
    countGlobalStyleProbeRender: (probeId: string) => {
      globalStyleProbeCounts.set(
        probeId,
        (globalStyleProbeCounts.get(probeId) ?? 0) + 1
      );
    },
    selectionProbeRenderCounts: selectionProbeCounts,
    countSelectionProbeRender: (probeId: string) => {
      selectionProbeCounts.set(
        probeId,
        (selectionProbeCounts.get(probeId) ?? 0) + 1
      );
    },
    readOnlyProbeRenderCounts: readOnlyProbeCounts,
    countReadOnlyProbeRender: (probeId: string) => {
      readOnlyProbeCounts.set(
        probeId,
        (readOnlyProbeCounts.get(probeId) ?? 0) + 1
      );
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
});

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

// Stable singleton (same rationale as the other hook mocks). The real
// useFirestore memoizes its result; a fresh object per call would make
// saveDashboardFirestore / subscribeToDashboards / etc. churn identity every
// provider render, which recomputes the big contextValue (those feed its
// callbacks' deps) even on a pure tool-vis toggle — masking the F9 split.
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
  };
  return { useFirestore: () => value };
});

// Stable singletons (same rationale as the useAuth mock above). The real
// useRosters / useCollections / useSharedCollection hooks memoize their result,
// so their identity survives an unrelated provider re-render. A fresh object
// per call would make rosters/collectionsApi/share* churn identity on EVERY
// provider render, recomputing the big contextValue even when only tool
// visibility changed — which would defeat the F9 split's measurement (the
// bystander probes would re-render on a toggle via collectionsApi churn, not a
// genuine tool-vis fan-out).
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
  // Bystander-consumer fan-out: how many of the 5 legacy-context probes
  // re-rendered during the scenario (sum), plus the per-probe breakdown. This
  // is the PRIMARY metric for the F9 context split — it should be > 0 (ideally
  // 5) on the toggleToolVisibility scenario today and drop to 0 once tool
  // visibility moves into its own context.
  bystanderRenders: number;
  bystanderRendersById: Record<string, number>;
  // Actions-consumer fan-out: how many of the 5 ActionsProbe consumers (which
  // read the mount-stable `useDashboardActions()` surface, modeling a MIGRATED
  // content component) re-rendered during the scenario (sum), plus the per-probe
  // breakdown. This is the migration CONTRAST metric — on bringToFront5 and
  // drag.release it must be 0 (the actions object identity never changes), while
  // the legacy `bystanderRenders` above stays > 0 on the same scenarios.
  actionsProbeRenders: number;
  actionsProbeRendersById: Record<string, number>;
  // GlobalStyle-consumer fan-out: how many of the 5 GlobalStyleProbe consumers
  // (which call `useGlobalStyle()`, a selector over the canvas store's
  // `activeDashboard.globalStyle`) re-rendered during the scenario (sum), plus
  // the per-probe breakdown. This is the selector-isolation proof — on
  // bringToFront5 and drag.release it must be 0 (those ops never touch the
  // nested globalStyle object, so the selector's Object.is cache bails), while a
  // real setGlobalStyle change re-renders all 5.
  globalStyleProbeRenders: number;
  globalStyleProbeRendersById: Record<string, number>;
  // Selection-consumer fan-out: how many of the 5 SelectionProbe consumers
  // (each calling `useIsWidgetSelected('w-8')`, a PER-INSTANCE selector over the
  // canvas store's `selectedWidgetId === id`) re-rendered during the scenario
  // (sum), plus the per-probe breakdown. This is the per-instance isolation
  // proof — on selectOther (a DIFFERENT widget is selected) it must be 0 (the
  // w-8 boolean stays false → Object.is cache bails), and on bringToFront5 /
  // drag.release it must be 0 (those ops never touch selection), while
  // selectSelf (w-8 itself is selected) re-renders all 5.
  selectionProbeRenders: number;
  selectionProbeRendersById: Record<string, number>;
  // ReadOnly-consumer fan-out: how many of the 5 ReadOnlyProbe consumers (each
  // calling `useIsActiveBoardReadOnly()`, a selector over the canvas store's
  // read-only boolean) re-rendered during the scenario (sum), plus the per-probe
  // breakdown. This is the read-only isolation proof — on bringToFront5 /
  // drag.release it must be 0 (those ops never touch the linkedShareRole the flag
  // is derived from), while activating a genuinely read-only board re-renders
  // all 5.
  readOnlyProbeRenders: number;
  readOnlyProbeRendersById: Record<string, number>;
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

/** Per-probe delta of bystanderRenderCounts since the given baseline snapshot. */
function bystanderRenderDeltas(
  baseline: ReadonlyMap<string, number>
): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const key of [...bystanderRenderCounts.keys()].sort()) {
    const delta =
      (bystanderRenderCounts.get(key) ?? 0) - (baseline.get(key) ?? 0);
    if (delta > 0) deltas[key] = delta;
  }
  return deltas;
}

/** Per-probe delta of actionsProbeRenderCounts since the given baseline snapshot. */
function actionsProbeRenderDeltas(
  baseline: ReadonlyMap<string, number>
): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const key of [...actionsProbeRenderCounts.keys()].sort()) {
    const delta =
      (actionsProbeRenderCounts.get(key) ?? 0) - (baseline.get(key) ?? 0);
    if (delta > 0) deltas[key] = delta;
  }
  return deltas;
}

/** Per-probe delta of globalStyleProbeRenderCounts since the given baseline snapshot. */
function globalStyleProbeRenderDeltas(
  baseline: ReadonlyMap<string, number>
): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const key of [...globalStyleProbeRenderCounts.keys()].sort()) {
    const delta =
      (globalStyleProbeRenderCounts.get(key) ?? 0) - (baseline.get(key) ?? 0);
    if (delta > 0) deltas[key] = delta;
  }
  return deltas;
}

/** Per-probe delta of selectionProbeRenderCounts since the given baseline snapshot. */
function selectionProbeRenderDeltas(
  baseline: ReadonlyMap<string, number>
): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const key of [...selectionProbeRenderCounts.keys()].sort()) {
    const delta =
      (selectionProbeRenderCounts.get(key) ?? 0) - (baseline.get(key) ?? 0);
    if (delta > 0) deltas[key] = delta;
  }
  return deltas;
}

/** Per-probe delta of readOnlyProbeRenderCounts since the given baseline snapshot. */
function readOnlyProbeRenderDeltas(
  baseline: ReadonlyMap<string, number>
): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const key of [...readOnlyProbeRenderCounts.keys()].sort()) {
    const delta =
      (readOnlyProbeRenderCounts.get(key) ?? 0) - (baseline.get(key) ?? 0);
    if (delta > 0) deltas[key] = delta;
  }
  return deltas;
}

function createRecorder() {
  let commits = 0;
  let duration = 0;
  let shellBaseline: ReadonlyMap<string, number> = new Map();
  let bystanderBaseline: ReadonlyMap<string, number> = new Map();
  let actionsProbeBaseline: ReadonlyMap<string, number> = new Map();
  let globalStyleProbeBaseline: ReadonlyMap<string, number> = new Map();
  let selectionProbeBaseline: ReadonlyMap<string, number> = new Map();
  let readOnlyProbeBaseline: ReadonlyMap<string, number> = new Map();
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
      bystanderBaseline = new Map(bystanderRenderCounts);
      actionsProbeBaseline = new Map(actionsProbeRenderCounts);
      globalStyleProbeBaseline = new Map(globalStyleProbeRenderCounts);
      selectionProbeBaseline = new Map(selectionProbeRenderCounts);
      readOnlyProbeBaseline = new Map(readOnlyProbeRenderCounts);
    },
    record(scenario: string) {
      const shellRendersByWidget = shellRenderDeltas(shellBaseline);
      const bystanderRendersById = bystanderRenderDeltas(bystanderBaseline);
      const actionsProbeRendersById =
        actionsProbeRenderDeltas(actionsProbeBaseline);
      const globalStyleProbeRendersById = globalStyleProbeRenderDeltas(
        globalStyleProbeBaseline
      );
      const selectionProbeRendersById = selectionProbeRenderDeltas(
        selectionProbeBaseline
      );
      const readOnlyProbeRendersById = readOnlyProbeRenderDeltas(
        readOnlyProbeBaseline
      );
      metrics.push({
        scenario,
        commits,
        actualDurationMs: Number(duration.toFixed(3)),
        totalShellRenders: Object.values(shellRendersByWidget).reduce(
          (sum, n) => sum + n,
          0
        ),
        shellRendersByWidget,
        bystanderRenders: Object.values(bystanderRendersById).reduce(
          (sum, n) => sum + n,
          0
        ),
        bystanderRendersById,
        actionsProbeRenders: Object.values(actionsProbeRendersById).reduce(
          (sum, n) => sum + n,
          0
        ),
        actionsProbeRendersById,
        globalStyleProbeRenders: Object.values(
          globalStyleProbeRendersById
        ).reduce((sum, n) => sum + n, 0),
        globalStyleProbeRendersById,
        selectionProbeRenders: Object.values(selectionProbeRendersById).reduce(
          (sum, n) => sum + n,
          0
        ),
        selectionProbeRendersById,
        readOnlyProbeRenders: Object.values(readOnlyProbeRendersById).reduce(
          (sum, n) => sum + n,
          0
        ),
        readOnlyProbeRendersById,
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

// F9 — tool visibility now lives on its own context (ToolVisibilityContext),
// captured separately so the toggleToolVisibility scenario can drive it after
// the split. The BystanderProbe deliberately keeps reading the legacy
// useDashboard() value (NOT this), so it still measures the DashboardContext
// fan-out the split is meant to silence.
const toolVisRef: { current: ReturnType<typeof useToolVisibility> | null } = {
  current: null,
};

function getToolVis(): ReturnType<typeof useToolVisibility> {
  if (!toolVisRef.current)
    throw new Error('Tool-visibility context not captured');
  return toolVisRef.current;
}

/**
 * Bystander consumer probe. Stands in for the ~189 widget-content/settings
 * components that call the legacy `useDashboard()` for an unrelated field and
 * have nothing to do with tool visibility.
 *
 * It subscribes to the REAL legacy DashboardContext (via `useDashboard()`),
 * not the isolated canvas store — so it re-renders whenever the provider's
 * memoized contextValue identity changes, which is exactly what a tool toggle
 * does today (visibleTools/dockItems are in that value's useMemo deps). It
 * reads `updateWidget` (a callback that survives the F9 split) and
 * `activeDashboard` so a tree-shaker can't elide the subscription; it does
 * NOT touch `useDashboardCanvasSelector`/`useDashboardActions`, so it faithfully
 * represents the churning-context consumers the split aims to quiet.
 *
 * Wrapped in React.memo with a stable `id` prop so the ONLY thing that can
 * drive a re-render is context-value churn — parent (BoardHarness) re-renders
 * are bailed out by memo, isolating the metric to the fan-out under test.
 */
const BystanderProbe: React.FC<{ id: string }> = React.memo(({ id }) => {
  const { updateWidget, activeDashboard } = useDashboard();
  countBystanderRender(id);
  // Reference both reads so the subscription is real and not optimized away.
  void updateWidget;
  void activeDashboard;
  return null;
});
BystanderProbe.displayName = 'BystanderProbe';

const BYSTANDER_IDS = [
  'bystander-1',
  'bystander-2',
  'bystander-3',
  'bystander-4',
  'bystander-5',
] as const;

/**
 * Migrated-consumer probe. Stands in for a content/settings component AFTER the
 * useDashboard()→useDashboardActions() migration: it reads only the
 * mount-stable actions surface (`useDashboardActions()`), exactly like the 9
 * widgets migrated in this slice (Traffic, HotspotImage, NumberLine, MathTool,
 * SyntaxFramer, CustomWidget, Embed, MathTools, StarterPack).
 *
 * With DashboardProvider mounted the actions object identity NEVER changes
 * after mount (it delegates to a live-ref of the freshest closures), so a
 * discrete widget op (bringToFront / drag-release) cannot re-render this probe
 * — its scenario delta is 0. Contrasted against BystanderProbe (which reads the
 * churning legacy value and re-renders on those same ops), this 0 is the direct
 * proof the migration isolates content consumers from board-wide fan-out.
 *
 * Wrapped in React.memo with a stable `id` prop so the ONLY thing that could
 * drive a re-render is the actions context changing identity — which it never
 * does — isolating the metric to the surface under test.
 */
const ActionsProbe: React.FC<{ id: string }> = React.memo(({ id }) => {
  const { updateWidget } = useDashboardActions();
  countActionsProbeRender(id);
  // Reference the read so the subscription is real and not optimized away.
  void updateWidget;
  return null;
});
ActionsProbe.displayName = 'ActionsProbe';

const ACTIONS_PROBE_IDS = [
  'actions-1',
  'actions-2',
  'actions-3',
  'actions-4',
  'actions-5',
] as const;

/**
 * GlobalStyle-consumer probe. Stands in for a content/settings component that
 * reads only the active board's `globalStyle` via the mount-stable
 * `useGlobalStyle()` selector (context/dashboardCanvasStore.ts) — e.g. a widget
 * face that honors the dashboard's font family / window transparency.
 *
 * The selector subscribes to the canvas store but projects only
 * `activeDashboard.globalStyle`. A discrete widget op (bringToFront /
 * drag-release) spreads a new board object + widgets array yet leaves the nested
 * `globalStyle` reference untouched, so the selector's `Object.is` cache bails
 * and this probe does NOT re-render — its scenario delta is 0. Only a genuine
 * `setGlobalStyle` allocates a new style identity and fires all 5. Contrasted
 * against the legacy BystanderProbe (which re-renders on those same widget ops),
 * this 0 is the direct proof the selector isolates style consumers from the
 * board-wide fan-out.
 *
 * Wrapped in React.memo with a stable `id` prop so the ONLY thing that can drive
 * a re-render is the projected `globalStyle` slice changing identity —
 * isolating the metric to the selector under test.
 */
const GlobalStyleProbe: React.FC<{ id: string }> = React.memo(({ id }) => {
  const globalStyle = useGlobalStyle();
  countGlobalStyleProbeRender(id);
  // Reference the read so the subscription is real and not optimized away.
  void globalStyle;
  return null;
});
GlobalStyleProbe.displayName = 'GlobalStyleProbe';

const GLOBALSTYLE_PROBE_IDS = ['gs-1', 'gs-2', 'gs-3', 'gs-4', 'gs-5'] as const;

/**
 * Per-instance selection probe. Stands in for a widget shell/content component
 * that subscribes ONLY to "am I the selected widget?" via the mount-stable
 * `useIsWidgetSelected(widgetId)` selector (context/dashboardCanvasStore.ts) —
 * the per-instance projection `selectedWidgetId === widgetId`.
 *
 * All 5 instances are bound to a FIXED widget id (`w-8`) that NO scenario
 * touches: drag moves w-5, resize moves w-7, bringToFront5 raises w-1..w-6, and
 * the add/remove/minimize scenarios target other ids — so w-8's selected-ness
 * never flips through any of those ops. Because the selector projects a boolean
 * and `Object.is(false, false)` holds, selecting a DIFFERENT widget (selectOther)
 * leaves these probes untouched (0 delta) — true per-instance isolation, NOT the
 * board-wide re-render a raw `selectedWidgetId` read would cause. Only selecting
 * w-8 itself (selectSelf) flips the projected boolean and fires all 5.
 *
 * Wrapped in React.memo with stable `id`/`widgetId` props so the ONLY thing that
 * can drive a re-render is the projected boolean changing identity — isolating
 * the metric to the per-instance selector under test.
 */
const SelectionProbe: React.FC<{ id: string; widgetId: string }> = React.memo(
  ({ id, widgetId }) => {
    const isSelected = useIsWidgetSelected(widgetId);
    countSelectionProbeRender(id);
    // Reference the read so the subscription is real and not optimized away.
    void isSelected;
    return null;
  }
);
SelectionProbe.displayName = 'SelectionProbe';

const SELECTION_PROBE_IDS = [
  'sel-1',
  'sel-2',
  'sel-3',
  'sel-4',
  'sel-5',
] as const;

// The widget all SelectionProbes are bound to. Chosen because NO scenario
// touches it: drag→w-5, resize→w-7, bringToFront5→w-1..w-4,w-6, add/remove→a
// fresh uuid, minimize/restore→w-3. So w-8's selected-ness only flips when a
// scenario explicitly selects it (selectSelf), never as a side effect.
const SELECTION_PROBE_WIDGET_ID = 'w-8';

/**
 * Read-only-board probe. Stands in for a widget shell/toolbar component that
 * subscribes ONLY to "is the active board read-only?" via the mount-stable
 * `useIsActiveBoardReadOnly()` selector (context/dashboardCanvasStore.ts) — the
 * boolean derived from the active board's `linkedShareRole === 'viewer' &&
 * !linkedShareEnded` (DashboardContext.tsx).
 *
 * A discrete widget op (bringToFront / drag-release) spreads a new board +
 * widgets array but never touches `linkedShareRole`/`linkedShareEnded`, so the
 * derived boolean is unchanged and the selector's `Object.is` cache bails — these
 * probes do NOT re-render on those ops (0 delta). Activating a genuinely
 * read-only board (`loadReadOnlyBoard`, a viewer-role snapshot pushed + made
 * active) flips the boolean to `true` and fires all 5.
 *
 * Note on the positive control: the SELECTOR MECHANISM these probes ride
 * (`useDashboardCanvasSelector` over a boolean projection) is identical to the
 * mechanism the SelectionProbe and GlobalStyleProbe positive controls already
 * exercise — a real state change to the projected slice re-renders exactly the
 * subscribed consumers and nothing else. Here we ALSO prove the read-only path
 * end-to-end with a dedicated `loadReadOnlyBoard` positive control (a viewer
 * board is pushed cleanly through the harness snapshot path), so the two
 * 0-deltas above are demonstrably genuine isolation rather than a dead probe.
 *
 * Wrapped in React.memo with a stable `id` prop so the ONLY thing that can drive
 * a re-render is the projected boolean changing identity — isolating the metric
 * to the selector under test.
 */
const ReadOnlyProbe: React.FC<{ id: string }> = React.memo(({ id }) => {
  const isReadOnly = useIsActiveBoardReadOnly();
  countReadOnlyProbeRender(id);
  // Reference the read so the subscription is real and not optimized away.
  void isReadOnly;
  return null;
});
ReadOnlyProbe.displayName = 'ReadOnlyProbe';

const RO_PROBE_IDS = ['ro-1', 'ro-2', 'ro-3', 'ro-4', 'ro-5'] as const;

/**
 * Mirrors the production wiring in DashboardView → MountedBoardsLayer →
 * BoardCanvas: context state and callbacks flow down as props, while
 * DraggableWindow/WidgetRenderer read the stable actions context and the
 * canvas hot-slice selectors directly (context/dashboardCanvasStore.ts).
 *
 * The 5 BystanderProbe consumers are mounted alongside BoardCanvas, under the
 * same <DashboardProvider> and inside the same <Profiler>, so their
 * context-driven re-renders are captured by the recorder.
 */
const BoardHarness: React.FC = () => {
  const ctx = useDashboard();
  const toolVis = useToolVisibility();
  // Capture into the module-level holders from a post-commit effect, NOT the
  // render body: ctxRef/toolVisRef are module-level objects (not useRef()
  // values), so writing them during render trips the `react-hooks/immutability`
  // rule (it fires on any module-level mutation inside a render function — see
  // tests/context/AuthContext.quizMonitorPrefs.test.tsx). getCtx()/getToolVis()
  // are read inside act() after the commit settles, so a post-commit write is
  // when the value is needed.
  useEffect(() => {
    ctxRef.current = ctx;
    toolVisRef.current = toolVis;
  });
  if (!ctx.activeDashboard) return null;
  return (
    <>
      {BYSTANDER_IDS.map((id) => (
        <BystanderProbe key={id} id={id} />
      ))}
      {ACTIONS_PROBE_IDS.map((id) => (
        <ActionsProbe key={id} id={id} />
      ))}
      {GLOBALSTYLE_PROBE_IDS.map((id) => (
        <GlobalStyleProbe key={id} id={id} />
      ))}
      {SELECTION_PROBE_IDS.map((id) => (
        <SelectionProbe key={id} id={id} widgetId={SELECTION_PROBE_WIDGET_ID} />
      ))}
      {RO_PROBE_IDS.map((id) => (
        <ReadOnlyProbe key={id} id={id} />
      ))}
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
    </>
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

    // (7) toggleToolVisibility — flip one tool's dock visibility through the
    // real context action. Post-F9 this action lives on ToolVisibilityContext
    // (captured via getToolVis()), NOT DashboardContext. 'clock' is a real
    // WidgetType (config/tools.ts); the harness seeds an empty dock, so the
    // toggle ADDS it — mutating visibleTools and dockItems, which are now in
    // the toolVisibilityValue useMemo deps (context/DashboardContext.tsx).
    // Because that value is a SEPARATE context, recreating it does NOT churn
    // DashboardContext's value identity, so the 5 bystander probes (which read
    // legacy useDashboard()) stay put — bystanderRenders drops to 0. The
    // shells likewise read the isolated canvas store and never re-render here.
    const toolToToggle: WidgetType = 'clock';
    const visibleBefore = getToolVis().visibleTools.includes(toolToToggle);
    rec.start();
    act(() => {
      getToolVis().toggleToolVisibility(toolToToggle);
    });
    await settle();
    rec.record('toggleToolVisibility');
    // Behavioral validity: the toggle actually flipped the tool's visibility,
    // so toolVisibilityValue genuinely churned (not a no-op).
    expect(getToolVis().visibleTools.includes(toolToToggle)).toBe(
      !visibleBefore
    );

    // (8) setGlobalStyle — positive control for the GlobalStyleProbe. Change the
    // active board's font family through the real context action. The seed
    // widgets carry no globalStyle, so this writes
    // {...DEFAULT_GLOBAL_STYLE, fontFamily:'handwritten'} → a brand-new style
    // object identity → every useGlobalStyle() selector consumer re-renders.
    // This proves the probe is wired to the real mechanism (so the 0-deltas on
    // bringToFront5/drag.release below are genuine isolation, not a dead probe),
    // while the action-only ActionsProbe consumers stay put (the actions surface
    // never changes identity).
    rec.start();
    act(() => {
      getCtx().setGlobalStyle({ fontFamily: 'handwritten' });
    });
    await settle();
    rec.record('setGlobalStyle');
    // Behavioral validity: the style change actually landed on the active board.
    expect(getCtx().activeDashboard?.globalStyle?.fontFamily).toBe(
      'handwritten'
    );

    // (9) selectOther — per-instance ISOLATION for the SelectionProbe. Select a
    // DIFFERENT widget (w-9) than the one the 5 probes are bound to (w-8). Each
    // probe reads `useIsWidgetSelected('w-8')`, which projects the boolean
    // `selectedWidgetId === 'w-8'`. Selecting w-9 leaves that boolean at `false`,
    // so the selector's Object.is cache bails and NONE of the probes re-render —
    // proof the per-instance selector isolates each widget's selection
    // subscription from unrelated selection changes (a raw `selectedWidgetId`
    // read would re-render every consumer here).
    rec.start();
    act(() => {
      getCtx().setSelectedWidgetId('w-9');
    });
    await settle();
    rec.record('selectOther');
    // Behavioral validity: the selection actually moved to w-9 (so the store
    // genuinely changed — this is not a no-op masquerading as isolation).
    expect(getCtx().selectedWidgetId).toBe('w-9');

    // (10) selectSelf — positive control for the SelectionProbe. Select w-8
    // itself, the id all 5 probes are bound to. The projected boolean flips
    // false→true, allocating a new snapshot for each probe, so all 5 re-render.
    // This live-instrument check makes the selectOther / bringToFront5 /
    // drag.release 0-deltas genuine isolation rather than a dead probe.
    rec.start();
    act(() => {
      getCtx().setSelectedWidgetId('w-8');
    });
    await settle();
    rec.record('selectSelf');
    // Behavioral validity: w-8 is now the selected widget.
    expect(getCtx().selectedWidgetId).toBe('w-8');

    // (11) loadReadOnlyBoard — positive control for the ReadOnlyProbe. Push a
    // fresh snapshot that ADDS a viewer-role board (linkedShareRole:'viewer',
    // linkedShareEnded falsy) alongside the existing board, then activate it via
    // the real loadDashboard action. The provider derives
    // isActiveBoardReadOnly = activeBoard.linkedShareRole === 'viewer' &&
    // !linkedShareEnded (DashboardContext.tsx ~4277) and publishes it to the
    // canvas store, so the active board flipping read-only changes the boolean
    // false→true → all 5 useIsActiveBoardReadOnly() probes re-render. This is a
    // clean push: a brand-new board id is accepted wholesale by the snapshot
    // handler (no surgical-merge for non-active boards). We deliberately set NO
    // `linkedShareId` — it isn't part of the read-only derivation, and including
    // it would arm the live-share subscribe effect (which calls
    // subscribeToSharedBoard, outside this harness's useFirestore mock surface).
    // The role alone is sufficient to flip the derived flag.
    const readOnlyBoard: Dashboard = {
      ...buildDashboard(buildWidgets()),
      id: 'perf-dash-ro',
      name: 'Perf Read-Only Board',
      linkedShareRole: 'viewer',
      linkedShareEnded: false,
    };
    rec.start();
    await pushSnapshot([
      buildDashboard(getCtx().activeDashboard?.widgets ?? []),
      readOnlyBoard,
    ]);
    act(() => {
      getCtx().loadDashboard('perf-dash-ro');
    });
    await settle();
    rec.record('loadReadOnlyBoard');
    // Behavioral validity: the active board is now the viewer board AND the
    // derived read-only flag is true (so the 5 RO-probe renders are a real
    // read-only transition, not noise).
    expect(getCtx().activeDashboard?.id).toBe('perf-dash-ro');
    expect(getCtx().isActiveBoardReadOnly).toBe(true);

    // The harness only asserts that metrics were produced — no duration
    // thresholds (CI machines vary; this must never be flaky).
    expect(metrics).toHaveLength(17);
    for (const m of metrics) {
      expect(m.commits).toBeGreaterThanOrEqual(0);
      expect(m.actualDurationMs).toBeGreaterThanOrEqual(0);
      expect(m.totalShellRenders).toBeGreaterThanOrEqual(0);
      expect(m.bystanderRenders).toBeGreaterThanOrEqual(0);
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

    // ── Bystander fan-out (the F9 'before' baseline) ──────────────────────
    const metricFor = (scenario: string): ScenarioMetric => {
      const m = metrics.find((x) => x.scenario === scenario);
      if (!m) throw new Error(`scenario ${scenario} not recorded`);
      return m;
    };

    // SANITY: the BYSTANDER probe specifically is wired correctly — a real
    // DashboardContext change (addWidget mutates dashboards/activeDashboard →
    // contextValue identity) re-renders the legacy `useDashboard()` consumers.
    // Post-migration only the bystander probes churn on addWidget; the
    // actions/globalStyle probes do NOT (they read mount-stable surfaces). If
    // this bystander delta were 0, the probe isn't subscribed to the churning
    // context and every other bystander reading is worthless.
    const sanityAddWidgetProbeDelta = metricFor('addWidget').bystanderRenders;
    expect(sanityAddWidgetProbeDelta).toBeGreaterThan(0);

    // PRIMARY (post-F9): tool visibility lives on its own context, so toggling
    // a tool recreates ONLY toolVisibilityValue — DashboardContext's value
    // identity is untouched. The 5 bystander probes read legacy useDashboard()
    // (the DashboardContext value), so NONE of them re-render: bystanderRenders
    // is 0 and the per-probe breakdown is empty. This is the F9 win the harness
    // exists to prove. The sanity check above (addWidget DOES churn the probes)
    // confirms the instrument still detects real DashboardContext fan-out, so a
    // 0 here is a genuine isolation result, not a dead probe.
    const toggle = metricFor('toggleToolVisibility');
    expect(toggle.bystanderRenders).toBe(0);
    expect(toggle.bystanderRendersById).toEqual({});
    // The toggle must NOT have re-rendered any widget shell — shells read the
    // isolated canvas store, not the tool-visibility context, so the
    // tool-visibility churn is invisible to them too.
    expect(shellDiff('toggleToolVisibility')).toEqual([]);

    // ── Migration contrast-proof (the win this slice delivers) ────────────
    // The 5 ActionsProbe consumers model a MIGRATED content component: they
    // read the mount-stable `useDashboardActions()` surface instead of the
    // churning legacy `useDashboard()` value. The contrast below is the proof
    // that swapping that one hook eliminates the per-op fan-out.

    // SANITY: the actions probes are actually mounted and counted — they each
    // render at least once during mount15. Without this, a 0 delta on the hot
    // scenarios could just mean the probe never mounted (a dead instrument).
    expect(
      Object.keys(metricFor('mount15').actionsProbeRendersById)
    ).toHaveLength(5);

    // bringToFront5: each of the 5 pointer-downs raises a widget →
    // setDashboards → new activeDashboard identity → the big contextValue memo
    // recreates → every legacy useDashboard() consumer re-renders. The legacy
    // bystander probes therefore churn (5 probes × 5 raises = 25), while the
    // migrated actions probes stay at 0 — their actions object identity is
    // fixed for the provider's lifetime, so the raises are invisible to them.
    const bringToFront = metricFor('bringToFront5');
    expect(bringToFront.bystanderRenders).toBe(25);
    expect(bringToFront.actionsProbeRenders).toBe(0);
    expect(bringToFront.actionsProbeRendersById).toEqual({});

    // drag.release: the pointer-up commits the moved widget → setDashboards →
    // new activeDashboard identity → one contextValue recreation → the 5 legacy
    // bystanders each re-render once (5), while the 5 migrated actions probes
    // stay at 0. Same fan-out, silenced by the migration.
    const dragRelease = metricFor('drag.release');
    expect(dragRelease.bystanderRenders).toBe(5);
    expect(dragRelease.actionsProbeRenders).toBe(0);
    expect(dragRelease.actionsProbeRendersById).toEqual({});

    // ── Selector-isolation proof (the win this slice delivers) ────────────
    // The 5 GlobalStyleProbe consumers read the active board's `globalStyle`
    // via the mount-stable `useGlobalStyle()` selector. A discrete widget op
    // spreads a new board + widgets array but never touches the nested
    // `globalStyle` object, so the selector's Object.is cache bails and these
    // probes do NOT re-render on those ops — while a real setGlobalStyle change
    // fires all 5. The contrast is the proof the selector isolates style
    // consumers from the per-op fan-out.

    // SANITY: the globalStyle probes are actually mounted and counted — they
    // each render at least once during mount15. Without this, a 0 delta on the
    // hot scenarios could just mean the probe never mounted (a dead instrument).
    expect(
      Object.keys(metricFor('mount15').globalStyleProbeRendersById)
    ).toHaveLength(5);

    // bringToFront5 / drag.release: each raise/commit spreads a new board +
    // widgets array but leaves the nested `globalStyle` reference untouched, so
    // the useGlobalStyle() selector's Object.is cache bails — the 5 globalStyle
    // probes never re-render. (Contrast: the legacy bystanders churn 25 and 5
    // on these same ops above.)
    expect(metricFor('bringToFront5').globalStyleProbeRenders).toBe(0);
    expect(metricFor('drag.release').globalStyleProbeRenders).toBe(0);

    // POSITIVE CONTROL: a real setGlobalStyle change allocates a new style
    // object identity → all 5 globalStyle probes re-render, while the
    // action-only ActionsProbe consumers stay at 0 (the actions surface never
    // changes identity). This is the live-instrument check that makes the two
    // 0-deltas above genuine isolation rather than a dead probe.
    const setStyle = metricFor('setGlobalStyle');
    expect(setStyle.globalStyleProbeRenders).toBe(5);
    expect(setStyle.actionsProbeRenders).toBe(0);

    // ── Per-instance selection-isolation proof (the win this slice delivers) ─
    // The 5 SelectionProbe consumers each read `useIsWidgetSelected('w-8')` — a
    // per-instance selector projecting `selectedWidgetId === 'w-8'`. Because no
    // scenario touches w-8's selected-ness, selecting any OTHER widget leaves the
    // projected boolean false and the selector's Object.is cache bails; only
    // selecting w-8 itself flips it and fires all 5.

    // SANITY: the selection probes are actually mounted and counted — they each
    // render at least once during mount15. Without this, a 0 delta on the
    // isolation scenarios could just mean the probe never mounted (a dead
    // instrument), so the per-instance claim would be vacuous.
    expect(
      Object.keys(metricFor('mount15').selectionProbeRendersById)
    ).toHaveLength(5);

    // selectOther: selecting a DIFFERENT widget (w-9) than the bound id (w-8)
    // leaves `selectedWidgetId === 'w-8'` at false → the per-instance selector's
    // Object.is cache bails → 0 of the 5 w-8 probes re-render. This is the
    // headline per-instance isolation result: a raw `selectedWidgetId` read would
    // re-render every consumer here.
    expect(metricFor('selectOther').selectionProbeRenders).toBe(0);

    // selectSelf: positive control — selecting w-8 itself flips the projected
    // boolean false→true, so all 5 bound probes re-render. This live-instrument
    // check proves the selectOther / bringToFront5 / drag.release 0-deltas are
    // genuine isolation, not a dead probe.
    expect(metricFor('selectSelf').selectionProbeRenders).toBe(5);

    // ISOLATION: a discrete widget op never touches selection of the bound w-8 —
    // bringToFront5 raises w-1..w-6 (and selects each in turn, but never w-8) and
    // drag.release commits w-5 — so the w-8 probes stay at 0 on both. (If
    // SelectionProbe read the RAW `selectedWidgetId` off the churning legacy
    // value instead, both of these would be > 0 — that's the falsifiability
    // pivot documented in the test header.)
    expect(metricFor('bringToFront5').selectionProbeRenders).toBe(0);
    expect(metricFor('drag.release').selectionProbeRenders).toBe(0);

    // ── Read-only-board isolation proof (the win this slice delivers) ────────
    // The 5 ReadOnlyProbe consumers each read `useIsActiveBoardReadOnly()` — a
    // selector over the active board's read-only boolean. A discrete widget op
    // never touches the `linkedShareRole`/`linkedShareEnded` the flag is derived
    // from, so the boolean is unchanged and the selector's Object.is cache bails.

    // SANITY: the read-only probes are actually mounted and counted — they each
    // render at least once during mount15. Without this, a 0 delta on the
    // isolation scenarios could just mean the probe never mounted (a dead
    // instrument).
    expect(
      Object.keys(metricFor('mount15').readOnlyProbeRendersById)
    ).toHaveLength(5);

    // ISOLATION: bringToFront5 / drag.release spread a new board + widgets array
    // but never touch read-only-ness, so the derived boolean is unchanged and the
    // 5 read-only probes stay at 0 on both.
    expect(metricFor('bringToFront5').readOnlyProbeRenders).toBe(0);
    expect(metricFor('drag.release').readOnlyProbeRenders).toBe(0);

    // ORTHOGONALITY: a selection change (selectOther/selectSelf) flips
    // selectedWidgetId but never touches read-only-ness, so the read-only probes
    // stay at 0 — making explicit that the two new selectors subscribe to
    // independent slice fields (the converse of loadReadOnlyBoard, which fires the
    // ReadOnlyProbe while leaving the w-8-bound SelectionProbe untouched).
    expect(metricFor('selectOther').readOnlyProbeRenders).toBe(0);
    expect(metricFor('selectSelf').readOnlyProbeRenders).toBe(0);

    // POSITIVE CONTROL: activating a genuinely read-only board flips
    // isActiveBoardReadOnly false→true → all 5 read-only probes re-render, while
    // the action-only ActionsProbe consumers stay at 0 (the actions surface never
    // changes identity). This live-instrument check makes the two 0-deltas above
    // genuine isolation rather than a dead probe.
    const loadReadOnly = metricFor('loadReadOnlyBoard');
    expect(loadReadOnly.readOnlyProbeRenders).toBe(5);
    expect(loadReadOnly.actionsProbeRenders).toBe(0);
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
          'bystanderRenders/bystanderRendersById count how many of the 5 ' +
          'legacy-DashboardContext consumer probes re-rendered per scenario — ' +
          'this is the F9 context-split ruler: post-split the ' +
          'toggleToolVisibility scenario reads 0 (tool visibility lives on its ' +
          'own ToolVisibilityContext, so a toggle no longer churns the ' +
          'DashboardContext value the probes subscribe to), while addWidget ' +
          'still churns the probes (sanity that the instrument is live). ' +
          'actionsProbeRenders/actionsProbeRendersById count how many of the 5 ' +
          'ActionsProbe consumers (which read the mount-stable ' +
          'useDashboardActions() surface, modeling a MIGRATED content ' +
          'component) re-rendered per scenario — the migration contrast-proof: ' +
          'on bringToFront5 and drag.release the actions probes read 0 while ' +
          'the legacy bystander probes read 25 and 5 respectively, showing the ' +
          'useDashboard()→useDashboardActions() swap isolates content consumers ' +
          'from the per-op DashboardContext fan-out. ' +
          'globalStyleProbeRenders/globalStyleProbeRendersById count how many of ' +
          'the 5 GlobalStyleProbe consumers (which read the active board ' +
          'globalStyle via the mount-stable useGlobalStyle() selector) ' +
          're-rendered per scenario — the selector-isolation proof: on ' +
          'bringToFront5 and drag.release they read 0 (those ops never touch the ' +
          'nested globalStyle object, so the selector Object.is cache bails), ' +
          'while the setGlobalStyle scenario reads 5 (a real style change ' +
          'allocates a new style identity) with the actions probes still at 0. ' +
          'selectionProbeRenders/selectionProbeRendersById count how many of the ' +
          '5 SelectionProbe consumers (each reading useIsWidgetSelected("w-8"), a ' +
          'PER-INSTANCE selector projecting selectedWidgetId === id) re-rendered ' +
          'per scenario — the per-instance isolation proof: on selectOther (a ' +
          'DIFFERENT widget is selected), bringToFront5, and drag.release they ' +
          'read 0 (the w-8 boolean stays false, so the selector Object.is cache ' +
          'bails), while selectSelf (w-8 itself is selected) reads 5. ' +
          'readOnlyProbeRenders/readOnlyProbeRendersById count how many of the 5 ' +
          'ReadOnlyProbe consumers (each reading useIsActiveBoardReadOnly(), a ' +
          'selector over the active board read-only boolean) re-rendered per ' +
          'scenario — the read-only isolation proof: on bringToFront5 and ' +
          'drag.release they read 0 (those ops never touch the linkedShareRole the ' +
          'flag is derived from), while loadReadOnlyBoard (a viewer-role board is ' +
          'pushed and activated) reads 5 with the actions probes still at 0. ' +
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
