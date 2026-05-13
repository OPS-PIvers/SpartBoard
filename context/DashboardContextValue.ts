import { createContext } from 'react';
import {
  WidgetData,
  WidgetType,
  Toast,
  Dashboard,
  GradeFilter,
  ClassRoster,
  DockItem,
  InternalToolType,
  WidgetConfig,
  GlobalStyle,
  Student,
  AddWidgetOverrides,
  GridPosition,
  DrawableObject,
} from '../types';
import type { RosterCreateMeta } from '../hooks/useRosters';

/**
 * Mode applied to a shared-board import. Substitute shares are intentionally
 * NOT included here — they are never imported into a teacher's account; they
 * live only inside the `/subs` substitute portal. Code that handles import
 * flows can rely on this narrow union to stay correct without checking for
 * substitute as a special case.
 */
export type SharedBoardImportMode = 'copy' | 'synced' | 'view-only';

/**
 * Input to `shareSubstituteDashboard()` — the substitute share write path.
 * Distinct from `shareDashboard()` because the lifecycle differs: substitute
 * shares are frozen at creation, never mirror live edits, and don't tag the
 * local dashboard with a linkedShareId.
 */
export interface SubstituteShareInput {
  dashboard: Dashboard;
  /** ms epoch — host-chosen expiration. */
  expiresAt: number;
  /** Canonical building id (config/buildings.ts). */
  buildingId: string;
  /** Optional @orono.k12.mn.us emails the host wants to grant Drive access to. */
  subEmails?: string[];
}

export interface PendingShareImport {
  shareId: string;
  /** Snapshot fetched from the shared doc — populated when the picker opens. */
  preview: Dashboard | null;
  /**
   * Drive-backed shares are one-time exports and only support 'copy' mode.
   * Firestore-backed shares support all three modes.
   */
  driveBacked: boolean;
  /**
   * The mode the host chose when creating the link, if present on the share
   * doc. When set, the recipient flow shows a single confirmation dialog
   * instead of a 3-option picker.
   */
  intendedMode?: SharedBoardImportMode;
}

export interface AnnotationState {
  objects: DrawableObject[];
  color: string;
  width: number;
  customColors: string[];
}

export interface DashboardContextValue {
  dashboards: Dashboard[];
  activeDashboard: Dashboard | null;
  toasts: Toast[];
  visibleTools: (WidgetType | InternalToolType)[];
  dockItems: DockItem[];
  loading: boolean;
  isSaving: boolean;
  gradeFilter: GradeFilter;
  setGradeFilter: (filter: GradeFilter) => void;
  addToast: (
    message: string,
    type?: Toast['type'],
    action?: Toast['action']
  ) => void;
  removeToast: (id: string) => void;
  createNewDashboard: (name: string, data?: Dashboard) => Promise<void>;
  saveCurrentDashboard: () => Promise<void>;
  deleteDashboard: (id: string) => Promise<void>;
  duplicateDashboard: (id: string) => Promise<void>;
  renameDashboard: (id: string, name: string) => Promise<void>;
  loadDashboard: (id: string) => void;
  reorderDashboards: (ids: string[]) => Promise<void>;
  setDefaultDashboard: (id: string) => void;
  resetDockToDefaults: () => void;
  addWidget: (type: WidgetType, overrides?: AddWidgetOverrides) => void;
  addWidgets: (
    widgetsToAdd: {
      type: WidgetType;
      config?: WidgetConfig;
      gridConfig?: GridPosition;
    }[]
  ) => void;
  removeWidget: (id: string) => void;
  duplicateWidget: (id: string) => void;
  removeWidgets: (ids: string[]) => void;
  clearAllStickers: () => void;
  clearAllWidgets: () => void;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
  bringToFront: (id: string) => void;
  moveWidgetLayer: (id: string, direction: 'up' | 'down') => void;
  minimizeAllWidgets: () => void;
  restoreAllWidgets: () => void;
  deleteAllWidgets: () => void;
  resetWidgetSize: (id: string) => void;
  setBackground: (bg: string) => void;
  setGlobalStyle: (style: Partial<GlobalStyle>) => void;
  toggleToolVisibility: (type: WidgetType | InternalToolType) => void;
  setAllToolsVisibility: (visible: boolean) => void;
  reorderTools: (tools: (WidgetType | InternalToolType)[]) => void;
  reorderLibrary: (tools: (WidgetType | InternalToolType)[]) => void;
  reorderDockItems: (items: DockItem[]) => void;
  libraryOrder: (WidgetType | InternalToolType)[];
  updateDashboardSettings: (settings: Partial<Dashboard['settings']>) => void;
  updateDashboard: (updates: Partial<Dashboard>) => void;

  // Annotation (ephemeral full-screen draw-over overlay; NOT a widget)
  annotationActive: boolean;
  annotationState: AnnotationState;
  openAnnotation: () => void;
  closeAnnotation: () => void;
  updateAnnotationState: (updates: Partial<AnnotationState>) => void;
  addAnnotationObject: (obj: DrawableObject) => void;
  undoAnnotation: () => void;
  clearAnnotation: () => void;

  // Zoom system
  zoom: number;
  setZoom: (zoom: number) => void;

