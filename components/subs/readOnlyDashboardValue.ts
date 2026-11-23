import type {
  AnnotationState,
  DashboardContextValue,
  PendingShareImport,
  SubstituteShareInput,
  SubstituteShareResult,
} from '@/context/DashboardContextValue';
import type { Dashboard } from '@/types';

/** The parts a read-only dashboard really implements; everything else is a no-op. */
export type ReadOnlyDashboardParts = Pick<
  DashboardContextValue,
  | 'isActiveBoardReadOnly'
  | 'updateWidget'
  | 'bringToFront'
  | 'rosters'
  | 'activeRosterId'
  | 'setActiveRoster'
  | 'toasts'
  | 'addToast'
  | 'removeToast'
> & { activeDashboard: Dashboard };

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
  activeTool: 'pen',
  shapeFill: false,
};

/** A DashboardContextValue that never writes: the /subs board and the /subs tour layer use it. */
export function buildReadOnlyDashboardValue(
  parts: ReadOnlyDashboardParts
): DashboardContextValue {
  return {
    // === Real implementations (the four that matter) =====================
    driveService: null,
    collectionsApi: {
      collections: [],
      loading: false,
      error: null,
      createCollection: () => Promise.resolve(''),
      renameCollection: () => Promise.resolve(),
      moveCollection: () => Promise.resolve(),
      deleteCollection: () => Promise.resolve(),
      reorderSiblings: () => Promise.resolve(),
      setCollectionMetadata: () => Promise.resolve(),
      setCollectionLink: () => Promise.resolve(),
      setCollectionDefaultBoard: () => Promise.resolve(),
    },
    dashboards: [parts.activeDashboard],
    activeDashboard: parts.activeDashboard,
    isActiveBoardReadOnly: parts.isActiveBoardReadOnly,
    drawingWidgetsMigrating: new Set<string>(),
    updateWidget: parts.updateWidget,
    bringToFront: parts.bringToFront,

    // === Safe defaults =================================================
    toasts: parts.toasts,
    loading: false,
    isSaving: false,
    saveRetrying: false,
    gradeFilter: 'all',
    annotationActive: false,
    annotationState: DEFAULT_ANNOTATION_STATE,
    zoom: 1,
    selectedWidgetId: null,
    selectedWidgetIds: EMPTY_ARRAY,
    groupBuildMode: false,
    pendingShareId: null,
    pendingShareImport: null as PendingShareImport | null,
    pendingRubricShareId: null,
    clearPendingRubricShare: NOOP,
    pendingQuizShareId: null,
    pendingAssignmentShareId: null,
    pendingVideoActivityShareId: null,
    pendingAssignmentSetupId: null,
    pendingAssignmentEditId: null,
    pendingQuizReveal: null,
    rosters: parts.rosters,
    activeRosterId: parts.activeRosterId,

    // === No-op actions =================================================
    addToast: parts.addToast,
    removeToast: parts.removeToast,

    // Dashboard CRUD — subs never create / delete / rename / load /
    // reorder dashboards.
    createNewDashboard: NOOP_ASYNC as (
      name: string,
      data?: Dashboard
    ) => Promise<string | undefined>,
    saveCurrentDashboard: NOOP_ASYNC,
    deleteDashboard: NOOP_ASYNC,
    duplicateDashboard: NOOP_ASYNC,
    duplicateCollection: NOOP_ASYNC,
    renameDashboard: NOOP_ASYNC,
    loadDashboard: NOOP,
    reorderDashboards: NOOP_ASYNC,
    setDefaultDashboard: NOOP_ASYNC,
    moveBoardToCollection: NOOP_ASYNC,
    pinBoard: NOOP_ASYNC,
    unpinBoard: NOOP_ASYNC,
    markClaudeBoardSeen: NOOP_ASYNC,
    setActiveCollectionId: NOOP,
    setGradeFilter: NOOP,

    // Widget CRUD — disallowed for subs. The read-only flag already
    // blocks the canonical provider; we no-op here so a misbehaving
    // widget that calls these directly cannot mutate the board.
    addWidget: NOOP,
    addWidgets: NOOP,
    removeWidget: NOOP,
    duplicateWidget: NOOP,
    removeWidgets: NOOP,
    clearAllStickers: NOOP,
    clearAllWidgets: NOOP,
    undoWidgets: NOOP,
    redoWidgets: NOOP,
    recordWidgetSnapshot: NOOP,
    canUndo: false,
    canRedo: false,
    moveWidgetLayer: NOOP,
    minimizeAllWidgets: NOOP,
    restoreAllWidgets: NOOP,
    deleteAllWidgets: NOOP,
    resetWidgetSize: NOOP,
    setBackground: NOOP,
    setGlobalStyle: NOOP,
    updateDashboardSettings: NOOP,
    updateDashboard: NOOP,
    updateWidgets: NOOP,
    updateWidgetConfigsAcrossBoards: () => Promise.resolve(),

    // Annotation / zoom / selection — disabled for subs.
    openAnnotation: NOOP,
    closeAnnotation: NOOP,
    updateAnnotationState: () => false,
    addAnnotationObject: () => false,
    updateAnnotationObject: NOOP,
    removeAnnotationObject: NOOP,
    undoAnnotation: NOOP,
    redoAnnotation: NOOP,
    canUndoAnnotation: false,
    canRedoAnnotation: false,
    clearAnnotation: NOOP,
    reportAnnotationCanvasSize: NOOP,
    setZoom: NOOP,
    setSelectedWidgetId: NOOP,
    setSelectedWidgetIds: NOOP,
    groupWidgets: NOOP,
    ungroupWidgets: NOOP,
    setGroupBuildMode: NOOP,

    // Collection sharing — subs never originate collection shares.
    shareCollection: () => Promise.resolve(''),
    shareLinkedCollection: () => Promise.resolve(''),
    countLinkedBoardRemovals: () => 0,
    stopSharingCollection: () => Promise.resolve(),
    leaveSharedCollection: () => Promise.resolve(),
    countLinkedCollectionMoveRemovals: () => 0,
    shareSubstituteCollection: () => Promise.resolve(''),
    updateSubstituteCollectionShare: () => Promise.resolve(),
    extendSubstituteCollectionShare: () => Promise.resolve(),
    endSubstituteCollectionShare: () => Promise.resolve(),
    listSubstituteCollectionShares: () => Promise.resolve([]),
    loadSharedCollection: () =>
      Promise.resolve({
        ok: false as const,
        reason: 'not-found' as const,
      }),
    loadSharedCollectionBoards: () => Promise.resolve([]),
    importSharedCollection: () => Promise.resolve(null),
    pendingSharedCollectionId: null,
    setPendingSharedCollectionId: NOOP,
    clearPendingSharedCollection: NOOP,

    // Sharing — subs never originate shares of their own.
    shareDashboard: NOOP_ASYNC_STRING,
    shareSubstituteDashboard: (
      _input: SubstituteShareInput
    ): Promise<SubstituteShareResult> =>
      Promise.resolve({ shareId: '', driveGrants: null }),
    loadSharedDashboard: (_shareId: string): Promise<Dashboard | null> =>
      Promise.resolve(null),
    clearPendingShare: NOOP,
    cancelPendingShareImport: NOOP,
    importSharedBoard: NOOP_ASYNC,
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
    clearPendingQuizReveal: NOOP,
    setPendingQuizReveal: NOOP,

    // Roster CRUD — subs only read the shared rosters.
    addRoster: () => Promise.resolve(''),
    updateRoster: NOOP_ASYNC,
    deleteRoster: NOOP_ASYNC,
    setActiveRoster: parts.setActiveRoster,
    setAbsentStudents: NOOP_ASYNC,
    appendRosterGroups: NOOP_ASYNC,
  };
}
