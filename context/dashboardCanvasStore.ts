/**
 * Canvas hot-path store + stable actions surface for DashboardProvider.
 *
 * `DashboardContext` exposes one value object (~100 properties) whose
 * identity changes on every provider commit, so every `useDashboard()`
 * consumer re-renders on every state mutation. The canvas hot path
 * (BoardCanvas → WidgetRenderer → DraggableWindow) only needs a 6-field
 * state slice plus a fixed set of action callbacks, so this module exposes
 * two narrower, mount-stable surfaces:
 *
 * - `DashboardActionsContext`: an actions object whose identity NEVER
 *   changes after mount (thin wrappers delegating to a latest-ref inside
 *   the provider), so action-only consumers never re-render.
 * - `DashboardCanvasStoreContext`: a `useSyncExternalStore`-backed mirror
 *   of the 6 hot state fields. The provider assigns the slice during its
 *   own render body and notifies subscribers post-commit, so subscribers
 *   always read commit-consistent values. Selector hooks bail out via
 *   `Object.is`, collapsing e.g. a selection change from "all shells
 *   re-render" to "only the two affected shells re-render".
 *
 * The store is a derived MIRROR of DashboardProvider state — the provider
 * remains the single source of truth; nothing writes to the store except
 * the provider's render-body mirror. The render-body mirror assumes
 * DashboardProvider's subtree never renders inside a transition
 * (startTransition/useDeferredValue); if concurrent rendering of this
 * subtree is ever introduced, move the mirror into the same useLayoutEffect
 * that notifies, since a discarded render would otherwise leave
 * never-committed values readable via `getState`.
 *
 * Back-compat: every hook here falls back to the legacy DashboardContext
 * when the new contexts are absent, because DashboardContext has alternate
 * value hosts that never mount these providers (SubsDashboardProvider,
 * StudentContexts, and unit tests mounting `DashboardContext.Provider`
 * directly). The fallback reads via React 19's conditional `use` — NOT an
 * unconditional useContext, which would subscribe every store-mode
 * component to the churning legacy value and pierce memo() on every
 * provider commit. In fallback mode consumers subscribe to the full legacy
 * context — exactly their pre-refactor behavior in those hosts.
 *
 * Listener/snapshot mechanics modeled on `components/common/modalStore.ts`.
 */

import {
  createContext,
  use,
  useCallback,
  useContext,
  useRef,
  useSyncExternalStore,
} from 'react';
import type { Dashboard, GlobalStyle, TourLayoutKeyframe } from '@/types';
import { DEFAULT_GLOBAL_STYLE } from '@/types';
import {
  DashboardContext,
  type DashboardContextValue,
} from './DashboardContextValue';

/**
 * The narrow state slice the canvas hot path subscribes to. Mirrored from
 * DashboardProvider on every provider render via `setStateFromRender`.
 */
export interface DashboardCanvasState {
  activeDashboard: Dashboard | null;
  selectedWidgetId: string | null;
  selectedWidgetIds: string[];
  groupBuildMode: boolean;
  zoom: number;
  isActiveBoardReadOnly: boolean;
}

/**
 * Minimal external-store contract for the canvas hot slice.
 *
 * `setStateFromRender` and `notify` are internal — only DashboardProvider
 * calls them (assignment during render, notification post-commit).
 */
export interface DashboardCanvasStore {
  getState: () => DashboardCanvasState;
  subscribe: (listener: () => void) => () => void;
  /**
   * Internal: provider render-body mirror. Keeps the previous state OBJECT
   * identity when all 6 fields are `Object.is`-equal (so `getSnapshot`
   * stays referentially stable across unrelated provider commits). MUST
   * NOT call listeners — it runs during render.
   */
  setStateFromRender: (next: DashboardCanvasState) => void;
  /** Internal: provider post-commit notifier. */
  notify: () => void;
}

export function createDashboardCanvasStore(
  initial: DashboardCanvasState
): DashboardCanvasStore {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setStateFromRender: (next) => {
      // Field-wise Object.is so untouched slices keep object identity.
      // `selectedWidgetIds` compares by reference — the provider replaces
      // the array on change.
      if (
        Object.is(state.activeDashboard, next.activeDashboard) &&
        Object.is(state.selectedWidgetId, next.selectedWidgetId) &&
        Object.is(state.selectedWidgetIds, next.selectedWidgetIds) &&
        Object.is(state.groupBuildMode, next.groupBuildMode) &&
        Object.is(state.zoom, next.zoom) &&
        Object.is(state.isActiveBoardReadOnly, next.isActiveBoardReadOnly)
      ) {
        return;
      }
      state = next;
    },
    notify: () => {
      for (const listener of listeners) listener();
    },
  };
}

