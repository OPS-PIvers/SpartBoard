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
  GridPosition,
  FeaturePermission,
  DrawableObject,
  UserProfile,
  SubstituteShareDriveGrant,
  ROOT_COLLECTION_KEY,
  Collection,
  CollectionSubstituteShareInput,
} from '../types';
import { doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, isAuthBypass } from '../config/firebase';
import { useAuth } from './useAuth';
import { mergeWidgetConfig } from '../utils/widgetConfigPersistence';
import { useFirestore, type SharedBoardSnapshot } from '../hooks/useFirestore';
import { TOOLS } from '../config/tools';
import { canonicalizeBuildingKeyedRecord } from '@/config/buildings';
import {
  WIDGET_DEFAULTS,
  WIDGET_STRETCH_BEHAVIOR,
} from '../config/widgetDefaults';
import {
  migrateLocalStorageToFirestore,
  migrateWidget,
} from '../utils/migration';
import {
  REFERENCE_VIEWPORT,
  pixelToProp,
  computeWidgetPixelRect,
} from '../utils/proportionalLayout';
import {
  migrateDashboardWidgets,
  hydrateWidgetPixels,
} from '../utils/migrateProportionalLayout';
import {
  scrubDashboardPII,
  extractDashboardPII,
  mergeDashboardPII,
  dashboardHasPII,
} from '../utils/dashboardPII';
import { migrateBoardForCollections } from '../utils/collectionsMigration';
import { pickInitialBoard } from '../utils/pickInitialBoard';
import { logError } from '../utils/logError';
import { useRosters } from '../hooks/useRosters';
import { useGoogleDrive } from '../hooks/useGoogleDrive';
import { useDriveReconnected } from '../hooks/useDriveReconnected';
import { useCollections } from '../hooks/useCollections';
import { useSharedCollection } from '../hooks/useSharedCollection';
import { setDriveAuthErrorHandler } from '../utils/driveAuthErrors';
import {
  setAiModelConfigFallbackHandler,
  resetAiModelConfigFallbackLatch,
} from '../utils/aiModelConfigFallback';
import {
  DashboardContext,
  PendingShareImport,
  SharedBoardImportMode,
  SubstituteShareInput,
  SubstituteShareResult,
} from './DashboardContextValue';
import { validateGridConfig, sanitizeAIConfig } from '../utils/ai_security';
import { getAdminBuildingConfig as getAdminBuildingConfigPure } from '../utils/adminBuildingConfig';
import { AnnotationState } from './DashboardContextValue';
import { DRAWING_DEFAULTS } from '../components/widgets/DrawingWidget/constants';
import { STANDARD_COLORS } from '../config/colors';

// Helper to migrate legacy visibleTools to dockItems
const migrateToDockItems = (
  visibleTools: (WidgetType | InternalToolType)[]
): DockItem[] => {
  return visibleTools.map((type) => ({ type: 'tool', toolType: type }));
};

const getCurrentViewport = (): { vpW: number; vpH: number } => {
  if (typeof window === 'undefined') {
    return { vpW: REFERENCE_VIEWPORT.w, vpH: REFERENCE_VIEWPORT.h };
  }
  return {
    vpW: window.innerWidth || REFERENCE_VIEWPORT.w,
    vpH: window.innerHeight || REFERENCE_VIEWPORT.h,
  };
};

/**
 * Run proportional migration (idempotent) and hydrate pixel x/y/w/h from
 * proportions × current viewport. After this, widget components can keep
 * reading widget.w/h as pixels regardless of which device authored the board.
 */
const hydrateDashboardForViewport = (
  d: Dashboard,
  vpW: number,
  vpH: number
): Dashboard => {
  const migrated = migrateDashboardWidgets(
    d.widgets,
    d.viewportWidth,
    d.viewportHeight
  );
  let widgetsChanged = migrated !== d.widgets;
  const hydrated = migrated.map((w) => {
    const stretch = WIDGET_STRETCH_BEHAVIOR[w.type] ?? 'preserve-aspect';
    const next = hydrateWidgetPixels(w, vpW, vpH, stretch);
    if (next !== w) widgetsChanged = true;
    return next;
  });
  if (!widgetsChanged) return d;
  return { ...d, widgets: hydrated };
};

/**
 * Update a widget's proportional fields and aspect ratio to match its current
 * pixel x/y/w/h at the current viewport. Called from mutation paths
 * (drag/resize/snap commits, addWidget, paste, etc.) so the canonical
 * proportional storage stays in sync with the pixel state used for rendering.
 *
 * `updateAspect` defaults to true; pass false for drag-only changes (no resize)
 * so the locked aspect ratio survives free-position moves.
 */
const syncWidgetProportionsFromPixels = (
  w: WidgetData,
  vpW: number,
  vpH: number,
  updateAspect = true
): WidgetData => {
  const prop = pixelToProp({ x: w.x, y: w.y, w: w.w, h: w.h }, vpW, vpH);
  const aspectRatio = updateAspect
    ? w.h > 0
      ? w.w / w.h
      : (w.aspectRatio ?? 1)
    : w.aspectRatio;
  if (
    prop.xProp === w.xProp &&
    prop.yProp === w.yProp &&
    prop.wProp === w.wProp &&
    prop.hProp === w.hProp &&
    aspectRatio === w.aspectRatio
  ) {
    return w;
  }
  return {
    ...w,
    xProp: prop.xProp,
    yProp: prop.yProp,
    wProp: prop.wProp,
    hProp: prop.hProp,
    ...(typeof aspectRatio === 'number' ? { aspectRatio } : {}),
  };
};

/**
 * Strip the derived pixel x/y/w/h fields from a widget. Pixel values are
 * recomputed from xProp/yProp/wProp/hProp on every dashboard load and on
 * window resize, so they should not factor into "did anything change"
 * comparisons — otherwise window resizes (which only update derived pixels)
 * would trigger phantom saves.
 */
const stripDerivedPixels = (w: WidgetData) => {
  const { x: _x, y: _y, w: _w, h: _h, ...rest } = w;
  return rest;
};

