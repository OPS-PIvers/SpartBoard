import React, { ReactNode } from 'react';
import { AuthContext, AuthContextType } from '@/context/AuthContextValue';
import {
  DashboardContext,
  DashboardContextValue,
} from '@/context/DashboardContextValue';

interface StudentProviderProps {
  children: ReactNode;
}

// --- MOCK AUTH ---
const mockAuth: AuthContextType = {
  user: null,
  googleAccessToken: null,
  loading: false,
  isAdmin: null,
  userRoles: null,
  appSettings: null,
  featurePermissions: [],
  globalPermissions: [],
  updateAppSettings: () => Promise.resolve(),
  canAccessWidget: () => true, // Allow everything in student view
  canAccessFeature: () => true,
  userTier: 'free',
  // Students are never org members and never external (the real isExternalUser
  // predicate excludes student roles outright).
  hasOrg: false,
  isExternalUser: false,
  // Student view doesn't render assignment-creation UI; the default keeps
  // any consumers that read this returning the safe pre-feature default.
  getAssignmentMode: () => 'submissions',
  // Student view never shows view-count badges; admin-only default.
  canSeeShareTracking: () => false,
  signInWithGoogle: async () => {
    // No-op
  },
  signOut: async () => {
    // No-op
  },
  selectedBuildings: [],
  userGradeLevels: [],
  setSelectedBuildings: async () => {
    // No-op in student view
  },
  language: 'en',
  setLanguage: async () => {
    // No-op in student view
  },
  refreshGoogleToken: () => {
    return Promise.resolve(null);
  },
  disconnectGoogleDrive: async () => {
    // No-op in student view
  },
  connectGoogleDrive: async () => {
    // No-op in student view
  },
  savedWidgetConfigs: {},
  saveWidgetConfig: () => {
    // No-op
  },
  profileLoaded: true,
  setupCompleted: true,
  completeSetup: async () => {
    // No-op in student view
  },
  disableCloseConfirmation: false,
  remoteControlEnabled: true,
  dockPosition: 'bottom',
  quizMonitorColorsEnabled: true,
  quizMonitorScoreDisplay: 'percent',
  updateAccountPreferences: async () => {
    // No-op in student view
  },
  lastActiveCollectionId: undefined,
  lastBoardIdByCollection: undefined,
  orgId: null,
  roleId: null,
  isStudentRole: false,
  roleResolved: true,
  buildingIds: [],
  orgBuildings: [],
  orgBuildingsLoaded: true,
  favoriteBackgrounds: [],
  recentBackgrounds: [],
  toggleFavoriteBackground: async () => {
    // No-op in student view
  },
  recordRecentBackground: async () => {
    // No-op in student view
  },
};