  // Selection system
  selectedWidgetId: string | null;
  setSelectedWidgetId: (id: string | null) => void;

  // Widget grouping
  groupWidgets: (widgetIds: string[]) => void;
  ungroupWidgets: (groupId: string) => void;
  updateWidgets: (
    updates: Array<{
      id: string;
      changes: Partial<Pick<WidgetData, 'x' | 'y' | 'w' | 'h'>>;
    }>
  ) => void;
  selectedWidgetIds: string[];
  setSelectedWidgetIds: (
    ids: string[] | ((prev: string[]) => string[])
  ) => void;
  groupBuildMode: boolean;
  setGroupBuildMode: (active: boolean) => void;

  // Sharing system
  shareDashboard: (
    dashboard: Dashboard,
    intendedMode?: SharedBoardImportMode,
    /**
     * Phase 6 — optional PLC scope. When set, the resulting `/shared_boards/{id}`
     * doc carries a `plcId` field so members of that PLC see the share on
     * their PLC Dashboard's Shared Boards tab. Plc-scoped shares still
     * generate a normal share URL the host can paste anywhere.
     */
    plcId?: string
  ) => Promise<string>;
  /**
   * Create a frozen, time-boxed share for a substitute teacher. Writes a
   * `/shared_boards/{shareId}` doc with `intendedMode: 'substitute'` plus
   * substitute-specific fields (expiresAt, buildingId, initialState,
   * subEmails). Does NOT tag the local dashboard with a linkedShareId — the
   * host's later edits never propagate to substitute shares.
   */
  shareSubstituteDashboard: (input: SubstituteShareInput) => Promise<string>;
  loadSharedDashboard: (shareId: string) => Promise<Dashboard | null>;
  pendingShareId: string | null;
  clearPendingShare: () => void;
  /** Set after the picker should be displayed — null when no import is pending. */
  pendingShareImport: PendingShareImport | null;
  /** Cancel the pending import (close picker without importing). */
  cancelPendingShareImport: () => void;
  /** Complete the pending import in the chosen mode. */
  importSharedBoard: (mode: SharedBoardImportMode) => Promise<void>;
  /** Host action: tear down the live share for the active dashboard. */
  stopSharingDashboard: (dashboardId: string) => Promise<void>;
  /** True when the active dashboard is a view-only guest copy. */
  isActiveBoardReadOnly: boolean;
  pendingQuizShareId: string | null;
  clearPendingQuizShare: () => void;
  pendingAssignmentShareId: string | null;
  setPendingAssignmentShareId: (shareId: string | null) => void;
  clearPendingAssignmentShare: () => void;
  /**
   * Pending video-activity-assignment share id, parsed from
   * `/share/video-activity/{shareId}`. Mirrors `pendingAssignmentShareId`;
   * the VideoActivityWidget's URL-paste flow drives off this state.
   */
  pendingVideoActivityShareId: string | null;
  setPendingVideoActivityShareId: (shareId: string | null) => void;
  clearPendingVideoActivityShare: () => void;
  setPendingQuizShareId: (shareId: string | null) => void;
  /**
   * Set after a successful `importSharedAssignment` to signal the QuizWidget
   * to open a "pick classes" prompt for the freshly-imported assignment.
   * Cleared by the modal once the user saves, opens full settings, or skips.
   */
  pendingAssignmentSetupId: string | null;
  setPendingAssignmentSetup: (assignmentId: string | null) => void;
  clearPendingAssignmentSetup: () => void;
  /**
   * Set when an external surface (e.g. the PLC dashboard's post-import
   * "Edit all settings…" link) wants to open the QuizWidget's full
   * assignment-settings editor for a specific assignment. The QuizWidget
   * reads this, opens the editor, and clears it. Distinct from
   * `pendingAssignmentSetupId` — that opens the "pick classes" prompt;
   * this skips the prompt and goes straight to the full editor.
   */
  pendingAssignmentEditId: string | null;
  setPendingAssignmentEdit: (assignmentId: string | null) => void;
  clearPendingAssignmentEdit: () => void;

  // Roster system
  rosters: ClassRoster[];
  activeRosterId: string | null;
  addRoster: (
    name: string,
    students: Student[],
    meta?: RosterCreateMeta
  ) => Promise<string>;
  updateRoster: (id: string, updates: Partial<ClassRoster>) => Promise<void>;
  deleteRoster: (id: string) => Promise<void>;
  setActiveRoster: (id: string | null) => void;
  setAbsentStudents: (rosterId: string, studentIds: string[]) => Promise<void>;

  // Folder system
  addFolder: (name: string) => void;
  createFolderWithItems: (
    name: string,
    items: (WidgetType | InternalToolType)[]
  ) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  addItemToFolder: (
    folderId: string,
    type: WidgetType | InternalToolType
  ) => void;
  removeItemFromFolder: (
    folderId: string,
    type: WidgetType | InternalToolType
  ) => void;
  moveItemOutOfFolder: (
    folderId: string,
    type: WidgetType | InternalToolType,
    index: number
  ) => void;
  reorderFolderItems: (
    folderId: string,
    newItems: (WidgetType | InternalToolType)[]
  ) => void;
}

export const DashboardContext = createContext<
  DashboardContextValue | undefined
>(undefined);
