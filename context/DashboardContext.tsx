import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import {
  Dashboard,
  WidgetData,
  WidgetType,
  WidgetConfig,
  Toast,
  GradeFilter,
  DockItem,
  InternalToolType,
  DockFolder,
  GlobalStyle,
  DEFAULT_GLOBAL_STYLE,
  AddWidgetOverrides,
  NextUpConfig,
  GridPosition,
  FeaturePermission,
  MaterialsGlobalConfig,
  DrawableObject,
} from '../types';
import { useAuth } from './useAuth';
import { stripTransientKeys } from '../utils/widgetConfigPersistence';
import { useFirestore } from '../hooks/useFirestore';
import { TOOLS } from '../config/tools';
import { WIDGET_DEFAULTS } from '../config/widgetDefaults';
import {
  migrateLocalStorageToFirestore,
  migrateWidget,
} from '../utils/migration';
import {
  scrubDashboardPII,
  extractDashboardPII,
  mergeDashboardPII,
  dashboardHasPII,
} from '../utils/dashboardPII';
import { useRosters } from '../hooks/useRosters';
import { useGoogleDrive } from '../hooks/useGoogleDrive';
import { DashboardContext } from './DashboardContextValue';
import { validateGridConfig, sanitizeAIConfig } from '../utils/ai_security';
import { getMaterialsCatalog } from '../components/widgets/MaterialsWidget/constants';
import { AnnotationState } from './DashboardContextValue';
import { DRAWING_DEFAULTS } from '../components/widgets/DrawingWidget/constants';
import { STANDARD_COLORS } from '../config/colors';

// Helper to migrate legacy visibleTools to dockItems
const migrateToDockItems = (
  visibleTools: (WidgetType | InternalToolType)[]
): DockItem[] => {
  return visibleTools.map((type) => ({ type: 'tool', toolType: type }));
};

/** Serialize dashboard state for change-detection comparisons. */
const serializeDashboard = (d: Dashboard): string =>
  JSON.stringify({
    widgets: d.widgets.map((w) => {
      const { config, ...rest } = w;
      return {
        ...rest,
        // Fallback for old widgets without version
        ...(w.version === undefined ? { config } : {}),
      };
    }),
    background: d.background,
    name: d.name,
    libraryOrder: d.libraryOrder,
    settings: d.settings,
  });

