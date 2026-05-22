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
  Collection,
  CollectionSubstituteShareInput,
} from '../types';
import type { RosterCreateMeta } from '../hooks/useRosters';
import type { GoogleDriveService } from '../utils/googleDriveService';
import type { UseCollectionsResult } from '../hooks/useCollections';
import type { LoadSharedCollectionResult } from '../hooks/useSharedCollection';

/**
 * Mode applied to a shared-board import. Substitute shares are intentionally
 * NOT included here — they are never imported into a teacher's account; they
 * live only inside the `/subs` substitute portal. Code that handles import
 * flows can rely on this narrow union to stay correct without checking for
 * substitute as a special case.
 */
export type SharedBoardImportMode = 'copy' | 'synced' | 'view-only';

/**
 * Outcome of a substitute share creation. The share doc itself always
 * writes successfully (the function would throw otherwise), but Drive
 * grants for each (email, fileId) pair can fail individually — Drive
 * permission calls hit the network and may bounce on a stale token,
 * quota, or a recipient that doesn't exist. We surface the per-pair
 * outcome so the caller can warn the host before they hand the link to
 * a sub who won't actually have roster access.
 */
export interface SubstituteShareResult {
  shareId: string;
  /**
   * Null when no roster Drive sharing was requested (empty
   * `rosterDriveFileIds` or empty `subEmails`). Otherwise carries the
   * counts plus the failed pairs (caller can show specifics).
   */
  driveGrants: {
    attempted: number;
    succeeded: number;
    failed: Array<{ email: string; fileId: string }>;
  } | null;
}

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
  /**
   * Drive file ids that should be shared (read-only) with each `subEmails`
   * entry — typically the active roster's JSON file. The handler iterates
   * the cross-product, captures each returned permission id, and persists
   * `driveGrants[]` back on the share doc for later revocation. Caller is
   * responsible for resolving which files are relevant (usually the active
   * roster's `driveFileId`).
   */
  rosterDriveFileIds?: string[];
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
  /**
   * Memoized Google Drive service for the active teacher session, or null
   * when no Google access token is available. Surfaced here so callers
   * inside DashboardProvider can reuse the existing hook instance instead
   * of calling `useGoogleDrive()` again — that hook has side effects
   * (token-change handler, folder-migration effect) that should fire at
   * most once per session.
   */
  driveService: GoogleDriveService | null;
  /**
   * Single shared instance of the collections hook result. All consumers
   * must read from this instead of calling `useCollections(user?.uid)`
   * directly — using the single source of truth avoids duplicate Firestore
   * subscriptions and ensures in-memory state (auth bypass / E2E) is shared
   * across every component.
   */
  collectionsApi: UseCollectionsResult;
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
  createNewDashboard: (
    name: string,
    data?: Dashboard,
    options?: { collectionId?: string | null; silent?: boolean }
  ) => Promise<string | undefined>;
  saveCurrentDashboard: () => Promise<void>;
  deleteDashboard: (id: string) => Promise<void>;
  duplicateDashboard: (id: string) => Promise<void>;
  /**
   * Flat clone: creates a new Collection (same parent, color) with `(Copy)`
   * suffix and duplicates each direct child Board into it. Sub-Collections
   * are NOT recursed — keeps the write bounded and predictable.
   */
  duplicateCollection: (id: string) => Promise<void>;
  renameDashboard: (id: string, name: string) => Promise<void>;
  loadDashboard: (id: string) => void;
  reorderDashboards: (ids: string[]) => Promise<void>;
  setDefaultDashboard: (
    boardId: string,
    options?: { silent?: boolean }
  ) => Promise<void>;
  moveBoardToCollection: (
    boardId: string,
    collectionId: string | null,
    options?: { silent?: boolean }
  ) => Promise<void>;
  pinBoard: (boardId: string, options?: { silent?: boolean }) => Promise<void>;
  unpinBoard: (
    boardId: string,
    options?: { silent?: boolean }
  ) => Promise<void>;
  setActiveCollectionId: (collectionId: string | null) => void;
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
   *
   * Returns a `SubstituteShareResult` carrying the new shareId AND a
   * per-pair Drive grant summary so callers can warn the host when some
   * subs missed out on roster access (e.g. stale Drive token, quota).
   */
  shareSubstituteDashboard: (
    input: SubstituteShareInput
  ) => Promise<SubstituteShareResult>;
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
  /**
   * Set by the PLC In-progress sub-tab (owner row) so the QuizWidget opens
   * the live monitor for that assignment. Mirrors the `pendingAssignmentEditId`
   * hand-off: close the PLC dashboard, set this id, QuizWidget effect picks
   * it up and calls `updateWidget` to switch to `view: 'monitor'`.
   */
  pendingAssignmentMonitorId: string | null;
  setPendingAssignmentMonitor: (assignmentId: string | null) => void;
  clearPendingAssignmentMonitor: () => void;
  /**
   * Same as `pendingAssignmentMonitorId` but navigates to `view: 'results'`
   * instead of the live monitor.
   */
  pendingAssignmentResultsId: string | null;
  setPendingAssignmentResults: (assignmentId: string | null) => void;
  clearPendingAssignmentResults: () => void;

  // Collection sharing system
  shareCollection: (input: {
    collection: Collection;
    boards: Dashboard[];
  }) => Promise<string>;
  shareSubstituteCollection: (
    input: CollectionSubstituteShareInput & {
      collection: Collection;
      boards: Dashboard[];
    }
  ) => Promise<string>;
  loadSharedCollection: (
    shareId: string
  ) => Promise<LoadSharedCollectionResult>;
  loadSharedCollectionBoards: (
    shareId: string,
    boardIds: string[]
  ) => Promise<Dashboard[]>;
  importSharedCollection: (
    shareId: string
  ) => Promise<{ collectionId: string; firstBoardId: string | null } | null>;
  pendingSharedCollectionId: string | null;
  setPendingSharedCollectionId: (id: string | null) => void;
  clearPendingSharedCollection: () => void;

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
