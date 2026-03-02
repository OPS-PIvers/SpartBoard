import React, { ReactNode } from 'react';
import { AuthContext, AuthContextType } from '../../context/AuthContextValue';
import {
  DashboardContext,
  DashboardContextValue,
} from '../../context/DashboardContextValue';

interface StudentProviderProps {
  children: ReactNode;
}

// --- MOCK AUTH ---
const mockAuth: AuthContextType = {
  user: null,
  googleAccessToken: null,
  loading: false,
  isAdmin: null,
  featurePermissions: [],
  globalPermissions: [],
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
  createNewDashboard: () => {
    // No-op
  },
  saveCurrentDashboard: () => {
    // No-op
  },
  deleteDashboard: () => {
    /* mock */
  },
  duplicateDashboard: () => {
    /* mock */
  },
  renameDashboard: () => {
    /* mock */
  },
  loadDashboard: () => {
    /* mock */
  },
  reorderDashboards: () => {
    // No-op
  },
  setDefaultDashboard: () => {
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