/**
 * The action subset the canvas hot path needs. A `Pick` of the legacy
 * context value, so a `DashboardContextValue` structurally satisfies it —
 * that's what makes the legacy fallback in `useDashboardActions` cast-free.
 */
export type DashboardActions = Pick<
  DashboardContextValue,
  | 'addWidget'
  | 'updateWidget'
  | 'updateWidgets'
  | 'removeWidget'
  | 'undoWidgets'
  | 'recordWidgetSnapshot'
  | 'duplicateWidget'
  | 'bringToFront'
  | 'moveWidgetLayer'
  | 'addToast'
  | 'resetWidgetSize'
  | 'deleteAllWidgets'
  | 'ungroupWidgets'
  | 'groupWidgets'
  | 'setSelectedWidgetId'
  | 'setSelectedWidgetIds'
  | 'setGroupBuildMode'
  | 'setZoom'
  | 'addTourWidget'
  | 'commitTourWidgets'
  | 'discardTourWidgets'
>;

/** Mount-stable actions surface provided by DashboardProvider. */
export const DashboardActionsContext = createContext<DashboardActions | null>(
  null
);

/** Canvas hot-slice store provided by DashboardProvider. */
export const DashboardCanvasStoreContext =
  createContext<DashboardCanvasStore | null>(null);

/** Picks the 6 hot fields off the full legacy context value (fallback mode). */
const sliceFromLegacy = (
  value: DashboardContextValue
): DashboardCanvasState => ({
  activeDashboard: value.activeDashboard,
  selectedWidgetId: value.selectedWidgetId,
  selectedWidgetIds: value.selectedWidgetIds,
  groupBuildMode: value.groupBuildMode,
  zoom: value.zoom,
  isActiveBoardReadOnly: value.isActiveBoardReadOnly,
});

/** No-op subscribe used when no store is mounted (legacy fallback hosts). */
const noopSubscribe = (): (() => void) => () => undefined;

/** Constant snapshot for the unused store slot in fallback mode. */
const getNullSnapshot = (): null => null;

/**
 * Actions hook for the canvas hot path. With DashboardProvider mounted the
 * returned object's identity never changes after mount; in alternate hosts
 * it falls back to the full legacy context value (which structurally
 * satisfies `DashboardActions`).
 */
export function useDashboardActions(): DashboardActions {
  const actions = useContext(DashboardActionsContext);
  if (actions) return actions;
  // Fallback hosts only. React 19's `use` may be called conditionally, and
  // that's load-bearing here: an unconditional useContext(DashboardContext)
  // would subscribe every hot-path component to the legacy value (a new
  // identity on every provider commit), and context updates pierce memo() —
  // defeating the whole point of the stable actions surface.
  const legacy = use(DashboardContext);
  if (!legacy)
    throw new Error('useDashboard must be used within DashboardProvider');
  return legacy;
}

/**
 * Selector hook over the canvas hot slice. With a store mounted, the
 * component re-renders ONLY when its selection changes (`Object.is`);
 * without one (subs/student/test hosts) it reads the slice off the legacy
 * context and re-renders with every legacy context change — exactly the
 * pre-refactor behavior there.
 *
 * Selectors MUST return primitives or identity-stable objects (fields of
 * the slice, not freshly-built objects/arrays): the cached snapshot only
 * dedupes `Object.is`-equal selections, so a selector that allocates a new
 * object each call would re-render on every notify and can trip
 * `useSyncExternalStore`'s render-loop guard.
 */
