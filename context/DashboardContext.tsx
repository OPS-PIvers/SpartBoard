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
} from '../types';
import { useAuth } from './useAuth';
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

// Helper to migrate legacy visibleTools to dockItems
const migrateToDockItems = (
  visibleTools: (WidgetType | InternalToolType)[]
): DockItem[] => {
  return visibleTools.map((type) => ({ type: 'tool', toolType: type }));
};

/** Serialize dashboard state for change-detection comparisons. */
const serializeDashboard = (d: Dashboard): string =>
  JSON.stringify({
    widgets: d.widgets,
    background: d.background,
    name: d.name,
    libraryOrder: d.libraryOrder,
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
    if (path.startsWith('/share/')) {
      return path.split('/share/')[1] || null;
    }
    return null;
  });

  const clearPendingShare = useCallback(() => {
    setPendingShareId(null);
    window.history.replaceState(null, '', '/');
  }, []);

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef(activeId);
  const dashboardsRef = useRef(dashboards);
  const [toasts, setToasts] = useState<Toast[]>([]);
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
    return TOOLS.map((t) => t.type);
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
    return migrateToDockItems(TOOLS.map((t) => t.type));
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
  // Counter (not boolean) to correctly track overlapping in-flight saves
  const pendingSaveCountRef = useRef<number>(0);
  // Tracks Drive file IDs for PII supplements per dashboard to enable in-place updates
  const piiDriveFileIdRef = useRef<Map<string, string>>(new Map());

  // Sync activeId to ref
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Sync dashboards to ref
  useEffect(() => {
    dashboardsRef.current = dashboards;
  }, [dashboards]);

  // --- DRIVE WRAPPERS & CALLBACKS ---

  const saveDashboard = useCallback(
    async (dashboard: Dashboard) => {
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
          return;
        }
      }

      // CRITICAL: Strip all student PII before writing to Firestore.
      // Custom widget names (firstNames, lastNames, completedNames, etc.) must
      // NEVER reach Firestore — they are preserved in Drive only.
      const scrubbed = scrubDashboardPII(dashboard);

      await saveDashboardFirestore({
        ...scrubbed,
        driveFileId,
      });
    },
    [isAdmin, driveService, saveDashboardFirestore]
  );

  const saveDashboards = useCallback(
    async (dashboardsToSave: Dashboard[]) => {
      // For plural saves (like reordering), we'll do Firestore first
      await saveDashboardsFirestore(dashboardsToSave);

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
      const timer = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => setLoading(true), 0);

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

        setDashboards((prev) => {
          const now = Date.now();
          const isRecentlyUpdatedLocally =
            now - lastLocalUpdateAt.current < 5000;

          // Check if local state has unsaved changes by comparing against
          // what was last saved. This prevents server data from overwriting
          // local edits that haven't been flushed yet.
          const currentActive = prev.find((p) => p.id === activeIdRef.current);
          const hasUnsavedLocalChanges =
            currentActive &&
            lastSavedDataRef.current !== '' &&
            serializeDashboard(currentActive) !== lastSavedDataRef.current;

          // Detect stale snapshots from Firestore latency compensation
          const serverActive = migratedDashboards.find(
            (d) => d.id === activeIdRef.current
          );
          // Use <= to handle cases where timestamps match exactly (fast echoes)
          const isStaleSnapshot =
            serverActive &&
            (serverActive.updatedAt ?? 0) <= lastSavedAtRef.current;

          if (
            hasPendingWrites ||
            isRecentlyUpdatedLocally ||
            hasUnsavedLocalChanges ||
            pendingSaveCountRef.current > 0 ||
            isStaleSnapshot
          ) {
            return migratedDashboards.map((db) => {
              if (db.id === activeIdRef.current && currentActive) {
                // If we have pending writes, this snapshot is just a local echo of what we
                // just did. Trust our current active state completely to avoid reverts.
                if (hasPendingWrites) {
                  return currentActive;
                }

                // If the snapshot is stale (older than our last save), ignore it completely
                // and keep our local state to prevent overwriting with old data.
                if (isStaleSnapshot) {
                  return currentActive;
                }

                // SURGICAL MERGE: Start from server snapshot but only preserve
                // locally-modified fields. Fields unchanged locally accept the
                // server value, so remote edits (e.g. name change in another
                // tab) aren't discarded when only widgets changed locally.
                const localWidgets = JSON.stringify(currentActive.widgets);
                const widgetsChangedLocally =
                  localWidgets !== lastSavedFieldsRef.current.widgets;
                const backgroundChangedLocally =
                  currentActive.background !==
                  lastSavedFieldsRef.current.background;
                const nameChangedLocally =
                  currentActive.name !== lastSavedFieldsRef.current.name;
                const libraryOrderChangedLocally =
                  currentActive.libraryOrder &&
                  JSON.stringify(currentActive.libraryOrder) !==
                    lastSavedFieldsRef.current.libraryOrder;

                return {
                  ...db,
                  ...(widgetsChangedLocally && {
                    widgets: currentActive.widgets,
                  }),
                  ...(backgroundChangedLocally && {
                    background: currentActive.background,
                  }),
                  ...(nameChangedLocally && { name: currentActive.name }),
                  ...(libraryOrderChangedLocally && {
                    libraryOrder: currentActive.libraryOrder,
                  }),
                };
              }
              return db;
            });
          }
          return migratedDashboards;
        });

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
          setActiveId(defaultDb ? defaultDb.id : migratedDashboards[0].id);
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
          void saveDashboard(defaultDb).then(() => {
            setToasts((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                message: 'Welcome! Board created',
                type: 'info' as const,
              },
            ]);
          });
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
      clearTimeout(timer);
      unsubscribe();
    };
  }, [user, subscribeToDashboards, migrated, saveDashboard]);

  // Auto-save to Firestore with debouncing
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track auxiliary timeouts spawned by save handlers so they can be
  // cleaned up when the effect re-runs or the component unmounts.
  const auxTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const lastSavedDataRef = useRef<string>('');
  const lastSavedAtRef = useRef<number>(0);
  const lastWidgetCountRef = useRef<number>(0);
  // Track per-field last-saved state so the surgical merge can determine
  // which fields actually changed locally vs. which should accept server updates.
  const lastSavedFieldsRef = useRef<{
    widgets: string;
    background: string;
    name: string;
    libraryOrder: string;
  }>({ widgets: '', background: '', name: '', libraryOrder: '' });

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

    // Detect structural changes (adding/removing widgets) for more aggressive saving
    const isStructuralChange =
      active.widgets.length !== lastWidgetCountRef.current;
    const debounceMs = isStructuralChange ? 200 : 800; // 200ms for add/remove, 800ms for config/moving

    const showSavingTimer = setTimeout(() => setIsSaving(true), 0);
    auxTimers.add(showSavingTimer);
    saveTimerRef.current = setTimeout(() => {
      const savedData = currentData;
      // Capture per-field state at save time for field-granular merge decisions
      const savedFields = {
        widgets: JSON.stringify(active.widgets),
        background: active.background,
        name: active.name,
        libraryOrder: JSON.stringify(active.libraryOrder),
      };
      pendingSaveCountRef.current++;
      lastWidgetCountRef.current = active.widgets.length;
      saveDashboard(active)
        .then(() => {
          // Only update refs on success so failed saves are retried
          const now = Date.now();
          lastSavedDataRef.current = savedData;
          lastSavedFieldsRef.current = savedFields;
          lastSavedAtRef.current = now;
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
            void saveDashboardFirestore({ ...active, driveFileId: newFileId });
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

          setActiveId(newDb.id);
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
    (name: string, data?: Dashboard) => {
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

      saveDashboard(newDb)
        .then(() => {
          setActiveId(newDb.id);
          addToast(`Dashboard "${name}" ready`);
        })
        .catch((err) => {
          console.error('Failed to create dashboard:', err);
          addToast('Failed to create dashboard', 'error');
        });
    },
    [user, dashboards, saveDashboard, addToast]
  );

  const saveCurrentDashboard = useCallback(() => {
    if (!user) {
      addToast('Must be signed in to save', 'error');
      return;
    }

    const active = dashboards.find((d) => d.id === activeId);
    if (active) {
      saveDashboard(active)
        .then(() => {
          addToast('All changes saved to cloud', 'success');
        })
        .catch((err) => {
          console.error('Save failed:', err);
          addToast('Save failed', 'error');
        });
    }
  }, [user, dashboards, activeId, saveDashboard, addToast]);

  const deleteDashboard = useCallback(
    (id: string) => {
      if (!user) {
        addToast('Must be signed in to delete', 'error');
        return;
      }

      handleDeleteDashboard(id)
        .then(() => {
          if (activeId === id) {
            const filtered = dashboards.filter((d) => d.id !== id);
            setActiveId(filtered.length > 0 ? filtered[0].id : null);
          }
          addToast('Dashboard removed');
        })
        .catch((err) => {
          console.error('Delete failed:', err);
          addToast('Delete failed', 'error');
        });
    },
    [user, activeId, dashboards, handleDeleteDashboard, addToast]
  );

  const duplicateDashboard = useCallback(
    (id: string) => {
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

      saveDashboard(duplicated)
        .then(() => {
          addToast(`Board "${dashboard.name}" duplicated`);
        })
        .catch((err) => {
          console.error('Duplicate failed:', err);
          addToast('Duplicate failed', 'error');
        });
    },
    [user, dashboards, saveDashboard, addToast]
  );

  const renameDashboard = useCallback(
    (id: string, name: string) => {
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
      }

      saveDashboard(updated)
        .then(() => {
          addToast('Dashboard renamed');
        })
        .catch((err) => {
          console.error('Rename failed:', err);
          addToast('Rename failed', 'error');
          // Revert
          setDashboards((prev) =>
            prev.map((d) => (d.id === id ? dashboard : d))
          );
        });
    },
    [user, dashboards, activeId, saveDashboard, addToast]
  );

  const reorderDashboards = useCallback(
    (ids: string[]) => {
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
      void saveDashboards(updatedDashboards).catch((err) => {
        console.error('Failed to save reordered dashboards:', err);
      });
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

  const loadDashboard = useCallback(
    (id: string) => {
      setActiveId(id);
      addToast('Board loaded');
    },
    [addToast]
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
        case 'clock':
          if (raw.format24 !== undefined) out.format24 = raw.format24;
          if (raw.fontFamily) out.fontFamily = raw.fontFamily;
          if (raw.themeColor) out.themeColor = raw.themeColor;
          break;
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
        case 'materials':
          if (Array.isArray(raw.selectedItems) && raw.selectedItems.length > 0)
            out.selectedItems = raw.selectedItems;
          break;
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

      const adminConfig = getAdminBuildingConfig(type);

      setDashboards((prev) =>
        prev.map((d) => {
          if (d.id !== activeId) return d;
          const maxZ = d.widgets.reduce((max, w) => Math.max(max, w.z), 0);
          const defaults = WIDGET_DEFAULTS[type] ?? {};

          const newWidget: WidgetData = {
            id: crypto.randomUUID(),
            type,
            x: 50,
            y: 80,
            w: defaults.w ?? 200,
            h: defaults.h ?? 200,
            flipped: false,
            z: maxZ + 1,
            ...defaults,
            ...overrides,
            // Layer order: widget defaults → admin building defaults → explicit overrides
            config: {
              ...(defaults.config ?? {}),
              ...adminConfig,
              ...(overrides?.config ?? {}),
            } as WidgetConfig,
          };
          return { ...d, widgets: [...d.widgets, newWidget] };
        })
      );
    },
    [activeId, getAdminBuildingConfig]
  );

  const addWidgets = useCallback(
    (widgetsToAdd: { type: WidgetType; config?: WidgetConfig }[]) => {
      if (!activeId) return;
      lastLocalUpdateAt.current = Date.now();

      setDashboards((prev) =>
        prev.map((d) => {
          if (d.id !== activeId) return d;
          let maxZ = d.widgets.reduce((max, w) => Math.max(max, w.z), 0);

          const START_X = 50;
          const START_Y = 80;
          const COL_WIDTH = 300 + 50; // Width + Gap

          const newWidgets = widgetsToAdd.map((item, index) => {
            const defaults = WIDGET_DEFAULTS[item.type] ?? {};
            const adminConfig = getAdminBuildingConfig(item.type);
            maxZ++;

            // 3-Column Grid Layout
            const col = index % 3;
            const row = Math.floor(index / 3);

            // Row height assumption
            const ROW_HEIGHT = 250;

            return {
              id: crypto.randomUUID(),
              type: item.type,
              x: START_X + col * COL_WIDTH,
              y: START_Y + row * ROW_HEIGHT,
              w: defaults.w ?? 200,
              h: defaults.h ?? 200,
              flipped: false,
              z: maxZ,
              ...defaults,
              // Layer order: widget defaults → admin building defaults → explicit item config
              config: {
                ...(defaults.config ?? {}),
                ...adminConfig,
                ...(item.config ?? {}),
              },
            } as WidgetData;
          });

          return { ...d, widgets: [...d.widgets, ...newWidgets] };
        })
      );
    },
    [activeId, getAdminBuildingConfig]
  );

  const removeWidget = useCallback(
    (id: string) => {
      if (!activeId) return;
      lastLocalUpdateAt.current = Date.now();
      setDashboards((prev) =>
        prev.map((d) =>
          d.id === activeId
            ? { ...d, widgets: d.widgets.filter((w) => w.id !== id) }
            : d
        )
      );
    },
    [activeId]
  );

  const duplicateWidget = useCallback(
    (id: string) => {
      if (!activeId) return;
      lastLocalUpdateAt.current = Date.now();
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
            config: JSON.parse(JSON.stringify(target.config)) as WidgetConfig,
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
      setDashboards((prev) =>
        prev.map((d) =>
          d.id === activeId
            ? { ...d, widgets: d.widgets.filter((w) => !ids.includes(w.id)) }
            : d
        )
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
    setDashboards((prev) =>
      prev.map((d) => (d.id === activeId ? { ...d, widgets: [] } : d))
    );
    addToast('All windows cleared');
  }, [activeId, addToast]);

  const updateWidget = useCallback(
    (id: string, updates: Partial<WidgetData>) => {
      if (!activeIdRef.current) return;
      lastLocalUpdateAt.current = Date.now();
      setDashboards((prev) =>
        prev.map((d) => {
          if (d.id !== activeIdRef.current) return d;
          return {
            ...d,
            widgets: d.widgets.map((w) =>
              w.id === id
                ? {
                    ...w,
                    ...updates,
                    config: updates.config
                      ? { ...w.config, ...updates.config }
                      : w.config,
                  }
                : w
            ),
          };
        })
      );
    },
    []
  );

  const bringToFront = useCallback((id: string) => {
    if (!activeIdRef.current) return;

    setDashboards((prev) => {
      const active = prev.find((d) => d.id === activeIdRef.current);
      if (!active) return prev;

      const maxZ = active.widgets.reduce((max, w) => Math.max(max, w.z), 0);
      const target = active.widgets.find((w) => w.id === id);

      if (target && target.z < maxZ) {
        lastLocalUpdateAt.current = Date.now();
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

  const deleteAllWidgets = useCallback(() => {
    if (!activeId) return;
    lastLocalUpdateAt.current = Date.now();
    setDashboards((prev) =>
      prev.map((d) => (d.id === activeId ? { ...d, widgets: [] } : d))
    );
    addToast('All widgets removed');
  }, [activeId, addToast]);

  const resetWidgetSize = useCallback(
    (id: string) => {
      if (!activeId) return;
      lastLocalUpdateAt.current = Date.now();
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
    setDashboards((prev) =>
      prev.map((d) => (d.id === activeIdRef.current ? { ...d, ...updates } : d))
    );
  }, []);

  const setGlobalStyle = useCallback((style: Partial<GlobalStyle>) => {
    if (!activeIdRef.current) return;
    lastLocalUpdateAt.current = Date.now();
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
      addWidget,
      addWidgets,
      removeWidget,
      duplicateWidget,
      removeWidgets,
      updateWidget,
      bringToFront,
      moveWidgetLayer,
      minimizeAllWidgets,
      deleteAllWidgets,
      resetWidgetSize,
      setBackground,
      updateDashboardSettings,
      updateDashboard,
      setGlobalStyle,
      toggleToolVisibility,
      setAllToolsVisibility,
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
      addWidget,
      addWidgets,
      removeWidget,
      duplicateWidget,
      removeWidgets,
      updateWidget,
      bringToFront,
      moveWidgetLayer,
      minimizeAllWidgets,
      deleteAllWidgets,
      resetWidgetSize,
      setBackground,
      updateDashboardSettings,
      updateDashboard,
      setGlobalStyle,
      toggleToolVisibility,
      setAllToolsVisibility,
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
    ]
  );

  return (
    <DashboardContext.Provider value={contextValue}>
      {children}
    </DashboardContext.Provider>
  );
};
