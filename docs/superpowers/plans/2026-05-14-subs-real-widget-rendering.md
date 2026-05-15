# Substitute Real Widget Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder widget grid in `SubBoardScreen` with the teacher's real widgets — rendered through the existing widget pipeline, at their actual positions/sizes, on the teacher's actual background — so a sub sees the same board the teacher prepared.

**Architecture:** Mount a thin `SubsDashboardProvider` inside `SubBoardScreen` that satisfies `DashboardContextValue` from the substitute share's `initialState` snapshot. `isActiveBoardReadOnly` is forced to `true` (so existing drag/resize/close/flip guards in `DraggableWindow` and `DashboardContext` auto-lock the board), but the provider's own `updateWidget` is a permissive local-state mutator (so widget content — timer Start, lunch +/-, scoreboard, music play/pause — still works without ever writing to Firestore). Reset deep-clones from the immutable `initialState` snapshot and bumps a `resetKey` to re-mount widgets so component-local state is thrown away too. A second tiny context, `SubsControlContext`, exposes `resetWidgets()` to the existing `SubProfileToolbar`. Rendering goes through `WidgetRenderer` + `DraggableWindow` exactly as on the teacher side.

**Tech Stack:** React 19, TypeScript, existing `DashboardContext` / `WidgetRenderer` / `DraggableWindow` infrastructure. No new dependencies.

---

## Context the engineer must read first

You will likely have zero context on `/subs`. Read these before starting:

1. **`components/subs/SubBoardScreen.tsx`** — current placeholder implementation. The file header comment promises "Phase 6 polish" that never landed; ignore it, you are that polish.
2. **`hooks/useSubstituteShares.ts`** — `useSubstituteShare(shareId)` returns the `SubstituteShareDoc`. The doc carries the teacher's widget snapshot in two places: the `widgets` field (inherited from `Dashboard`) and `initialState` (declared in `SubstituteShareFields`, intended for resets). Both are written from the same source at creation time and never mutated thereafter.
3. **`context/DashboardContextValue.ts`** — the full `DashboardContextValue` interface (~80 fields). You will stub most of these.
4. **`context/DashboardContext.tsx`** lines 3286-3290 — how `isActiveBoardReadOnly` and `isActiveBoardReadOnlyRef` work in the canonical provider. The ref-gated mutation pattern is what we are deliberately NOT copying in the sub provider, because we want local content interaction.
5. **`components/common/DraggableWindow.tsx`** line 514 — `isLocked = (widget.isLocked ?? false) || isActiveBoardReadOnly`. Confirms that flipping the provider's flag to `true` automatically hides drag/resize/close affordances for every widget.
6. **`components/widgets/WidgetRenderer.tsx`** — the renderer expects a `DashboardContextValue` to be in scope (it does not itself call `useDashboard()` directly, but the `DraggableWindow` and individual widgets do). The session-related props (`isLive`, `students`, `startSession`, etc.) need values; pass disabled-stub equivalents.
7. **`types.ts`** lines 5018-5050 — `SubstituteShareFields` and `SubstituteShareDriveGrant`.

**Out of scope for this plan** (do not implement, do not refactor):

