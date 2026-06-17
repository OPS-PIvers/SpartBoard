import { createContext } from 'react';
import { WidgetType, DockItem, InternalToolType } from '@/types';

/**
 * Tool-visibility slice of the dashboard, split out of `DashboardContextValue`
 * into its own context (F9). DashboardContext builds one big memoized value
 * whose `useMemo` deps include `visibleTools` / `dockItems` / `libraryOrder`,
 * so toggling a tool recreates that object and re-renders ALL ~189
 * `useDashboard()` consumers. Tool visibility is read by only a handful of
 * surfaces (Dock, NewUserSetup, WidgetLibrary, SidebarWidgets), so isolating
 * it here means a tool toggle recreates only THIS value (~3 consumers) while
 * widget/canvas mutations no longer churn the dock.
 *
 * The provider is `DashboardProvider` — it owns all the underlying state
 * (`visibleTools`, `dockItems`, `libraryOrder`) and persistence effects and
 * supplies BOTH contexts. `useToolVisibility()` therefore throws the same
 * "within DashboardProvider" error as `useDashboard()` when no provider is
 * mounted. Alternate hosts that mount a bare `DashboardContext.Provider`
 * (SubsDashboardProvider, StudentContexts) do NOT mount this context, but they
 * also never render a tool-visibility consumer, so the throw is unreachable
 * there.
 */
export interface ToolVisibilityContextValue {
  visibleTools: (WidgetType | InternalToolType)[];
  dockItems: DockItem[];
  libraryOrder: (WidgetType | InternalToolType)[];
  toggleToolVisibility: (type: WidgetType | InternalToolType) => void;
  setAllToolsVisibility: (visible: boolean) => void;
  reorderTools: (tools: (WidgetType | InternalToolType)[]) => void;
  reorderLibrary: (tools: (WidgetType | InternalToolType)[]) => void;
  reorderDockItems: (items: DockItem[]) => void;
  resetDockToDefaults: () => void;
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

export const ToolVisibilityContext =
  createContext<ToolVisibilityContextValue | null>(null);