// --- MOCK DASHBOARD ---
// NOTE: Widgets in student view are read-only. The mock dashboard context
// returns no-op functions for critical operations like updateWidget, which
// is called by widgets for state management. This means widgets that attempt
// to update their configuration will silently fail.
// See studentViewConfig.ts for widget compatibility details.
const mockDashboard: DashboardContextValue = {
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
    setCollectionDefaultBoard: () => Promise.resolve(),
  },
  dashboards: [],
  activeDashboard: null,
  toasts: [],
  loading: false,
  isSaving: false,
  gradeFilter: 'all',
  setGradeFilter: () => {
    // No-op
  },
  addToast: () => {
    // No-op
  },
  removeToast: () => {
    // No-op
  },
  createNewDashboard: () => Promise.resolve(undefined),
  saveCurrentDashboard: async () => {
    // No-op
  },
  deleteDashboard: async () => {
    /* mock */
  },
  duplicateDashboard: async () => {
    /* mock */
  },
  duplicateCollection: async () => {
    /* mock */
  },
  renameDashboard: async () => {
    /* mock */
  },
  loadDashboard: () => {
    /* mock */
  },
  reorderDashboards: async () => {
    // No-op
  },
  setDefaultDashboard: async () => {
    // No-op
  },
  moveBoardToCollection: async () => {
    // No-op
  },
  pinBoard: async () => {
    // No-op
  },
  unpinBoard: async () => {
    // No-op
  },
  setActiveCollectionId: () => {
    // No-op
  },
  addWidget: () => {
    // No-op
  },
  addWidgets: () => {
    // No-op
  },
  removeWidget: () => {
    // No-op
  },
  duplicateWidget: () => {
    // No-op
  },
  removeWidgets: () => {
    // No-op
  },
  clearAllWidgets: () => {
    // No-op
  },
  updateWidget: () => {
    // No-op. Widgets in student view are read-only or handle state internally.
  },
  bringToFront: () => {
    // No-op
  },
  moveWidgetLayer: () => {
    // No-op
  },
  minimizeAllWidgets: () => {
    // No-op
  },
  restoreAllWidgets: () => {
    // No-op
  },
  deleteAllWidgets: () => {
    // No-op
  },
  resetWidgetSize: () => {
    // No-op
  },
  setBackground: () => {
    // No-op
  },
  setGlobalStyle: () => {
    // No-op
  },
  updateDashboardSettings: () => {
    // No-op
  },
  updateDashboard: () => {
    // No-op
  },
  zoom: 1,
  setZoom: () => {
    // No-op
  },
  selectedWidgetId: null,
  setSelectedWidgetId: () => {
    // No-op
  },
  // Widget grouping mocks
  groupWidgets: () => {
    // No-op
  },
  ungroupWidgets: () => {
    // No-op
  },
  updateWidgets: () => {
    // No-op
  },
  selectedWidgetIds: [],
  setSelectedWidgetIds: () => {
    // No-op
  },
  groupBuildMode: false,
  setGroupBuildMode: () => {
    // No-op
  },
  clearAllStickers: () => {
    // No-op
  },
  // Collection sharing system mocks
  shareCollection: () => Promise.resolve(''),
  shareSubstituteCollection: () => Promise.resolve(''),
  loadSharedCollection: () =>
    Promise.resolve({ ok: false as const, reason: 'not-found' as const }),
  loadSharedCollectionBoards: () => Promise.resolve([]),
  importSharedCollection: () => Promise.resolve(null),
  pendingSharedCollectionId: null,
  setPendingSharedCollectionId: () => {
    // No-op
  },
  clearPendingSharedCollection: () => {
    // No-op
  },
  // Sharing system mocks
  shareDashboard: async () => {
    return Promise.reject(new Error('Sharing not implemented in student view'));
  },
  shareSubstituteDashboard: async () => {
    return Promise.reject(new Error('Sharing not implemented in student view'));
  },
  loadSharedDashboard: async () => {
    return Promise.resolve(null);
  },
  pendingShareId: null,
  clearPendingShare: () => {
    // No-op
  },
  pendingShareImport: null,
  cancelPendingShareImport: () => {
    // No-op — student view never imports shared boards.
  },
  importSharedBoard: async () => {
    // No-op
  },
  stopSharingDashboard: async () => {
    // No-op
  },
  isActiveBoardReadOnly: false,
  drawingWidgetsMigrating: new Set<string>(),
  pendingQuizShareId: null,
  clearPendingQuizShare: () => {
    // No-op
  },
  setPendingQuizShareId: () => {
    // No-op
  },
  pendingAssignmentShareId: null,
  setPendingAssignmentShareId: () => {
    // No-op
  },
  clearPendingAssignmentShare: () => {
    // No-op
  },
  pendingVideoActivityShareId: null,
  setPendingVideoActivityShareId: () => {
    // No-op
  },
  clearPendingVideoActivityShare: () => {
    // No-op
  },
  pendingAssignmentSetupId: null,
  setPendingAssignmentSetup: () => {
    // No-op — student view never imports assignments.
  },
  clearPendingAssignmentSetup: () => {
    // No-op
  },
  pendingAssignmentEditId: null,
  setPendingAssignmentEdit: () => {
    // No-op — student view never edits assignment settings.
  },
  clearPendingAssignmentEdit: () => {
    // No-op
  },
  // Roster mocks
  rosters: [],
  activeRosterId: null,
  addRoster: () => {
    return Promise.reject(
      new Error('addRoster is not implemented in student view')
    );
  },
  updateRoster: async () => {
    // No-op
  },
  deleteRoster: async () => {
    // No-op
  },
  setActiveRoster: () => {
    // No-op
  },
  setAbsentStudents: async () => {
    // No-op — student view doesn't edit attendance
  },
  // Annotation (app-level overlay) — not applicable in student view
  annotationActive: false,
  annotationState: {
    objects: [],
    color: '#000000',
    width: 4,
    customColors: ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'],
    activeTool: 'pen',
    shapeFill: false,
  },
  openAnnotation: () => {
    // No-op
  },
  closeAnnotation: () => {
    // No-op
  },
  updateAnnotationState: () => {
    // No-op
  },
  addAnnotationObject: () => {
    // No-op
  },
  updateAnnotationObject: () => {
    // No-op
  },
  removeAnnotationObject: () => {
    // No-op
  },
  undoAnnotation: () => {
    // No-op
  },
  redoAnnotation: () => {
    // No-op — students don't surface the annotation overlay.
  },
  canRedoAnnotation: false,
  clearAnnotation: () => {
    // No-op
  },
};

export const StudentProvider: React.FC<StudentProviderProps> = ({
  children,
}) => {
  return (
    <AuthContext.Provider value={mockAuth}>
      <DashboardContext.Provider value={mockDashboard}>
        {children}
      </DashboardContext.Provider>
    </AuthContext.Provider>
  );
};