- Viewport scale-to-fit (rendering the teacher's projector-sized board onto a Chromebook). Sub may need to scroll. Track as a follow-up if needed.
- Annotations / spotlight / zoom (these stay disabled).
- Sidebar / Dock for subs (intentionally absent — the `SubProfileToolbar` is the only chrome).
- New widget types or any widget-level changes.
- Roster / Drive integration changes.
- Changing the share creation or expiration path.

## File structure

### New files

- `components/subs/SubsControlContext.tsx` — tiny `{ resetWidgets: () => void }` context, exposed only to `SubProfileToolbar`-shaped consumers inside the sub board screen.
- `components/subs/SubsDashboardProvider.tsx` — provides a full `DashboardContextValue` synthesised from a `SubstituteShareDoc`. Internal state: `widgets` and `resetKey`. Mounts the `SubsControlContext.Provider` alongside `DashboardContext.Provider`.
- `components/subs/SubBoardCanvas.tsx` — renders each widget via `WidgetRenderer` at absolute coordinates, on the teacher's background. Reads everything it needs from `useDashboard()`.
- `tests/components/subs/SubsDashboardProvider.test.tsx` — unit tests for the provider (initial state, local updateWidget, reset, read-only flag).

### Modified files

- `components/subs/SubBoardScreen.tsx` — drop `PLACEHOLDER_TILES`, `FrozenWidgetTile`, `WidgetPreview`, and every `*Preview` component (~280 LOC removed). Mount the new provider + canvas. Inherit teacher background. Wire toolbar's `onReset` to `SubsControlContext.resetWidgets`.

### Files to read but not modify

- `context/DashboardContextValue.ts`, `context/DashboardContext.tsx`, `components/widgets/WidgetRenderer.tsx`, `components/common/DraggableWindow.tsx`, `hooks/useSubstituteShares.ts`, `types.ts`.

Each file has one clear responsibility. The provider and the canvas are deliberately split so the canvas can be unit-rendered against a fake provider in future tests without recomputing state shape.

---

## Task 1: Create `SubsControlContext`

**Files:**
- Create: `components/subs/SubsControlContext.tsx`

This is a one-method context. Keeping it separate from `DashboardContext` avoids polluting the canonical interface with a "reset to initial state" verb that only makes sense for subs.

- [ ] **Step 1: Write the file**

```tsx
/**
 * SubsControlContext — surfaces sub-specific board controls (currently just
 * `resetWidgets`) to consumers inside SubBoardScreen. Kept separate from
 * DashboardContext because "reset board to host's snapshot" is a sub-only
 * verb and would have no meaning on the teacher side.
 */

import { createContext, useContext } from 'react';

export interface SubsControlContextValue {
  /**
   * Restore every widget on the board to its state at share-creation time
   * (the immutable `initialState` snapshot on the share doc) AND re-mount
   * every widget so any component-local state (timer running flags,
   * playback state, transient UI) is thrown away too.
   */
  resetWidgets: () => void;
}

export const SubsControlContext = createContext<SubsControlContextValue | null>(
  null
);

export function useSubsControl(): SubsControlContextValue {
  const ctx = useContext(SubsControlContext);
  if (!ctx) {
    throw new Error(
      'useSubsControl must be used inside <SubsDashboardProvider />'
    );
  }
  return ctx;
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm run type-check`
Expected: passes (no usages yet, just the type).

- [ ] **Step 3: Commit**

```bash
git add components/subs/SubsControlContext.tsx
git commit -m "feat(subs): add SubsControlContext for reset wiring"
```

---

## Task 2: Create `SubsDashboardProvider`

**Files:**
- Create: `components/subs/SubsDashboardProvider.tsx`

This is the load-bearing file. It must satisfy the full `DashboardContextValue` interface. Most fields are no-op stubs; the ones that matter are `activeDashboard`, `dashboards`, `isActiveBoardReadOnly`, `updateWidget`, `bringToFront`, plus a synthesised `driveService` (null) and live-session defaults (no live session for subs).

The provider takes a fully-loaded `SubstituteShareDoc` (the caller — `SubBoardScreen` — handles loading/error/expired states before mounting this).

- [ ] **Step 1: Write the file**

```tsx
/**
 * SubsDashboardProvider — supplies a DashboardContextValue scoped to a
 * substitute share doc so the existing widget renderer (WidgetRenderer →
 * DraggableWindow → individual widget components) can be reused inside the
 * /subs portal.
 *
 * Design:
 * - `activeDashboard` is synthesised from the share's `initialState` (kept
 *   immutable) plus a separate `widgets` slice of local React state that
 *   mutates as the sub interacts with widget content (timer Start, lunch
 *   +/-, etc.). All edits stay local — no Firestore writes ever happen
 *   from this provider.
 * - `isActiveBoardReadOnly: true` forces DraggableWindow to render every
 *   widget as locked (no drag/resize/close/flip chrome). The canonical
 *   DashboardProvider gates its own `updateWidget` on the same flag; we
 *   intentionally do not — our updateWidget is the local-state mutator
 *   that powers content interaction.
 * - `resetWidgets()` deep-clones from `initialState` and bumps `resetKey`,
 *   exposed separately via SubsControlContext so the existing
 *   SubProfileToolbar.onReset prop has somewhere to point.
 * - Every other action on DashboardContextValue is a no-op. Subs never see
 *   a sidebar, dock, roster picker, sharing UI, or annotations.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { DashboardContext } from '@/context/DashboardContext';
import type {
  DashboardContextValue,
  PendingShareImport,
  SharedBoardImportMode,
  SubstituteShareInput,
  SubstituteShareResult,
  AnnotationState,
} from '@/context/DashboardContextValue';
import type {
  Dashboard,
  WidgetData,
  WidgetType,
  Toast,
  GradeFilter,
  GlobalStyle,
  DashboardSettings,
  InternalToolType,
  AddWidgetOverrides,
  ClassRoster,
} from '@/types';
import {
  SubsControlContext,
  type SubsControlContextValue,
} from './SubsControlContext';
import type { SubstituteShareDoc } from '@/hooks/useSubstituteShares';

interface SubsDashboardProviderProps {
  share: SubstituteShareDoc;
  children: React.ReactNode;
  /**
   * Bumped on reset — pass into SubBoardCanvas as `key` to force re-mount
   * of every widget (clears component-local state like Timer's `running`).
   */
  onResetKeyChange?: (key: number) => void;
}

const NOOP = () => {};
const NOOP_ASYNC = async () => {};
const NOOP_ASYNC_STRING = async () => '';
const EMPTY_ARRAY: never[] = [];
const DEFAULT_ANNOTATION_STATE: AnnotationState = {
  objects: [],
  color: '#ef4444',
  width: 4,
  customColors: [],
};

/**
 * Deep-clone a widget array. The substitute share's `initialState` is the
 * single source of truth for "the board before the sub touched it" and
 * must never be mutated — every reset deep-clones from it.
 */
function cloneInitialWidgets(source: WidgetData[]): WidgetData[] {
  return source.map((w) => ({
    ...w,
    config: w.config ? structuredClone(w.config) : w.config,
  }));
}

export const SubsDashboardProvider: React.FC<SubsDashboardProviderProps> = ({
  share,
  children,
  onResetKeyChange,
}) => {
  // The snapshot we reset to. `initialState` is the canonical reset target;
  // fall back to `widgets` for legacy shares that pre-date the field.
  const initialSnapshot = useMemo<WidgetData[]>(
    () => share.initialState ?? share.widgets ?? [],
    [share.initialState, share.widgets]
  );
  const initialSnapshotRef = useRef(initialSnapshot);
  initialSnapshotRef.current = initialSnapshot;

  const [widgets, setWidgets] = useState<WidgetData[]>(() =>
    cloneInitialWidgets(initialSnapshot)
  );
  const [resetKey, setResetKey] = useState(0);

  // When the share doc swaps (extremely unusual — the share id changes
  // when the sub picks a different teacher), reseed local state from the
  // new snapshot. Done with the "adjusting state while rendering" pattern
  // rather than useEffect, per CLAUDE.md guidance.
  const [prevShareId, setPrevShareId] = useState(share.shareId);
  if (prevShareId !== share.shareId) {
    setPrevShareId(share.shareId);
    setWidgets(cloneInitialWidgets(initialSnapshot));
    setResetKey((k) => k + 1);
  }

  const resetWidgets = useCallback(() => {
    setWidgets(cloneInitialWidgets(initialSnapshotRef.current));
    setResetKey((k) => {
      const next = k + 1;
      onResetKeyChange?.(next);
      return next;
    });
  }, [onResetKeyChange]);

  // Local-only widget mutation. Deliberately does NOT honour the
  // isActiveBoardReadOnly flag — that flag exists to lock chrome (drag /
  // resize / close), not to lock widget content. Without this, every
  // counter / score / timer / lunch-count interaction would silently
  // no-op for the sub.
  const updateWidget = useCallback(
    (id: string, updates: Partial<WidgetData>) => {
      setWidgets((prev) =>
        prev.map((w) => (w.id === id ? { ...w, ...updates } : w))
      );
    },
    []
  );

  const bringToFront = useCallback(
    (id: string) => {
      // Subs can still tap to focus a widget visually. We bump z but keep
      // the change local (no Firestore write). Skipped silently if the
      // widget is already on top.
      setWidgets((prev) => {
        const maxZ = prev.reduce((acc, w) => Math.max(acc, w.z ?? 0), 0);
        return prev.map((w) =>
          w.id === id && (w.z ?? 0) < maxZ ? { ...w, z: maxZ + 1 } : w
        );
      });
    },
    []
  );

  const activeDashboard = useMemo<Dashboard>(
    () => ({
      id: share.shareId,
      name: share.name ?? 'Substitute board',
      background: share.background ?? '',
      widgets,
      createdAt: share.createdAt ?? Date.now(),
      // Inherit any teacher-side display settings the share carried. The
      // canonical Dashboard type allows partial / undefined here.
      settings: share.settings,
      globalStyle: share.globalStyle,
      folders: share.folders ?? [],
      libraryOrder: share.libraryOrder ?? [],
    }),
    [
      share.shareId,
      share.name,
      share.background,
      share.createdAt,
      share.settings,
      share.globalStyle,
      share.folders,
      share.libraryOrder,
      widgets,
    ]
  );

  const value = useMemo<DashboardContextValue>(() => {
    return {
      // === Real implementations (the four that matter) =====================
      driveService: null,
      dashboards: [activeDashboard],
      activeDashboard,
      isActiveBoardReadOnly: true,
      updateWidget,
      bringToFront,

      // === Safe defaults =================================================
      toasts: EMPTY_ARRAY as Toast[],
      visibleTools: EMPTY_ARRAY as (WidgetType | InternalToolType)[],
      dockItems: EMPTY_ARRAY as DashboardContextValue['dockItems'],
      loading: false,
      isSaving: false,
      gradeFilter: 'all' as GradeFilter,
      libraryOrder: EMPTY_ARRAY as (WidgetType | InternalToolType)[],
      annotationActive: false,
      annotationState: DEFAULT_ANNOTATION_STATE,
      zoom: 1,
      selectedWidgetId: null,
      selectedWidgetIds: EMPTY_ARRAY as string[],
      groupBuildMode: false,
      pendingShareId: null,
      pendingShareImport: null as PendingShareImport | null,
      pendingQuizShareId: null,
      pendingAssignmentShareId: null,
      pendingVideoActivityShareId: null,
      pendingAssignmentSetupId: null,
      pendingAssignmentEditId: null,
      rosters: EMPTY_ARRAY as ClassRoster[],
      activeRosterId: null,

      // === No-op actions =================================================
      // Toasts go nowhere — subs cannot see them and never trigger flows
      // that would produce them.
      addToast: NOOP,
      removeToast: NOOP,

      // Dashboard CRUD — subs never create / delete / rename / load /
      // reorder dashboards.
      createNewDashboard: NOOP_ASYNC,
      saveCurrentDashboard: NOOP_ASYNC,
      deleteDashboard: NOOP_ASYNC,
      duplicateDashboard: NOOP_ASYNC,
      renameDashboard: NOOP_ASYNC,
      loadDashboard: NOOP,
      reorderDashboards: NOOP_ASYNC,
      setDefaultDashboard: NOOP,
      resetDockToDefaults: NOOP,
      setGradeFilter: NOOP,

      // Widget CRUD — disallowed for subs. The read-only flag already
      // blocks the canonical provider; we no-op here so a misbehaving
      // widget that calls these directly cannot mutate the board.
      addWidget: NOOP as (
        type: WidgetType,
        overrides?: AddWidgetOverrides
      ) => void,
      addWidgets: NOOP,
      removeWidget: NOOP,
      duplicateWidget: NOOP,
      removeWidgets: NOOP,
      clearAllStickers: NOOP,
      clearAllWidgets: NOOP,
      moveWidgetLayer: NOOP,
      minimizeAllWidgets: NOOP,
      restoreAllWidgets: NOOP,
      deleteAllWidgets: NOOP,
      resetWidgetSize: NOOP,
      setBackground: NOOP,
      setGlobalStyle: NOOP as (style: Partial<GlobalStyle>) => void,
      toggleToolVisibility: NOOP,
      setAllToolsVisibility: NOOP,
      reorderTools: NOOP,
      reorderLibrary: NOOP,
      reorderDockItems: NOOP,
      updateDashboardSettings: NOOP as (
        settings: Partial<DashboardSettings>
      ) => void,
      updateDashboard: NOOP as (updates: Partial<Dashboard>) => void,
      updateWidgets: NOOP,

      // Annotation / zoom / selection — disabled for subs.
      openAnnotation: NOOP,
      closeAnnotation: NOOP,
      updateAnnotationState: NOOP,
      addAnnotationObject: NOOP,
      undoAnnotation: NOOP,
      clearAnnotation: NOOP,
      setZoom: NOOP,
      setSelectedWidgetId: NOOP,
      setSelectedWidgetIds: NOOP as (
        ids: string[] | ((prev: string[]) => string[])
      ) => void,
      groupWidgets: NOOP,
      ungroupWidgets: NOOP,
      setGroupBuildMode: NOOP,

      // Sharing — subs never originate shares of their own.
      shareDashboard: NOOP_ASYNC_STRING as (
        dashboard: Dashboard,
        intendedMode?: SharedBoardImportMode,
        plcId?: string
      ) => Promise<string>,
      shareSubstituteDashboard: (async () => ({
        shareId: '',
        driveGrants: null,
      })) as (input: SubstituteShareInput) => Promise<SubstituteShareResult>,
      loadSharedDashboard: async () => null,
      clearPendingShare: NOOP,
      cancelPendingShareImport: NOOP,
      importSharedBoard: NOOP_ASYNC as (
        mode: SharedBoardImportMode
      ) => Promise<void>,
      stopSharingDashboard: NOOP_ASYNC,
      clearPendingQuizShare: NOOP,
      setPendingQuizShareId: NOOP,
      clearPendingAssignmentShare: NOOP,
      setPendingAssignmentShareId: NOOP,
      clearPendingVideoActivityShare: NOOP,
      setPendingVideoActivityShareId: NOOP,
      clearPendingAssignmentSetup: NOOP,
      setPendingAssignmentSetup: NOOP,
      clearPendingAssignmentEdit: NOOP,
      setPendingAssignmentEdit: NOOP,

      // Roster CRUD — subs read rosters via /subs UI separately, not
      // through this context.
      addRoster: (async () => '') as DashboardContextValue['addRoster'],
      updateRoster: NOOP_ASYNC,
      deleteRoster: NOOP_ASYNC,
      setActiveRoster: NOOP,
      setAbsentStudents: NOOP_ASYNC,

      // Folder CRUD — subs don't see the dock so this never runs.
      addFolder: NOOP,
      createFolderWithItems: NOOP,
      renameFolder: NOOP,
      deleteFolder: NOOP,
      addItemToFolder: NOOP,
      removeItemFromFolder: NOOP,
      moveItemOutOfFolder: NOOP,
      reorderFolderItems: NOOP,
    };
  }, [activeDashboard, updateWidget, bringToFront]);

  const controlValue = useMemo<SubsControlContextValue>(
    () => ({ resetWidgets }),
    [resetWidgets]
  );

  return (
    <DashboardContext.Provider value={value}>
      <SubsControlContext.Provider value={controlValue}>
        {/*
          resetKey is exposed via a `data-reset-key` attribute so SubBoardCanvas
          can read it off the DOM if needed — but the canonical channel is the
          onResetKeyChange callback, which lets the parent thread it through as
          a React `key` prop. Belt-and-suspenders.
        */}
        <div data-reset-key={resetKey} className="contents">
          {children}
        </div>
      </SubsControlContext.Provider>
    </DashboardContext.Provider>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm run type-check`
Expected: passes. If `DashboardContextValue` fields drift in the future (someone adds a new method), this will be the file that fails to compile — which is what we want.

- [ ] **Step 3: Lint**

Run: `pnpm run lint`
Expected: passes. The `EMPTY_ARRAY as never[]` and a few `NOOP as ...` casts are needed to make the never-typed empty arrays / no-op functions assignable to their named slots. If ESLint flags a specific cast, narrow the types rather than disabling the rule.

- [ ] **Step 4: Commit**

```bash
git add components/subs/SubsDashboardProvider.tsx
git commit -m "feat(subs): SubsDashboardProvider — DashboardContext shim over a substitute share"
```

---

## Task 3: Create `SubBoardCanvas`

**Files:**
- Create: `components/subs/SubBoardCanvas.tsx`

The canvas reads `activeDashboard` from `useDashboard()` and renders each widget through `WidgetRenderer`. It mounts the teacher's background as the surface beneath. Widgets are absolute-positioned by their `x` / `y` / `w` / `h` — `DraggableWindow` already supports absolute layout when those values are present on the `widget` prop.

A subtle bit: `WidgetRenderer` expects a bag of live-session props (`isLive`, `students`, `startSession`, etc.). For subs we pass no-op equivalents because we never start a live session from the sub view. `isLive` is always false; the LiveControl button is gated on `canAccessFeature('live-session')` AND `isLive` (see `WidgetRenderer.tsx:327`), and subs typically lack that feature permission, so the button never renders — but we still must supply the props.

- [ ] **Step 1: Write the file**

```tsx
/**
 * SubBoardCanvas — renders the substitute board's widgets at their real
 * positions through the existing WidgetRenderer pipeline. Reads everything
 * from useDashboard(), which is supplied by SubsDashboardProvider.
 *
 * Layout: an absolutely-positioned canvas the size of the teacher's
 * original board. Sub may scroll if their viewport is smaller (viewport-
 * fit is a planned follow-up, intentionally not in this PR).
 */

import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetRenderer } from '@/components/widgets/WidgetRenderer';
import {
  isExternalBackground,
  isCustomBackground,
  getCustomBackgroundStyle,
} from '@/utils/backgrounds';
import {
  DEFAULT_GLOBAL_STYLE,
  type LiveStudent,
  type LiveSession,
  type WidgetConfig,
  type WidgetType,
} from '@/types';

const EMPTY_STUDENTS: LiveStudent[] = [];

const NO_LIVE_SESSION = {
  isLive: false,
  students: EMPTY_STUDENTS,
  sessionCode: undefined,
  isGlobalFrozen: false,
  updateSessionConfig: async (_config: WidgetConfig) => {},
  updateSessionBackground: async (_bg: string) => {},
  startSession: async (
    _widgetId: string,
    _widgetType: WidgetType,
    _config?: WidgetConfig,
    _background?: string
  ): Promise<LiveSession> => {
    throw new Error('Live sessions are disabled in the substitute view');
  },
  endSession: async () => {},
  removeStudent: async () => {},
  toggleFreezeStudent: async () => {},
  toggleGlobalFreeze: async () => {},
};

interface SubBoardCanvasProps {
  /**
   * Bumped on reset by SubsDashboardProvider so passing it as `key` on
   * the widget wrapper re-mounts every widget — wiping component-local
   * state (Timer running flags, Music playing state, etc.) along with
   * the widgets-array reset.
   */
  resetKey: number;
}

export const SubBoardCanvas: React.FC<SubBoardCanvasProps> = ({ resetKey }) => {
  const dashboard = useDashboard();
  const active = dashboard.activeDashboard;
  if (!active) return null;

  const background = active.background ?? '';
  const isCustom = isCustomBackground(background);
  const isExternal = isExternalBackground(background);
  const customBgStyle = isCustom
    ? getCustomBackgroundStyle(background)
    : undefined;

  const globalStyle = active.globalStyle ?? DEFAULT_GLOBAL_STYLE;

  // Compute canvas bounds from the rightmost/bottommost widget edges so
  // the absolute-positioned widgets all land inside a sized container.
  const canvasW = active.widgets.reduce(
    (acc, w) => Math.max(acc, (w.x ?? 0) + (w.w ?? 0)),
    1200
  );
  const canvasH = active.widgets.reduce(
    (acc, w) => Math.max(acc, (w.y ?? 0) + (w.h ?? 0)),
    800
  );

  return (
    <div
      className="absolute inset-0 overflow-auto"
      style={
        isCustom
          ? customBgStyle
          : isExternal
            ? { background }
            : undefined
      }
      // Background-class case: when neither isCustom nor isExternal, the
      // teacher's background is a Tailwind className string. Apply it
      // directly so utility-class backgrounds still work.
      data-background-class={!isCustom && !isExternal ? background : undefined}
    >
      <div
        className={
          !isCustom && !isExternal && background
            ? background
            : undefined
        }
        style={{
          position: 'relative',
          width: canvasW,
          height: canvasH,
          minWidth: '100%',
          minHeight: '100%',
        }}
      >
        {active.widgets.map((widget) => (
          <div
            key={`${widget.id}-${resetKey}`}
            style={{
              position: 'absolute',
              left: widget.x,
              top: widget.y,
              width: widget.w,
              height: widget.h,
              zIndex: widget.z ?? 1,
            }}
          >
            <WidgetRenderer
              widget={widget}
              isLive={NO_LIVE_SESSION.isLive}
              students={NO_LIVE_SESSION.students}
              sessionCode={NO_LIVE_SESSION.sessionCode}
              isGlobalFrozen={NO_LIVE_SESSION.isGlobalFrozen}
              updateSessionConfig={NO_LIVE_SESSION.updateSessionConfig}
              updateSessionBackground={NO_LIVE_SESSION.updateSessionBackground}
              startSession={NO_LIVE_SESSION.startSession}
              endSession={NO_LIVE_SESSION.endSession}
              removeStudent={NO_LIVE_SESSION.removeStudent}
              toggleFreezeStudent={NO_LIVE_SESSION.toggleFreezeStudent}
              toggleGlobalFreeze={NO_LIVE_SESSION.toggleGlobalFreeze}
              updateWidget={dashboard.updateWidget}
              removeWidget={dashboard.removeWidget}
              duplicateWidget={dashboard.duplicateWidget}
              bringToFront={dashboard.bringToFront}
              addToast={dashboard.addToast}
              globalStyle={globalStyle}
              dashboardBackground={background}
              dashboardSettings={active.settings}
              updateDashboardSettings={dashboard.updateDashboardSettings}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm run type-check`
Expected: passes. If the `WidgetRendererProps` interface drifts, this file will be the failure surface — fix the call site here (and audit whether the new prop has a meaningful sub-side equivalent or should be a no-op).

- [ ] **Step 3: Commit**

```bash
git add components/subs/SubBoardCanvas.tsx
git commit -m "feat(subs): SubBoardCanvas — render real widgets at real coords through WidgetRenderer"
```

---

## Task 4: Rewrite `SubBoardScreen` body

**Files:**
- Modify: `components/subs/SubBoardScreen.tsx`

Drop the entire `PLACEHOLDER_TILES` array, `FrozenWidgetTile`, `WidgetPreview`, and all the `*Preview` components (≈280 LOC removed). Keep:

- The header comment (rewritten — no more "Phase 6 polish" promise).
- The share-fetch (`useSubstituteShare`), the expiration tick `useEffect`, the auto-bounce-back-to-directory `useEffect`.
- The `SubProfileToolbar` with `teacherName` / `boardName` / `expiresAt` / `onReset` / `onBackToDirectory` / `onChangeBuilding`.
- The corner "Substitute view — widgets are locked in place" pill.
- The `ExpiredOrErrorPanel` (used unchanged).

Add: a `SubsDashboardProvider` wrapping a `SubBoardCanvas`. The `onReset` toolbar prop now points at `useSubsControl().resetWidgets`. The hardcoded radial-gradient background goes away — the canvas paints the teacher's background.

- [ ] **Step 1: Replace the file contents**

Read the current file (`components/subs/SubBoardScreen.tsx`) for reference, then overwrite with:

```tsx
/**
 * SubBoardScreen — frozen, read-only-but-content-interactive view of the
 * teacher's real board for a substitute.
 *
 * The share doc carries the teacher's widget snapshot in
 * `initialState`/`widgets`. SubsDashboardProvider supplies a
 * DashboardContextValue scoped to that snapshot, with
 * `isActiveBoardReadOnly: true` so DraggableWindow auto-locks every
 * widget's drag/resize/close chrome. Widget content interaction (timer
 * Start, lunch +/-, scoreboard, music play/pause) stays local — the
 * provider's updateWidget mutates local React state only and never
 * writes to Firestore.
 *
 * Reset throws away both the local widgets-array changes (via
 * SubsControlContext.resetWidgets) AND component-local state (via a
 * resetKey bump on every widget mount).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { SubProfileToolbar } from './SubProfileToolbar';
import { teacherCardAccent, teacherInitials } from './subsView';
import { useSubstituteShare } from '@/hooks/useSubstituteShares';
import { SubsDashboardProvider } from './SubsDashboardProvider';
import { useSubsControl } from './SubsControlContext';
import { SubBoardCanvas } from './SubBoardCanvas';
import type { SubstituteShareDoc } from '@/hooks/useSubstituteShares';

interface SubBoardScreenProps {
  shareId: string;
  onBackToDirectory: () => void;
  onChangeBuilding: () => void;
}

export const SubBoardScreen: React.FC<SubBoardScreenProps> = ({
  shareId,
  onBackToDirectory,
  onChangeBuilding,
}) => {
  const { share, loading, error } = useSubstituteShare(shareId);
  const [expired, setExpired] = useState(false);

  // Imperatively check expiration on a 60-second tick so an idle sub
  // still gets bounced back when the share lapses. Same pattern as
  // before — Date.now() lives inside the effect, not the render path.
  const expiresAt = share?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const check = () => {
      if (expiresAt <= Date.now()) setExpired(true);
    };
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (!expired) return;
    const id = window.setTimeout(onBackToDirectory, 1500);
    return () => window.clearTimeout(id);
  }, [expired, onBackToDirectory]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/60 bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!!error || !share || expired) {
    return (
      <div className="min-h-screen bg-slate-900">
        <ExpiredOrErrorPanel
          message={
            expired ? 'This share has expired.' : (error ?? 'Share not found.')
          }
          onBack={onBackToDirectory}
        />
      </div>
    );
  }

  return (
    <SubsDashboardProvider share={share}>
      <SubBoardScreenContent
        share={share}
        onBackToDirectory={onBackToDirectory}
        onChangeBuilding={onChangeBuilding}
      />
    </SubsDashboardProvider>
  );
};

interface SubBoardScreenContentProps {
  share: SubstituteShareDoc;
  onBackToDirectory: () => void;
  onChangeBuilding: () => void;
}

const SubBoardScreenContent: React.FC<SubBoardScreenContentProps> = ({
  share,
  onBackToDirectory,
  onChangeBuilding,
}) => {
  const { resetWidgets } = useSubsControl();
  // Mirror the provider's resetKey locally so SubBoardCanvas re-mounts
  // widgets on reset. The provider calls onResetKeyChange but we drive
  // it from here so a SubBoardCanvas key bump is guaranteed.
  const [resetKey, setResetKey] = useState(0);

  const teacherName = share.originalAuthorName ?? 'Teacher';
  const boardName = share.name ?? 'Untitled board';
  const accent = useMemo(
    () => teacherCardAccent(share.shareId),
    [share.shareId]
  );
  const initials = useMemo(() => teacherInitials(teacherName), [teacherName]);

  const handleReset = () => {
    resetWidgets();
    setResetKey((k) => k + 1);
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-slate-900">
      <SubProfileToolbar
        teacherName={teacherName}
        teacherInitials={initials}
        accentColor={accent}
        boardName={boardName}
        expiresAt={share.expiresAt ?? 0}
        onReset={handleReset}
        onBackToDirectory={onBackToDirectory}
        onChangeBuilding={onChangeBuilding}
      />

      <div className="fixed top-4 right-4 z-40 hidden md:flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-xl border border-white/15 px-3 py-1.5 text-[11px] text-white/80 pointer-events-none">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Substitute view — widgets are locked in place
      </div>

      <main className="absolute inset-0 pt-20">
        <SubBoardCanvas resetKey={resetKey} />
      </main>
    </div>
  );
};

const ExpiredOrErrorPanel: React.FC<{
  message: string;
  onBack: () => void;
}> = ({ message, onBack }) => (
  <main className="min-h-screen flex items-center justify-center px-8">
    <div className="max-w-md text-center text-white">
      <h2 className="text-2xl font-bold tracking-tight">{message}</h2>
      <p className="mt-2 text-sm text-white/60">
        Returning you to the teacher directory.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 text-xs font-bold text-white transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to directory
      </button>
    </div>
  </main>
);
```

- [ ] **Step 2: Type-check**

Run: `pnpm run type-check`
Expected: passes.

- [ ] **Step 3: Lint**

Run: `pnpm run lint`
Expected: passes. The unused-import lint will catch any of `Play`, `RotateCcw`, `Shuffle`, `Volume2`, `X`, `useEffect`-from-the-old-clock-preview etc. that the old file pulled in for placeholder previews — they should all be gone.

- [ ] **Step 4: Commit**

```bash
git add components/subs/SubBoardScreen.tsx
git commit -m "feat(subs): render teacher's real board through SubsDashboardProvider + SubBoardCanvas"
```

---

## Task 5: Tests — `SubsDashboardProvider`

**Files:**
- Create: `tests/components/subs/SubsDashboardProvider.test.tsx`

Four cases worth pinning down with tests, in priority order. Skip everything else — the rest of the surface area is no-op stubs that aren't worth asserting.

1. `isActiveBoardReadOnly` is exposed as `true`.
2. `updateWidget` mutates local state visible via `activeDashboard.widgets`.
3. `resetWidgets()` (from `useSubsControl`) restores `activeDashboard.widgets` to the share's `initialState` snapshot.
4. Replacing the `share` prop with a different `shareId` reseeds widget state.

- [ ] **Step 1: Write the failing test**

Use a tiny probe component that reads from `useDashboard()` and `useSubsControl()` and exposes the values for assertion.

```tsx
import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { SubsDashboardProvider } from '@/components/subs/SubsDashboardProvider';
import { useSubsControl } from '@/components/subs/SubsControlContext';
import { useDashboard } from '@/context/useDashboard';
import type { SubstituteShareDoc } from '@/hooks/useSubstituteShares';
import type { WidgetData } from '@/types';

function makeShare(overrides: Partial<SubstituteShareDoc> = {}): SubstituteShareDoc {
  const widgets: WidgetData[] = [
    {
      id: 'w1',
      type: 'lunch-count',
      x: 0,
      y: 0,
      w: 200,
      h: 200,
      z: 1,
      config: { counts: { hot: 5, cold: 2, home: 1 } },
    } as unknown as WidgetData,
  ];
  return {
    shareId: 'share-1',
    name: 'Test board',
    background: '',
    widgets,
    initialState: widgets,
    createdAt: 0,
    intendedMode: 'substitute',
    expiresAt: Date.now() + 60_000,
    buildingId: 'oms',
    folders: [],
    libraryOrder: [],
    ...overrides,
  } as SubstituteShareDoc;
}

interface ProbeHandle {
  isReadOnly: boolean;
  widgets: WidgetData[];
  update: (id: string, updates: Partial<WidgetData>) => void;
  reset: () => void;
}

function Probe({ onReady }: { onReady: (h: ProbeHandle) => void }) {
  const dash = useDashboard();
  const ctrl = useSubsControl();
  React.useEffect(() => {
    onReady({
      isReadOnly: dash.isActiveBoardReadOnly,
      widgets: dash.activeDashboard?.widgets ?? [],
      update: dash.updateWidget,
      reset: ctrl.resetWidgets,
    });
  });
  return null;
}

describe('SubsDashboardProvider', () => {
  it('exposes isActiveBoardReadOnly: true so DraggableWindow auto-locks', () => {
    let handle: ProbeHandle | null = null;
    render(
      <SubsDashboardProvider share={makeShare()}>
        <Probe onReady={(h) => (handle = h)} />
      </SubsDashboardProvider>
    );
    expect(handle!.isReadOnly).toBe(true);
  });

  it('updateWidget mutates local state but does not touch Firestore', () => {
    let handle: ProbeHandle | null = null;
    render(
      <SubsDashboardProvider share={makeShare()}>
        <Probe onReady={(h) => (handle = h)} />
      </SubsDashboardProvider>
    );
    act(() => {
      handle!.update('w1', { config: { counts: { hot: 99, cold: 0, home: 0 } } } as Partial<WidgetData>);
    });
    expect((handle!.widgets[0].config as { counts: Record<string, number> }).counts.hot).toBe(99);
  });

  it('resetWidgets restores the initialState snapshot', () => {
    let handle: ProbeHandle | null = null;
    render(
      <SubsDashboardProvider share={makeShare()}>
        <Probe onReady={(h) => (handle = h)} />
      </SubsDashboardProvider>
    );
    act(() => {
      handle!.update('w1', { config: { counts: { hot: 99, cold: 0, home: 0 } } } as Partial<WidgetData>);
    });
    expect((handle!.widgets[0].config as { counts: Record<string, number> }).counts.hot).toBe(99);
    act(() => {
      handle!.reset();
    });
    expect((handle!.widgets[0].config as { counts: Record<string, number> }).counts.hot).toBe(5);
  });

  it('reseeds local state when shareId changes', () => {
    let handle: ProbeHandle | null = null;
    const initial = makeShare({ shareId: 'a' });
    const { rerender } = render(
      <SubsDashboardProvider share={initial}>
        <Probe onReady={(h) => (handle = h)} />
      </SubsDashboardProvider>
    );
    act(() => {
      handle!.update('w1', { config: { counts: { hot: 99, cold: 0, home: 0 } } } as Partial<WidgetData>);
    });
    expect((handle!.widgets[0].config as { counts: Record<string, number> }).counts.hot).toBe(99);
    rerender(
      <SubsDashboardProvider share={makeShare({ shareId: 'b' })}>
        <Probe onReady={(h) => (handle = h)} />
      </SubsDashboardProvider>
    );
    expect((handle!.widgets[0].config as { counts: Record<string, number> }).counts.hot).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail before the provider works**

Run: `pnpm run test -- tests/components/subs/SubsDashboardProvider.test.tsx`

If you wrote the provider in Task 2 already, these should pass. If they fail, fix the provider — the tests are correct, not the implementation. Common gotchas:
- Forgot to deep-clone in `cloneInitialWidgets` (later reset shares a reference, mutation leaks).
- Used `useEffect` to reseed on share change instead of the "adjusting state while rendering" pattern (causes one stale render).
- Hooked `resetWidgets` to `widgets` instead of the ref to `initialSnapshot` (loses the original after first edit).

- [ ] **Step 3: Run tests to verify pass**

Run: `pnpm run test -- tests/components/subs/SubsDashboardProvider.test.tsx`
Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add tests/components/subs/SubsDashboardProvider.test.tsx
git commit -m "test(subs): cover SubsDashboardProvider read-only, local update, reset, reseed"
```

---

## Task 6: Manual verification

**Files:** none modified — this is a verification pass.

The unit tests cover the provider, but they don't exercise the actual widget pipeline. Verify by running the app.

- [ ] **Step 1: Start the dev server**

Run: `pnpm run dev`
Expected: server up on port 3000.

- [ ] **Step 2: Set up a real substitute share to test against**

Sign in as a teacher with at least one dashboard containing varied widgets — at minimum: Clock, Timer, Lunch Count, Scoreboard, Sub Notes (Text widget), Music. From the Sidebar share menu, create a substitute share with at least 1 hour of expiry.

- [ ] **Step 3: Open the share as a sub**

In a private/incognito window, sign in as a `@orono.k12.mn.us` account that is **not** the share host. Navigate to `/subs` → pick the building → pick the teacher card.

- [ ] **Step 4: Validate visual fidelity**

Confirm:
- Background matches the teacher's dashboard background (color, gradient, or image — not the radial-gradient placeholder).
- Widgets render at their actual sizes and positions (not in a hand-rolled 4×3 grid).
- Widget content shows real config (real schedule items, real scoreboard team names, real Sub Notes text — NOT "Ava / Marcus / Priya", NOT "Quiet Focus Mix", NOT the placeholder copy).
- Each widget shows the teacher's actual title in the header.

- [ ] **Step 5: Validate read-only chrome**

Confirm:
- No drag affordance when hovering a widget's title bar.
- No resize handle in the bottom-right corner.
- No close button.
- No gear icon to flip to settings.
- Hovering still shows the "locked" cursor / visual treatment that the existing `widget.isLocked` path produces.

- [ ] **Step 6: Validate content interaction**

Confirm:
- Timer Start button starts the timer; Reset on the timer resets it.
- Lunch Count +/- buttons mutate the count.
- Scoreboard +/- buttons change the score.
- Music play/pause toggles state.
- Changes persist within the session (refreshing the sub's `/subs` board would re-fetch the share doc — that's expected; local changes are local).

- [ ] **Step 7: Validate the Reset action**

Click the hamburger toolbar → Reset. Confirm:
- Lunch counts, scores, timer state — all snap back to whatever the teacher had at share-creation time.
- No flicker / no widgets disappearing during reset.
- Reset can be invoked multiple times in a row without error.

- [ ] **Step 8: Validate Firestore writes**

Open the Firebase console for this environment. Confirm:
- No writes are issued to `/users/{teacherUid}/dashboards/...` during the sub session.
- No writes are issued to `/shared_boards/{shareId}` during the sub session.
- (Writes WILL happen when the teacher edits — that's expected. We're verifying the SUB doesn't write.)

- [ ] **Step 9: Validate expiration bounce**

Either wait for natural expiration or temporarily set a very short expiry. Confirm the sub gets bounced to the directory within ~60s of expiry.

- [ ] **Step 10: Confirm dev console is clean**

Open dev tools. Confirm no React warnings (key warnings, missing context, etc.) and no Firestore permission-denied errors.

---

## Task 7: Self-review and ship

- [ ] **Step 1: Re-read the diff**

Run: `git diff main...HEAD`
Look for: leftover console.log, stale TODO comments, unused imports, the word "Phase 6" anywhere (it should be gone from `SubBoardScreen.tsx`).

- [ ] **Step 2: Validate**

Run: `pnpm run validate`
Expected: type-check + lint + format-check + tests all pass.

- [ ] **Step 3: Push and open PR**

Per memory: `dev-paul → main must use regular merge commit, never squash`. Feature branch → `dev-paul` can squash.

```bash
git push -u origin HEAD
gh pr create --base dev-paul --title "feat(subs): render teacher's real board in /subs portal" --body "$(cat <<'EOF'
## Summary
- Replaces the hand-rolled placeholder widget grid in /subs with the teacher's real widgets, rendered through the existing WidgetRenderer pipeline at real positions/sizes with the real background.
- Introduces SubsDashboardProvider: a thin DashboardContext shim over a SubstituteShareDoc with isActiveBoardReadOnly forced true so DraggableWindow auto-locks chrome.
- Widget content stays interactive (timer, lunch count, scoreboard, music) via a permissive local-state updateWidget that never writes to Firestore.
- Reset deep-clones from the immutable initialState snapshot AND bumps a resetKey to wipe component-local state too.

## Test plan
- [ ] pnpm run validate
- [ ] Sub session shows the teacher's real background and widget layout
- [ ] Drag / resize / close / flip are all disabled in the sub view
- [ ] Timer / lunch-count / scoreboard / music interactions work locally
- [ ] Reset restores the teacher's initial state
- [ ] No Firestore writes from the sub session
- [ ] Expiration bounce still works
EOF
)"
```

---

## Self-review checklist (run before committing Task 7)

- **Spec coverage:** Did every item in the goal ("teacher's real widgets, real positions, real background, locked chrome, interactive content, working reset, no Firestore writes") land in a task? ✓ Tasks 2-6.
- **Placeholder scan:** No `TODO`, `FIXME`, `Phase N`, `placeholder`, `TBD`, `mock` in the final diff. The Step 1 of Task 7 enforces this.
- **Type consistency:** `SubsControlContextValue.resetWidgets` (Task 1) matches the call in `SubBoardScreenContent` (Task 4) and the test (Task 5). `SubBoardCanvasProps.resetKey` (Task 3) matches the prop site (Task 4). `SubstituteShareDoc` field names used in `SubsDashboardProvider` (`initialState`, `widgets`, `name`, `background`, `createdAt`, `settings`, `globalStyle`, `folders`, `libraryOrder`, `originalAuthorName`, `expiresAt`, `shareId`) match `hooks/useSubstituteShares.ts` and `types.ts`.

If any of the above fails, fix inline and re-run validate.