/** Capture the serialized state used to populate lastSaved* refs. */
const getDashboardSaveState = (d: Dashboard) => ({
  serializedData: serializeDashboard(d),
  fields: {
    widgets: JSON.stringify(d.widgets),
    background: d.background,
    name: d.name,
    libraryOrder: JSON.stringify(d.libraryOrder ?? []),
    settings: JSON.stringify(d.settings ?? {}),
  },
});

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const {
    user,
    isAdmin,
    refreshGoogleToken,
    featurePermissions,
    selectedBuildings,
    savedWidgetConfigs,
    saveWidgetConfig,
    remoteControlEnabled: accountRemoteControlEnabled,
  } = useAuth();
  const { driveService, userDomain } = useGoogleDrive();
  const {
    saveDashboard: saveDashboardFirestore,
    saveDashboards: saveDashboardsFirestore,
    deleteDashboard: deleteDashboardFirestore,
    subscribeToDashboards,
    shareDashboard: shareDashboardFirestore,
    loadSharedDashboard: loadSharedDashboardFirestore,
  } = useFirestore(user?.uid ?? null);

  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [pendingShareId, setPendingShareId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const path = window.location.pathname;
    // Skip quiz and assignment share URLs — those are handled separately
    if (path.startsWith('/share/quiz/')) return null;
    if (path.startsWith('/share/assignment/')) return null;
    if (path.startsWith('/share/')) {
      return path.split('/share/')[1] || null;
    }
    return null;
  });

  const [pendingQuizShareId, setPendingQuizShareId] = useState<string | null>(
    () => {
      if (typeof window === 'undefined') return null;
      const path = window.location.pathname;
      if (path.startsWith('/share/quiz/')) {
        return path.split('/share/quiz/')[1] || null;
      }
      return null;
    }
  );

  const [pendingAssignmentShareId, setPendingAssignmentShareId] = useState<
    string | null
  >(() => {
    if (typeof window === 'undefined') return null;
    const path = window.location.pathname;
    if (path.startsWith('/share/assignment/')) {
      return path.split('/share/assignment/')[1] || null;
    }
    return null;
  });

  const clearPendingShare = useCallback(() => {
    setPendingShareId(null);
    window.history.replaceState(null, '', '/');
  }, []);

  const clearPendingQuizShare = useCallback(() => {
    setPendingQuizShareId(null);
    window.history.replaceState(null, '', '/');
  }, []);

  const clearPendingAssignmentShare = useCallback(() => {
    setPendingAssignmentShareId(null);
    window.history.replaceState(null, '', '/');
  }, []);

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef(activeId);
  // Keep a ref to account-level remote control so the Firestore snapshot
  // handler can read the latest value without triggering a re-subscription.
  const accountRemoteControlEnabledRef = useRef(accountRemoteControlEnabled);
  accountRemoteControlEnabledRef.current = accountRemoteControlEnabled;
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<string[]>([]);
  const [groupBuildMode, setGroupBuildMode] = useState(false);
  const dashboardsRef = useRef(dashboards);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [zoom, setZoom] = useState<number>(1);

  // --- Annotation (ephemeral full-screen draw-over overlay; NOT a widget) ---
  const [annotationActive, setAnnotationActive] = useState(false);
  const [annotationState, setAnnotationState] = useState<AnnotationState>(
    () => ({
      objects: [],
      color: STANDARD_COLORS.slate,
      width: DRAWING_DEFAULTS.WIDTH,
      customColors: [...DRAWING_DEFAULTS.CUSTOM_COLORS],
    })
  );

  // Helper to centralize active dashboard switching and its side-effects (like zoom reset)
  const updateActiveId = useCallback((id: string | null) => {
    setActiveId(id);
    setZoom(1);
    // Auto-close annotation when switching dashboards — annotations are board-local
    setAnnotationActive(false);
    setAnnotationState((prev) => ({ ...prev, objects: [] }));
  }, []);

  const [isDockInitialized, setIsDockInitialized] = useState<boolean>(() => {
    return localStorage.getItem('classroom_dock_initialized') === 'true';
  });
  // Keep a ref in sync so timeout callbacks can read the latest value without
  // capturing a stale closure.
  const isDockInitializedRef = useRef(isDockInitialized);
  isDockInitializedRef.current = isDockInitialized;

  const [visibleTools, setVisibleTools] = useState<
    (WidgetType | InternalToolType)[]
  >(() => {
    const saved = localStorage.getItem('classroom_visible_tools');
    if (saved) {
      try {
        return JSON.parse(saved) as (WidgetType | InternalToolType)[];
      } catch (e) {
        console.error('Failed to parse saved tools', e);
      }
    }
    return [];
  });

  const [libraryOrder, setLibraryOrder] = useState<
    (WidgetType | InternalToolType)[]
  >(() => {
    const saved = localStorage.getItem('spartboard_library_order');
    if (saved) {
      try {
        return JSON.parse(saved) as (WidgetType | InternalToolType)[];
      } catch (e) {
        console.error('Failed to parse library order', e);
      }
    }
    return TOOLS.map((t) => t.type);
  });

  const [dockItems, setDockItems] = useState<DockItem[]>(() => {
    const saved = localStorage.getItem('classroom_dock_items');
    if (saved) {
      try {
        return JSON.parse(saved) as DockItem[];
      } catch (e) {
        console.error('Failed to parse saved dock items', e);
      }
    }
    // Fallback: migrate from visibleTools if available
    const savedTools = localStorage.getItem('classroom_visible_tools');
    if (savedTools) {
      try {
        const tools = JSON.parse(savedTools) as (
          | WidgetType
          | InternalToolType
        )[];
        return migrateToDockItems(tools);
      } catch (e) {
        console.error('Failed to migrate tools to dock items', e);
      }
    }
    return [];
  });

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [migrated, setMigrated] = useState(false);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (
      message: string,
      type: Toast['type'] = 'info',
      action?: Toast['action']
    ) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, type, action }]);
      // If there's an action, keep it longer (10s) so the user has time to click
      const duration = action ? 10000 : 3000;
      setTimeout(() => {
        removeToast(id);
      }, duration);
    },
    [removeToast]
  );

  const [gradeFilter, setGradeFilter] = useState<GradeFilter>(() => {
    const saved = localStorage.getItem('spartboard_gradeFilter');
    const validFilters: GradeFilter[] = ['all', 'k-2', '3-5', '6-8', '9-12'];
    return saved && validFilters.includes(saved as GradeFilter)
      ? (saved as GradeFilter)
      : 'all';
  });

  const handleSetGradeFilter = useCallback((filter: GradeFilter) => {
    setGradeFilter(filter);
    localStorage.setItem('spartboard_gradeFilter', filter);
  }, []);

  /**
   * Returns the list of dock tools that should be used as defaults for the
   * current user's primary building, filtered so that only tools the user can
   * actually access (enabled, correct access level / beta list) are included.
   *
   * - When `selectedBuildings` is empty ("show all content"), returns all
   *   accessible tools from the TOOLS config.
   * - When a building is selected, returns the tools marked as default for
   *   that building in admin configuration.
   * - Falls back to `['time-tool']` when a building is selected but no
   *   building-specific defaults are found.
   */
  const getDefaultDockTools = useCallback((): (
    | WidgetType
    | InternalToolType
  )[] => {
    /**
     * Checks whether a given FeaturePermission record is accessible to the
     * current user (enabled, correct access level, in beta list if required).
     */
    const isPermAccessible = (perm: FeaturePermission): boolean => {
      const isEnabled = perm.enabled !== false;
      const isAccessibleByRole =
        perm.accessLevel !== 'admin' || isAdmin === true;
      const isBetaAccessible =
        perm.accessLevel !== 'beta' ||
        perm.betaUsers.includes(user?.email ?? '');
      return isEnabled && isAccessibleByRole && isBetaAccessible;
    };

    // Build a Map for O(1) permission look-ups when iterating over TOOLS.
    const permByType = new Map<string, FeaturePermission>(
      (featurePermissions ?? []).map((p) => [p.widgetType, p])
    );

    // When no building is configured treat as "show all content" (project
    // convention: empty selectedBuildings = no building-based filtering).
    if (selectedBuildings.length === 0) {
      return TOOLS.filter((tool) => {
        const perm = permByType.get(tool.type);
        // No permission record → public by default
        if (!perm) return true;
        return isPermAccessible(perm);
      }).map((tool) => tool.type);
    }

    const tools: (WidgetType | InternalToolType)[] = [];
    const buildingId = selectedBuildings[0];

    (featurePermissions ?? []).forEach((perm) => {
      const dockDefaults = perm.config?.dockDefaults as
        | Record<string, boolean>
        | undefined;

      const isDefaultForBuilding =
        dockDefaults !== undefined && dockDefaults[buildingId] === true;
      if (!isDefaultForBuilding) return;

      // Only include tools that the current user can actually access,
      // mirroring the same checks performed by canAccessWidget / the dock.
      if (isPermAccessible(perm)) {
        tools.push(perm.widgetType);
      }
    });

    if (tools.length === 0) {
      tools.push('time-tool');
    }

    return tools;
  }, [featurePermissions, selectedBuildings, isAdmin, user]);

  useEffect(() => {
    if (isDockInitialized) return;

    // If the user already has a saved dock layout/tool visibility in
    // localStorage, preserve it and mark init complete instead of overwriting
    // with building defaults. This keeps dock customizations intact when
    // creating or switching boards.
    const savedDockRaw = localStorage.getItem('classroom_dock_items');
    const savedVisibleToolsRaw = localStorage.getItem(
      'classroom_visible_tools'
    );
    const hasPersistedDockState =
      savedDockRaw !== null || savedVisibleToolsRaw !== null;

    if (hasPersistedDockState) {
      try {
        // Validate saved dock state before marking initialization complete.
        // visibleTools/dockItems are already hydrated by their useState initializers.
        if (savedDockRaw !== null) {
          JSON.parse(savedDockRaw);
        }
        if (savedVisibleToolsRaw !== null) {
          JSON.parse(savedVisibleToolsRaw);
        }
        setIsDockInitialized(true);
        localStorage.setItem('classroom_dock_initialized', 'true');
        return;
      } catch (err) {
        console.warn('Failed to hydrate saved dock state, using defaults', err);
      }
    }

    // Safety timeout: if we are stuck waiting for some reason after 5 seconds, fallback.
    // Uses isDockInitializedRef so the callback always reads the latest value even
    // if the effect closure has gone stale.  The timer also captures getDefaultDockTools
    // so the fallback uses the same access-filtering logic as the normal init path.
    const initTimer = setTimeout(() => {
      if (!isDockInitializedRef.current) {
        console.warn('Dock init timeout - using defaults');
        const fallbackTools = getDefaultDockTools();
        const fallbackDock = migrateToDockItems(fallbackTools);
        setDockItems(fallbackDock);
        setVisibleTools(fallbackTools);
        setIsDockInitialized(true);
        localStorage.setItem('classroom_dock_initialized', 'true');
        localStorage.setItem(
          'classroom_dock_items',
          JSON.stringify(fallbackDock)
        );
        localStorage.setItem(
          'classroom_visible_tools',
          JSON.stringify(fallbackTools)
        );
      }
    }, 5000);

    // When a building is selected we need to wait for permissions to load
    // before we can apply building-specific defaults.  When no building is
    // selected (empty array = "show all content") we can initialize immediately
    // using all accessible tools without waiting.
    if (
      selectedBuildings.length > 0 &&
      (featurePermissions ?? []).length === 0
    ) {
      // Still loading permissions for a specific building – keep the safety
      // timer running but allow the effect to be cleaned up if the component
      // unmounts first.
      return () => clearTimeout(initTimer);
    }

    const defaultTools = getDefaultDockTools();
    const defaultDock = migrateToDockItems(defaultTools);
    setDockItems(defaultDock);
    setVisibleTools(defaultTools);
    setIsDockInitialized(true);
    localStorage.setItem('classroom_dock_initialized', 'true');
    localStorage.setItem('classroom_dock_items', JSON.stringify(defaultDock));
    localStorage.setItem(
      'classroom_visible_tools',
      JSON.stringify(defaultTools)
    );

    clearTimeout(initTimer);
    return () => clearTimeout(initTimer);
  }, [
    isDockInitialized,
    featurePermissions,
    selectedBuildings,
    getDefaultDockTools,
  ]);

  // --- ROSTER LOGIC ---
  const {
    rosters,
    activeRosterId,
    addRoster,
    updateRoster,
    deleteRoster,
    setActiveRoster,
  } = useRosters(user);

  // Refs to prevent race conditions
  const lastLocalUpdateAt = useRef<number>(0);
  // True when the most recent dashboard change was a settings-only update
  // (e.g. spotlight/maximize toggle).  Used to apply a faster Firestore
  // write debounce for these small, high-priority changes.
  const lastUpdateWasSettingsOnly = useRef<boolean>(false);
  // Counter (not boolean) to correctly track overlapping in-flight saves
  const pendingSaveCountRef = useRef<number>(0);
  // Tracks Drive file IDs for PII supplements per dashboard to enable in-place updates
  const piiDriveFileIdRef = useRef<Map<string, string>>(new Map());
  // Tracks widget IDs added locally but not yet confirmed by a server snapshot
  const locallyAddedWidgetIds = useRef<Set<string>>(new Set());

  // Sync refs during render (safe — refs are mutable containers, not state)
  activeIdRef.current = activeId;
  dashboardsRef.current = dashboards;

  // --- DRIVE WRAPPERS & CALLBACKS ---

  const saveDashboard = useCallback(
    async (dashboard: Dashboard): Promise<number> => {
      // Always save to Firestore for real-time sync
      let driveFileId = dashboard.driveFileId;

      // MANDATE: Save to Drive for non-admins (full dashboard with PII goes to Drive)
      if (!isAdmin && driveService) {
        try {
          // Only perform immediate export if it's a new dashboard or doesn't have an ID yet
          // Background effect handles ongoing sync
          driveFileId ??= await driveService.exportDashboard(dashboard);
        } catch (e) {
          console.error('Failed to export to Drive during save:', e);
        }
      }

      // Save PII supplement to Drive for ALL users (including admins) to prevent
      // data loss. PII scrubbing below is unconditional, so without this backup
      // admin users who use custom roster features would permanently lose student names.
      // Update in-place when the file already exists to avoid orphaned duplicates.
      if (driveService && dashboardHasPII(dashboard)) {
        const pii = extractDashboardPII(dashboard);
        const blob = new Blob([JSON.stringify(pii)], {
          type: 'application/json',
        });
        const existingPiiFileId = piiDriveFileIdRef.current.get(dashboard.id);
        try {
          if (existingPiiFileId) {
            await driveService.updateFileContent(existingPiiFileId, blob);
          } else {
            const file = await driveService.uploadFile(
              blob,
              `${dashboard.id}-pii.json`,
              'Data/Dashboards'
            );
            piiDriveFileIdRef.current.set(dashboard.id, file.id);
          }
        } catch (e) {
          // Abort Firestore save to avoid losing PII when Drive is temporarily unavailable.
          console.error('[PII] Failed to save PII supplement to Drive:', e);
          // Reject so callers treat this as a genuine failure rather than a
          // silent success — prevents success toasts, ref updates, and
          // localStorage removal in migration from happening on an aborted save.
          throw new Error(
            '[PII] Aborted dashboard save because PII supplement could not be saved to Drive'
          );
        }
      }

      // CRITICAL: Strip all student PII before writing to Firestore.
      // Custom widget names (firstNames, lastNames, completedNames, etc.) must
      // NEVER reach Firestore — they are preserved in Drive only.
      const scrubbed = scrubDashboardPII(dashboard);

      return saveDashboardFirestore({
        ...scrubbed,
        driveFileId,
      });
    },
    [isAdmin, driveService, saveDashboardFirestore]
  );

  const saveDashboards = useCallback(
    async (dashboardsToSave: Dashboard[]) => {
      // For plural saves (like reordering), we'll do Firestore first.
      // CRITICAL: Scrub PII from every dashboard before writing to Firestore.
      await saveDashboardsFirestore(dashboardsToSave.map(scrubDashboardPII));

      // Then background sync to Drive
      if (!isAdmin && driveService) {
        void (async () => {
          for (const db of dashboardsToSave) {
            try {
              await driveService.exportDashboard(db);
            } catch (e) {
              console.error(
                `Failed to export dashboard ${db.name} to Drive:`,
                e
              );
            }
          }
        })();
      }
    },
    [isAdmin, driveService, saveDashboardsFirestore]
  );

  const handleDeleteDashboard = useCallback(
    async (id: string) => {
      const dashboard = dashboards.find((d) => d.id === id);
      if (!isAdmin && driveService && dashboard?.driveFileId) {
        try {
          await driveService.deleteFile(dashboard.driveFileId);
        } catch (e) {
          console.error('Failed to delete dashboard from Drive:', e);
        }
      }
      await deleteDashboardFirestore(id);
      // Clear stale PII file ID to prevent failed in-place update attempts
      piiDriveFileIdRef.current.delete(id);
    },
    [isAdmin, driveService, dashboards, deleteDashboardFirestore]
  );

  const handleShareDashboard = useCallback(
    async (dashboard: Dashboard): Promise<string> => {
      // MANDATE: Share through Google Drive if available for non-admins
      if (!isAdmin && driveService) {
        try {
          const fileId = await driveService.exportDashboard(dashboard);
          await driveService.makePublic(fileId, userDomain);
          return `drive-${fileId}`;
        } catch (e) {
          console.error('Drive sharing failed, falling back to Firestore:', e);
        }
      }
      return shareDashboardFirestore(dashboard);
    },
    [isAdmin, driveService, shareDashboardFirestore, userDomain]
  );

  const handleLoadSharedDashboard = useCallback(
    async (shareId: string): Promise<Dashboard | null> => {
      if (shareId.startsWith('drive-')) {
        if (!driveService) {
          throw new Error('Google Drive access required to load this board');
        }
        const fileId = shareId.replace('drive-', '');
        return driveService.importDashboard(fileId);
      }
      return loadSharedDashboardFirestore(shareId);
    },
    [driveService, loadSharedDashboardFirestore]
  );

  // Load dashboards on mount and subscribe to changes
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Real-time subscription to Firestore
    const unsubscribe = subscribeToDashboards(
      (updatedDashboards, hasPendingWrites) => {
        // Sort dashboards: default first, then by order, then by createdAt
        const sortedDashboards = [...updatedDashboards].sort((a, b) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) return orderA - orderB;
          return (b.createdAt || 0) - (a.createdAt || 0);
        });

        const migratedDashboards = sortedDashboards.map((db) => ({
          ...db,
          widgets: db.widgets.map(migrateWidget),
        }));

        // Update saving status: clear when Firestore confirms no pending writes
        // and we have no local saves in flight
        if (!hasPendingWrites && pendingSaveCountRef.current === 0) {
          setIsSaving(false);
        } else if (hasPendingWrites) {
          setIsSaving(true);
        }

        if (import.meta.env.DEV) {
          console.warn('[DashboardContext] onSnapshot update:', {
            dashboardsCount: updatedDashboards.length,
            hasPendingWrites,
            pendingSaveCount: pendingSaveCountRef.current,
          });
        }

        // ---- Conflict-detection and merge ----
        // All ref reads and writes happen here, OUTSIDE the setDashboards
        // callback, because React StrictMode double-invokes state updater
        // functions and any ref mutation inside that callback would corrupt
        // the state on the second (committed) invocation — causing every
        // second phone remote action to be silently rejected.
        const currentActive = dashboardsRef.current.find(
          (p) => p.id === activeIdRef.current
        );

        // Initialize (or re-initialize on dashboard switch) saved-data refs
        // from the CURRENT LOCAL STATE, not the incoming server snapshot.
        // Initialising from the server snapshot would make hasUnsavedLocalChanges
        // incorrectly true on the desktop, blocking every phone remote update.
        // Re-initialize on dashboard switch so stale refs from the previous
        // dashboard don't incorrectly flag unsaved changes on the new one.
        if (
          currentActive &&
          (lastSavedDataRef.current === '' ||
            currentActive.id !== lastSavedDashboardIdRef.current)
        ) {
          const { serializedData: initData, fields: initFields } =
            getDashboardSaveState(currentActive);
          lastSavedDataRef.current = initData;
          lastSavedFieldsRef.current = initFields;
          lastSavedDashboardIdRef.current = currentActive.id;
        }

        const now = Date.now();
        // 2500 ms covers debounced config updates + Firestore round-trip + some jitter.
        const isRecentlyUpdatedLocally = now - lastLocalUpdateAt.current < 2500;

        // Check if local state has unsaved changes by comparing against
        // what was last saved. This prevents server data from overwriting
        // local edits that haven't been flushed yet.
        const hasUnsavedLocalChanges =
          currentActive &&
          lastSavedDataRef.current !== '' &&
          serializeDashboard(currentActive) !== lastSavedDataRef.current;

        // serverActive is used both in the merge path and in the else-branch below.
        const serverActive = migratedDashboards.find(
          (d) => d.id === activeIdRef.current
        );

        let newDashboards: Dashboard[];

        if (
          hasPendingWrites ||
          isRecentlyUpdatedLocally ||
          hasUnsavedLocalChanges ||
          pendingSaveCountRef.current > 0
        ) {
          newDashboards = migratedDashboards.map((db) => {
            if (db.id === activeIdRef.current && currentActive) {
              // If we have pending writes, this snapshot is just a local echo of what we
              // just did. Trust our current active state completely to avoid reverts.
              if (hasPendingWrites) {
                return currentActive;
              }

              // SURGICAL MERGE: Start from server snapshot but only preserve
              // locally-modified fields. Fields unchanged locally accept the
              // server value, so remote edits (e.g. checklist toggle, spotlight)
              // aren't discarded when unrelated local state changed (e.g. timer tick).
              const backgroundChangedLocally =
                currentActive.background !==
                lastSavedFieldsRef.current.background;
              const nameChangedLocally =
                currentActive.name !== lastSavedFieldsRef.current.name;
              const libraryOrderChangedLocally =
                currentActive.libraryOrder &&
                JSON.stringify(currentActive.libraryOrder) !==
                  lastSavedFieldsRef.current.libraryOrder;
              const settingsChangedLocally =
                JSON.stringify(currentActive.settings ?? {}) !==
                (lastSavedFieldsRef.current.settings ?? '{}');

              // Per-widget merge: only keep a widget's local config when THAT
              // specific widget changed locally (e.g. running timer). Accept the
              // server config for widgets untouched locally so remote controls
              // (checklist toggles, remote timer start/stop, etc.) take effect
              // even while other widgets are actively updating.
              let lastSavedWidgets: WidgetData[] = [];
              try {
                lastSavedWidgets = JSON.parse(
                  lastSavedFieldsRef.current.widgets || '[]'
                ) as WidgetData[];
              } catch (e) {
                console.error(
                  'Failed to parse last saved widgets state. Preserving local state.',
                  e
                );
                lastSavedWidgets = [];
              }
              const lastSavedById = new Map(
                lastSavedWidgets.map((w) => [w.id, w])
              );
              const localById = new Map(
                currentActive.widgets.map((w) => [w.id, w])
              );
              const LAYOUT_FIELDS = [
                'x',
                'y',
                'w',
                'h',
                'z',
                'minimized',
                'flipped',
                'maximized',
                'groupId',
              ] as const;

              const STYLE_FIELDS = [
                'backgroundColor',
                'fontFamily',
                'baseTextSize',
                'transparency',
                'buildingId',
                'customTitle',
                'isPinned',
                'isLocked',
                'annotation',
              ] as const;

              const INSTANCE_FIELDS = ['customTitle', 'isPinned'] as const;

              const remoteControlEnabled =
                accountRemoteControlEnabledRef.current;

              // Pre-calculate merge decisions for all incoming server widgets
              const widgetMergeDecisions = db.widgets.map((sw) => {
                const lw = localById.get(sw.id);
                const saved = lastSavedById.get(sw.id);

                // Exclude widgets deleted locally (present in lastSaved but absent from current local state)
                const isDeletedLocally = saved && !lw;

                // If it's a new widget from server (!lw && !saved), accept entirely.
                // If it's a new widget locally (!saved && lw), we keep local. (Though server widgets typically don't fall in this bucket unless IDs magically collide).
                if (!lw || !saved) {
                  return {
                    sw,
                    lw,
                    saved,
                    keepLocalConfig: false,
                    keepLocalLayout: false,
                    keepLocalStyle: false,
                    keepLocalInstance: false,
                    keepLocalAnnotation: false,
                    isDeletedLocally,
                  };
                }

                const configChangedLocally =
                  lw.version !== undefined && saved.version !== undefined
                    ? lw.version !== saved.version
                    : JSON.stringify(lw.config) !==
                      JSON.stringify(saved.config);
                const layoutChangedLocally = LAYOUT_FIELDS.some(
                  (f) => lw[f] !== saved[f]
                );
                const styleChangedLocally = STYLE_FIELDS.some(
                  (f) => lw[f] !== saved[f]
                );
                const instanceChangedLocally = INSTANCE_FIELDS.some(
                  (f) => lw[f] !== saved[f]
                );
                // Fast-path: skip JSON.stringify when both values are the
                // same reference (including both undefined). When references
                // differ, short-circuit on paths array length before falling
                // back to deep comparison to avoid serializing large paths.
                const annotationChangedLocally = (() => {
                  const la = lw.annotation;
                  const sa = saved.annotation;
                  if (la === sa) return false;
                  if (!la || !sa) return true;
                  if (la.mode !== sa.mode) return true;
                  if ((la.paths?.length ?? 0) !== (sa.paths?.length ?? 0))
                    return true;
                  return JSON.stringify(la) !== JSON.stringify(sa);
                })();

                return {
                  sw,
                  lw,
                  saved,
                  isDeletedLocally,
                  // If remote control is OFF, do not accept incoming server changes
                  keepLocalConfig:
                    configChangedLocally || !remoteControlEnabled,
                  keepLocalLayout:
                    layoutChangedLocally || !remoteControlEnabled,
                  keepLocalStyle: styleChangedLocally || !remoteControlEnabled,
                  keepLocalInstance:
                    instanceChangedLocally || !remoteControlEnabled,
                  keepLocalAnnotation:
                    annotationChangedLocally || !remoteControlEnabled,
                };
              });

              const mergedWidgets = widgetMergeDecisions
                .filter((d) => !d.isDeletedLocally)
                .map(
                  ({
                    sw,
                    lw,
                    keepLocalConfig,
                    keepLocalLayout,
                    keepLocalStyle,
                    keepLocalInstance,
                    keepLocalAnnotation,
                  }) => {
                    if (!lw) return sw; // new widget from server -> accept

                    return {
                      ...sw,
                      version: keepLocalConfig ? lw.version : sw.version,
                      config: keepLocalConfig ? lw.config : sw.config,
                      ...(keepLocalLayout
                        ? (() => {
                            const acc: Record<string, unknown> = {};
                            for (const f of LAYOUT_FIELDS)
                              acc[f] = lw[f as keyof WidgetData];
                            return acc as Partial<WidgetData>;
                          })()
                        : {}),
                      ...(keepLocalStyle
                        ? (() => {
                            const acc: Record<string, unknown> = {};
                            for (const f of STYLE_FIELDS)
                              acc[f] = lw[f as keyof WidgetData];
                            return acc as Partial<WidgetData>;
                          })()
                        : {}),
                      ...(keepLocalInstance
                        ? (() => {
                            const acc: Record<string, unknown> = {};
                            for (const f of INSTANCE_FIELDS)
                              acc[f] = lw[f as keyof WidgetData];
                            return acc as Partial<WidgetData>;
                          })()
                        : {}),
                      ...(keepLocalAnnotation
                        ? { annotation: lw.annotation }
                        : {}),
                    };
                  }
                );

              // Clean up locally-added tracking for widgets now confirmed by the server
              const serverIds = new Set(db.widgets.map((w) => w.id));
              for (const sid of serverIds) {
                locallyAddedWidgetIds.current.delete(sid);
              }

              // Append widgets added locally that aren't on the server yet.
              // Only keep widgets explicitly tracked as locally-added; widgets
              // present locally but absent from the server that are NOT in the
              // tracking set were remotely deleted and should be removed.
              const localOnlyWidgets = currentActive.widgets.filter(
                (w) =>
                  !serverIds.has(w.id) &&
                  locallyAddedWidgetIds.current.has(w.id)
              );

              // SURGICAL MERGE STATE UPDATE
              // To prevent the "rejected server update" race condition, we MUST immediately
              // update `lastSavedFieldsRef` to match the fields we just ACCEPTED from the server.
              // Otherwise, if the server sends another update before our local auto-save completes,
              // the client will mistakenly see its new state (the one we just accepted) as a "local change"
              // relative to the stale `lastSavedFieldsRef`, and it will reject the server's new update.
              if (!backgroundChangedLocally) {
                lastSavedFieldsRef.current.background = db.background;
              }
              if (!nameChangedLocally) {
                lastSavedFieldsRef.current.name = db.name;
              }
              if (!libraryOrderChangedLocally) {
                lastSavedFieldsRef.current.libraryOrder = JSON.stringify(
                  db.libraryOrder ?? []
                );
              }
              if (!settingsChangedLocally) {
                lastSavedFieldsRef.current.settings = JSON.stringify(
                  db.settings ?? {}
                );
              }

              // For widgets, construct the array of what we would have saved if we had
              // accepted the server's widget baseline for non-locally-modified widgets.
              const nextLastSavedWidgets = widgetMergeDecisions.map(
                ({
                  sw,
                  lw,
                  saved,
                  keepLocalConfig,
                  keepLocalLayout,
                  keepLocalStyle,
                  keepLocalInstance,
                  keepLocalAnnotation,
                }) => {
                  if (!lw || !saved) return sw;

                  return {
                    ...sw,
                    version: keepLocalConfig ? saved.version : sw.version,
                    config: keepLocalConfig ? saved.config : sw.config,
                    ...(keepLocalLayout
                      ? (() => {
                          const acc: Record<string, unknown> = {};
                          for (const f of LAYOUT_FIELDS)
                            acc[f] = saved[f as keyof WidgetData];
                          return acc as Partial<WidgetData>;
                        })()
                      : {}),
                    ...(keepLocalStyle
                      ? (() => {
                          const acc: Record<string, unknown> = {};
                          for (const f of STYLE_FIELDS)
                            acc[f] = saved[f as keyof WidgetData];
                          return acc as Partial<WidgetData>;
                        })()
                      : {}),
                    ...(keepLocalInstance
                      ? (() => {
                          const acc: Record<string, unknown> = {};
                          for (const f of INSTANCE_FIELDS)
                            acc[f] = saved[f as keyof WidgetData];
                          return acc as Partial<WidgetData>;
                        })()
                      : {}),
                    ...(keepLocalAnnotation
                      ? { annotation: saved.annotation }
                      : {}),
                  };
                }
              );
              lastSavedFieldsRef.current.widgets =
                JSON.stringify(nextLastSavedWidgets);

              return {
                ...db,
                widgets: [...mergedWidgets, ...localOnlyWidgets],
                background: backgroundChangedLocally
                  ? currentActive.background
                  : db.background,
                name: nameChangedLocally ? currentActive.name : db.name,
                libraryOrder: libraryOrderChangedLocally
                  ? currentActive.libraryOrder
                  : db.libraryOrder,
                settings: settingsChangedLocally
                  ? currentActive.settings
                  : db.settings,
              };
            }
            return db;
          });
        } else {
          // No local conflicts — accept the server state. Sync all saved-data
          // refs to match so that subsequent phone remote changes don't
          // incorrectly trigger hasUnsavedLocalChanges on the desktop, and so
          // the structural-change debounce baseline stays accurate.
          if (serverActive) {
            const { serializedData: serverData, fields: serverFields } =
              getDashboardSaveState(serverActive);
            lastSavedDataRef.current = serverData;
            lastSavedFieldsRef.current = serverFields;
            lastWidgetCountRef.current = serverActive.widgets.length;
            lastSavedDashboardIdRef.current = serverActive.id;
          }
          newDashboards = migratedDashboards;
        }

        setDashboards(newDashboards);

        // Update libraryOrder state from active dashboard if it changed on server
        const activeOnServer = migratedDashboards.find(
          (d) => d.id === activeIdRef.current
        );
        if (activeOnServer?.libraryOrder) {
          setLibraryOrder(activeOnServer.libraryOrder);
        }

        if (migratedDashboards.length > 0 && !activeIdRef.current) {
          // Try to load default dashboard first
          const defaultDb = migratedDashboards.find((d) => d.isDefault);
          updateActiveId(defaultDb ? defaultDb.id : migratedDashboards[0].id);
        }

        // Create default dashboard if none exist
        if (updatedDashboards.length === 0 && !migrated) {
          const defaultDb: Dashboard = {
            id: crypto.randomUUID(),
            name: 'My First Board',
            background: 'bg-slate-900',
            widgets: [],
            createdAt: Date.now(),
          };
          void saveDashboard(defaultDb)
            .then(() => {
              setToasts((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  message: 'Welcome! Board created',
                  type: 'info' as const,
                },
              ]);
            })
            .catch(console.error);
        }

        setLoading(false);
      }
    );

    // Migrate localStorage data on first sign-in
    const localData = localStorage.getItem('classroom_dashboards');
    if (localData && !migrated) {
      migrateLocalStorageToFirestore(user.uid, saveDashboard)
        .then((count) => {
          if (count > 0) {
            setToasts((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                message: `Migrated ${count} dashboard(s) to cloud`,
                type: 'success' as const,
              },
            ]);
          }
          setMigrated(true);
        })
        .catch((err) => {
          console.error('Migration error:', err);
          setToasts((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              message: 'Failed to migrate local data',
              type: 'error' as const,
            },
          ]);
        });
    }

    return () => {
      unsubscribe();
    };
  }, [user, subscribeToDashboards, migrated, saveDashboard, updateActiveId]);

  // Auto-save to Firestore with debouncing
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track auxiliary timeouts spawned by save handlers so they can be
  // cleaned up when the effect re-runs or the component unmounts.
  const auxTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const lastSavedDataRef = useRef<string>('');
  const lastWidgetCountRef = useRef<number>(0);
  // Track which dashboard the saved-data refs correspond to so they can be
  // re-initialised when the user switches dashboards.
  const lastSavedDashboardIdRef = useRef<string | null>(null);
  // Track per-field last-saved state so the surgical merge can determine
  // which fields actually changed locally vs. which should accept server updates.
  const lastSavedFieldsRef = useRef<{
    widgets: string;
    background: string;
    name: string;
    libraryOrder: string;
    settings: string;
  }>({ widgets: '', background: '', name: '', libraryOrder: '', settings: '' });

  useEffect(() => {
    // Capture ref value for stable cleanup (react-hooks/exhaustive-deps)
    const auxTimers = auxTimersRef.current;

    if (!user || loading || !activeId) return;

    const active = dashboards.find((d) => d.id === activeId);
    if (!active) return;

    const currentData = serializeDashboard(active);

    // Always clear any pending timer, even if data hasn't changed
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (currentData === lastSavedDataRef.current) {
      // No unsaved changes — if no saves are in-flight either, clear the flag.
      // This handles the case where a debounced timer was cancelled and state
      // reverted to match the last-saved data, so pendingSaveCountRef doesn't
      // get stuck positive.
      if (pendingSaveCountRef.current === 0) {
        setIsSaving(false);
      }
      return;
    }

    // First run after initial load OR after a dashboard switch: initialize save
    // refs from the loaded data WITHOUT triggering a redundant Firestore write.
    //
    // Without this guard the first effect run (or post-switch run) would see
    // lastSavedDataRef.current differing from currentData and schedule a
    // redundant write of the just-loaded Firestore data back to Firestore,
    // incrementing pendingSaveCountRef and causing the onSnapshot merge path
    // to discard concurrent remote-control updates during the round-trip window.
    const isDashboardSwitch =
      lastSavedDashboardIdRef.current !== null &&
      lastSavedDashboardIdRef.current !== active.id;
    if (lastSavedDataRef.current === '' || isDashboardSwitch) {
      const { serializedData: initSavedData, fields: initSavedFields } =
        getDashboardSaveState(active);
      lastSavedDataRef.current = initSavedData;
      lastSavedFieldsRef.current = initSavedFields;
      lastWidgetCountRef.current = active.widgets.length;
      lastSavedDashboardIdRef.current = active.id;
      if (pendingSaveCountRef.current === 0) {
        setIsSaving(false);
      }
      return;
    }

    // Detect structural changes (adding/removing widgets) for more aggressive saving
    const isStructuralChange =
      active.widgets.length !== lastWidgetCountRef.current;
    // Settings-only changes (spotlight, maximize) are small and urgent —
    // use a fast 100 ms debounce so the desktop board reflects remote-
    // controlled presentation changes with minimal perceived delay.
    const debounceMs = isStructuralChange
      ? 200 // add/remove widget
      : lastUpdateWasSettingsOnly.current
        ? 100 // settings toggle (spotlight, maximize, etc.)
        : 800; // widget config / position

    const showSavingTimer = setTimeout(() => setIsSaving(true), 0);
    auxTimers.add(showSavingTimer);
    saveTimerRef.current = setTimeout(() => {
      lastUpdateWasSettingsOnly.current = false; // reset after consuming debounce
      const savedData = currentData;
      // Capture per-field state at save time for field-granular merge decisions
      const savedFields = {
        widgets: JSON.stringify(active.widgets),
        background: active.background,
        name: active.name,
        libraryOrder: JSON.stringify(active.libraryOrder),
        settings: JSON.stringify(active.settings),
      };
      pendingSaveCountRef.current++;
      lastWidgetCountRef.current = active.widgets.length;
      saveDashboard(active)
        .then(() => {
          lastSavedDataRef.current = savedData;
          lastSavedFieldsRef.current = savedFields;
          pendingSaveCountRef.current = Math.max(
            0,
            pendingSaveCountRef.current - 1
          );
          // Clear isSaving after a brief delay to let onSnapshot catch up.
          // If another save is still in-flight, isSaving stays true.
          const delayTimer = setTimeout(() => {
            auxTimers.delete(delayTimer);
            if (pendingSaveCountRef.current === 0) {
              setIsSaving(false);
            }
          }, 300);
          auxTimers.add(delayTimer);
        })
        .catch((err) => {
          pendingSaveCountRef.current = Math.max(
            0,
            pendingSaveCountRef.current - 1
          );
          console.error('Auto-save failed:', err);
          if (pendingSaveCountRef.current === 0) {
            setIsSaving(false);
          }
          setToasts((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              message: 'Failed to sync changes',
              type: 'error' as const,
            },
          ]);
        });
    }, debounceMs);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      // Clean up all auxiliary timeouts (setIsSaving delay, etc.)
      for (const t of auxTimers) clearTimeout(t);
      auxTimers.clear();
    };
  }, [dashboards, activeId, user, loading, saveDashboard]);

  // --- GOOGLE DRIVE SYNC EFFECT ---
  // Decoupled from Firestore auto-save to ensure performance.
  // Debounced heavily (5 seconds) to avoid hitting Drive API limits.
  const lastExportedDataRef = useRef<string>('');
  const driveSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || isAdmin || !driveService || loading || !activeId) return;

    const active = dashboards.find((d) => d.id === activeId);
    if (!active) return;

    const currentData = serializeDashboard(active);

    if (currentData === lastExportedDataRef.current) return;

    if (driveSyncTimerRef.current) clearTimeout(driveSyncTimerRef.current);

    driveSyncTimerRef.current = setTimeout(() => {
      void driveService
        .exportDashboard(active)
        .then((newFileId) => {
          lastExportedDataRef.current = currentData;
          // If we got a new ID (e.g. first sync), save it back to Firestore silently
          if (newFileId !== active.driveFileId) {
            // CRITICAL: Scrub PII before writing directly to Firestore.
            void saveDashboardFirestore({
              ...scrubDashboardPII(active),
              driveFileId: newFileId,
            });
          }
        })
        .catch((err: unknown) => {
          console.error('[Drive Sync] Background export failed:', err);
          if (err instanceof Error && err.message.includes('expired')) {
            addToast(
              'Google Drive session expired. Please reconnect to keep syncing.',
              'error',
              {
                label: 'Reconnect',
                onClick: async () => {
                  const token = await refreshGoogleToken();
                  if (token) {
                    addToast('Google Drive session refreshed', 'success');
                  } else {
                    addToast('Failed to refresh Drive session', 'error');
                  }
                },
              }
            );
          }
        });
    }, 5000);

    return () => {
      if (driveSyncTimerRef.current) clearTimeout(driveSyncTimerRef.current);
    };
  }, [
    user,
    isAdmin,
    driveService,
    dashboards,
    activeId,
    loading,
    saveDashboardFirestore,
    addToast,
    refreshGoogleToken,
  ]);

  // --- PII RESTORE EFFECT ---
  // When the active dashboard changes, attempt to restore any custom widget
  // names (PII) from the Drive PII supplement file. Firestore only stores the
  // scrubbed version; Drive is the authoritative source of PII fields.
  const lastPiiRestoredIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!driveService || !activeId || loading) return;
    // Only run once per dashboard switch
    if (lastPiiRestoredIdRef.current === activeId) return;
    lastPiiRestoredIdRef.current = activeId;

    // Capture activeId to guard against race condition if it changes before the
    // async Drive call completes
    const currentId = activeId;
    const expectedFileName = `${currentId}-pii.json`;

    // Use a static query string to avoid query injection, then filter by exact
    // filename client-side
    void driveService
      .listFiles("name contains '-pii.json'")
      .then(async (files) => {
        const piiFile = files.find((f) => f.name === expectedFileName);
        if (!piiFile) {
          // No supplement found — clear any stale cached ID for this dashboard
          piiDriveFileIdRef.current.delete(currentId);
          return;
        }
        // Cache the file ID so future saves can update in-place
        piiDriveFileIdRef.current.set(currentId, piiFile.id);
        const blob = await driveService.downloadFile(piiFile.id);
        const text = await blob.text();
        const pii = JSON.parse(text) as ReturnType<typeof extractDashboardPII>;
        if (Object.keys(pii).length === 0) return;

        setDashboards((prev) =>
          prev.map((d) => (d.id === currentId ? mergeDashboardPII(d, pii) : d))
        );
      })
      .catch((err: unknown) => {
        // Clear stale file ID if Drive returns 404 (file was manually deleted)
        const isNotFound = err instanceof Error && err.message.includes('404');
        const isExpired =
          err instanceof Error && err.message.includes('expired');

        if (isNotFound) {
          piiDriveFileIdRef.current.delete(currentId);
        }

        if (isExpired) {
          addToast(
            'Google Drive session expired. Some names may be hidden.',
            'error',
            {
              label: 'Reconnect',
              onClick: async () => {
                const token = await refreshGoogleToken();
                if (token) {
                  addToast('Google Drive session refreshed', 'success');
                } else {
                  addToast('Failed to refresh Drive session', 'error');
                }
              },
            }
          );
        } else {
          // Silent for other errors — Drive may be unavailable or no supplement exists yet
          console.warn('[PII Restore] Could not load supplement:', err);
        }
      });
  }, [activeId, loading, driveService, addToast, refreshGoogleToken]);

  // Flush pending saves on page refresh/close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (saveTimerRef.current && user && !loading && activeId) {
        const active = dashboards.find((d) => d.id === activeId);
        if (active) {
          // Note: We can't reliably await this in beforeunload,
          // but we can try to trigger it.
          void saveDashboard(active);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dashboards, activeId, user, loading, saveDashboard]);

  const toggleToolVisibility = useCallback(
    (type: WidgetType | InternalToolType) => {
      setVisibleTools((prev) => {
        const next = prev.includes(type)
          ? prev.filter((t) => t !== type)
          : [...prev, type];
        localStorage.setItem('classroom_visible_tools', JSON.stringify(next));
        return next;
      });

      setDockItems((prev) => {
        const isVisible = visibleTools.includes(type);
        let next: DockItem[];

        if (isVisible) {
          // Remove from dockItems (search globally in tools and folders)
          next = prev
            .map((item) => {
              if (item.type === 'folder') {
                return {
                  ...item,
                  folder: {
                    ...item.folder,
                    items: item.folder.items.filter((t) => t !== type),
                  },
                };
              }
              return item;
            })
            .filter(
              (item) => !(item.type === 'tool' && item.toolType === type)
            );
        } else {
          // Add to dockItems (if not already present)
          const exists = prev.some(
            (item) =>
              (item.type === 'tool' && item.toolType === type) ||
              (item.type === 'folder' && item.folder.items.includes(type))
          );
          next = exists ? prev : [...prev, { type: 'tool', toolType: type }];
        }

        localStorage.setItem('classroom_dock_items', JSON.stringify(next));
        return next;
      });
    },
    [visibleTools]
  );

  const setAllToolsVisibility = useCallback((visible: boolean) => {
    const nextTools = visible ? TOOLS.map((t) => t.type) : [];
    setVisibleTools(nextTools);
    localStorage.setItem('classroom_visible_tools', JSON.stringify(nextTools));

    const nextDock = visible ? migrateToDockItems(nextTools) : [];
    setDockItems(nextDock);
    localStorage.setItem('classroom_dock_items', JSON.stringify(nextDock));
  }, []);

  const reorderTools = useCallback(
    (tools: (WidgetType | InternalToolType)[]) => {
      setVisibleTools(tools);
      localStorage.setItem('classroom_visible_tools', JSON.stringify(tools));
    },
    []
  );

  const reorderLibrary = useCallback(
    (tools: (WidgetType | InternalToolType)[]) => {
      setLibraryOrder(tools);
      localStorage.setItem('spartboard_library_order', JSON.stringify(tools));

      if (!activeIdRef.current) return;
      setDashboards((prev) =>
        prev.map((d) =>
          d.id === activeIdRef.current ? { ...d, libraryOrder: tools } : d
        )
      );
    },
    []
  );

  const reorderDockItems = useCallback((items: DockItem[]) => {
    setDockItems(items);
    localStorage.setItem('classroom_dock_items', JSON.stringify(items));
  }, []);

  // Use a ref to prevent duplicate processing of the same share ID
  // which can happen if dependencies change during the async load
  const processingRef = useRef<string | null>(null);

  // Handle shared dashboard loading
  useEffect(() => {
    if (!pendingShareId || !user) return;
    if (processingRef.current === pendingShareId) return;

    const currentShareId = pendingShareId;
    processingRef.current = currentShareId;
    let mounted = true;

    const load = async () => {
      try {
        const sharedDb = await handleLoadSharedDashboard(currentShareId);

        if (!mounted) return;

        if (sharedDb) {
          // Calculate order based on current dashboards state
          const maxOrder = dashboardsRef.current.reduce(
            (max, db) => Math.max(max, db.order ?? 0),
            0
          );

          // Explicitly construct new dashboard to avoid carrying over
          // metadata from the shared document (e.g. originalAuthor, sharedAt)
          const newDb: Dashboard = {
            id: crypto.randomUUID(),
            name: `${sharedDb.name} (Copy)`,
            background: sharedDb.background,
            widgets: sharedDb.widgets,
            globalStyle: sharedDb.globalStyle,
            settings: sharedDb.settings,
            isDefault: false,
            createdAt: Date.now(),
            order: maxOrder + 1,
          };

          await saveDashboard(newDb);

          if (!mounted) return;

          updateActiveId(newDb.id);
          addToast('Board imported successfully', 'success');
          clearPendingShare();
        } else {
          if (!mounted) return;

          addToast('Shared board not found', 'error');
          clearPendingShare();
        }
      } catch (err) {
        console.error('Failed to load shared dashboard:', err);
        if (!mounted) return;

        addToast('Failed to load shared board', 'error');
        clearPendingShare();
      } finally {
        // Clear processingRef only if it still matches the current share ID
        if (processingRef.current === currentShareId) {
          processingRef.current = null;
        }
      }
    };

    void load();

    return () => {
      mounted = false;
      // Clear processingRef in cleanup if it matches the current share ID
      // This ensures the effect can re-run after StrictMode's remount cycle
      if (processingRef.current === currentShareId) {
        processingRef.current = null;
      }
    };
  }, [
    pendingShareId,
    user,
    handleLoadSharedDashboard,
    saveDashboard,
    addToast,
    clearPendingShare,
    updateActiveId,
  ]);

  // --- FOLDER ACTIONS ---
  const addFolder = useCallback(
    (name: string) => {
      const newFolder: DockFolder = {
        id: crypto.randomUUID(),
        name,
        items: [],
      };
      setDockItems((prev) => {
        const next = [...prev, { type: 'folder' as const, folder: newFolder }];
        localStorage.setItem('classroom_dock_items', JSON.stringify(next));
        return next;
      });
      addToast(`Folder "${name}" created`);
    },
    [addToast]
  );

  const createFolderWithItems = useCallback(
    (name: string, items: (WidgetType | InternalToolType)[]) => {
      setDockItems((prev) => {
        // 1. Remove items from their current locations
        let currentItems = [...prev];
        items.forEach((type) => {
          currentItems = currentItems
            .map((item) => {
              if (item.type === 'folder') {
                return {
                  ...item,
                  folder: {
                    ...item.folder,
                    items: item.folder.items.filter((t) => t !== type),
                  },
                };
              }
              return item;
            })
            .filter(
              (item) => !(item.type === 'tool' && item.toolType === type)
            );
        });

        // 2. Create new folder with items
        const newFolder: DockFolder = {
          id: crypto.randomUUID(),
          name,
          items,
        };

        // 3. Add to dock
        const next = [
          ...currentItems,
          { type: 'folder' as const, folder: newFolder },
        ];
        localStorage.setItem('classroom_dock_items', JSON.stringify(next));
        return next;
      });
      addToast('Group created');
    },
    [addToast]
  );

  const renameFolder = useCallback((id: string, name: string) => {
    setDockItems((prev) => {
      const next = prev.map((item) =>
        item.type === 'folder' && item.folder.id === id
          ? { ...item, folder: { ...item.folder, name } }
          : item
      );
      localStorage.setItem('classroom_dock_items', JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteFolder = useCallback(
    (id: string) => {
      setDockItems((prev) => {
        const folder = prev.find(
          (item) => item.type === 'folder' && item.folder.id === id
        );
        if (!folder || folder.type !== 'folder') return prev;

        // Move items back to root dock
        const folderItems: DockItem[] = folder.folder.items.map((type) => ({
          type: 'tool',
          toolType: type,
        }));

        const next = prev
          .filter((item) => !(item.type === 'folder' && item.folder.id === id))
          .concat(folderItems);

        localStorage.setItem('classroom_dock_items', JSON.stringify(next));
        return next;
      });
      addToast('Folder removed');
    },
    [addToast]
  );

  const addItemToFolder = useCallback(
    (folderId: string, type: WidgetType | InternalToolType) => {
      setDockItems((prev) => {
        // 1. Remove the tool from wherever it was (top-level or another folder)
        const cleaned = prev
          .map((item) => {
            if (item.type === 'folder') {
              return {
                ...item,
                folder: {
                  ...item.folder,
                  items: item.folder.items.filter((t) => t !== type),
                },
              };
            }
            return item;
          })
          .filter((item) => !(item.type === 'tool' && item.toolType === type));

        // 2. Add it to the target folder
        const next = cleaned.map((item) =>
          item.type === 'folder' && item.folder.id === folderId
            ? {
                ...item,
                folder: {
                  ...item.folder,
                  items: [...item.folder.items, type],
                },
              }
            : item
        );

        localStorage.setItem('classroom_dock_items', JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const removeItemFromFolder = useCallback(
    (folderId: string, type: WidgetType | InternalToolType) => {
      setDockItems((prev) => {
        const next = prev.map((item) =>
          item.type === 'folder' && item.folder.id === folderId
            ? {
                ...item,
                folder: {
                  ...item.folder,
                  items: item.folder.items.filter((t) => t !== type),
                },
              }
            : item
        );
        localStorage.setItem('classroom_dock_items', JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const moveItemOutOfFolder = useCallback(
    (folderId: string, type: WidgetType | InternalToolType, index: number) => {
      setDockItems((prev) => {
        // Remove from folder
        const cleaned = prev.map((item) =>
          item.type === 'folder' && item.folder.id === folderId
            ? {
                ...item,
                folder: {
                  ...item.folder,
                  items: item.folder.items.filter((t) => t !== type),
                },
              }
            : item
        );

        // Insert at root level at specified index
        const next = [...cleaned];
        next.splice(index, 0, { type: 'tool', toolType: type });

        localStorage.setItem('classroom_dock_items', JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const reorderFolderItems = useCallback(
    (folderId: string, newItems: (WidgetType | InternalToolType)[]) => {
      setDockItems((prev) => {
        const next = prev.map((item) =>
          item.type === 'folder' && item.folder.id === folderId
            ? {
                ...item,
                folder: {
                  ...item.folder,
                  items: newItems,
                },
              }
            : item
        );
        localStorage.setItem('classroom_dock_items', JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const createNewDashboard = useCallback(
    async (name: string, data?: Dashboard) => {
      if (!user) {
        addToast('Must be signed in to create dashboard', 'error');
        return;
      }

      const maxOrder = dashboards.reduce(
        (max, db) => Math.max(max, db.order ?? 0),
        0
      );

      const newDb: Dashboard = data
        ? { ...data, id: crypto.randomUUID(), name, order: maxOrder + 1 }
        : {
            id: crypto.randomUUID(),
            name,
            background: 'bg-slate-800',
            widgets: [],
            createdAt: Date.now(),
            order: maxOrder + 1,
          };

      try {
        await saveDashboard(newDb);
        updateActiveId(newDb.id);
        addToast(`Dashboard "${name}" ready`);
      } catch (err) {
        console.error('Failed to create dashboard:', err);
        addToast('Failed to create dashboard', 'error');
      }
    },
    [user, dashboards, saveDashboard, addToast, updateActiveId]
  );

  const saveCurrentDashboard = useCallback(async () => {
    if (!user) {
      addToast('Must be signed in to save', 'error');
      return;
    }

    const active = dashboards.find((d) => d.id === activeId);
    if (active) {
      try {
        await saveDashboard(active);
        addToast('All changes saved to cloud', 'success');
      } catch (err) {
        console.error('Save failed:', err);
        addToast('Save failed', 'error');
      }
    }
  }, [user, dashboards, activeId, saveDashboard, addToast]);

  const deleteDashboard = useCallback(
    async (id: string) => {
      if (!user) {
        addToast('Must be signed in to delete', 'error');
        return;
      }

      try {
        await handleDeleteDashboard(id);
        if (activeId === id) {
          const filtered = dashboards.filter((d) => d.id !== id);
          updateActiveId(filtered.length > 0 ? filtered[0].id : null);
        }
        addToast('Dashboard removed');
      } catch (err) {
        console.error('Delete failed:', err);
        addToast('Delete failed', 'error');
      }
    },
    [
      user,
      activeId,
      dashboards,
      handleDeleteDashboard,
      addToast,
      updateActiveId,
    ]
  );

  const duplicateDashboard = useCallback(
    async (id: string) => {
      if (!user) {
        addToast('Must be signed in to duplicate', 'error');
        return;
      }

      const dashboard = dashboards.find((d) => d.id === id);
      if (!dashboard) return;

      const maxOrder = dashboards.reduce(
        (max, db) => Math.max(max, db.order ?? 0),
        0
      );

      const duplicated: Dashboard = {
        ...dashboard,
        id: crypto.randomUUID(),
        name: `${dashboard.name} (Copy)`,
        isDefault: false,
        createdAt: Date.now(),
        order: maxOrder + 1,
      };

      try {
        await saveDashboard(duplicated);
        addToast(`Board "${dashboard.name}" duplicated`);
      } catch (err) {
        console.error('Duplicate failed:', err);
        addToast('Duplicate failed', 'error');
      }
    },
    [user, dashboards, saveDashboard, addToast]
  );

  const renameDashboard = useCallback(
    async (id: string, name: string) => {
      if (!user) {
        addToast('Must be signed in to rename', 'error');
        return;
      }

      const dashboard = dashboards.find((d) => d.id === id);
      if (!dashboard) return;

      const updated = { ...dashboard, name };

      // Update local state immediately
      setDashboards((prev) => prev.map((d) => (d.id === id ? updated : d)));

      if (activeId === id) {
        lastLocalUpdateAt.current = Date.now();
        lastUpdateWasSettingsOnly.current = false;
      }

      try {
        await saveDashboard(updated);
        addToast('Dashboard renamed');
      } catch (err) {
        console.error('Rename failed:', err);
        addToast('Rename failed', 'error');
        // Revert
        setDashboards((prev) => prev.map((d) => (d.id === id ? dashboard : d)));
      }
    },
    [user, dashboards, activeId, saveDashboard, addToast]
  );

  const reorderDashboards = useCallback(
    async (ids: string[]) => {
      if (!user) return;

      const updatedDashboards: Dashboard[] = [];
      ids.forEach((id, index) => {
        const db = dashboards.find((d) => d.id === id);
        if (db) {
          updatedDashboards.push({ ...db, order: index });
        }
      });

      // Update local state
      setDashboards((prev) => {
        const next = [...prev];
        updatedDashboards.forEach((updated) => {
          const index = next.findIndex((d) => d.id === updated.id);
          if (index >= 0) next[index] = updated;
        });
        return next.sort((a, b) => {
          const orderA = a.order ?? 0;
          const orderB = b.order ?? 0;
          if (orderA !== orderB) return orderA - orderB;
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return (b.createdAt || 0) - (a.createdAt || 0);
        });
      });

      // Save to Firestore
      try {
        await saveDashboards(updatedDashboards);
      } catch (err) {
        console.error('Failed to save reordered dashboards:', err);
      }
    },
    [user, dashboards, saveDashboards]
  );

  const setDefaultDashboard = useCallback(
    (id: string) => {
      if (!user) return;

      const updatedDashboards = dashboards.map((db) => ({
        ...db,
        isDefault: db.id === id,
      }));

      // Update local state
      setDashboards(
        [...updatedDashboards].sort((a, b) => {
          const orderA = a.order ?? 0;
          const orderB = b.order ?? 0;
          if (orderA !== orderB) return orderA - orderB;
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return (b.createdAt || 0) - (a.createdAt || 0);
        })
      );

      // Save to Firestore
      void saveDashboards(updatedDashboards).catch((err) => {
        console.error('Failed to save default dashboard status:', err);
      });

      addToast('Default board updated');
    },
    [user, dashboards, saveDashboards, addToast]
  );

  const resetDockToDefaults = useCallback(() => {
    // Re-use the shared helper so the access-filtering logic (enabled,
    // accessLevel, betaUsers) is always consistent with the init path.
    const defaultTools = getDefaultDockTools();

    const defaultDock = migrateToDockItems(defaultTools);
    setDockItems(defaultDock);
    setVisibleTools(defaultTools);
    localStorage.setItem('classroom_dock_items', JSON.stringify(defaultDock));
    localStorage.setItem(
      'classroom_visible_tools',
      JSON.stringify(defaultTools)
    );

    addToast('Dock reset to building defaults', 'success');
  }, [getDefaultDockTools, addToast]);

  const loadDashboard = useCallback(
    (id: string) => {
      updateActiveId(id);
      addToast('Board loaded');
    },
    [addToast, updateActiveId]
  );

  const activeDashboard = dashboards.find((d) => d.id === activeId) ?? null;

  /**
   * Extracts building-level config overrides for a widget type from the admin's
   * feature_permissions config. These are applied between widget defaults and
   * explicit overrides so that per-building admin settings pre-configure new
   * widget instances for the teacher's building.
   */
  const getAdminBuildingConfig = useCallback(
    (type: WidgetType): Record<string, unknown> => {
      if (!selectedBuildings.length) return {};
      const buildingId = selectedBuildings[0];
      const perm = featurePermissions.find((p) => p.widgetType === type);
      const raw = (
        perm?.config as
          | { buildingDefaults?: Record<string, Record<string, unknown>> }
          | undefined
      )?.buildingDefaults?.[buildingId];
      if (!raw) return {};

      const out: Record<string, unknown> = {};
      switch (type) {
        case 'seating-chart': {
          let validRosterMode: 'class' | 'custom' | undefined;
          if (typeof raw.rosterMode === 'string') {
            if (raw.rosterMode === 'class' || raw.rosterMode === 'custom') {
              validRosterMode = raw.rosterMode;
              out.rosterMode = validRosterMode;
            }
          }
          break;
        }
        case 'reveal-grid': {
          const validRevealModes = ['flip', 'fade'] as const;
          const validRevealFonts = [
            'sans',
            'serif',
            'mono',
            'handwritten',
            'rounded',
            'fun',
            'comic',
            'slab',
            'retro',
            'marker',
            'cursive',
          ] as const;
          const validColumns = [2, 3, 4, 5] as const;
          if (
            typeof raw.columns === 'number' &&
            (validColumns as readonly number[]).includes(raw.columns)
          )
            out.columns = raw.columns;
          if (
            typeof raw.revealMode === 'string' &&
            (validRevealModes as readonly string[]).includes(raw.revealMode)
          )
            out.revealMode = raw.revealMode;
          if (
            typeof raw.fontFamily === 'string' &&
            (validRevealFonts as readonly string[]).includes(raw.fontFamily)
          )
            out.fontFamily = raw.fontFamily;
          if (
            typeof raw.defaultCardColor === 'string' &&
            raw.defaultCardColor.trim() !== ''
          )
            out.defaultCardColor = raw.defaultCardColor;
          if (
            typeof raw.defaultCardBackColor === 'string' &&
            raw.defaultCardBackColor.trim() !== ''
          )
            out.defaultCardBackColor = raw.defaultCardBackColor;
          break;
        }
        case 'smartNotebook': {
          const storageLimit = (raw as { storageLimitMb?: unknown })
            .storageLimitMb;
          if (
            typeof storageLimit === 'number' &&
            Number.isFinite(storageLimit)
          ) {
            const clampedStorageLimit = Math.max(0, storageLimit);
            out.storageLimitMb = clampedStorageLimit;
          }
          break;
        }
        case 'numberLine': {
          const validDisplayModes = [
            'integers',
            'decimals',
            'fractions',
          ] as const;
          if (typeof raw.min === 'number' && Number.isFinite(raw.min))
            out.min = raw.min;
          if (typeof raw.max === 'number' && Number.isFinite(raw.max))
            out.max = raw.max;
          if (
            typeof raw.step === 'number' &&
            Number.isFinite(raw.step) &&
            raw.step > 0
          )
            out.step = raw.step;
          if (
            typeof raw.displayMode === 'string' &&
            (validDisplayModes as readonly string[]).includes(raw.displayMode)
          )
            out.displayMode = raw.displayMode;
          if (typeof raw.showArrows === 'boolean')
            out.showArrows = raw.showArrows;
          break;
        }
        case 'syntax-framer':
          if (
            typeof raw.mode === 'string' &&
            (raw.mode === 'text' || raw.mode === 'math')
          ) {
            out.mode = raw.mode;
          }
          if (
            typeof raw.alignment === 'string' &&
            (raw.alignment === 'left' || raw.alignment === 'center')
          ) {
            out.alignment = raw.alignment;
          }
          break;
        case 'clock':
          if (raw.format24 !== undefined) out.format24 = raw.format24;
          if (raw.fontFamily) out.fontFamily = raw.fontFamily;
          if (raw.themeColor) out.themeColor = raw.themeColor;
          break;
        case 'breathing': {
          const validPatterns = ['4-4-4-4', '4-7-8', '5-5'] as const;
          const validVisuals = ['circle', 'lotus', 'wave'] as const;
          if (
            typeof raw.pattern === 'string' &&
            (validPatterns as readonly string[]).includes(raw.pattern)
          )
            out.pattern = raw.pattern;
          if (
            typeof raw.visual === 'string' &&
            (validVisuals as readonly string[]).includes(raw.visual)
          )
            out.visual = raw.visual;
          if (typeof raw.color === 'string' && raw.color.trim() !== '')
            out.color = raw.color;
          break;
        }
        case 'time-tool':
          if (typeof raw.duration === 'number') {
            out.duration = raw.duration;
            out.elapsedTime = raw.duration;
          }
          if (raw.timerEndTrafficColor !== undefined)
            out.timerEndTrafficColor = raw.timerEndTrafficColor;
          break;
        case 'checklist':
          if (Array.isArray(raw.items) && raw.items.length > 0) {
            out.items = (raw.items as Array<{ id: string; text: string }>).map(
              (item) => ({
                id: crypto.randomUUID(),
                text: item.text,
                completed: false,
              })
            );
          }
          if (raw.scaleMultiplier !== undefined)
            out.scaleMultiplier = raw.scaleMultiplier;
          break;
        case 'sound':
          if (raw.visual) out.visual = raw.visual;
          if (raw.sensitivity !== undefined) out.sensitivity = raw.sensitivity;
          break;
        case 'text':
          if (raw.bgColor) out.bgColor = raw.bgColor;
          if (typeof raw.fontSize === 'number') out.fontSize = raw.fontSize;
          break;
        case 'traffic':
          if (raw.active !== undefined) out.active = raw.active;
          break;
        case 'random':
          if (raw.visualStyle) out.visualStyle = raw.visualStyle;
          if (raw.soundEnabled !== undefined)
            out.soundEnabled = raw.soundEnabled;
          break;
        case 'dice':
          if (typeof raw.count === 'number') out.count = raw.count;
          break;
        case 'drawing':
          // Note: `mode` is no longer configurable per-building — annotation
          // vs windowed whiteboard is now an explicit runtime choice via the
          // Dock popover. Only width/colors remain as building defaults.
          if (typeof raw.width === 'number') {
            const roundedWidth = Math.round(raw.width);
            if (roundedWidth >= 1 && roundedWidth <= 20) {
              out.width = roundedWidth;
            }
          }
          if (Array.isArray(raw.customColors)) {
            const stringColors = raw.customColors.filter(
              (c): c is string => typeof c === 'string' && c.trim() !== ''
            );
            if (stringColors.length > 0) {
              const normalized: string[] = stringColors.slice(0, 5);
              while (normalized.length < 5) {
                normalized.push(normalized[normalized.length - 1]);
              }
              out.customColors = normalized;
              // Also set the active color to the first preset
              out.color = normalized[0];
            }
          }
          break;
        case 'scoreboard':
          if (Array.isArray(raw.teams) && raw.teams.length > 0) {
            out.teams = (
              raw.teams as Array<{ name: string; color?: string }>
            ).map((t) => ({
              id: crypto.randomUUID(),
              name: t.name,
              color: t.color,
              score: 0,
            }));
          }
          break;
        case 'poll':
          if (typeof raw.question === 'string') out.question = raw.question;
          if (Array.isArray(raw.options) && raw.options.length > 0) {
            out.options = (raw.options as Array<{ label: string }>).map(
              (opt) => ({
                id: crypto.randomUUID(),
                label: opt.label,
                votes: 0,
              })
            );
          }
          break;
        case 'materials':
          if (
            Array.isArray(raw.selectedItems) &&
            raw.selectedItems.length > 0
          ) {
            const validMaterialIds = new Set(
              getMaterialsCatalog(
                perm?.config as Partial<MaterialsGlobalConfig>
              ).map((item) => item.id)
            );
            out.selectedItems = raw.selectedItems.filter(
              (item): item is string =>
                typeof item === 'string' && validMaterialIds.has(item)
            );
          }
          break;
        case 'nextUp':
          if (raw) {
            if (typeof raw['displayCount'] === 'number') {
              out.displayCount = raw['displayCount'];
            }
            if (raw['fontFamily'] || raw['themeColor']) {
              const nextUpDefaultConfig = WIDGET_DEFAULTS.nextUp
                .config as unknown as NextUpConfig;
              out.styling = {
                ...nextUpDefaultConfig.styling,
                ...(typeof raw['fontFamily'] === 'string'
                  ? { fontFamily: raw['fontFamily'] }
                  : {}),
                ...(typeof raw['themeColor'] === 'string'
                  ? { themeColor: raw['themeColor'] }
                  : {}),
              };
            }
          }
          break;
        case 'hotspot-image':
          if (raw.popoverTheme) out.popoverTheme = raw.popoverTheme;
          break;
        case 'concept-web':
          if (
            typeof raw.defaultNodeWidth === 'number' &&
            Number.isFinite(raw.defaultNodeWidth)
          ) {
            out.defaultNodeWidth = Math.max(
              5,
              Math.min(50, Math.round(raw.defaultNodeWidth))
            );
          }
          if (
            typeof raw.defaultNodeHeight === 'number' &&
            Number.isFinite(raw.defaultNodeHeight)
          ) {
            out.defaultNodeHeight = Math.max(
              5,
              Math.min(50, Math.round(raw.defaultNodeHeight))
            );
          }
          if (typeof raw.fontFamily === 'string')
            out.fontFamily = raw.fontFamily;
          break;
        case 'classes':
          if (typeof raw.classLinkEnabled === 'boolean') {
            out.classLinkEnabled = raw.classLinkEnabled;
          }
          break;
        case 'url':
          if (Array.isArray(raw.urls) && raw.urls.length > 0) {
            out.urls = (
              raw.urls as Array<{
                url: string;
                title?: string;
                color?: string;
              }>
            ).map((item) => ({
              id: crypto.randomUUID(),
              url: typeof item.url === 'string' ? item.url : '',
              ...(typeof item.title === 'string' ? { title: item.title } : {}),
              ...(typeof item.color === 'string' ? { color: item.color } : {}),
            }));
          }
          break;
        case 'soundboard': {
          const soundIds: string[] = [];
          if (Array.isArray(raw.availableSounds)) {
            for (const s of raw.availableSounds as Array<{ id?: string }>) {
              if (typeof s.id === 'string') soundIds.push(s.id);
            }
          }
          if (Array.isArray(raw.enabledLibrarySoundIds)) {
            for (const id of raw.enabledLibrarySoundIds as string[]) {
              if (typeof id === 'string') soundIds.push(id);
            }
          }
          if (Array.isArray(raw.enabledCustomSoundIds)) {
            for (const id of raw.enabledCustomSoundIds as string[]) {
              if (typeof id === 'string') soundIds.push(id);
            }
          }
          if (soundIds.length > 0) out.selectedSoundIds = soundIds;
          break;
        }
        case 'schedule': {
          if (Array.isArray(raw.schedules) && raw.schedules.length > 0) {
            out.schedules = (
              raw.schedules as Array<{
                name?: string;
                items?: Array<Record<string, unknown>>;
                days?: number[];
              }>
            ).map((sched) => ({
              ...sched,
              id: crypto.randomUUID(),
              items: Array.isArray(sched.items)
                ? sched.items.map((item) => ({
                    ...item,
                    id: crypto.randomUUID(),
                  }))
                : [],
            }));
          }
          if (Array.isArray(raw.items) && raw.items.length > 0) {
            out.items = (raw.items as Array<Record<string, unknown>>).map(
              (item) => ({
                ...item,
                id: crypto.randomUUID(),
              })
            );
          }
          break;
        }
        case 'embed':
          // Building embed defaults (hideUrlField, whitelistUrls) are
          // admin-level constraints consumed by the EmbedWidget via direct
          // permission config lookup, not widget config fields.
          break;
        case 'qr':
          if (
            typeof raw.defaultUrl === 'string' &&
            raw.defaultUrl.trim() !== ''
          )
            out.url = raw.defaultUrl;
          if (typeof raw.qrColor === 'string' && raw.qrColor.trim() !== '')
            out.qrColor = raw.qrColor;
          if (typeof raw.qrBgColor === 'string' && raw.qrBgColor.trim() !== '')
            out.qrBgColor = raw.qrBgColor;
          break;
        case 'countdown': {
          const validViewModes = ['number', 'grid'] as const;
          if (typeof raw.title === 'string') out.title = raw.title;
          if (typeof raw.startDate === 'string') out.startDate = raw.startDate;
          if (typeof raw.eventDate === 'string') out.eventDate = raw.eventDate;
          if (typeof raw.includeWeekends === 'boolean')
            out.includeWeekends = raw.includeWeekends;
          if (typeof raw.countToday === 'boolean')
            out.countToday = raw.countToday;
          if (
            typeof raw.viewMode === 'string' &&
            (validViewModes as readonly string[]).includes(raw.viewMode)
          )
            out.viewMode = raw.viewMode;
          break;
        }
        default:
          break;
      }
      return out;
    },
    [featurePermissions, selectedBuildings]
  );

  const addWidget = useCallback(
    (type: WidgetType, overrides?: AddWidgetOverrides) => {
      if (!activeId) return;
      lastLocalUpdateAt.current = Date.now();
      lastUpdateWasSettingsOnly.current = false;

      const adminConfig = getAdminBuildingConfig(type);

      setDashboards((prev) =>
        prev.map((d) => {
          if (d.id !== activeId) return d;
          const maxZ = d.widgets.reduce((max, w) => Math.max(max, w.z), 0);
          const defaults = WIDGET_DEFAULTS[type] ?? {};

          const newWidgetId = crypto.randomUUID();
          locallyAddedWidgetIds.current.add(newWidgetId);
          const newWidget: WidgetData = {
            id: newWidgetId,
            type,
            x: 50,
            y: 80,
            w: defaults.w ?? 200,
            h: defaults.h ?? 200,
            flipped: false,
            z: maxZ + 1,
            version: 1,
            ...defaults,
            ...overrides,
            // Layer order: widget defaults → admin building defaults → saved global config → explicit overrides
            config: Object.assign(
              {},
              defaults.config ?? {},
              adminConfig,
              stripTransientKeys(savedWidgetConfigs?.[type] ?? {}),
              overrides?.config ?? {}
            ) as WidgetConfig,
          };
          return { ...d, widgets: [...d.widgets, newWidget] };
        })
      );
    },
    [activeId, getAdminBuildingConfig, savedWidgetConfigs]
  );

  const addWidgets = useCallback(
    (
      widgetsToAdd: {
        type: WidgetType;
        config?: WidgetConfig;
        gridConfig?: GridPosition;
      }[]
    ) => {
      if (!activeId) return;
      lastLocalUpdateAt.current = Date.now();
      lastUpdateWasSettingsOnly.current = false;

      setDashboards((prev) =>
        prev.map((d) => {
          if (d.id !== activeId) return d;
          let maxZ = d.widgets.reduce((max, w) => Math.max(max, w.z), 0);

          // --- GRID SYSTEM CONSTANTS ---
          // Base 16:9 canvas (1600x900), clamped to the current viewport so
          // smart-grid layouts remain visible on smaller screens.
          const { boardW: BOARD_W, boardH: BOARD_H } = (() => {
            const BASE_BOARD_W = 1600;
            const BASE_BOARD_H = 900;
            if (typeof window === 'undefined') {
              return { boardW: BASE_BOARD_W, boardH: BASE_BOARD_H };
            }
            // Use window dimensions if available, otherwise fall back to base
            // Clamping ensures that col 11 (at OFFSET_X + 11*COL_W) doesn't end up off-screen
            const viewportWidth = window.innerWidth || BASE_BOARD_W;
            const viewportHeight = window.innerHeight || BASE_BOARD_H;

            return {
              boardW: Math.min(BASE_BOARD_W, viewportWidth),
              boardH: Math.min(BASE_BOARD_H, viewportHeight),
            };
          })();

          // Margins to prevent widgets from hitting the exact edges of the screen
          const OFFSET_X = 60;
          const OFFSET_Y = 80;
          const GRID_GAP = 16; // 16px gap between widgets

          // Compute grid cell sizes from the usable area after subtracting margins.
          // Clamp to at least GRID_GAP + 1 to avoid zero/negative widget sizes.
          const usableBoardW = Math.max(BOARD_W - 2 * OFFSET_X, GRID_GAP + 1);
          const usableBoardH = Math.max(BOARD_H - 2 * OFFSET_Y, GRID_GAP + 1);
          const COL_W = usableBoardW / 12;
          const ROW_H = usableBoardH / 12;

          const newWidgets = widgetsToAdd.map((item, index) => {
            const defaults = WIDGET_DEFAULTS[item.type] ?? {};
            const adminConfig = getAdminBuildingConfig(item.type);
            maxZ++;

            // Sanitize AI-provided config and grid positions
            const sanitizedInputConfig = sanitizeAIConfig(
              item.type,
              item.config
            );
            const validatedGrid = item.gridConfig
              ? validateGridConfig(item.gridConfig)
              : null;

            // Base config from defaults, admin settings, and global persistence
            const baseConfig = Object.assign(
              {},
              defaults.config ?? {},
              adminConfig,
              stripTransientKeys(savedWidgetConfigs?.[item.type] ?? {}),
              sanitizedInputConfig
            ) as WidgetConfig;

            const newWidgetId = crypto.randomUUID();
            locallyAddedWidgetIds.current.add(newWidgetId);

            // 1. SMART LAYOUT: If AI provided spatial data
            if (validatedGrid) {
              const { col, row, colSpan, rowSpan } = validatedGrid;
              return {
                id: newWidgetId,
                type: item.type,
                flipped: false,
                z: maxZ,
                version: 1,
                ...defaults,
                x: col * COL_W + OFFSET_X,
                y: row * ROW_H + OFFSET_Y,
                w: Math.max(1, colSpan * COL_W - GRID_GAP),
                h: Math.max(1, rowSpan * ROW_H - GRID_GAP),
                config: baseConfig,
              } as WidgetData;
            }

            // 2. FALLBACK LAYOUT: Legacy 3-column placement for missing gridConfigs
            const col = index % 3;
            const row = Math.floor(index / 3);
            const START_X = 50;
            const START_Y = 80;
            const COL_WIDTH = 350;
            const ROW_HEIGHT = 280;

            return {
              id: newWidgetId,
              type: item.type,
              x: START_X + col * COL_WIDTH,
              y: START_Y + row * ROW_HEIGHT,
              w: defaults.w ?? 250,
              h: defaults.h ?? 250,
              flipped: false,
              z: maxZ,
              version: 1,
              ...defaults,
              config: baseConfig,
            } as WidgetData;
          });

          return { ...d, widgets: [...d.widgets, ...newWidgets] };
        })
      );
    },
    [activeId, getAdminBuildingConfig, savedWidgetConfigs]
  );

  const removeWidget = useCallback(
    (id: string) => {
      if (!activeId) return;
      lastLocalUpdateAt.current = Date.now();
      lastUpdateWasSettingsOnly.current = false;
      setDashboards((prev) =>
        prev.map((d) => {
          if (d.id !== activeId) return d;
          const target = d.widgets.find((w) => w.id === id);
          const gid = target?.groupId;
          let widgets = d.widgets.filter((w) => w.id !== id);
          // Auto-dissolve group if only 1 member left
          if (gid) {
            const remaining = widgets.filter((w) => w.groupId === gid);
            if (remaining.length <= 1) {
              widgets = widgets.map((w) =>
                w.groupId === gid ? { ...w, groupId: undefined } : w
              );
            }
          }
          return { ...d, widgets };
        })
      );
    },
    [activeId]
  );

  const duplicateWidget = useCallback(
    (id: string) => {
      if (!activeId) return;
      lastLocalUpdateAt.current = Date.now();
      lastUpdateWasSettingsOnly.current = false;
      setDashboards((prev) =>
        prev.map((d) => {
          if (d.id !== activeId) return d;
          const target = d.widgets.find((w) => w.id === id);
          if (!target) return d;

          const maxZ = d.widgets.reduce((max, w) => Math.max(max, w.z), 0);
          const duplicated: WidgetData = {
            ...target,
            id: crypto.randomUUID(),
            x: target.x + 20,
            y: target.y + 20,
            z: maxZ + 1,
            version: 1,
            groupId: undefined, // Duplicated widgets are independent
            config: structuredClone(target.config),
          };
          return { ...d, widgets: [...d.widgets, duplicated] };
        })
      );
    },
    [activeId]
  );

  const removeWidgets = useCallback(
    (ids: string[]) => {
      if (!activeId) return;
      lastLocalUpdateAt.current = Date.now();
      lastUpdateWasSettingsOnly.current = false;
      const idSet = new Set(ids);
      setDashboards((prev) =>
        prev.map((d) => {
          if (d.id !== activeId) return d;
          // Collect groupIds of removed widgets for auto-dissolve check
          const affectedGroupIds = new Set<string>();
          d.widgets.forEach((w) => {
            if (idSet.has(w.id) && w.groupId) affectedGroupIds.add(w.groupId);
          });
          const widgets = d.widgets.filter((w) => !idSet.has(w.id));

          if (affectedGroupIds.size === 0) return { ...d, widgets };

          // Count remaining members for each affected group
          const groupCounts = new Map<string, number>();
          widgets.forEach((w) => {
            if (w.groupId && affectedGroupIds.has(w.groupId)) {
              groupCounts.set(w.groupId, (groupCounts.get(w.groupId) ?? 0) + 1);
            }
          });

          // Identify groups with <= 1 remaining member
          const groupsToDissolve = new Set<string>();
          for (const gid of affectedGroupIds) {
            if ((groupCounts.get(gid) ?? 0) <= 1) {
              groupsToDissolve.add(gid);
            }
          }

          // Auto-dissolve identified groups
          const finalWidgets =
            groupsToDissolve.size > 0
              ? widgets.map((w) =>
                  w.groupId && groupsToDissolve.has(w.groupId)
                    ? { ...w, groupId: undefined }
                    : w
                )
              : widgets;

          return { ...d, widgets: finalWidgets };
        })
      );
    },
    [activeId]
  );
  const clearAllStickers = useCallback(() => {
    if (!activeDashboard) return;
    const stickerWidgetIds = activeDashboard.widgets
      .filter((w) => w.type === 'sticker')
      .map((w) => w.id);
    if (stickerWidgetIds.length > 0) {
      removeWidgets(stickerWidgetIds);
    }
  }, [activeDashboard, removeWidgets]);

  const clearAllWidgets = useCallback(() => {
    if (!activeId) return;
    lastLocalUpdateAt.current = Date.now();
    lastUpdateWasSettingsOnly.current = false;
    setDashboards((prev) =>
      prev.map((d) => (d.id === activeId ? { ...d, widgets: [] } : d))
    );
    addToast('All windows cleared');
  }, [activeId, addToast]);

  const updateWidget = useCallback(
    (id: string, updates: Partial<WidgetData>) => {
      if (!activeIdRef.current) return;
      lastLocalUpdateAt.current = Date.now();
      lastUpdateWasSettingsOnly.current = false;

      // Track whether this update changes widget position/size so we can
      // stamp the current viewport dimensions — ensuring the saved viewport
      // always matches the viewport where widget layout was actually set.
      const isLayoutChange =
        'x' in updates || 'y' in updates || 'w' in updates || 'h' in updates;

      setDashboards((prev) =>
        prev.map((d) => {
          if (d.id !== activeIdRef.current) return d;

          let widgetType: WidgetType | undefined;

          const newWidgets = d.widgets.map((w) => {
            if (w.id === id) {
              widgetType = w.type;
              let newVersion = w.version;

              let newConfig = w.config;
              if (updates.config) {
                newConfig = { ...w.config, ...updates.config };
                if (JSON.stringify(w.config) !== JSON.stringify(newConfig)) {
                  newVersion = (w.version ?? 1) + 1;
                }
              }

              return {
                ...w,
                ...updates,
                version: newVersion,
                config: newConfig,
              };
            }
            return w;
          });

          // Save config globally so new instances inherit settings.
          // saveWidgetConfig handles transient-key stripping (including PII fields).
          if (widgetType && updates.config) {
            saveWidgetConfig(widgetType, updates.config);
          }

          return {
            ...d,
            widgets: newWidgets,
            ...(isLayoutChange
              ? {
                  viewportWidth: window.innerWidth,
                  viewportHeight: window.innerHeight,
                }
              : {}),
          };
        })
      );
    },
    [saveWidgetConfig]
  );

  // --- Widget grouping ---

  const updateWidgets = useCallback(
    (
      updates: Array<{
        id: string;
        changes: Partial<Pick<WidgetData, 'x' | 'y' | 'w' | 'h'>>;
      }>
    ) => {
      if (!activeIdRef.current) return;
      lastLocalUpdateAt.current = Date.now();
      lastUpdateWasSettingsOnly.current = false;
      const updateMap = new Map(updates.map((u) => [u.id, u.changes]));
      setDashboards((prev) =>
        prev.map((d) => {
          if (d.id !== activeIdRef.current) return d;
          return {
            ...d,
            widgets: d.widgets.map((w) => {
              const changes = updateMap.get(w.id);
              if (!changes) return w;
              return { ...w, ...changes };
            }),
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
          };
        })
      );
    },
    []
  );

  const groupWidgets = useCallback(
    (widgetIds: string[]) => {
      if (!activeIdRef.current || widgetIds.length < 2) return;

      // Find the active dashboard to check widget states
      const active = dashboardsRef.current.find(
        (d) => d.id === activeIdRef.current
      );
      if (!active) return;

      const widgetMap = new Map(active.widgets.map((w) => [w.id, w]));
      const eligible: string[] = [];
      let excluded = 0;
      for (const id of widgetIds) {
        const w = widgetMap.get(id);
        if (!w) continue;
        if (w.isPinned || w.isLocked || w.minimized) {
          excluded++;
        } else {
          eligible.push(id);
        }
      }

      if (excluded > 0) {
        addToast(
          `${excluded} widget${excluded > 1 ? 's' : ''} skipped (pinned, locked, or minimized)`,
          'info'
        );
      }

      if (eligible.length < 2) return;

      const gid = crypto.randomUUID();
      lastLocalUpdateAt.current = Date.now();
      lastUpdateWasSettingsOnly.current = false;
      const idSet = new Set(eligible);
      setDashboards((prev) =>
        prev.map((d) => {
          if (d.id !== activeIdRef.current) return d;
          return {
            ...d,
            widgets: d.widgets.map((w) =>
              idSet.has(w.id) ? { ...w, groupId: gid } : w
            ),
          };
        })
      );
    },
    [addToast]
  );

  const ungroupWidgets = useCallback((groupId: string) => {
    if (!activeIdRef.current) return;
    lastLocalUpdateAt.current = Date.now();
    lastUpdateWasSettingsOnly.current = false;
    setDashboards((prev) =>
      prev.map((d) => {
        if (d.id !== activeIdRef.current) return d;
        return {
          ...d,
          widgets: d.widgets.map((w) =>
            w.groupId === groupId ? { ...w, groupId: undefined } : w
          ),
        };
      })
    );
  }, []);

  const bringToFront = useCallback((id: string) => {
    if (!activeIdRef.current) return;

    setDashboards((prev) => {
      const active = prev.find((d) => d.id === activeIdRef.current);
      if (!active) return prev;

      const maxZ = active.widgets.reduce((max, w) => Math.max(max, w.z), 0);
      const target = active.widgets.find((w) => w.id === id);
      if (!target) return prev;

      // If widget is in a group, bring the entire group to front
      if (target.groupId) {
        const groupMembers = active.widgets
          .filter((w) => w.groupId === target.groupId)
          .sort((a, b) => a.z - b.z);
        const groupIdSet = new Set(groupMembers.map((w) => w.id));
        const groupMinZ = Math.min(...groupMembers.map((w) => w.z));
        const nonGroupMaxZ = active.widgets.reduce((max, w) => {
          if (groupIdSet.has(w.id)) return max;
          return Math.max(max, w.z);
        }, Number.NEGATIVE_INFINITY);
        if (groupMinZ > nonGroupMaxZ) return prev; // entire group is already on top
        lastLocalUpdateAt.current = Date.now();
        lastUpdateWasSettingsOnly.current = false;
        return prev.map((d) => {
          if (d.id !== activeIdRef.current) return d;
          return {
            ...d,
            widgets: d.widgets.map((w) => {
              if (!groupIdSet.has(w.id)) return w;
              // Preserve internal z-order within the group
              const idx = groupMembers.findIndex((gw) => gw.id === w.id);
              return { ...w, z: maxZ + 1 + idx };
            }),
          };
        });
      }

      if (target.z < maxZ) {
        lastLocalUpdateAt.current = Date.now();
        lastUpdateWasSettingsOnly.current = false;
        return prev.map((d) => {
          if (d.id !== activeIdRef.current) return d;
          return {
            ...d,
            widgets: d.widgets.map((w) =>
              w.id === id ? { ...w, z: maxZ + 1 } : w
            ),
          };
        });
      }
      return prev;
    });
  }, []);

  const moveWidgetLayer = useCallback(
    (id: string, direction: 'up' | 'down') => {
      if (!activeIdRef.current) return;

      setDashboards((prev) => {
        const active = prev.find((d) => d.id === activeIdRef.current);
        if (!active) return prev;

        // Deep copy widgets to avoid mutation and prepare for sort/modify
        const widgets = active.widgets.map((w) => ({ ...w }));

        // Sort by Z
        widgets.sort((a, b) => a.z - b.z);

        // Normalize Zs to ensure contiguous 0..N-1
        widgets.forEach((w, i) => {
          w.z = i;
        });

        const idx = widgets.findIndex((w) => w.id === id);
        if (idx === -1) return prev;

        if (direction === 'up') {
          if (idx < widgets.length - 1) {
            // Swap with next
            widgets[idx].z = idx + 1;
            widgets[idx + 1].z = idx;
            lastLocalUpdateAt.current = Date.now();
            lastUpdateWasSettingsOnly.current = false;
          } else {
            return prev;
          }
        } else {
          // down
          if (idx > 0) {
            // Swap with prev
            widgets[idx].z = idx - 1;
            widgets[idx - 1].z = idx;
            lastLocalUpdateAt.current = Date.now();
            lastUpdateWasSettingsOnly.current = false;
          } else {
            return prev;
          }
        }

        return prev.map((d) =>
          d.id === activeIdRef.current ? { ...d, widgets } : d
        );
      });
    },
    []
  );

  const minimizeAllWidgets = useCallback(() => {
    if (!activeId) return;
    lastLocalUpdateAt.current = Date.now();
    lastUpdateWasSettingsOnly.current = false;
    setDashboards((prev) =>
      prev.map((d) =>
        d.id === activeId
          ? {
              ...d,
              widgets: d.widgets.map((w) => ({
                ...w,
                minimized: true,
                flipped: false,
              })),
            }
          : d
      )
    );
  }, [activeId]);

  const restoreAllWidgets = useCallback(() => {
    if (!activeId) return;
    lastLocalUpdateAt.current = Date.now();
    lastUpdateWasSettingsOnly.current = false;
    setDashboards((prev) =>
      prev.map((d) =>
        d.id === activeId
          ? {
              ...d,
              widgets: d.widgets.map((w) => ({
                ...w,
                minimized: false,
                flipped: false,
                maximized: false,
              })),
            }
          : d
      )
    );
  }, [activeId]);

  const deleteAllWidgets = useCallback(() => {
    if (!activeId) return;
    lastLocalUpdateAt.current = Date.now();
    lastUpdateWasSettingsOnly.current = false;
    setDashboards((prev) =>
      prev.map((d) => (d.id === activeId ? { ...d, widgets: [] } : d))
    );
    addToast('All widgets removed');
  }, [activeId, addToast]);

  const resetWidgetSize = useCallback(
    (id: string) => {
      if (!activeId) return;
      lastLocalUpdateAt.current = Date.now();
      lastUpdateWasSettingsOnly.current = false;
      setDashboards((prev) =>
        prev.map((d) => {
          if (d.id !== activeId) return d;
          return {
            ...d,
            widgets: d.widgets.map((w) => {
              if (w.id !== id) return w;
              const defaults = WIDGET_DEFAULTS[w.type] ?? {};
              return {
                ...w,
                w: defaults.w ?? w.w,
                h: defaults.h ?? w.h,
              };
            }),
          };
        })
      );
    },
    [activeId]
  );

  const setBackground = useCallback((bg: string) => {
    if (!activeIdRef.current) return;
    lastLocalUpdateAt.current = Date.now();
    lastUpdateWasSettingsOnly.current = false;
    setDashboards((prev) =>
      prev.map((d) =>
        d.id === activeIdRef.current ? { ...d, background: bg } : d
      )
    );
  }, []);

  const updateDashboardSettings = useCallback(
    (updates: Partial<Dashboard['settings']>) => {
      if (!activeIdRef.current) return;
      lastLocalUpdateAt.current = Date.now();
      lastUpdateWasSettingsOnly.current = true;
      setDashboards((prev) =>
        prev.map((d) =>
          d.id === activeIdRef.current
            ? {
                ...d,
                settings: {
                  ...(d.settings ?? {}),
                  ...updates,
                },
              }
            : d
        )
      );
    },
    []
  );

  const updateDashboard = useCallback((updates: Partial<Dashboard>) => {
    if (!activeIdRef.current) return;
    lastLocalUpdateAt.current = Date.now();
    lastUpdateWasSettingsOnly.current = false;
    setDashboards((prev) =>
      prev.map((d) => (d.id === activeIdRef.current ? { ...d, ...updates } : d))
    );
  }, []);

  const setGlobalStyle = useCallback((style: Partial<GlobalStyle>) => {
    if (!activeIdRef.current) return;
    lastLocalUpdateAt.current = Date.now();
    lastUpdateWasSettingsOnly.current = false;
    setDashboards((prev) =>
      prev.map((d) =>
        d.id === activeIdRef.current
          ? {
              ...d,
              globalStyle: {
                ...(d.globalStyle ?? DEFAULT_GLOBAL_STYLE),
                ...style,
              },
            }
          : d
      )
    );
  }, []);

  // --- Annotation actions ---
  const openAnnotation = useCallback(() => {
    // Seed from admin building defaults for width + color palette.
    // `color` is not configurable at the admin level — keep the user's
    // previously-chosen color across sessions.
    const adminConfig = getAdminBuildingConfig('drawing') as {
      width?: number;
      customColors?: string[];
    };
    setAnnotationState((prev) => ({
      objects: [],
      color: prev.color,
      width: adminConfig.width ?? DRAWING_DEFAULTS.WIDTH,
      customColors: adminConfig.customColors ?? [
        ...DRAWING_DEFAULTS.CUSTOM_COLORS,
      ],
    }));
    setAnnotationActive(true);
  }, [getAdminBuildingConfig]);

  const closeAnnotation = useCallback(() => {
    setAnnotationActive(false);
    setAnnotationState((prev) => ({ ...prev, objects: [] }));
  }, []);

  const updateAnnotationState = useCallback(
    (updates: Partial<AnnotationState>) => {
      setAnnotationState((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const addAnnotationObject = useCallback((obj: DrawableObject) => {
    setAnnotationState((prev) => ({
      ...prev,
      objects: [...prev.objects, obj],
    }));
  }, []);

  const undoAnnotation = useCallback(() => {
    setAnnotationState((prev) => ({
      ...prev,
      objects: prev.objects.slice(0, -1),
    }));
  }, []);

  const clearAnnotation = useCallback(() => {
    setAnnotationState((prev) => ({ ...prev, objects: [] }));
  }, []);

  const contextValue = useMemo(
    () => ({
      dashboards,
      activeDashboard,
      toasts,
      visibleTools,
      dockItems,
      loading,
      isSaving,
      gradeFilter,
      setGradeFilter: handleSetGradeFilter,
      addToast,
      removeToast,
      createNewDashboard,
      saveCurrentDashboard,
      deleteDashboard,
      duplicateDashboard,
      renameDashboard,
      loadDashboard,
      reorderDashboards,
      setDefaultDashboard,
      resetDockToDefaults,
      addWidget,
      addWidgets,
      removeWidget,
      duplicateWidget,
      removeWidgets,
      updateWidget,
      bringToFront,
      moveWidgetLayer,
      minimizeAllWidgets,
      restoreAllWidgets,
      deleteAllWidgets,
      resetWidgetSize,
      setBackground,
      updateDashboardSettings,
      updateDashboard,
      setGlobalStyle,
      toggleToolVisibility,
      setAllToolsVisibility,
      selectedWidgetId,
      setSelectedWidgetId,
      groupWidgets,
      ungroupWidgets,
      updateWidgets,
      selectedWidgetIds,
      setSelectedWidgetIds,
      groupBuildMode,
      setGroupBuildMode,
      reorderTools,
      reorderLibrary,
      reorderDockItems,
      libraryOrder,
      clearAllStickers,
      clearAllWidgets,
      rosters,
      activeRosterId,
      addRoster,
      updateRoster,
      deleteRoster,
      setActiveRoster,
      addFolder,
      createFolderWithItems,
      renameFolder,
      deleteFolder,
      addItemToFolder,
      removeItemFromFolder,
      moveItemOutOfFolder,
      reorderFolderItems,
      shareDashboard: handleShareDashboard,
      loadSharedDashboard: handleLoadSharedDashboard,
      pendingShareId,
      clearPendingShare,
      pendingQuizShareId,
      clearPendingQuizShare,
      setPendingQuizShareId,
      pendingAssignmentShareId,
      setPendingAssignmentShareId,
      clearPendingAssignmentShare,
      zoom,
      setZoom,
      annotationActive,
      annotationState,
      openAnnotation,
      closeAnnotation,
      updateAnnotationState,
      addAnnotationObject,
      undoAnnotation,
      clearAnnotation,
    }),
    [
      dashboards,
      activeDashboard,
      toasts,
      visibleTools,
      dockItems,
      loading,
      isSaving,
      gradeFilter,
      handleSetGradeFilter,
      addToast,
      removeToast,
      createNewDashboard,
      saveCurrentDashboard,
      deleteDashboard,
      duplicateDashboard,
      renameDashboard,
      loadDashboard,
      reorderDashboards,
      setDefaultDashboard,
      resetDockToDefaults,
      addWidget,
      addWidgets,
      removeWidget,
      duplicateWidget,
      removeWidgets,
      updateWidget,
      bringToFront,
      moveWidgetLayer,
      minimizeAllWidgets,
      restoreAllWidgets,
      deleteAllWidgets,
      resetWidgetSize,
      setBackground,
      updateDashboardSettings,
      updateDashboard,
      setGlobalStyle,
      toggleToolVisibility,
      setAllToolsVisibility,
      selectedWidgetId,
      setSelectedWidgetId,
      groupWidgets,
      ungroupWidgets,
      updateWidgets,
      selectedWidgetIds,
      setSelectedWidgetIds,
      groupBuildMode,
      setGroupBuildMode,
      reorderTools,
      reorderLibrary,
      reorderDockItems,
      libraryOrder,
      clearAllStickers,
      clearAllWidgets,
      rosters,
      activeRosterId,
      addRoster,
      updateRoster,
      deleteRoster,
      setActiveRoster,
      addFolder,
      createFolderWithItems,
      renameFolder,
      deleteFolder,
      addItemToFolder,
      removeItemFromFolder,
      moveItemOutOfFolder,
      reorderFolderItems,
      handleShareDashboard,
      handleLoadSharedDashboard,
      pendingShareId,
      clearPendingShare,
      pendingQuizShareId,
      clearPendingQuizShare,
      setPendingQuizShareId,
      pendingAssignmentShareId,
      setPendingAssignmentShareId,
      clearPendingAssignmentShare,
      zoom,
      setZoom,
      annotationActive,
      annotationState,
      openAnnotation,
      closeAnnotation,
      updateAnnotationState,
      addAnnotationObject,
      undoAnnotation,
      clearAnnotation,
    ]
  );

  return (
    <DashboardContext.Provider value={contextValue}>
      {children}
    </DashboardContext.Provider>
  );
};