export function useDashboardCanvasSelector<T>(
  selector: (s: DashboardCanvasState) => T
): T {
  const store = useContext(DashboardCanvasStoreContext);

  // Cache the last selection so Object.is-equal results return the SAME
  // reference — useSyncExternalStore treats a changed snapshot reference
  // as "store changed" and would otherwise loop. getSnapshot is rebuilt
  // each render (closing over the freshest selector), which uSES supports
  // without re-subscribing; only `subscribe` identity drives resubscription.
  const lastSnapshotRef = useRef<{ value: T } | null>(null);

  // Always called (hook order); fed inert arguments in fallback mode.
  const subscribed = useSyncExternalStore<T | null>(
    store ? store.subscribe : noopSubscribe,
    store
      ? () => {
          const next = selector(store.getState());
          const cached = lastSnapshotRef.current;
          if (cached && Object.is(cached.value, next)) return cached.value;
          lastSnapshotRef.current = { value: next };
          return next;
        }
      : getNullSnapshot
  );

  if (store) return subscribed as T;
  // Fallback hosts only — conditional `use` (see useDashboardActions) so
  // store-mode components never subscribe to the churning legacy context.
  const legacy = use(DashboardContext);
  if (!legacy)
    throw new Error('useDashboard must be used within DashboardProvider');
  return selector(sliceFromLegacy(legacy));
}

/**
 * Selector hook for the active board's `globalStyle`. Reads it off the canvas
 * hot slice (`activeDashboard.globalStyle`) so consumers re-render ONLY when
 * the style object identity changes — NOT on unrelated widget ops. A discrete
 * op (updateWidget/bringToFront) spreads a new board object + widgets array but
 * never touches `globalStyle`, so the nested reference survives and the
 * selector's `Object.is` cache bails the re-render; only `setGlobalStyle`
 * allocates a new style object.
 *
 * The `?? DEFAULT_GLOBAL_STYLE` fallback MUST reference the module-level
 * singleton (a stable identity), never an inline object literal — a fresh
 * object each call would defeat the `Object.is` dedupe and trip
 * `useSyncExternalStore`'s render-loop guard (see `useDashboardCanvasSelector`).
 */
export function useGlobalStyle(): GlobalStyle {
  return useDashboardCanvasSelector(
    (s) => s.activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE
  );
}

/**
 * Selector hook for the active board's read-only flag. Returns a boolean, so
 * the `Object.is` snapshot cache bails on any commit that doesn't flip
 * read-only — a discrete widget op (updateWidget/bringToFront) never touches
 * the `linkedShareRole`/`linkedShareEnded` this is derived from, so consumers
 * never re-render on unrelated ops. Prefer this over reading
 * `isActiveBoardReadOnly` off the legacy `useDashboard()` value, which pierces
 * `memo()` on every provider commit.
 */
export function useIsActiveBoardReadOnly(): boolean {
  return useDashboardCanvasSelector((s) => s.isActiveBoardReadOnly);
}

/**
 * Per-instance selector for "is THIS widget the selected one". Returns the
 * boolean `selectedWidgetId === id`, NOT the raw `selectedWidgetId` — so a
 * given widget re-renders only when ITS OWN selected-ness flips, and selecting
 * a DIFFERENT widget leaves it untouched (the `Object.is` cache returns the
 * same `false`). Reading the raw `selectedWidgetId` instead would re-render
 * every consumer on any selection change. `id` is the widget's id.
 */
export function useIsWidgetSelected(id: string): boolean {
  return useDashboardCanvasSelector((s) => s.selectedWidgetId === id);
}

/**
 * Returns a STABLE function for event-handler-time reads of the canvas hot
 * slice (e.g. pointer-down group-sibling capture) without subscribing the
 * component to any of it.
 */
export function useDashboardCanvasStateGetter(): () => DashboardCanvasState {
  const store = useContext(DashboardCanvasStoreContext);

  // With a store the getter only depends on the store object (created once
  // per provider mount), so its identity is fixed — and the conditional
  // `use` (see useDashboardActions) keeps store-mode components from
  // subscribing to the churning legacy context at all. In fallback mode the
  // getter depends on the legacy value — those hosts re-render on every
  // legacy context change anyway, so a per-commit getter identity matches
  // today's behavior there.
  const legacyForFallback = store ? null : (use(DashboardContext) ?? null);

  return useCallback(() => {
    if (store) return store.getState();
    if (!legacyForFallback)
      throw new Error('useDashboard must be used within DashboardProvider');
    return sliceFromLegacy(legacyForFallback);
  }, [store, legacyForFallback]);
}

/** A live tour's temporary place for one of the teacher's widgets. */
export type TourLayoutOverride = Omit<TourLayoutKeyframe, 'slot'> & {
  aspectRatio?: number;
};

