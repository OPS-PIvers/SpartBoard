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
 * - `resetWidgets()` deep-clones from `initialState` back into local state,
 *   exposed via SubsControlContext so SubProfileToolbar.onReset has somewhere
 *   to point. The canvas key channel (`resetKey`) is owned by SubBoardScreen
 *   and driven directly from there.
 * - Every other action on DashboardContextValue is a no-op. Subs never see
 *   a sidebar, dock, roster picker, sharing UI, or annotations.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { DashboardContext } from '@/context/DashboardContextValue';
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
  InternalToolType,
  AddWidgetOverrides,
  ClassRoster,
  WidgetConfig,
  GridPosition,
} from '@/types';
import {
  SubsControlContext,
  type SubsControlContextValue,
} from './SubsControlContext';
import type { SubstituteShareDoc } from '@/hooks/useSubstituteShares';

interface SubsDashboardProviderProps {
  share: SubstituteShareDoc;
  children: React.ReactNode;
}

const NOOP = () => {
  /* noop */
};
const NOOP_ASYNC = (): Promise<void> => Promise.resolve();
const NOOP_ASYNC_STRING = (): Promise<string> => Promise.resolve('');
const EMPTY_ARRAY: never[] = [];
const DEFAULT_ANNOTATION_STATE: AnnotationState = {
  objects: [],
  color: '#ef4444',
  width: 4,
  customColors: [],
};

/**
 * Deep-clone a widget array so the substitute share's initialState is never
 * mutated. Uses structuredClone on the whole widget (not just config) so
 * nested fields like `annotation` are also independent copies.
 */
function cloneInitialWidgets(source: WidgetData[]): WidgetData[] {
  return structuredClone(source);
}

export const SubsDashboardProvider: React.FC<SubsDashboardProviderProps> = ({
  share,
  children,
}) => {
  // Freeze the reset target at mount time. Firestore onSnapshot may fire
  // new array references for the same logical data; useMemo would chase
  // those identities and silently retarget reset. Use lazy useState so
  // "reset to initial state" means "reset to the state when the sub
  // opened this board".
  const [initialSnapshot, setInitialSnapshot] = useState<WidgetData[]>(
    () => share.initialState ?? share.widgets ?? []
  );

  const [widgets, setWidgets] = useState<WidgetData[]>(() =>
    cloneInitialWidgets(initialSnapshot)
  );

  // Stable fallback for `createdAt` — captured once so `activeDashboard`
  // useMemo does not observe a new value each render when the share doc
  // lacks a `createdAt` field. Stored in state (lazy initializer) rather
  // than a ref so the purity lint rule is satisfied.
  const [fallbackCreatedAt] = useState<number>(() => Date.now());

  // When the share doc swaps (extremely unusual — the share id changes
  // when the sub picks a different teacher), reseed local state from the
  // new snapshot. Done with the "adjusting state while rendering" pattern
  // rather than useEffect, per CLAUDE.md guidance.
  const [prevShareId, setPrevShareId] = useState(share.shareId);
  if (prevShareId !== share.shareId) {
    const nextSnapshot = share.initialState ?? share.widgets ?? [];
    setPrevShareId(share.shareId);
    setInitialSnapshot(nextSnapshot);
    setWidgets(cloneInitialWidgets(nextSnapshot));
  }

  const resetWidgets = useCallback(() => {
    setWidgets(cloneInitialWidgets(initialSnapshot));
  }, [initialSnapshot]);

  // Local-only widget mutation. Deliberately does NOT honour the
  // isActiveBoardReadOnly flag — that flag exists to lock chrome (drag /
  // resize / close), not to lock widget content. Without this, every
  // counter / score / timer / lunch-count interaction would silently
  // no-op for the sub.
  //
  // Mirrors the canonical DashboardContext.updateWidget config-merge logic:
  // partial config updates are shallow-merged so widgets that call
  // updateWidget(id, { config: { someField: x } }) don't clobber other
  // config keys.
  const updateWidget = useCallback(
    (id: string, updates: Partial<WidgetData>) => {
      setWidgets((prev) =>
        prev.map((w) => {
          if (w.id !== id) return w;
          const mergedConfig = updates.config
            ? { ...w.config, ...updates.config }
            : w.config;
          return { ...w, ...updates, config: mergedConfig };
        })
      );
    },
    []
  );

  const bringToFront = useCallback((id: string) => {
    // Subs can still tap to focus a widget visually. We bump z but keep
    // the change local (no Firestore write). Skipped silently if the
    // widget is already on top.
    setWidgets((prev) => {
      const maxZ = prev.reduce((acc, w) => Math.max(acc, w.z ?? 0), 0);
      return prev.map((w) =>
        w.id === id && (w.z ?? 0) < maxZ ? { ...w, z: maxZ + 1 } : w
      );
    });
  }, []);

  const activeDashboard = useMemo<Dashboard>(
    () => ({
      id: share.shareId,
      name: share.name ?? 'Substitute board',
      background: share.background ?? '',
      widgets,
      createdAt: share.createdAt ?? fallbackCreatedAt,
      // Inherit any teacher-side display settings the share carried. The
      // canonical Dashboard type allows partial / undefined here.
      settings: share.settings,
      globalStyle: share.globalStyle,
      libraryOrder: share.libraryOrder ?? [],
    }),
    [
      share.shareId,
      share.name,
      share.background,
      share.createdAt,
      share.settings,
      share.globalStyle,
      share.libraryOrder,
      fallbackCreatedAt,
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
      createNewDashboard: NOOP_ASYNC as (
        name: string,
        data?: Dashboard
      ) => Promise<void>,
      saveCurrentDashboard: NOOP_ASYNC,
      deleteDashboard: NOOP_ASYNC as (id: string) => Promise<void>,
      duplicateDashboard: NOOP_ASYNC as (id: string) => Promise<void>,
      renameDashboard: NOOP_ASYNC as (
        id: string,
        name: string
      ) => Promise<void>,
      loadDashboard: NOOP,
      reorderDashboards: NOOP_ASYNC as (ids: string[]) => Promise<void>,
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
      addWidgets: NOOP as (
        widgetsToAdd: {
          type: WidgetType;
          config?: WidgetConfig;
          gridConfig?: GridPosition;
        }[]
      ) => void,
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
        settings: Partial<Dashboard['settings']>
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
      shareSubstituteDashboard: (
        _input: SubstituteShareInput
      ): Promise<SubstituteShareResult> =>
        Promise.resolve({ shareId: '', driveGrants: null }),
      loadSharedDashboard: (_shareId: string): Promise<Dashboard | null> =>
        Promise.resolve(null),
      clearPendingShare: NOOP,
      cancelPendingShareImport: NOOP,
      importSharedBoard: NOOP_ASYNC as (
        mode: SharedBoardImportMode
      ) => Promise<void>,
      stopSharingDashboard: NOOP_ASYNC as (
        dashboardId: string
      ) => Promise<void>,
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
      addRoster: () => Promise.resolve(''),
      updateRoster: NOOP_ASYNC as DashboardContextValue['updateRoster'],
      deleteRoster: NOOP_ASYNC as DashboardContextValue['deleteRoster'],
      setActiveRoster: NOOP,
      setAbsentStudents:
        NOOP_ASYNC as DashboardContextValue['setAbsentStudents'],

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
        {children}
      </SubsControlContext.Provider>
    </DashboardContext.Provider>
  );
};
