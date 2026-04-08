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
} from '../types';

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
  addToast: (message: string, type?: Toast['type']) => void;
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

  // Zoom system
  zoom: number;
  setZoom: (zoom: number) => void;

  // Selection system
  selectedWidgetId: string | null;
  setSelectedWidgetId: (id: string | null) => void;

  // Sharing system
  shareDashboard: (dashboard: Dashboard) => Promise<string>;
  loadSharedDashboard: (shareId: string) => Promise<Dashboard | null>;
  pendingShareId: string | null;
  clearPendingShare: () => void;
  pendingQuizShareId: string | null;
  clearPendingQuizShare: () => void;

  // Roster system
  rosters: ClassRoster[];
  activeRosterId: string | null;
  addRoster: (name: string, students: Student[]) => Promise<string>;
  updateRoster: (id: string, updates: Partial<ClassRoster>) => Promise<void>;
  deleteRoster: (id: string) => Promise<void>;
  setActiveRoster: (id: string | null) => void;

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