type TourOverrides = ReadonlyMap<string, TourLayoutOverride>;

let tourOverrides: TourOverrides = new Map();
const tourOverrideListeners = new Set<() => void>();

const sameOverride = (a?: TourLayoutOverride, b?: TourLayoutOverride) =>
  a === b ||
  (!!a &&
    !!b &&
    a.xProp === b.xProp &&
    a.yProp === b.yProp &&
    a.wProp === b.wProp &&
    a.hProp === b.hProp &&
    a.aspectRatio === b.aspectRatio);

/** Replaces every tour layout override; render-only, never persisted. */
export function setTourLayoutOverrides(
  next: ReadonlyMap<string, TourLayoutOverride>
): void {
  // Unchanged entries keep their identity so only moved widgets re-render.
  const merged = new Map<string, TourLayoutOverride>();
  let changed = next.size !== tourOverrides.size;
  for (const [id, value] of next) {
    const prev = tourOverrides.get(id);
    if (prev && sameOverride(prev, value)) merged.set(id, prev);
    else {
      merged.set(id, value);
      changed = true;
    }
  }
  if (!changed) return;
  tourOverrides = merged;
  tourOverrideListeners.forEach((l) => l());
}

/** Drops every tour layout override, putting the teacher's widgets back. */
export function clearTourLayoutOverrides(): void {
  setTourLayoutOverrides(new Map());
}

export const getTourLayoutOverrides = (): TourOverrides => tourOverrides;

const subscribeTourOverrides = (listener: () => void) => {
  tourOverrideListeners.add(listener);
  return () => {
    tourOverrideListeners.delete(listener);
  };
};

/** The tour's temporary layout for one widget, if a tour is moving it. */
export function useTourLayoutOverride(
  widgetId: string
): TourLayoutOverride | undefined {
  return useSyncExternalStore(
    subscribeTourOverrides,
    () => tourOverrides.get(widgetId),
    () => undefined
  );
}

/** A live tour's temporary stacking and restore for one widget; never persisted. */
export interface TourWidgetPatch {
  z?: number;
  restored?: true;
}

type TourPatches = ReadonlyMap<string, TourWidgetPatch>;

let tourPatches: TourPatches = new Map();
const tourPatchListeners = new Set<() => void>();

const samePatch = (a?: TourWidgetPatch, b?: TourWidgetPatch) =>
  a === b || (!!a && !!b && a.z === b.z && a.restored === b.restored);

// Widgets the teacher minimized during the tour; the tour stops un-minimizing them.
let releasedRestores = new Set<string>();

/** Replaces every tour widget patch; unchanged entries keep their identity. */
export function setTourWidgetPatches(
  next: ReadonlyMap<string, TourWidgetPatch>
): void {
  const merged = new Map<string, TourWidgetPatch>();
  let changed = next.size !== tourPatches.size;
  for (const [id, raw] of next) {
    const value =
      raw.restored && releasedRestores.has(id)
        ? { ...(raw.z === undefined ? {} : { z: raw.z }) }
        : raw;
    const prev = tourPatches.get(id);
    if (prev && samePatch(prev, value)) merged.set(id, prev);
    else {
      merged.set(id, value);
      changed = true;
    }
  }
  if (!changed) return;
  tourPatches = merged;
  tourPatchListeners.forEach((l) => l());
}

export function clearTourWidgetPatches(): void {
  releasedRestores = new Set();
  setTourWidgetPatches(new Map());
}

/** The teacher minimized a widget the tour had restored; let it stay minimized. */
export function releaseTourRestore(widgetId: string): void {
  if (!tourPatches.get(widgetId)?.restored) return;
  releasedRestores = new Set(releasedRestores).add(widgetId);
  setTourWidgetPatches(tourPatches);
}

export const getTourWidgetPatches = (): TourPatches => tourPatches;

const subscribeTourPatches = (listener: () => void) => {
  tourPatchListeners.add(listener);
  return () => {
    tourPatchListeners.delete(listener);
  };
};

/** The tour's temporary z or restore for one widget, if any. */
export function useTourWidgetPatch(
  widgetId: string
): TourWidgetPatch | undefined {
  return useSyncExternalStore(
    subscribeTourPatches,
    () => tourPatches.get(widgetId),
    () => undefined
  );
}
