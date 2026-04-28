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
  disconnectGoogleDrive: () => {
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
  updateAccountPreferences: async () => {
    // No-op in student view
  },
  orgId: null,
  roleId: null,
  buildingIds: [],
  orgBuildings: [],
};

// --- MOCK DASHBOARD ---
// NOTE: Widgets in student view are read-only. The mock dashboard context
// returns no-op functions for critical operations like updateWidget, which
// is called by widgets for state management. This means widgets that attempt
// to update their configuration will silently fail.
// See studentViewConfig.ts for widget compatibility details.
const mockDashboard: DashboardContextValue = {
  dashboards: [],
  activeDashboard: null,
  toasts: [],
  visibleTools: [],
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
  createNewDashboard: async () => {
    // No-op
  },
  saveCurrentDashboard: async () => {
    // No-op
  },
  deleteDashboard: async () => {
    /* mock */
  },
  duplicateDashboard: async () => {
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
  setDefaultDashboard: () => {
    // No-op
  },
  resetDockToDefaults: () => {
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
  toggleToolVisibility: () => {
    // No-op
  },
  setAllToolsVisibility: () => {
    // No-op
  },
  reorderTools: () => {
    // No-op
  },
  libraryOrder: [],
  reorderLibrary: () => {
    // No-op
  },
  dockItems: [],
  reorderDockItems: () => {
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
  addFolder: () => {
    // No-op
  },
  createFolderWithItems: () => {
    // No-op
  },
  renameFolder: () => {
    // No-op
  },
  deleteFolder: () => {
    // No-op
  },
  addItemToFolder: () => {
    // No-op
  },
  removeItemFromFolder: () => {
    // No-op
  },
  moveItemOutOfFolder: () => {
    // No-op
  },
  reorderFolderItems: () => {
    // No-op
  },

  clearAllStickers: () => {
    // No-op
  },
  // Sharing system mocks
  shareDashboard: async () => {
    return Promise.reject(new Error('Sharing not implemented in student view'));
  },
  loadSharedDashboard: async () => {
    return Promise.resolve(null);
  },
  pendingShareId: null,
  clearPendingShare: () => {
    // No-op
  },
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
  pendingAssignmentSetupId: null,
  setPendingAssignmentSetup: () => {
    // No-op — student view never imports assignments.
  },
  clearPendingAssignmentSetup: () => {
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
  undoAnnotation: () => {
    // No-op
  },
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