/** Serialize dashboard state for change-detection comparisons. */
const serializeDashboard = (d: Dashboard): string =>
  JSON.stringify({
    widgets: d.widgets.map((w) => {
      const { config, ...rest } = stripDerivedPixels(w);
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
    widgets: JSON.stringify(d.widgets.map(stripDerivedPixels)),
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
    roleId,
    isStudentRole,
    roleResolved,
    refreshGoogleToken,
    featurePermissions,
    selectedBuildings,
    savedWidgetConfigs,
    saveWidgetConfig,
    profileLoaded,
    lastActiveCollectionId,
    lastBoardIdByCollection,
    remoteControlEnabled: accountRemoteControlEnabled,
    recordRecentBackground,
  } = useAuth();
  const { driveService, userDomain } = useGoogleDrive();
  const {
    saveDashboard: saveDashboardFirestore,
    saveDashboards: saveDashboardsFirestore,
    deleteDashboard: deleteDashboardFirestore,
    subscribeToDashboards,
    shareDashboard: shareDashboardFirestore,
    shareSubstituteDashboard: shareSubstituteDashboardFirestore,
    loadSharedDashboard: loadSharedDashboardFirestore,
    mirrorSharedBoard,
    subscribeToSharedBoard,
    joinSharedBoard,
    leaveSharedBoard,
    stopSharingBoard,
  } = useFirestore(user?.uid ?? null);

  const collectionsApi = useCollections(user?.uid);
  const { collections } = collectionsApi;
  const sharedCollectionApi = useSharedCollection();

  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [pendingShareId, setPendingShareId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const path = window.location.pathname;
    // Skip quiz, assignment, and video-activity share URLs — those are
    // handled separately by their dedicated `pending*ShareId` states.
    if (path.startsWith('/share/quiz/')) return null;
    if (path.startsWith('/share/assignment/')) return null;
    if (path.startsWith('/share/video-activity/')) return null;
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

  const [pendingVideoActivityShareId, setPendingVideoActivityShareId] =
    useState<string | null>(() => {
      if (typeof window === 'undefined') return null;
      const path = window.location.pathname;
      if (path.startsWith('/share/video-activity/')) {
        return path.split('/share/video-activity/')[1] || null;
      }
      return null;
    });

  const clearPendingShare = useCallback(() => {
    setPendingShareId(null);
    window.history.replaceState(null, '', '/');
  }, []);

  // Detect malformed /share-collection/ URLs (present but no ID) so we can
  // toast after mount, when addToast is available.
  const [hadEmptyShareCollectionUrl] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname;
    return (
      path.startsWith('/share-collection/') &&
      !path.split('/share-collection/')[1]
    );
  });

  const [pendingSharedCollectionId, setPendingSharedCollectionId] = useState<
    string | null
  >(() => {
    if (typeof window === 'undefined') return null;
    const path = window.location.pathname;
    if (path.startsWith('/share-collection/')) {
      return path.split('/share-collection/')[1] || null;
    }
    return null;
  });

  const clearPendingSharedCollection = useCallback(() => {
    setPendingSharedCollectionId(null);
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

  const clearPendingVideoActivityShare = useCallback(() => {
    setPendingVideoActivityShareId(null);
    window.history.replaceState(null, '', '/');
  }, []);

  // Tracks an imported assignment that hasn't been targeted at any rosters
  // yet, so the QuizWidget can prompt the teacher to pick classes
  // immediately after import. Not derived from URL state — purely a
  // post-import signal between DashboardView and the QuizWidget.
  const [pendingAssignmentSetupId, setPendingAssignmentSetup] = useState<
    string | null
  >(null);

  const clearPendingAssignmentSetup = useCallback(() => {
    setPendingAssignmentSetup(null);
  }, []);

  // Tracks an assignment whose full settings editor should be opened by
  // the QuizWidget. Used by the PLC post-import "Edit all settings…"
  // hand-off so the teacher can reach attempt limits / timer / etc.
  // without having to manually navigate to the widget and find the row.
  const [pendingAssignmentEditId, setPendingAssignmentEdit] = useState<
    string | null
  >(null);

  const clearPendingAssignmentEdit = useCallback(() => {
    setPendingAssignmentEdit(null);
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
  dashboardsRef.current = dashboards;
  // Refs mirror auth/collections state used by the initial-board selection
  // path so that branch (which runs inside the snapshot callback) doesn't
  // have to be re-bound on every userProfile/collection change. Refs are
  // the right call here because the selection is fire-once on app open,
  // not a reactive computation.
  const profileLoadedRef = useRef(profileLoaded);
  profileLoadedRef.current = profileLoaded;
  const lastActiveCollectionIdRef = useRef(lastActiveCollectionId);
  lastActiveCollectionIdRef.current = lastActiveCollectionId;
  const lastBoardIdByCollectionRef = useRef(lastBoardIdByCollection);
  lastBoardIdByCollectionRef.current = lastBoardIdByCollection;
  const collectionsRef = useRef(collections);
  collectionsRef.current = collections;
  // Hoisted to component scope (not local to the one-shot initial-board
  // selection effect below) so the snapshot callback can also set it —
  // preventing a second Firestore churn from double-picking the initial
  // board.
  const initialBoardSelectedRef = useRef(false);
  // Navigation-memory write dedup + debounce. Mutated only inside the
  // `loadDashboard` callback / its setTimeout, never during render — the
  // previous write's key is compared to skip true no-op writes, and the
  // pending timer ID lets rapid board cycling collapse into one Firestore
  // write.
  const navigationWriteRef = useRef<{
    boardId: string;
    collectionKey: string;
  } | null>(null);
  const navigationDebounceRef = useRef<number | null>(null);
  // Drop any pending navigation-memory write on provider unmount so a
  // dangling timer can't fire after the AuthContext has cleared `user`.
  // The user lands on the second-to-last Board on next session in the
  // rare corner case where they navigate-and-close within the 500ms
  // window — acceptable trade-off for the dedup/debounce cost win.
  useEffect(() => {
    return () => {
      if (navigationDebounceRef.current !== null) {
        clearTimeout(navigationDebounceRef.current);
        navigationDebounceRef.current = null;
      }
    };
  }, []);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [zoom, setZoom] = useState<number>(1);

  // --- Annotation (ephemeral full-screen draw-over overlay; NOT a widget) ---
  // The `objects` array is stored on the active dashboard's
  // `annotationOverlay` so it rides through the live-share mirror to all
  // participants. Per-user UI state (color, width, palette) stays local.
  const [annotationActive, setAnnotationActive] = useState(false);
  const [annotationLocalState, setAnnotationLocalState] = useState<
    Omit<AnnotationState, 'objects'>
  >(() => ({
    color: STANDARD_COLORS.slate,
    width: DRAWING_DEFAULTS.WIDTH,
    customColors: [...DRAWING_DEFAULTS.CUSTOM_COLORS],
  }));

  // Helper to centralize active dashboard switching and its side-effects (like zoom reset)
  const updateActiveId = useCallback((id: string | null) => {
    setActiveId(id);
    setZoom(1);
    // Auto-close annotation when switching dashboards — annotations are
    // board-local. The objects themselves live on the dashboard's
    // `annotationOverlay`, so switching boards naturally swaps which strokes
    // are visible.
    setAnnotationActive(false);
  }, []);

  // Same-device cache invalidation across user accounts. The dock cache in
  // localStorage is keyed by the uid that last wrote it; on mount we only
  // trust the cache when its uid matches the currently signed-in user or
  // when no uid has been recorded yet (legacy migration: data was written
  // by code before the cache-UID feature existed, so it belongs to whoever
  // is currently signed in). DashboardProvider is only mounted when `user`
  // is truthy (see App.tsx), so a sign-out → sign-in as a different user
  // remounts this component with a fresh user value.
  const dockCacheUidRaw =
    typeof window !== 'undefined'
      ? localStorage.getItem('classroom_dock_cache_uid')
      : null;
  // Trust localStorage when the recorded uid matches the current user OR
  // when no uid is recorded at all (legacy / first run of the cache-UID
  // feature). The latter is the migration path that lets long-time users
  // keep their hand-curated docks on first load of the new Firestore-sync
  // code instead of having them wiped.
  const dockCacheMatchesUser = user
    ? dockCacheUidRaw === null || dockCacheUidRaw === user.uid
    : dockCacheUidRaw === null;
  // True only when localStorage was explicitly written by a *different*
  // user — the cross-account-leak case where we must wipe before mounting.
  // Legacy null-uid data is preserved (see comment above).
  const dockCacheBelongsToOtherUser =
    !!user && dockCacheUidRaw !== null && dockCacheUidRaw !== user.uid;

  const [isDockInitialized, setIsDockInitialized] = useState<boolean>(() => {
    if (!dockCacheMatchesUser) return false;
    return localStorage.getItem('classroom_dock_initialized') === 'true';
  });
  // Keep a ref in sync so timeout callbacks can read the latest value without
  // capturing a stale closure.
  const isDockInitializedRef = useRef(isDockInitialized);
  isDockInitializedRef.current = isDockInitialized;

  const [visibleTools, setVisibleTools] = useState<
    (WidgetType | InternalToolType)[]
  >(() => {
    if (!dockCacheMatchesUser) return [];
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
    if (!dockCacheMatchesUser) return TOOLS.map((t) => t.type);
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
    if (!dockCacheMatchesUser) return [];
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
  // Guards against re-kicking off the localStorage→Firestore migration when
  // this effect re-runs before `migrated` flips true (the role-flag deps
  // below cause re-runs as `roleResolved`/`roleId`/`isStudentRole` resolve).
  // Scoped per-uid so a sign-out → sign-in as a different user re-arms it.
  const migrationStartedForUidRef = useRef<string | null>(null);

  // Cross-device dock sync. `dockItems`, `libraryOrder`, and `isDockInitialized`
  // are mirrored to `/users/{uid}/userProfile/profile`. Hydration tracks two
  // separate things:
  //   - `dockHydrated` flips true once we've *attempted* the cloud read, even
  //     on failure. The local init effect below waits on this so it doesn't
  //     seed defaults before we know whether a cloud layout exists.
  //   - `dockHydrationOk` flips true only when the cloud read *succeeded* (doc
  //     present or confirmed-absent). The persistence effect requires this so
  //     a transient Firestore error during hydration doesn't let freshly-
  //     seeded defaults overwrite a real cloud layout that we just couldn't
  //     reach this session.
  const [dockHydrated, setDockHydrated] = useState(isAuthBypass);
  const [dockHydrationOk, setDockHydrationOk] = useState(isAuthBypass);
  const dockHydratedForUidRef = useRef<string | null>(null);
  // Coalesce rapid dock mutations (e.g. drag-reorders) into a single Firestore
  // write so we don't fire one setDoc per intermediate frame.
  const dockPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  // Serialized snapshot of the last dock state we wrote (or hydrated) to
  // Firestore. Used to skip the no-op write the persist effect would otherwise
  // fire immediately after hydration sets dockItems to the cloud value.
  const lastSavedDockDataRef = useRef<string | null>(null);

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

  // Register a module-level handler so silent Drive auth failures inside
  // `useGoogleDrive`'s catch blocks surface to the user. The hook can't call
  // `useDashboard()` directly (it's consumed by this provider, so the context
  // value isn't available yet at hook-call time), hence the singleton dispatch
  // pattern. See `hooks/useGoogleDrive.ts` for details.
  useEffect(() => {
    setDriveAuthErrorHandler(() => {
      addToast(
        'Google Drive connection expired — reconnect to keep things in sync.',
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
    });
    return () => setDriveAuthErrorHandler(null);
  }, [addToast, refreshGoogleToken]);

  // Fire a toast (and clean the URL) when the user landed on /share-collection/
  // with no share ID. The initializer for hadEmptyShareCollectionUrl captures
  // this at mount time; addToast isn't available during state init, so we
  // surface the error here instead. hadEmptyShareCollectionUrl is a frozen
  // constant (never updated after init) so this effect fires exactly once.
  useEffect(() => {
    if (hadEmptyShareCollectionUrl) {
      addToast('Invalid share link — missing share id.', 'error');
      window.history.replaceState(null, '', '/');
    }
  }, [hadEmptyShareCollectionUrl, addToast]);

  // Surface a one-time notice when an AI Cloud Function couldn't read the
  // admin-configured Gemini model overrides from Firestore and fell back to
  // hardcoded defaults. The flag is plumbed through every AI response payload
  // via `_modelConfigUsedFallback` and consumed in `utils/ai.ts`. We only
  // notify on the most recent attempt — the latch in the helper de-dupes
  // until the user clicks "Reload to retry" (which reloads, re-arming).
  //
  // Gated to admins: non-admins can't act on the notice (the override is set
  // in Admin Settings) and the copy explicitly mentions "admin overrides".
  // Non-admins still get AI generation — they just don't see the warning.
  useEffect(() => {
    if (isAdmin !== true) {
      return;
    }
    setAiModelConfigFallbackHandler(() => {
      addToast(
        'AI is running with default models (admin overrides unavailable). Reload to retry.',
        'warning',
        {
          label: 'Reload',
          onClick: () => {
            resetAiModelConfigFallbackLatch();
            window.location.reload();
          },
        }
      );
    });
    return () => {
      setAiModelConfigFallbackHandler(null);
      // Reset the module-level latch on teardown so a re-mounted provider
      // (e.g. user signs out and a different user signs in without a full
      // page reload) still surfaces the toast on the next stale-config
      // attempt. Otherwise the latch would stay sticky across sessions.
      resetAiModelConfigFallbackLatch();
    };
  }, [addToast, isAdmin]);

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

    // Union dock defaults across *all* of the user's selected buildings.
    // A teacher with both "high" and "middle" selected should see widgets
    // marked as default for either — picking just `selectedBuildings[0]`
    // dropped half the relevant defaults and was a frequent cause of
    // near-empty docks on first sign-in.
    const tools: (WidgetType | InternalToolType)[] = [];

    (featurePermissions ?? []).forEach((perm) => {
      const rawDockDefaults = perm.config?.dockDefaults as
        | Record<string, boolean>
        | undefined;

      // Canonicalize stored keys so legacy IDs (`orono-high-school`) still
      // match the canonical buildingIds (`high`). Without this, every
      // teacher would fall through to the `time-tool` fallback below,
      // because admin-panel writes from before canonicalization landed
      // are keyed on legacy IDs and `selectedBuildings` is always
      // canonicalized in AuthContext.
      const dockDefaults = rawDockDefaults
        ? canonicalizeBuildingKeyedRecord(rawDockDefaults)
        : undefined;

      const isDefaultForAnyBuilding =
        dockDefaults !== undefined &&
        selectedBuildings.some((bid) => dockDefaults[bid] === true);
      if (!isDefaultForAnyBuilding) return;

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

  // Empty-dock recovery: whenever the dock is empty after hydration,
  // refill it with building-aware defaults. Earlier iterations of this
  // effect gated by a once-per-session ref to "preserve a user's empty
  // dock," but the actual user experience is that an empty dock is
  // always wrong — there is no UI path to clear-and-refill, so an empty
  // dock is always either the migration bug, a failed hydration, or a
  // user attempting to clean up who has no way back. Always refill.
  useEffect(() => {
    if (isAuthBypass) return;
    if (!dockHydrated) return;
    if (dockItems.length > 0) return;
    // Wait for permissions when a building is selected — otherwise we'd
    // seed using an empty permission set and land on the `['time-tool']`
    // fallback, which is exactly the empty-feeling state we're trying to
    // escape from. With no building selected, the function falls back to
    // "show all accessible tools" and is safe to call immediately.
    if (
      selectedBuildings.length > 0 &&
      (featurePermissions ?? []).length === 0
    ) {
      return;
    }
    const defaultTools = getDefaultDockTools();
    if (defaultTools.length === 0) return;
    const defaultDock = migrateToDockItems(defaultTools);
    setDockItems(defaultDock);
    setVisibleTools(defaultTools);
    setIsDockInitialized(true);
    localStorage.setItem('classroom_dock_items', JSON.stringify(defaultDock));
    localStorage.setItem(
      'classroom_visible_tools',
      JSON.stringify(defaultTools)
    );
    localStorage.setItem('classroom_dock_initialized', 'true');
  }, [
    dockHydrated,
    dockItems.length,
    selectedBuildings,
    featurePermissions,
    getDefaultDockTools,
  ]);

  useEffect(() => {
    if (isDockInitialized) return;
    // Wait for the Firestore hydration to finish so we don't seed default
    // building tools on top of a cloud-synced dock layout from another device.
    if (!dockHydrated) return;

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
        // Re-hydrate state explicitly from localStorage rather than
        // trusting the useState initializers — the initializers gate on
        // `dockCacheMatchesUser`, and a future tightening of that check
        // could leave state empty here without this fallback. Belt-and-
        // suspenders: the initializers normally cover this, but the cost
        // of an extra setState call is negligible and the cost of an
        // empty dock is a user-visible regression.
        if (savedDockRaw !== null) {
          const parsedDock = JSON.parse(savedDockRaw) as DockItem[];
          setDockItems(parsedDock);
          // Derive visibleTools from dockItems so the two stores stay in
          // sync — folder items count as visible too.
          const derivedVisible = parsedDock.flatMap((item) =>
            item.type === 'tool' ? item.toolType : item.folder.items
          );
          setVisibleTools(derivedVisible);
        } else if (savedVisibleToolsRaw !== null) {
          const parsedTools = JSON.parse(savedVisibleToolsRaw) as (
            | WidgetType
            | InternalToolType
          )[];
          setVisibleTools(parsedTools);
          setDockItems(migrateToDockItems(parsedTools));
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
    dockHydrated,
    featurePermissions,
    selectedBuildings,
    getDefaultDockTools,
  ]);

  // Hydrate dock state from Firestore on sign-in. The userProfile doc is the
  // cross-device source of truth; localStorage is a cache that gives instant
  // initial paint and survives offline launches. Order of precedence:
  //   1. Firestore userProfile.dockItems (cloud, authoritative).
  //   2. localStorage (this device's last-known layout).
  //   3. Default building seeding via the effect above (truly new users).
  // Runs once per uid; resets on sign-out / user switch via the cleanup effect below.
  useEffect(() => {
    if (isAuthBypass) {
      setDockHydrated(true);
      setDockHydrationOk(true);
      return;
    }
    if (!user || !profileLoaded) return;
    if (dockHydratedForUidRef.current === user.uid) return;
    dockHydratedForUidRef.current = user.uid;

    let cancelled = false;
    void (async () => {
      let succeeded = false;
      try {
        const profileRef = doc(db, 'users', user.uid, 'userProfile', 'profile');
        const snap = await getDoc(profileRef);
        if (cancelled) return;
        const data = snap.exists()
          ? (snap.data() as Partial<UserProfile>)
          : null;

        const cloudDock =
          data && Array.isArray(data.dockItems) ? data.dockItems : null;
        const cloudLibrary =
          data && Array.isArray(data.libraryOrder) ? data.libraryOrder : null;
        const cloudInitialized =
          data && typeof data.dockInitialized === 'boolean'
            ? data.dockInitialized
            : null;

        if (cloudDock !== null) {
          // Cloud has authoritative state — overwrite local state and cache.
          setDockItems(cloudDock);
          localStorage.setItem(
            'classroom_dock_items',
            JSON.stringify(cloudDock)
          );

          // Derive visibleTools from cloud dockItems so the two stores stay
          // in sync. Folder items count as visible too.
          const derivedVisible = cloudDock.flatMap((item) =>
            item.type === 'tool' ? item.toolType : item.folder.items
          );
          setVisibleTools(derivedVisible);
          localStorage.setItem(
            'classroom_visible_tools',
            JSON.stringify(derivedVisible)
          );
        }
        if (cloudLibrary !== null) {
          setLibraryOrder(cloudLibrary);
          localStorage.setItem(
            'spartboard_library_order',
            JSON.stringify(cloudLibrary)
          );
        }
        if (cloudInitialized === true) {
          setIsDockInitialized(true);
          localStorage.setItem('classroom_dock_initialized', 'true');
        }
        // Claim the cache for this user so subsequent reloads on the same
        // device trust the localStorage cache and skip straight to the
        // cloud-synced state.
        localStorage.setItem('classroom_dock_cache_uid', user.uid);
        // Seed the saved-snapshot ref to whatever we just hydrated so the
        // persist effect doesn't immediately fire a redundant write back to
        // Firestore with the exact same payload.
        lastSavedDockDataRef.current = JSON.stringify({
          dockItems: cloudDock ?? null,
          libraryOrder: cloudLibrary ?? null,
        });
        succeeded = true;
      } catch (err) {
        // Leave dockHydrationOk false so we don't push defaults over a real
        // cloud layout we just couldn't reach. The init effect still proceeds
        // (via dockHydrated) so the user keeps a functional dock from cache
        // or admin defaults; a future refresh will retry the read.
        console.error('[DashboardContext] Failed to hydrate dock state:', err);
        // Allow another attempt if the user refreshes — drop the per-uid lock.
        if (dockHydratedForUidRef.current === user.uid) {
          dockHydratedForUidRef.current = null;
        }
      } finally {
        if (!cancelled) {
          setDockHydrated(true);
          if (succeeded) setDockHydrationOk(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, profileLoaded]);

  // Persist dock state to Firestore whenever it changes locally. Gated on
  // `dockHydrationOk` so a transient cloud-read failure doesn't let local
  // defaults overwrite the user's real layout. The 500ms debounce coalesces
  // rapid mutations (drag-reorders, multi-toggle bursts) into a single write.
  useEffect(() => {
    if (isAuthBypass) return;
    if (!user || !dockHydrationOk) return;
    // Only mirror to the cloud once the dock has actually been seeded —
    // otherwise we'd write empty arrays during the brief pre-seed window.
    if (!isDockInitialized) return;

    // Skip the redundant post-hydration write: if the current state matches
    // the last snapshot we saved or hydrated, there's nothing to persist.
    const serialized = JSON.stringify({ dockItems, libraryOrder });
    if (serialized === lastSavedDockDataRef.current) return;

    if (dockPersistTimerRef.current !== null) {
      clearTimeout(dockPersistTimerRef.current);
    }
    const uid = user.uid;
    dockPersistTimerRef.current = setTimeout(() => {
      dockPersistTimerRef.current = null;
      const profileRef = doc(db, 'users', uid, 'userProfile', 'profile');
      void setDoc(
        profileRef,
        {
          dockItems,
          libraryOrder,
          dockInitialized: true,
        },
        { merge: true }
      )
        .then(() => {
          lastSavedDockDataRef.current = serialized;
        })
        .catch((err: unknown) => {
          console.error(
            '[DashboardContext] Failed to persist dock state:',
            err
          );
        });
    }, 500);

    return () => {
      if (dockPersistTimerRef.current !== null) {
        clearTimeout(dockPersistTimerRef.current);
        dockPersistTimerRef.current = null;
      }
    };
  }, [user, dockHydrationOk, isDockInitialized, dockItems, libraryOrder]);

  // Drop any stale dock localStorage entries left behind by a *previous
  // user* on this device. Legacy localStorage with no recorded uid is
  // preserved — those entries belong to the currently signed-in user (they
  // were written by code that predates the cache-UID feature) and the
  // initializers will have already loaded them into state.
  //
  // Cross-user leak protection is primarily handled by the uid-gated
  // initializers above; this just keeps localStorage tidy and claims the
  // cache for the current user. A second user-switch in the same tab
  // session is impossible because DashboardProvider is conditionally
  // mounted on `user` (App.tsx) and remounts on each sign-in.
  const dockCacheCleanedRef = useRef(false);
  useEffect(() => {
    if (isAuthBypass) return;
    if (dockCacheCleanedRef.current) return;
    dockCacheCleanedRef.current = true;
    if (!user) return;
    if (dockCacheBelongsToOtherUser) {
      localStorage.removeItem('classroom_dock_items');
      localStorage.removeItem('classroom_visible_tools');
      localStorage.removeItem('classroom_dock_initialized');
      localStorage.removeItem('spartboard_library_order');
    }
    // Claim the cache for this user so subsequent reloads trust the
    // localStorage cache and skip straight to the cloud-synced state. The
    // hydration/persistence effects below keep this in sync on every
    // write — this is just the initial claim.
    localStorage.setItem('classroom_dock_cache_uid', user.uid);
  }, [dockCacheBelongsToOtherUser, user]);

  // --- ROSTER LOGIC ---
  const {
    rosters,
    activeRosterId,
    addRoster,
    updateRoster,
    deleteRoster,
    setActiveRoster,
    setAbsentStudents,
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
    async (
      dashboard: Dashboard,
      intendedMode?: SharedBoardImportMode,
      plcId?: string
    ): Promise<string> => {
      // MANDATE: Share through Google Drive if available for non-admins.
      // Drive shares are one-time exports — they don't support live sync,
      // and we intentionally don't tag the local dashboard as `owner`.
      // Drive-backed shares are always Copy-mode on the receiving end;
      // intendedMode is ignored here. PLC-scoped shares deliberately
      // bypass the Drive path — the surfacing surface (PLC Dashboard
      // Shared Boards tab) reads from Firestore, so a Drive-only share
      // would be invisible to teammates.
      if (!plcId && !isAdmin && driveService) {
        try {
          const fileId = await driveService.exportDashboard(dashboard);
          await driveService.makePublic(fileId, userDomain);
          return `drive-${fileId}`;
        } catch (e) {
          console.error('Drive sharing failed, falling back to Firestore:', e);
        }
      }

      // Firestore-backed share: also tag the local dashboard so subsequent
      // edits mirror to the shared doc and Synced/View-Only guests stay in
      // sync with the host. Both writes (the shared_boards seed and the
      // local dashboard with its new linkage) MUST go through PII scrubbing
      // — Firestore never holds student-name fields, even for the owner's
      // own dashboards collection. The mirror effect (further down) and the
      // local saveDashboard() path do this independently; here we scrub the
      // shared_boards seed up front so the very first write is clean too.
      const hostName = user?.displayName ?? user?.email ?? undefined;
      const scrubbedSeed = scrubDashboardPII(dashboard);
      const shareId = await shareDashboardFirestore(
        scrubbedSeed,
        intendedMode,
        hostName,
        plcId
      );
      // Copy-mode shares are one-time snapshots. Don't tag the local
      // dashboard as a live owner — there's no live sync to wire up.
      if (intendedMode === 'copy') {
        return shareId;
      }
      const tagged: Dashboard = {
        ...dashboard,
        linkedShareId: shareId,
        linkedShareRole: 'owner',
        linkedShareHostName: hostName,
        linkedShareEnded: false,
      };
      // Optimistic local update so the UI reflects the live-share state
      // immediately.
      setDashboards((prev) =>
        prev.map((d) => (d.id === dashboard.id ? tagged : d))
      );
      // Persist the linkage via the full saveDashboard pipeline, which
      // handles PII scrub + Drive supplement. Going through
      // saveDashboardFirestore directly would bypass that and could leak
      // restored-from-Drive PII to Firestore.
      try {
        await saveDashboard(tagged);
      } catch (e) {
        console.error('Failed to persist share linkage on dashboard:', e);
      }
      return shareId;
    },
    [
      isAdmin,
      driveService,
      shareDashboardFirestore,
      saveDashboard,
      userDomain,
      user,
      // NOTE: substitute-share handler below has its own dep list; this block
      // intentionally tracks `handleShareDashboard` deps only.
    ]
  );

  const handleShareSubstituteDashboard = useCallback(
    async (input: SubstituteShareInput): Promise<SubstituteShareResult> => {
      // Substitute shares always go through Firestore. The Drive export path
      // used by the regular share flow is one-time and copy-mode-only — it
      // can't host a building-scoped, expiring, queryable surface like the
      // sub directory needs.
      const hostName = user?.displayName ?? user?.email ?? undefined;
      const scrubbedSeed = scrubDashboardPII(input.dashboard);

      // Resolve Drive grants BEFORE writing the share doc so they can be
      // persisted atomically. Drive's `permissions.create` is idempotent —
      // calling it twice for the same (fileId, email) returns the SAME
      // permissionId, which means a naive grant flow would later revoke a
      // permission that another concurrent substitute share still depends
      // on. We pre-list the file's permissions and reuse the existing
      // permissionId when present so the refcounting logic in the reconcile
      // sweep (`useReconcileExpiredSubShares`) sees the conflict and skips
      // the revoke if other active shares still reference it.
      const driveGrants: SubstituteShareDriveGrant[] = [];
      const subEmails = input.subEmails ?? [];
      const fileIds = input.rosterDriveFileIds ?? [];
      const driveSharingRequested = subEmails.length > 0 && fileIds.length > 0;
      // Track failed pairs so the caller can warn the host — without this,
      // a partial network failure would silently produce a share doc with
      // missing driveGrants and the host would never know.
      const failedPairs: Array<{ email: string; fileId: string }> = [];
      if (driveSharingRequested && driveService) {
        for (const fileId of fileIds) {
          let existingPerms: Awaited<
            ReturnType<typeof driveService.listFilePermissions>
          > = [];
          try {
            existingPerms = await driveService.listFilePermissions(fileId);
          } catch (err) {
            console.error(
              `[shareSubstituteDashboard] listFilePermissions(${fileId}) failed; will fall back to grant calls:`,
              err
            );
          }

          for (const email of subEmails) {
            const lower = email.toLowerCase();
            const existing = existingPerms.find(
              (p) =>
                p.type === 'user' &&
                p.emailAddress?.toLowerCase() === lower &&
                typeof p.id === 'string'
            );
            if (existing) {
              driveGrants.push({ email, fileId, permissionId: existing.id });
              continue;
            }
            try {
              const permissionId = await driveService.grantUserReaderPermission(
                fileId,
                email
              );
              driveGrants.push({ email, fileId, permissionId });
            } catch (err) {
              console.error(
                `[shareSubstituteDashboard] Drive grant failed for ${email} on ${fileId}:`,
                err
              );
              failedPairs.push({ email, fileId });
            }
          }
        }
      } else if (driveSharingRequested && !driveService) {
        // Drive sharing was asked for but the teacher has no live Drive
        // service (no token / disconnected). Every requested pair fails.
        for (const fileId of fileIds) {
          for (const email of subEmails) {
            failedPairs.push({ email, fileId });
          }
        }
      }

      const shareId = await shareSubstituteDashboardFirestore({
        dashboard: scrubbedSeed,
        expiresAt: input.expiresAt,
        buildingId: input.buildingId,
        subEmails: input.subEmails,
        driveGrants: driveGrants.length > 0 ? driveGrants : undefined,
        hostDisplayName: hostName,
      });

      // Deliberately DO NOT tag the host's local dashboard with a
      // linkedShareId — substitute shares are frozen snapshots and the host
      // continues editing their live board independently.
      const attempted = driveSharingRequested
        ? subEmails.length * fileIds.length
        : 0;
      return {
        shareId,
        driveGrants: driveSharingRequested
          ? {
              attempted,
              succeeded: driveGrants.length,
              failed: failedPairs,
            }
          : null,
      };
    },
    [shareSubstituteDashboardFirestore, driveService, user]
  );

  const handleLoadSharedDashboard = useCallback(
    async (shareId: string): Promise<SharedBoardSnapshot | null> => {
      if (shareId.startsWith('drive-')) {
        if (!driveService) {
          throw new Error('Google Drive access required to load this board');
        }
        const fileId = shareId.replace('drive-', '');
        const drv = await driveService.importDashboard(fileId);
        return drv as SharedBoardSnapshot | null;
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

        const { vpW, vpH } = getCurrentViewport();
        const migratedDashboards = sortedDashboards.map((db) => {
          const collectionsMigrated = migrateBoardForCollections(db);
          const widgetMigrated: Dashboard = {
            ...collectionsMigrated,
            widgets: collectionsMigrated.widgets.map(migrateWidget),
          };
          return hydrateDashboardForViewport(widgetMigrated, vpW, vpH);
        });

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
              // Proportional fields are the canonical layout source — pixel
              // x/y/w/h are derived per-viewport and would produce false
              // positives when two devices on different screen sizes view
              // the same board.
              const LAYOUT_FIELDS = [
                'xProp',
                'yProp',
                'wProp',
                'hProp',
                'aspectRatio',
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
          // Wait for the userProfile snapshot to land before picking. If we
          // pick now using `undefined` lastActiveCollectionId, pickInitialBoard
          // falls through to the global default — a behavior we explicitly
          // want to AVOID on the first paint so the teacher doesn't see a
          // flash of "wrong board" before profile-aware selection corrects it.
          // The `initialBoardSelectedRef` gate makes the selection run
          // exactly once across snapshot churn.
          if (profileLoadedRef.current) {
            const initial = pickInitialBoard(
              migratedDashboards,
              lastActiveCollectionIdRef.current,
              lastBoardIdByCollectionRef.current,
              collectionsRef.current
            );
            if (initial) {
              updateActiveId(initial.id);
              initialBoardSelectedRef.current = true;
            }
          }
        }

        // Create default dashboard if none exist. Skip for student users —
        // both real SSO students (`isStudentRole` from the token claim) and
        // legacy students (`roleId === 'student'` from the org member doc).
        // Students should never own a teacher-style board, and the
        // Firestore rule will reject the write anyway. AppContent
        // redirects them to /my-assignments; this just avoids a noisy
        // permission-denied error in the gap before that fires.
        //
        // We also wait for `roleResolved` so a legacy student isn't briefly
        // seen as `roleId === null` (the "non-member" state) and accidentally
        // gets a default board created before the org-members snapshot
        // arrives. Non-member teachers without a member doc resolve cleanly
        // to `roleId === null` AND `roleResolved === true`, so they still
        // get their default board.
        if (
          updatedDashboards.length === 0 &&
          !migrated &&
          roleResolved &&
          !isStudentRole &&
          roleId !== 'student'
        ) {
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

    // Migrate localStorage data on first sign-in. Per-uid ref guards
    // against double-kickoff: the role-flag deps in this effect's array
    // can cause re-runs while migration is still in flight, and without
    // the ref we'd start a second migration that races with the first.
    const localData = localStorage.getItem('classroom_dashboards');
    if (
      localData &&
      !migrated &&
      migrationStartedForUidRef.current !== user.uid
    ) {
      migrationStartedForUidRef.current = user.uid;
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
          // Reset the kickoff guard so a future effect re-run can retry.
          // Without this, a transient migration failure would permanently
          // block retry until the user signs out and back in.
          migrationStartedForUidRef.current = null;
        });
    }

    return () => {
      unsubscribe();
    };
  }, [
    user,
    subscribeToDashboards,
    migrated,
    saveDashboard,
    updateActiveId,
    roleId,
    isStudentRole,
    roleResolved,
  ]);

  // One-shot upgrade of the initial Board choice once profile + collections
  // are both available. Runs at most once — guarded by `initialBoardSelectedRef`
  // so a subsequent profile refresh doesn't yank the teacher to a different
  // Board after they've started working. The ref is declared at component scope
  // (not here) so the snapshot callback can also set it.
  useEffect(() => {
    if (initialBoardSelectedRef.current) return;
    if (!profileLoaded) return;
    if (loading) return;
    if (dashboards.length === 0) return;
    if (activeIdRef.current) {
      // Some other path already picked an active Board (e.g. URL deep-link).
      initialBoardSelectedRef.current = true;
      return;
    }
    const initial = pickInitialBoard(
      dashboards,
      lastActiveCollectionId,
      lastBoardIdByCollection,
      collections
    );
    // Intentionally leave initialBoardSelectedRef false when initial === null,
    // so a future dep change (e.g. collections loading after dashboards) gets
    // another chance to pick a Board. Setting the ref true here would freeze
    // the effect into the "no board picked" state.
    if (initial) {
      updateActiveId(initial.id);
      initialBoardSelectedRef.current = true;
    }
  }, [
    profileLoaded,
    loading,
    dashboards,
    lastActiveCollectionId,
    lastBoardIdByCollection,
    collections,
    updateActiveId,
  ]);

  // Re-hydrate widget pixel x/y/w/h from canonical proportional bounds
  // whenever the viewport changes. The proportional fields don't change here,
  // so this update is invisible to the save path (which compares without
  // pixel fields) and to two-device sync.
  useEffect(() => {
    let rafId: number | null = null;
    const onResize = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const { vpW, vpH } = getCurrentViewport();
        setDashboards((prev) => {
          let anyChanged = false;
          const next = prev.map((d) => {
            const hydrated = hydrateDashboardForViewport(d, vpW, vpH);
            if (hydrated !== d) anyChanged = true;
            return hydrated;
          });
          return anyChanged ? next : prev;
        });
      });
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onResize);
    }
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', onResize);
      }
    };
  }, []);

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
          // Drive auth errors are surfaced via the latched
          // `setDriveAuthErrorHandler` toast that GoogleDriveService fires
          // from its throw sites (see utils/driveAuthErrors.ts). Duplicating
          // a per-call addToast here would bypass the latch and spam the
          // user with one toast per failed background export.
          console.error('[Drive Sync] Background export failed:', err);
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
  ]);

  // --- PII RESTORE EFFECT ---
  // When the active dashboard changes, attempt to restore any custom widget
  // names (PII) from the Drive PII supplement file. Firestore only stores the
  // scrubbed version; Drive is the authoritative source of PII fields.
  const lastPiiRestoredIdRef = useRef<string | null>(null);

  // After a Drive reconnect, clear the one-shot latch so a previously-failed
  // PII restore retries with the fresh token. Otherwise a teacher who saw
  // their custom widget names disappear (scrubbed Firestore copy with no
  // PII supplement loaded) keeps seeing the scrubbed version until they
  // switch dashboards and back. Mirrors the reset in SidebarBackgrounds.
  useDriveReconnected(() => {
    lastPiiRestoredIdRef.current = null;
  });

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
        // Clear stale file ID if Drive returns 404 (file was manually deleted).
        const isNotFound = err instanceof Error && err.message.includes('404');
        if (isNotFound) {
          piiDriveFileIdRef.current.delete(currentId);
          return;
        }
        // Drive auth errors are surfaced via the latched
        // `setDriveAuthErrorHandler` toast that driveService fires from its
        // throw sites (see utils/driveAuthErrors.ts). The previous code
        // here added a second message-matched toast per failed restore,
        // which spammed disconnected users on every board switch.
        console.warn('[PII Restore] Could not load supplement:', err);
      });
  }, [activeId, loading, driveService]);

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

      // Derive add vs remove from `prev` (dockItems) itself, not from the
      // outer `visibleTools` closure. Reading the closure desyncs the two
      // stores when React batches a previous setVisibleTools update that
      // hasn't flushed yet — the library then filters using a visibleTools
      // that no longer matches dockItems.
      setDockItems((prev) => {
        const exists = prev.some(
          (item) =>
            (item.type === 'tool' && item.toolType === type) ||
            (item.type === 'folder' && item.folder.items.includes(type))
        );
        let next: DockItem[];

        if (exists) {
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
          next = [...prev, { type: 'tool', toolType: type }];
        }

        localStorage.setItem('classroom_dock_items', JSON.stringify(next));
        return next;
      });
    },
    []
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

  // Pending share-import state. When a recipient opens /share/<id> we fetch
  // the shared doc and stash a snapshot here; the UI shows a 3-option picker
  // (Synced / View-Only / Copy) and calls importSharedBoard(mode) to commit.
  const [pendingShareImport, setPendingShareImport] =
    useState<PendingShareImport | null>(null);

  // Handle shared dashboard loading — fetches snapshot, then opens the picker.
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

        if (!sharedDb) {
          addToast('Shared board not found', 'error');
          clearPendingShare();
          return;
        }

        // Drive-backed shares are one-time exports; only Copy mode is
        // meaningful. Firestore-backed shares unlock all three modes.
        const driveBacked = currentShareId.startsWith('drive-');
        // For Drive-backed shares, the doc itself doesn't carry intendedMode —
        // force 'copy' so the recipient sees the single-action confirmation
        // path instead of the legacy 3-option picker.
        const sharedSnap = sharedDb as SharedBoardSnapshot | null;
        const docIntendedMode = sharedSnap?.intendedMode;
        // Substitute shares are never importable into a teacher's account —
        // they live only inside the /subs portal. Strip the mode here so the
        // import picker doesn't try to honor it.
        const importableMode: SharedBoardImportMode | undefined =
          docIntendedMode && docIntendedMode !== 'substitute'
            ? docIntendedMode
            : undefined;
        const intendedMode: SharedBoardImportMode | undefined = driveBacked
          ? 'copy'
          : importableMode;
        setPendingShareImport({
          shareId: currentShareId,
          preview: sharedDb,
          driveBacked,
          ...(intendedMode ? { intendedMode } : {}),
        });
      } catch (err) {
        console.error('Failed to load shared dashboard:', err);
        if (!mounted) return;
        addToast('Failed to load shared board', 'error');
        clearPendingShare();
      } finally {
        if (processingRef.current === currentShareId) {
          processingRef.current = null;
        }
      }
    };

    void load();

    return () => {
      mounted = false;
      if (processingRef.current === currentShareId) {
        processingRef.current = null;
      }
    };
  }, [
    pendingShareId,
    user,
    handleLoadSharedDashboard,
    addToast,
    clearPendingShare,
  ]);

  const cancelPendingShareImport = useCallback(() => {
    setPendingShareImport(null);
    clearPendingShare();
  }, [clearPendingShare]);

  const importSharedBoard = useCallback(
    async (mode: SharedBoardImportMode) => {
      const pending = pendingShareImport;
      if (!pending || !user) return;

      const { shareId, preview, driveBacked } = pending;
      if (!preview) return;

      // Drive shares can only ever be a copy — guard against bypass.
      const effectiveMode: SharedBoardImportMode = driveBacked ? 'copy' : mode;

      const maxOrder = dashboardsRef.current.reduce(
        (max, db) => Math.max(max, db.order ?? 0),
        0
      );

      const baseName = preview.name || 'Shared Board';
      const nameSuffix =
        effectiveMode === 'synced'
          ? ' (Synced)'
          : effectiveMode === 'view-only'
            ? ' (View-Only)'
            : ' (Copy)';

      const newDb: Dashboard = {
        id: crypto.randomUUID(),
        name: `${baseName}${nameSuffix}`,
        background: preview.background,
        widgets: preview.widgets ?? [],
        globalStyle: preview.globalStyle,
        settings: preview.settings,
        isDefault: false,
        createdAt: Date.now(),
        order: maxOrder + 1,
        ...(effectiveMode !== 'copy'
          ? {
              linkedShareId: shareId,
              linkedShareRole:
                effectiveMode === 'synced' ? 'collaborator' : 'viewer',
              linkedShareHostName: preview.linkedShareHostName,
              linkedShareEnded: false,
            }
          : {}),
      };

      try {
        await saveDashboard(newDb);

        // Join the shared doc's participants list so the host (and other
        // peers) can count us. Best-effort — don't block the import if the
        // join write fails (still useful as a one-way receiver).
        if (effectiveMode !== 'copy') {
          try {
            await joinSharedBoard(
              shareId,
              effectiveMode === 'synced' ? 'collaborator' : 'viewer',
              user.displayName ?? user.email ?? undefined
            );
          } catch (joinErr) {
            console.warn('Failed to join shared board participants:', joinErr);
          }
        }

        updateActiveId(newDb.id);
        const verb =
          effectiveMode === 'synced'
            ? 'Synced board imported'
            : effectiveMode === 'view-only'
              ? 'View-only board imported'
              : 'Board imported';
        addToast(verb, 'success');
      } catch (err) {
        console.error('Failed to import shared board:', err);
        addToast('Failed to import shared board', 'error');
      } finally {
        setPendingShareImport(null);
        clearPendingShare();
      }
    },
    [
      pendingShareImport,
      user,
      saveDashboard,
      joinSharedBoard,
      updateActiveId,
      addToast,
      clearPendingShare,
    ]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Live-share sync
  //
  // For every dashboard that's linked to a shared doc:
  //   - "owner" / "collaborator" roles MIRROR local changes into the shared
  //     doc on a debounced cadence.
  //   - All linked roles SUBSCRIBE to the shared doc so remote edits flow
  //     back into the local dashboard. We skip echoes by tagging mirror
  //     writes with our own uid in `updatedBy`.
  // ─────────────────────────────────────────────────────────────────────────

  /** Last serialized payload we mirrored per shareId — skip duplicate writes. */
  const lastMirroredRef = useRef<Map<string, string>>(new Map());
  /** Pending debounced mirror timers per shareId. */
  const mirrorTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  // Mirror local edits → shared doc (debounced, 500ms).
  useEffect(() => {
    if (!user) return;

    // Track which shareIds are still actively linked this pass so we can
    // cancel any pending timers for dashboards that have been detached
    // (stopSharingDashboard / leaveSharedBoard) before their 500ms debounce
    // window elapses. Without this, a stale snapshot would land in the
    // shared doc after the user already stopped sharing.
    const liveShareIds = new Set<string>();

    dashboards.forEach((d) => {
      if (!d.linkedShareId || d.linkedShareEnded) return;
      if (
        d.linkedShareRole !== 'owner' &&
        d.linkedShareRole !== 'collaborator'
      ) {
        return;
      }

      const shareId = d.linkedShareId;
      liveShareIds.add(shareId);

      // Scrub student PII before broadcasting. The local dashboard may have
      // had names merged back in from Drive (mergeDashboardPII); those must
      // never reach Firestore — least of all the cross-user shared_boards
      // collection. The mirror sees only scrubbed data.
      const scrubbed = scrubDashboardPII(d);

      // Cheap dedupe based on the same fields the saveDashboard path uses.
      const payload = serializeDashboard(scrubbed);
      if (lastMirroredRef.current.get(shareId) === payload) return;

      const existing = mirrorTimersRef.current.get(shareId);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        mirrorTimersRef.current.delete(shareId);
        lastMirroredRef.current.set(shareId, payload);
        void mirrorSharedBoard(shareId, scrubbed).catch((err) => {
          console.warn('Mirror to shared board failed:', err);
          // Drop the cached payload so we retry on the next change.
          lastMirroredRef.current.delete(shareId);
        });
      }, 500);
      mirrorTimersRef.current.set(shareId, timer);
    });

    // Cancel pending writes for shareIds that are no longer in the live set —
    // i.e. boards that were detached/unlinked while a debounce was queued.
    for (const [shareId, timer] of mirrorTimersRef.current) {
      if (!liveShareIds.has(shareId)) {
        clearTimeout(timer);
        mirrorTimersRef.current.delete(shareId);
        lastMirroredRef.current.delete(shareId);
      }
    }
  }, [dashboards, user, mirrorSharedBoard]);

  // Cleanup pending mirror timers on unmount so we don't write after teardown.
  useEffect(() => {
    const timers = mirrorTimersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  // Subscribe to remote edits on each linked share. We re-subscribe whenever
  // the set of (dashboardId, shareId) pairs changes; widget content edits do
  // NOT cause re-subscription because we read the dashboard list via ref.
  const linkedShareKeys = useMemo(
    () =>
      dashboards
        .filter((d) => d.linkedShareId)
        .map((d) => `${d.id}:${d.linkedShareId}`)
        .sort()
        .join('|'),
    [dashboards]
  );

  useEffect(() => {
    if (!user) return;

    const linked = dashboardsRef.current.filter((d) => d.linkedShareId);
    if (linked.length === 0) return;

    const unsubs = linked.map((d) => {
      const dashboardId = d.id;
      const shareId = d.linkedShareId;
      if (!shareId) return () => undefined;

      return subscribeToSharedBoard(shareId, (remote) => {
        if (!remote) {
          // Shared doc deleted by the host (revoked). Behavior depends on
          // the local user's role:
          //  - viewer: View-Only is ephemeral end-to-end. Delete the local
          //    dashboard so the user doesn't accumulate zombie copies.
          //  - collaborator (or anything else): preserve content as a
          //    detached editable copy and flag `linkedShareEnded` so the
          //    UI can surface a "share ended" indicator.
          const local = dashboardsRef.current.find((x) => x.id === dashboardId);
          if (local?.linkedShareRole === 'viewer') {
            const hostName = local.linkedShareHostName;
            // Switch active dashboard away if the doomed board is current.
            if (activeIdRef.current === dashboardId) {
              const next = dashboardsRef.current.find(
                (x) => x.id !== dashboardId
              );
              updateActiveId(next ? next.id : null);
            }
            // Delete from Firestore FIRST, then filter local state on success.
            // Otherwise a transient Firestore failure leaves the local view
            // gone but the persisted doc still present — on next load the
            // zombie reappears, which is exactly the state we're trying to
            // avoid for view-only.
            void deleteDashboardFirestore(dashboardId).then(
              () => {
                setDashboards((prev) =>
                  prev.filter((x) => x.id !== dashboardId)
                );
                addToast(
                  hostName
                    ? `Session closed by ${hostName}`
                    : 'View-only session closed by host',
                  'info'
                );
              },
              (err: unknown) => {
                console.error(
                  'Failed to delete view-only dashboard after host stopped sharing:',
                  err
                );
                // Fall back to the collaborator path (mark ended, keep
                // content) so the user has a non-broken board to recover
                // from. They can manually delete it later.
                setDashboards((prev) =>
                  prev.map((x) =>
                    x.id === dashboardId && !x.linkedShareEnded
                      ? { ...x, linkedShareEnded: true }
                      : x
                  )
                );
                addToast(
                  'View-only session closed, but we couldn’t remove the local copy. Try deleting it manually.',
                  'error'
                );
              }
            );
            return;
          }
          setDashboards((prev) =>
            prev.map((x) =>
              x.id === dashboardId && !x.linkedShareEnded
                ? { ...x, linkedShareEnded: true }
                : x
            )
          );
          return;
        }

        // Skip echoes of our own writes — `updatedBy` is stamped by the
        // mirror effect with the writer's uid, so this filter applies
        // symmetrically to owner, collaborator, and viewer roles.
        const remoteWith = remote as Dashboard & {
          updatedBy?: string;
        };
        if (remoteWith.updatedBy === user.uid) return;

        // Apply remote content patch to the local dashboard. This runs for
        // every role:
        //   - owner       receives collaborator edits (Synced bidirectional)
        //   - collaborator receives owner + peer edits (Synced bidirectional)
        //   - viewer       receives owner edits (View-Only one-way)
        // The echo filter above prevents a writer from re-applying its own
        // mirrored update.
        setDashboards((prev) =>
          prev.map((x) => {
            if (x.id !== dashboardId) return x;
            const { vpW, vpH } = getCurrentViewport();
            // Hydrate pixel x/y/w/h for this viewport: the remote may have
            // been authored on a screen with different dimensions, so its
            // pixel fields are stale. Proportional fields are the source of
            // truth and stay identical across devices.
            const remoteHydrated: Dashboard = remote.widgets
              ? hydrateDashboardForViewport(
                  { ...x, widgets: remote.widgets },
                  vpW,
                  vpH
                )
              : x;
            const next: Dashboard = {
              ...x,
              widgets: remoteHydrated.widgets,
              background: remote.background ?? x.background,
              globalStyle: remote.globalStyle ?? x.globalStyle,
              settings: remote.settings ?? x.settings,
              // Live annotation overlay — hosts and collaborators push
              // strokes through this field so all participants see strokes
              // appear in real time. Falls back to the local copy when the
              // remote omits it (legacy docs).
              annotationOverlay:
                remote.annotationOverlay ?? x.annotationOverlay,
              linkedShareEnded: false,
            };
            // Prime the mirror dedupe so the state change we just made
            // doesn't trigger an immediate echo write back to the shared
            // doc. Without this, every remote apply costs an extra
            // Firestore write of identical content.
            lastMirroredRef.current.set(shareId, serializeDashboard(next));
            return next;
          })
        );
      });
    });

    return () => {
      unsubs.forEach((u) => u());
    };
    // linkedShareKeys captures only structural changes (which share/dashboard
    // pairs exist), not content edits — so we don't re-subscribe on every edit.
  }, [
    linkedShareKeys,
    user,
    subscribeToSharedBoard,
    addToast,
    deleteDashboardFirestore,
    updateActiveId,
  ]);

  const stopSharingDashboard = useCallback(
    async (dashboardId: string) => {
      const target = dashboardsRef.current.find((d) => d.id === dashboardId);
      if (!target?.linkedShareId) return;

      const shareId = target.linkedShareId;
      const isOwner = target.linkedShareRole === 'owner';
      const isViewer = target.linkedShareRole === 'viewer';

      try {
        if (isOwner) {
          await stopSharingBoard(shareId);
        } else {
          // Guest: leave participants list. Local-side handling diverges by
          // role (see below).
          await leaveSharedBoard(shareId);
        }
      } catch (err) {
        console.error('Failed to tear down share:', err);
        addToast('Failed to stop sharing', 'error');
        return;
      }

      // Viewer leaving a View-Only board: View-Only is ephemeral end-to-end,
      // so the local copy is removed instead of being kept as a detached
      // editable dashboard. Switch active dashboard away first if needed.
      if (isViewer) {
        if (activeIdRef.current === dashboardId) {
          const next = dashboardsRef.current.find((x) => x.id !== dashboardId);
          updateActiveId(next ? next.id : null);
        }
        // Delete from Firestore first, then filter local state on success.
        // Optimistically filtering before the Firestore round-trip leaves
        // the doc orphaned if the delete fails — on next load it would
        // reappear with `linkedShareId` cleared (since `leaveSharedBoard`
        // ran), which is exactly the zombie copy view-only is supposed to
        // avoid.
        try {
          await deleteDashboardFirestore(dashboardId);
        } catch (err) {
          console.error('Failed to delete view-only dashboard on leave:', err);
          addToast(
            'Left the share, but we couldn’t remove the local copy. Try deleting it manually.',
            'error'
          );
          return;
        }
        setDashboards((prev) => prev.filter((d) => d.id !== dashboardId));
        addToast('Left view-only board', 'success');
        return;
      }

      // Clear linkage on the local dashboard so the mirror/subscribe effects
      // detach. The board's contents stay as a normal local dashboard for
      // owners stopping a share and for collaborators leaving Synced.
      const detached: Dashboard = {
        ...target,
        linkedShareId: undefined,
        linkedShareRole: undefined,
        linkedShareHostName: undefined,
        linkedShareEnded: undefined,
      };
      setDashboards((prev) =>
        prev.map((d) => (d.id === dashboardId ? detached : d))
      );
      try {
        await saveDashboard(detached);
      } catch (err) {
        console.error('Failed to persist detached share state:', err);
      }
      addToast(isOwner ? 'Stopped sharing' : 'Left shared board', 'success');
    },
    [
      stopSharingBoard,
      leaveSharedBoard,
      saveDashboard,
      addToast,
      deleteDashboardFirestore,
      updateActiveId,
    ]
  );

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
    async (
      name: string,
      data?: Dashboard,
      options?: { collectionId?: string | null; silent?: boolean }
    ): Promise<string | undefined> => {
      if (!user) {
        if (!options?.silent)
          addToast('Must be signed in to create dashboard', 'error');
        return undefined;
      }

      const maxOrder = dashboards.reduce(
        (max, db) => Math.max(max, db.order ?? 0),
        0
      );

      // Resolving collectionId up front lets us write the new Board into its
      // target Collection in a single Firestore write — no second round-trip
      // through moveBoardToCollection.
      const collectionId = options?.collectionId ?? null;

      const newDb: Dashboard = data
        ? {
            ...data,
            id: crypto.randomUUID(),
            name,
            order: data.order ?? maxOrder + 1,
            collectionId,
          }
        : {
            id: crypto.randomUUID(),
            name,
            background: 'bg-slate-800',
            widgets: [],
            createdAt: Date.now(),
            order: maxOrder + 1,
            collectionId,
            isPinned: false,
          };

      try {
        await saveDashboard(newDb);
        if (!options?.silent) {
          updateActiveId(newDb.id);
          addToast(`Dashboard "${name}" ready`);
        }
        return newDb.id;
      } catch (err) {
        logError('DashboardContext.createNewDashboard', err, {
          uid: user.uid,
          name,
          collectionId,
        });
        if (options?.silent) {
          // Silent callers (e.g. importSharedCollection) need to detect
          // failure via rejection — re-throw so Promise.allSettled can count.
          throw err;
        }
        addToast('Failed to create dashboard', 'error');
        return undefined;
      }
    },
    [user, dashboards, saveDashboard, addToast, updateActiveId]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Collection share + import actions
  // ─────────────────────────────────────────────────────────────────────────

  const shareCollection = useCallback(
    async (input: {
      collection: Collection;
      boards: Dashboard[];
    }): Promise<string> => {
      if (!user) throw new Error('Not authenticated');
      return sharedCollectionApi.shareCollection({
        ...input,
        hostUid: user.uid,
        hostDisplayName: user.displayName,
      });
    },
    [user, sharedCollectionApi]
  );

  const shareSubstituteCollection = useCallback(
    async (
      input: CollectionSubstituteShareInput & {
        collection: Collection;
        boards: Dashboard[];
      }
    ): Promise<string> => {
      if (!user) throw new Error('Not authenticated');
      return sharedCollectionApi.shareSubstituteCollection({
        ...input,
        hostUid: user.uid,
        hostDisplayName: user.displayName,
      });
    },
    [user, sharedCollectionApi]
  );

  const importSharedCollection = useCallback(
    async (
      shareId: string
    ): Promise<{
      collectionId: string;
      firstBoardId: string | null;
    } | null> => {
      if (!user) {
        addToast('Must be signed in to import', 'error');
        return null;
      }
      const result = await sharedCollectionApi.loadSharedCollection(shareId);
      if (!result.ok) {
        const message =
          result.reason === 'not-found'
            ? 'Shared Collection not found.'
            : result.reason === 'expired'
              ? 'This shared Collection has expired.'
              : result.reason === 'unauthorized'
                ? "You don't have permission to view this Collection. Reconnect your Google account or ask the host to re-share."
                : 'Could not load the shared Collection. Check your connection and try again.';
        addToast(message, 'error');
        return null;
      }
      const meta = result.meta;
      if (meta.intendedMode === 'substitute') {
        addToast(
          'Substitute shares are view-only. Open this link in /subs to view.',
          'error'
        );
        return null;
      }
      const boards = await sharedCollectionApi.loadSharedCollectionBoards(
        shareId,
        meta.boardIds
      );
      if (boards.length === 0) {
        addToast('Shared Collection is empty', 'error');
        return null;
      }
      // Warn if the share was partially available (some board docs missing).
      if (boards.length < meta.boardIds.length) {
        const missing = meta.boardIds.length - boards.length;
        addToast(
          `${missing.toString()} board(s) couldn't be loaded — importing the rest`,
          'error'
        );
        // Continue with the partial set; warning is surfaced above.
      }

      try {
        // Phase 1: create the recipient's Collection.
        const newCollectionId = await collectionsApi.createCollection(
          meta.collection.name,
          null // root — recipient can move it later
        );

        // Capture maxOrder ONCE before the parallel fan-out so each board
        // gets a deterministic, non-colliding order value.
        const baseOrder = dashboards.reduce(
          (max, d) => Math.max(max, d.order ?? 0),
          0
        );

        // Phase 2: clone each Board into the new Collection. Use silent:true
        // so N boards don't fire N toasts and N activeId thrashes. With
        // silent:true, createNewDashboard throws on failure so
        // Promise.allSettled captures rejections (not undefined returns).
        const importResults = await Promise.allSettled(
          boards.map((b, idx) =>
            createNewDashboard(
              `${b.name} (Imported)`,
              // Deep-clone the board so nested widget state isn't shared by
              // reference across imports.
              {
                ...structuredClone(b),
                id: crypto.randomUUID(),
                order: baseOrder + idx + 1,
              } as Dashboard,
              { collectionId: newCollectionId, silent: true }
            )
          )
        );

        // With silent:true, createNewDashboard throws on failure (rejected)
        // and returns the new id on success (fulfilled with a string).
        // Guard against undefined returns defensively in case a future caller
        // removes silent:true without updating this detection.
        const succeeded = importResults.filter(
          (r) => r.status === 'fulfilled' && r.value !== undefined
        ).length;
        const failed = boards.length - succeeded;

        if (failed > 0) {
          addToast(
            `Imported ${succeeded.toString()} board(s) — ${failed.toString()} failed`,
            'error'
          );
        } else {
          addToast(`Imported Collection with ${succeeded.toString()} board(s)`);
        }

        // NOTE: This cleanup runs AFTER createCollection's Firestore write
        // resolves, which means the recipient's useCollections onSnapshot
        // listener may have already received and displayed the new Collection
        // (typically ~50-200ms before this delete arrives). On total-failure
        // imports the user will see the Collection flash briefly in their
        // sidebar tree before disappearing. Acceptable for an exceptional
        // path; a transactional fix (single batch with all writes + create-or-
        // delete based on success count) would require Firestore Cloud
        // Functions or a rewrite to use a single batched transaction.
        if (succeeded === 0) {
          // All boards failed — delete the empty Collection rather than
          // leaving a labeled-but-empty shell in the recipient's tree.
          try {
            await collectionsApi.deleteCollection(
              newCollectionId,
              'delete-all'
            );
          } catch (cleanupErr) {
            logError(
              'DashboardContext.importSharedCollection.cleanup',
              cleanupErr,
              { newCollectionId }
            );
          }
          return null;
        }

        // Return the first successfully imported board's id directly so
        // the caller can navigate without waiting for the Firestore snapshot
        // to update the local dashboards state (which is async).
        const firstFulfilled = importResults.find(
          (r): r is PromiseFulfilledResult<string | undefined> =>
            r.status === 'fulfilled' && r.value !== undefined
        );
        const firstBoardId = firstFulfilled?.value ?? null;

        return { collectionId: newCollectionId, firstBoardId };
      } catch (err) {
        logError('DashboardContext.importSharedCollection', err, {
          shareId,
          boardCount: boards.length,
        });
        addToast('Failed to import shared Collection', 'error');
        return null;
      }
    },
    [
      user,
      dashboards,
      addToast,
      sharedCollectionApi,
      collectionsApi,
      createNewDashboard,
    ]
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

  // `options.silent` suppresses the success + error toast surfaced by the
  // action itself. Rollback + logError + throw still happen. Bulk callers
  // (Promise.allSettled fan-out) pass `silent: true` and rely on their own
  // aggregate "Updated N — M failed" toast to avoid per-item notification
  // spam (notification blindness is itself a silent-failure mode).
  const setDefaultDashboard = useCallback(
    async (boardId: string, options?: { silent?: boolean }): Promise<void> => {
      if (!user?.uid) throw new Error('Not authenticated');
      const target = dashboards.find((d) => d.id === boardId);
      if (!target) return;
      const targetCollectionId = target.collectionId ?? null;

      // Snapshot the previous default-flags so we can roll back if the
      // Firestore batch fails. Without this snapshot, a failed commit
      // leaves local state diverged from Firestore until the next snapshot.
      const prevDefaults = new Map(
        dashboards
          .filter((d) => (d.collectionId ?? null) === targetCollectionId)
          .map((d) => [d.id, d.isDefault] as const)
      );

      // Optimistic local state update: clear isDefault on siblings, set on target.
      setDashboards((prev) =>
        prev.map((d) => {
          const dColl = d.collectionId ?? null;
          if (dColl === targetCollectionId) {
            return { ...d, isDefault: d.id === boardId };
          }
          return d;
        })
      );

      if (isAuthBypass) {
        if (!options?.silent) addToast('Default board updated', 'success');
        return;
      }

      const batch = writeBatch(db);
      const now = Date.now();

      dashboards.forEach((d) => {
        const dColl = d.collectionId ?? null;
        if (dColl === targetCollectionId && d.isDefault && d.id !== boardId) {
          batch.update(doc(db, 'users', user.uid, 'dashboards', d.id), {
            isDefault: false,
            updatedAt: now,
          });
        }
      });
      batch.update(doc(db, 'users', user.uid, 'dashboards', boardId), {
        isDefault: true,
        updatedAt: now,
      });

      try {
        await batch.commit();
        if (!options?.silent) addToast('Default board updated', 'success');
      } catch (err) {
        logError('DashboardContext.setDefaultDashboard', err, {
          uid: user.uid,
          boardId,
        });
        // Roll back the optimistic state so the UI matches Firestore again.
        setDashboards((prev) =>
          prev.map((d) =>
            prevDefaults.has(d.id)
              ? { ...d, isDefault: prevDefaults.get(d.id) ?? false }
              : d
          )
        );
        if (!options?.silent) addToast('Failed to set default board', 'error');
        throw err;
      }
    },
    [user?.uid, dashboards, addToast]
  );

  const moveBoardToCollection = useCallback(
    async (
      boardId: string,
      collectionId: string | null,
      options?: { silent?: boolean }
    ): Promise<void> => {
      if (!user?.uid) throw new Error('Not authenticated');
      const prev = dashboards.find((d) => d.id === boardId);
      if (!prev) return;
      const prevCollectionId = prev.collectionId ?? null;
      // No-op when the board is already in the target Collection. Avoids a
      // wasted Firestore write (school-district cost) and a lying "Moved"
      // toast when the user re-picks the same destination.
      if (prevCollectionId === collectionId) return;

      setDashboards((curr) =>
        curr.map((d) => (d.id === boardId ? { ...d, collectionId } : d))
      );
      if (isAuthBypass) return;

      try {
        await updateDoc(doc(db, 'users', user.uid, 'dashboards', boardId), {
          collectionId,
          updatedAt: Date.now(),
        });
      } catch (err) {
        logError('DashboardContext.moveBoardToCollection', err, {
          uid: user.uid,
          boardId,
          fromCollectionId: prevCollectionId,
          toCollectionId: collectionId,
        });
        // Roll back the optimistic state so the dragged board returns to its
        // original Collection on screen.
        setDashboards((curr) =>
          curr.map((d) =>
            d.id === boardId ? { ...d, collectionId: prevCollectionId } : d
          )
        );
        if (!options?.silent) addToast('Failed to move board', 'error');
        throw err;
      }
    },
    [user?.uid, dashboards, addToast]
  );

  const pinBoard = useCallback(
    async (boardId: string, options?: { silent?: boolean }): Promise<void> => {
      if (!user?.uid) throw new Error('Not authenticated');
      const prev = dashboards.find((d) => d.id === boardId);
      const prevPinned = prev?.isPinned ?? false;
      if (prevPinned) return; // already pinned — skip the write

      setDashboards((curr) =>
        curr.map((d) => (d.id === boardId ? { ...d, isPinned: true } : d))
      );
      if (isAuthBypass) return;

      try {
        await updateDoc(doc(db, 'users', user.uid, 'dashboards', boardId), {
          isPinned: true,
          updatedAt: Date.now(),
        });
      } catch (err) {
        logError('DashboardContext.pinBoard', err, {
          uid: user.uid,
          boardId,
        });
        setDashboards((curr) =>
          curr.map((d) =>
            d.id === boardId ? { ...d, isPinned: prevPinned } : d
          )
        );
        if (!options?.silent) addToast('Failed to pin board', 'error');
        throw err;
      }
    },
    [user?.uid, dashboards, addToast]
  );

  const unpinBoard = useCallback(
    async (boardId: string, options?: { silent?: boolean }): Promise<void> => {
      if (!user?.uid) throw new Error('Not authenticated');
      const prev = dashboards.find((d) => d.id === boardId);
      const prevPinned = prev?.isPinned ?? false;
      if (!prevPinned) return; // already unpinned — skip the write

      setDashboards((curr) =>
        curr.map((d) => (d.id === boardId ? { ...d, isPinned: false } : d))
      );
      if (isAuthBypass) return;

      try {
        await updateDoc(doc(db, 'users', user.uid, 'dashboards', boardId), {
          isPinned: false,
          updatedAt: Date.now(),
        });
      } catch (err) {
        logError('DashboardContext.unpinBoard', err, {
          uid: user.uid,
          boardId,
        });
        setDashboards((curr) =>
          curr.map((d) =>
            d.id === boardId ? { ...d, isPinned: prevPinned } : d
          )
        );
        if (!options?.silent) addToast('Failed to unpin board', 'error');
        throw err;
      }
    },
    [user?.uid, dashboards, addToast]
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
      // Persist navigation memory (lastActiveCollectionId + per-Collection
      // last Board) only once the profile has been loaded. Writing earlier
      // races with AuthContext.loadProfile and can overwrite the freshly-read
      // values with a stale {merge: true} write before the read completes.
      if (!user?.uid || isAuthBypass) return;
      if (!profileLoaded) {
        // Tripwire: today App.tsx blocks render until profileLoaded === true
        // so this branch should be unreachable. If it ever fires, the
        // navigation-memory write is silently dropped and the user will land
        // on a stale Board on next session — log so we notice in telemetry
        // before users do.
        logError(
          'DashboardContext.loadDashboard.skippedPreProfile',
          new Error('loadDashboard called before profileLoaded'),
          { uid: user.uid, boardId: id }
        );
        return;
      }
      const target = dashboardsRef.current.find((d) => d.id === id);
      if (!target) return;
      const collectionKey = target.collectionId ?? ROOT_COLLECTION_KEY;

      // Dedup: skip the write entirely if neither value moved. A teacher
      // re-clicking the active board's sidebar entry (or rapidly cycling
      // through and landing back where they started) was previously
      // issuing a profile write per click. Across a district that adds up
      // to real Firestore cost for a strictly no-op write. The dedup
      // window is per-process, mirroring server state via the same ref.
      if (
        navigationWriteRef.current?.boardId === id &&
        navigationWriteRef.current.collectionKey === collectionKey
      ) {
        return;
      }
      navigationWriteRef.current = { boardId: id, collectionKey };

      // Debounce: collapse rapid board cycling (a teacher hopping through
      // 4-5 boards during a transition) into a single profile write. 500ms
      // is long enough to absorb interactive bursts, short enough that the
      // last-visited Board is captured before the user closes the tab.
      if (navigationDebounceRef.current !== null) {
        clearTimeout(navigationDebounceRef.current);
      }
      const uid = user.uid;
      const collectionId = target.collectionId ?? null;
      navigationDebounceRef.current = window.setTimeout(() => {
        navigationDebounceRef.current = null;
        const profileRef = doc(db, 'users', uid, 'userProfile', 'profile');
        // Use the nested-object form rather than a dot-notated key
        // (`lastBoardIdByCollection.${collectionKey}: id`). `setDoc` with
        // `{ merge: true }` treats dot-notated keys as LITERAL field names
        // — it does NOT interpret them as field paths the way `updateDoc`
        // does. The nested-object form recursively merges maps under
        // merge:true, so existing per-Collection entries in
        // `lastBoardIdByCollection` are preserved and the new entry is
        // added/updated under the right key. AuthContext reads this as a
        // nested map; the dot-notated form silently wrote literal
        // `"lastBoardIdByCollection.foo"` fields at the doc root that
        // AuthContext never saw, so navigation memory never persisted.
        const updates: Record<string, unknown> = {
          lastActiveCollectionId: collectionId,
          lastBoardIdByCollection: { [collectionKey]: id },
        };
        void setDoc(profileRef, updates, { merge: true }).catch(
          (err: unknown) => {
            logError('DashboardContext.loadDashboard.persistLastActive', err, {
              uid,
              boardId: id,
              collectionId,
            });
          }
        );
      }, 500);
    },
    [addToast, updateActiveId, user, profileLoaded]
  );

  const setActiveCollectionId = useCallback(
    (nextCollectionId: string | null) => {
      // Reuse pickInitialBoard but force its lastActiveCollectionId arg to
      // the new Collection — this picks the per-Collection remembered
      // Board (or the right fallback) without an extra Firestore read.
      const target = pickInitialBoard(
        dashboards,
        nextCollectionId,
        lastBoardIdByCollection,
        collections
      );
      if (!target) {
        // No Board to switch to. Surface a user-visible hint so a click on
        // an empty Collection isn't a confusing no-op — the previous
        // behaviour silently logged and returned, leaving the user wondering
        // why nothing happened. Active Board stays the same.
        const name = nextCollectionId
          ? (collections.find((c) => c.id === nextCollectionId)?.name ?? null)
          : null;
        addToast(
          name
            ? `“${name}” has no boards yet — add one to switch to it.`
            : 'This Collection has no boards yet — add one to switch to it.',
          'info'
        );
        logError(
          'DashboardContext.setActiveCollectionId.noBoardsInCollection',
          new Error('Target Collection has no resolvable Board'),
          { collectionId: nextCollectionId }
        );
        return;
      }
      loadDashboard(target.id);
    },
    [dashboards, lastBoardIdByCollection, collections, loadDashboard, addToast]
  );

  const activeDashboard = dashboards.find((d) => d.id === activeId) ?? null;

  // True when the user is viewing a board they joined as a viewer in
  // View-Only mode. Read-only mutation guards check this via a ref so
  // memoized action callbacks don't have to invalidate on every change.
  const isActiveBoardReadOnly =
    activeDashboard?.linkedShareRole === 'viewer' &&
    !activeDashboard?.linkedShareEnded;
  const isActiveBoardReadOnlyRef = useRef(isActiveBoardReadOnly);
  isActiveBoardReadOnlyRef.current = isActiveBoardReadOnly;

  /**
   * Bridges the pure {@link getAdminBuildingConfigPure} helper into the
   * context's reactive dependencies (`featurePermissions`,
   * `selectedBuildings`) so consumers can call it without threading those
   * values themselves. The validation/switch logic lives in
   * `utils/adminBuildingConfig.ts` for independent testing.
   */
  const getAdminBuildingConfig = useCallback(
    (type: WidgetType): Record<string, unknown> =>
      getAdminBuildingConfigPure(type, featurePermissions, selectedBuildings),
    [featurePermissions, selectedBuildings]
  );

  const addWidget = useCallback(
    (type: WidgetType, overrides?: AddWidgetOverrides) => {
      if (!activeId) return;
      if (isActiveBoardReadOnlyRef.current) return;
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
          // Anchor pixel defaults against the reference viewport so a widget
          // added on a 1366×768 laptop and one added on a 1920×1080 projector
          // get identical proportional bounds.
          const anchorX = 50;
          const anchorY = 80;
          const pixelW = defaults.w ?? 200;
          const pixelH = defaults.h ?? 200;
          const anchorProp = pixelToProp(
            { x: anchorX, y: anchorY, w: pixelW, h: pixelH },
            REFERENCE_VIEWPORT.w,
            REFERENCE_VIEWPORT.h
          );
          const stretch = WIDGET_STRETCH_BEHAVIOR[type] ?? 'preserve-aspect';
          const { vpW, vpH } = getCurrentViewport();
          const initialPixels = computeWidgetPixelRect(
            anchorProp,
            vpW,
            vpH,
            stretch
          );
          const baseWidget: WidgetData = {
            id: newWidgetId,
            type,
            x: initialPixels.x,
            y: initialPixels.y,
            w: initialPixels.w,
            h: initialPixels.h,
            xProp: anchorProp.xProp,
            yProp: anchorProp.yProp,
            wProp: anchorProp.wProp,
            hProp: anchorProp.hProp,
            aspectRatio: pixelW / pixelH,
            flipped: false,
            z: maxZ + 1,
            version: 1,
            ...defaults,
            ...overrides,
            config: mergeWidgetConfig(
              defaults.config,
              adminConfig,
              savedWidgetConfigs?.[type],
              overrides?.config
            ),
          };
          // Overrides (e.g. starter packs) may have supplied legacy pixel
          // x/y/w/h without proportional fields — re-derive proportions and
          // aspect ratio from whatever pixel rect the widget ended up with,
          // anchored against the reference viewport so the same starter
          // pack produces the same proportions on every device.
          const overrodePixels =
            !!overrides &&
            ('x' in overrides ||
              'y' in overrides ||
              'w' in overrides ||
              'h' in overrides);
          const overrodeProps =
            !!overrides &&
            ('xProp' in overrides ||
              'yProp' in overrides ||
              'wProp' in overrides ||
              'hProp' in overrides);
          const newWidget =
            overrodePixels && !overrodeProps
              ? syncWidgetProportionsFromPixels(
                  baseWidget,
                  REFERENCE_VIEWPORT.w,
                  REFERENCE_VIEWPORT.h,
                  true
                )
              : baseWidget;
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
      if (isActiveBoardReadOnlyRef.current) return;
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

            const baseConfig = mergeWidgetConfig(
              defaults.config,
              adminConfig,
              savedWidgetConfigs?.[item.type],
              sanitizedInputConfig
            );

            const newWidgetId = crypto.randomUUID();
            locallyAddedWidgetIds.current.add(newWidgetId);

            const stretch =
              WIDGET_STRETCH_BEHAVIOR[item.type] ?? 'preserve-aspect';

            const buildWidget = (pixels: {
              x: number;
              y: number;
              w: number;
              h: number;
            }): WidgetData => {
              const prop = pixelToProp(pixels, BOARD_W, BOARD_H);
              const aspectRatio = pixels.w / Math.max(1, pixels.h);
              const { vpW: curW, vpH: curH } = getCurrentViewport();
              const hydrated = computeWidgetPixelRect(
                prop,
                curW,
                curH,
                stretch
              );
              return {
                id: newWidgetId,
                type: item.type,
                flipped: false,
                z: maxZ,
                version: 1,
                ...defaults,
                x: hydrated.x,
                y: hydrated.y,
                w: hydrated.w,
                h: hydrated.h,
                xProp: prop.xProp,
                yProp: prop.yProp,
                wProp: prop.wProp,
                hProp: prop.hProp,
                aspectRatio,
                config: baseConfig,
              } as WidgetData;
            };

            // 1. SMART LAYOUT: If AI provided spatial data
            if (validatedGrid) {
              const { col, row, colSpan, rowSpan } = validatedGrid;
              return buildWidget({
                x: col * COL_W + OFFSET_X,
                y: row * ROW_H + OFFSET_Y,
                w: Math.max(1, colSpan * COL_W - GRID_GAP),
                h: Math.max(1, rowSpan * ROW_H - GRID_GAP),
              });
            }

            // 2. FALLBACK LAYOUT: Legacy 3-column placement for missing gridConfigs
            const col = index % 3;
            const row = Math.floor(index / 3);
            const START_X = 50;
            const START_Y = 80;
            const COL_WIDTH = 350;
            const ROW_HEIGHT = 280;

            return buildWidget({
              x: START_X + col * COL_WIDTH,
              y: START_Y + row * ROW_HEIGHT,
              w: defaults.w ?? 250,
              h: defaults.h ?? 250,
            });
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
      if (isActiveBoardReadOnlyRef.current) return;
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
      if (isActiveBoardReadOnlyRef.current) return;
      lastLocalUpdateAt.current = Date.now();
      lastUpdateWasSettingsOnly.current = false;
      setDashboards((prev) =>
        prev.map((d) => {
          if (d.id !== activeId) return d;
          const target = d.widgets.find((w) => w.id === id);
          if (!target) return d;

          const maxZ = d.widgets.reduce((max, w) => Math.max(max, w.z), 0);
          const { vpW, vpH } = getCurrentViewport();
          const offsetTarget = {
            ...target,
            x: target.x + 20,
            y: target.y + 20,
          };
          const withProps = syncWidgetProportionsFromPixels(
            offsetTarget,
            vpW,
            vpH,
            false // duplication is a position change only
          );
          const duplicated: WidgetData = {
            ...withProps,
            id: crypto.randomUUID(),
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
      if (isActiveBoardReadOnlyRef.current) return;
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
    if (isActiveBoardReadOnlyRef.current) return;
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
      if (isActiveBoardReadOnlyRef.current) return;
      lastLocalUpdateAt.current = Date.now();
      lastUpdateWasSettingsOnly.current = false;

      // A pixel-size change implies the user resized — refresh aspectRatio.
      // A pure position change keeps the locked aspect ratio.
      const isResize = 'w' in updates || 'h' in updates;
      const isPositionOrSize =
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

              const merged: WidgetData = {
                ...w,
                ...updates,
                version: newVersion,
                config: newConfig,
              };

              // After a pixel position/size change, re-derive proportional
              // bounds from the new pixel state. This is what makes the
              // canonical proportional storage track local edits.
              if (isPositionOrSize) {
                const { vpW, vpH } = getCurrentViewport();
                return syncWidgetProportionsFromPixels(
                  merged,
                  vpW,
                  vpH,
                  isResize
                );
              }
              return merged;
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
      if (isActiveBoardReadOnlyRef.current) return;
      lastLocalUpdateAt.current = Date.now();
      lastUpdateWasSettingsOnly.current = false;
      const updateMap = new Map(updates.map((u) => [u.id, u.changes]));
      setDashboards((prev) =>
        prev.map((d) => {
          if (d.id !== activeIdRef.current) return d;
          const { vpW, vpH } = getCurrentViewport();
          return {
            ...d,
            widgets: d.widgets.map((w) => {
              const changes = updateMap.get(w.id);
              if (!changes) return w;
              const merged = { ...w, ...changes };
              const isResize = 'w' in changes || 'h' in changes;
              return syncWidgetProportionsFromPixels(
                merged,
                vpW,
                vpH,
                isResize
              );
            }),
          };
        })
      );
    },
    []
  );

  const groupWidgets = useCallback(
    (widgetIds: string[]) => {
      if (!activeIdRef.current || widgetIds.length < 2) return;
      if (isActiveBoardReadOnlyRef.current) return;

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
    if (isActiveBoardReadOnlyRef.current) return;
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
      if (isActiveBoardReadOnlyRef.current) return;

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
    if (isActiveBoardReadOnlyRef.current) return;
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
    if (isActiveBoardReadOnlyRef.current) return;
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
    if (isActiveBoardReadOnlyRef.current) return;
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
      if (isActiveBoardReadOnlyRef.current) return;
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

  const setBackground = useCallback(
    (bg: string) => {
      if (!activeIdRef.current) return;
      if (isActiveBoardReadOnlyRef.current) return;
      lastLocalUpdateAt.current = Date.now();
      lastUpdateWasSettingsOnly.current = false;
      setDashboards((prev) =>
        prev.map((d) =>
          d.id === activeIdRef.current ? { ...d, background: bg } : d
        )
      );
      // Fire-and-forget; failure doesn't block the user's UX.
      recordRecentBackground(bg).catch((err) => {
        console.warn('Failed to record recent background', err);
      });
    },
    [recordRecentBackground]
  );

  const updateDashboardSettings = useCallback(
    (updates: Partial<Dashboard['settings']>) => {
      if (!activeIdRef.current) return;
      if (isActiveBoardReadOnlyRef.current) return;
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
    // Allow updates that only change link bookkeeping (so we can mark a
    // viewer's board as "share ended" or detach a guest) but block any
    // content edits when the board is read-only.
    if (isActiveBoardReadOnlyRef.current) {
      const onlyLinkFields = Object.keys(updates).every((k) =>
        k.startsWith('linkedShare')
      );
      if (!onlyLinkFields) return;
    }
    lastLocalUpdateAt.current = Date.now();
    lastUpdateWasSettingsOnly.current = false;
    setDashboards((prev) =>
      prev.map((d) => (d.id === activeIdRef.current ? { ...d, ...updates } : d))
    );
  }, []);

  const setGlobalStyle = useCallback((style: Partial<GlobalStyle>) => {
    if (!activeIdRef.current) return;
    if (isActiveBoardReadOnlyRef.current) return;
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
  // Helper: write a new annotationOverlay onto the active dashboard. Used by
  // every mutator below so all writes go through the same mirror-friendly
  // path. Read-only check is intentionally NOT applied here for annotation —
  // annotations on Synced boards are bidirectional by design (host and
  // collaborator both push). For viewers, the pencil button is hidden in
  // the UI, so they have no way to invoke these.
  const setActiveAnnotationObjects = useCallback((next: DrawableObject[]) => {
    const id = activeIdRef.current;
    if (!id) return;
    lastLocalUpdateAt.current = Date.now();
    lastUpdateWasSettingsOnly.current = false;
    setDashboards((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              annotationOverlay: {
                objects: next,
                updatedAt: Date.now(),
              },
            }
          : d
      )
    );
  }, []);

  const openAnnotation = useCallback(() => {
    // Seed from admin building defaults for width + color palette.
    // `color` is not configurable at the admin level — keep the user's
    // previously-chosen color across sessions.
    const adminConfig = getAdminBuildingConfig('drawing') as {
      width?: number;
      customColors?: string[];
    };
    setAnnotationLocalState((prev) => ({
      color: prev.color,
      width: adminConfig.width ?? DRAWING_DEFAULTS.WIDTH,
      customColors: adminConfig.customColors ?? [
        ...DRAWING_DEFAULTS.CUSTOM_COLORS,
      ],
    }));
    // Reset the dashboard's overlay so a fresh session starts blank for
    // everyone (including remote participants on a synced board).
    setActiveAnnotationObjects([]);
    setAnnotationActive(true);
  }, [getAdminBuildingConfig, setActiveAnnotationObjects]);

  const closeAnnotation = useCallback(() => {
    setAnnotationActive(false);
    // Clear shared strokes so collaborators / viewers see them disappear
    // when the host (or any synced participant) ends the session.
    setActiveAnnotationObjects([]);
  }, [setActiveAnnotationObjects]);

  const updateAnnotationState = useCallback(
    (updates: Partial<AnnotationState>) => {
      const { objects: nextObjects, ...rest } = updates;
      if (Object.keys(rest).length > 0) {
        setAnnotationLocalState((prev) => ({ ...prev, ...rest }));
      }
      if (nextObjects !== undefined) {
        setActiveAnnotationObjects(nextObjects);
      }
    },
    [setActiveAnnotationObjects]
  );

  const addAnnotationObject = useCallback(
    (obj: DrawableObject) => {
      const id = activeIdRef.current;
      if (!id) return;
      const stamped: DrawableObject = {
        ...obj,
        authorUid: obj.authorUid ?? user?.uid,
      };
      const current =
        dashboardsRef.current.find((d) => d.id === id)?.annotationOverlay
          ?.objects ?? [];
      setActiveAnnotationObjects([...current, stamped]);
    },
    [setActiveAnnotationObjects, user?.uid]
  );

  const undoAnnotation = useCallback(() => {
    const id = activeIdRef.current;
    if (!id) return;
    const current =
      dashboardsRef.current.find((d) => d.id === id)?.annotationOverlay
        ?.objects ?? [];
    if (current.length === 0) return;
    // Per-author undo: only remove the local user's most recent stroke so
    // collaborators on a synced board can't accidentally clobber each
    // other's drawings. Falls back to the very last object when the
    // user's uid isn't known (auth-bypass / pre-stamped legacy data).
    const uid = user?.uid;
    let removeAt = -1;
    if (uid) {
      for (let i = current.length - 1; i >= 0; i--) {
        if (current[i].authorUid === uid) {
          removeAt = i;
          break;
        }
      }
    }
    if (removeAt < 0) {
      removeAt = current.length - 1;
    }
    const next = [
      ...current.slice(0, removeAt),
      ...current.slice(removeAt + 1),
    ];
    setActiveAnnotationObjects(next);
  }, [setActiveAnnotationObjects, user?.uid]);

  const clearAnnotation = useCallback(() => {
    setActiveAnnotationObjects([]);
  }, [setActiveAnnotationObjects]);

  // Exposed `annotationState` merges per-user UI state with the active
  // dashboard's shared object list. This keeps a single shape for consumers
  // while making `objects` reactive to remote sync updates.
  const annotationState = useMemo<AnnotationState>(
    () => ({
      ...annotationLocalState,
      objects: activeDashboard?.annotationOverlay?.objects ?? [],
    }),
    [annotationLocalState, activeDashboard?.annotationOverlay?.objects]
  );

  const contextValue = useMemo(
    () => ({
      driveService,
      collectionsApi,
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
      moveBoardToCollection,
      pinBoard,
      unpinBoard,
      setActiveCollectionId,
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
      setAbsentStudents,
      addFolder,
      createFolderWithItems,
      renameFolder,
      deleteFolder,
      addItemToFolder,
      removeItemFromFolder,
      moveItemOutOfFolder,
      reorderFolderItems,
      shareDashboard: handleShareDashboard,
      shareSubstituteDashboard: handleShareSubstituteDashboard,
      loadSharedDashboard: handleLoadSharedDashboard,
      pendingShareId,
      clearPendingShare,
      pendingShareImport,
      cancelPendingShareImport,
      importSharedBoard,
      stopSharingDashboard,
      isActiveBoardReadOnly,
      pendingQuizShareId,
      clearPendingQuizShare,
      setPendingQuizShareId,
      pendingAssignmentShareId,
      setPendingAssignmentShareId,
      clearPendingAssignmentShare,
      pendingVideoActivityShareId,
      setPendingVideoActivityShareId,
      clearPendingVideoActivityShare,
      pendingAssignmentSetupId,
      setPendingAssignmentSetup,
      clearPendingAssignmentSetup,
      pendingAssignmentEditId,
      setPendingAssignmentEdit,
      clearPendingAssignmentEdit,
      shareCollection,
      shareSubstituteCollection,
      loadSharedCollection: sharedCollectionApi.loadSharedCollection,
      loadSharedCollectionBoards:
        sharedCollectionApi.loadSharedCollectionBoards,
      importSharedCollection,
      pendingSharedCollectionId,
      setPendingSharedCollectionId,
      clearPendingSharedCollection,
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
      driveService,
      collectionsApi,
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
      moveBoardToCollection,
      pinBoard,
      unpinBoard,
      setActiveCollectionId,
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
      setAbsentStudents,
      addFolder,
      createFolderWithItems,
      renameFolder,
      deleteFolder,
      addItemToFolder,
      removeItemFromFolder,
      moveItemOutOfFolder,
      reorderFolderItems,
      handleShareDashboard,
      handleShareSubstituteDashboard,
      handleLoadSharedDashboard,
      pendingShareId,
      clearPendingShare,
      pendingShareImport,
      cancelPendingShareImport,
      importSharedBoard,
      stopSharingDashboard,
      isActiveBoardReadOnly,
      pendingQuizShareId,
      clearPendingQuizShare,
      setPendingQuizShareId,
      pendingAssignmentShareId,
      setPendingAssignmentShareId,
      clearPendingAssignmentShare,
      pendingVideoActivityShareId,
      setPendingVideoActivityShareId,
      clearPendingVideoActivityShare,
      pendingAssignmentSetupId,
      setPendingAssignmentSetup,
      clearPendingAssignmentSetup,
      pendingAssignmentEditId,
      setPendingAssignmentEdit,
      clearPendingAssignmentEdit,
      shareCollection,
      shareSubstituteCollection,
      sharedCollectionApi.loadSharedCollection,
      sharedCollectionApi.loadSharedCollectionBoards,
      importSharedCollection,
      pendingSharedCollectionId,
      setPendingSharedCollectionId,
      clearPendingSharedCollection,
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
