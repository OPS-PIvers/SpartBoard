import React, { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useGesture } from '@use-gesture/react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import {
  isExternalBackground,
  isCustomBackground,
  getCustomBackgroundStyle,
} from '@/utils/backgrounds';
import { useAuth } from '@/context/useAuth';
import { useLiveSession } from '@/hooks/useLiveSession';
import { ImportShareModePicker } from '@/components/share/ImportShareModePicker';
import { ImportSharedCollectionModal } from '@/components/share/ImportSharedCollectionModal';
import { ShareStatusBanner } from '@/components/share/ShareStatusBanner';
import { logError } from '@/utils/logError';
import {
  PLC_WRITE_FAILED_EVENT,
  type PlcWriteFailureDetail,
} from '@/utils/plcWriteNotifications';
import { useStorage, MAX_PDF_SIZE_BYTES } from '@/hooks/useStorage';
import { AnnotationOverlay } from './AnnotationOverlay';
import { BoardNavFab } from './BoardNavFab';
import { AnnouncementOverlay } from '@/components/announcements/AnnouncementOverlay';
import { MountedBoardsLayer } from './MountedBoardsLayer';
import { HelpCenterModal } from '@/components/help/HelpCenterModal';
import {
  getLastHelpTab,
  HELP_OPEN_EVENT,
  type HelpOpenRequest,
  type HelpTab,
} from '@/components/help/helpCenterState';
import { useHasOpenModal } from '@/components/common/modalStore';
import { LazyChunkErrorBoundary } from '@/components/common/LazyChunkErrorBoundary';
import { BoardActionsFab } from './BoardActionsFab';
import { clampZoom, ZOOM_DEFAULT } from '@/utils/zoomMapping';
import {
  clampPan,
  clampWidgetToWorld,
  computeCursorAnchoredPan,
  viewportToWrapper,
} from '@/utils/zoomPanMath';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  Loader2,
  LayoutGrid,
  Music,
  X,
} from 'lucide-react';
import {
  DEFAULT_GLOBAL_STYLE,
  LiveStudent,
  SpartStickerDropPayload,
} from '@/types';
import type { LiveSession, WidgetType } from '@/types';
import { extractYouTubeId } from '@/utils/youtube';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';

// ── Code-split lazies ────────────────────────────────────────────────────────
// Declared after all static imports. ESM hoists `import` statements regardless,
// but keeping every static dependency in one block above is the readable
// convention; these `React.lazy()` consts are runtime values, not imports.
//
// Deep-link share-import machinery (5 Firestore-listener hooks + their import
// callbacks/effects/modal) is mounted lazily — only when a pending share id is
// actually present (see the latch in DashboardView below). On the common
// teacher load no share import is in flight, so none of those listeners open.
const DeepLinkShareImporter = React.lazy(() =>
  import('./DeepLinkShareImporter').then((m) => ({
    default: m.DeepLinkShareImporter,
  }))
);
// Sidebar and Dock are code-split out of the synchronous teacher mount so the
// board canvas paints first; they stream in (behind the Suspense boundary
// below) on the next microtask. Both are position:fixed overlays, so deferring
// them by a tick can't shift the board's layout — the only visible cost is the
// dock's brief skeleton (ShellPlaceholder) while its chunk resolves.
const Sidebar = React.lazy(() =>
  import('./sidebar/Sidebar').then((m) => ({ default: m.Sidebar }))
);
const Dock = React.lazy(() =>
  import('./Dock').then((m) => ({ default: m.Dock }))
);

const EMPTY_STUDENTS: LiveStudent[] = [];

// Gesture constants
const SWIPE_MIN_DISTANCE_PX = 60; // minimum travel to count as a deliberate swipe

// Off: it fired on ordinary two-finger scrolls and minimized widgets render at opacity 0, reading as the widget vanishing.
const SWIPE_MINIMIZE_ENABLED = false;
const SIDEBAR_EDGE_SWIPE_WIDTH_PX = 40; // left-edge zone that triggers sidebar open

// True when focus is inside a text-entry field (input/textarea/select or any
// contentEditable element). Used by the global keydown handler so dashboard
// shortcuts don't hijack keystrokes the user means for a field they're typing in.
const isTypingFieldActive = (): boolean => {
  const activeEl = document.activeElement as HTMLElement | null;
  return (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl?.tagName ?? '') ||
    !!activeEl?.isContentEditable
  );
};

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useDashboard();
  // The wrapper is a positioning container only — live-region semantics live on
  // each toast (role="status"/aria-live="polite" for normal updates, role="alert"
  // for errors). Keeping the live region on the individual toast avoids nesting
  // an assertive region inside a polite one, which some screen readers announce
  // unpredictably or drop entirely.
  return (
    <div
      // Toasts sit outside every widget's DOM subtree, so clicking one (e.g. an
      // "Undo" action) would otherwise register as a click outside an open
      // SettingsPanel and close it. Exclude the whole stack from that check.
      data-settings-exclude
      className="fixed z-toast space-y-3 pointer-events-none"
      style={{
        top: 'calc(1.5rem + env(safe-area-inset-top, 0px))',
        right: 'calc(1.5rem + env(safe-area-inset-right, 0px))',
      }}
    >
      {toasts.map((toast) => {
        const getStyles = () => {
          switch (toast.type) {
            case 'success':
              return 'bg-green-50/90 border-green-200 text-green-800';
            case 'error':
              return 'bg-red-50/90 border-red-200 text-red-800';
            case 'warning':
              return 'bg-yellow-50/90 border-yellow-200 text-yellow-800';
            case 'loading':
              return 'bg-blue-50/90 border-blue-200 text-blue-800';
            case 'info':
            default:
              return 'bg-white/90 border-slate-200 text-slate-800';
          }
        };

        const getIcon = () => {
          switch (toast.type) {
            case 'success':
              return <CheckCircle2 className="w-5 h-5 text-green-600" />;
            case 'error':
              return <AlertCircle className="w-5 h-5 text-red-600" />;
            case 'warning':
              return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
            case 'loading':
              return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
            case 'info':
            default:
              return <Info className="w-5 h-5 text-blue-600" />;
          }
        };

        const isError = toast.type === 'error';
        return (
          <div
            key={toast.id}
            // Errors announce assertively via role="alert"; normal updates use
            // role="status" (implicit aria-live="polite") so they don't
            // interrupt screen-reader output.
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? undefined : 'polite'}
            onClick={() => removeToast(toast.id)}
            className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl backdrop-blur-xl border pointer-events-auto cursor-pointer animate-in slide-in-from-right duration-300 ${getStyles()}`}
          >
            {getIcon()}
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-sm">{toast.message}</span>
              {toast.action && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.action?.onClick();
                    removeToast(toast.id);
                  }}
                  className="w-fit px-2 py-1 bg-black/5 hover:bg-black/10 rounded-lg text-xxs font-black uppercase tracking-widest transition-colors"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            {/* Explicit dismiss control so SR/keyboard users can close a toast
                before it auto-dismisses (the whole card is also clickable). */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeToast(toast.id);
              }}
              aria-label="Dismiss"
              className="ml-1 p-1 rounded-full hover:bg-black/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

// Skeleton shown in the dock's footprint while the code-split Dock chunk
// resolves (one microtask after first paint). Mirrors the real dock's
// position so its arrival doesn't visually jump. aria-hidden — it's a
// transient visual placeholder with no semantics.
const ShellPlaceholder: React.FC = () => {
  const { dockPosition } = useAuth();
  const isVertical = dockPosition === 'left' || dockPosition === 'right';
  const positionClasses =
    dockPosition === 'left'
      ? 'left-6 top-1/2 -translate-y-1/2'
      : dockPosition === 'right'
        ? 'right-6 top-1/2 -translate-y-1/2'
        : 'bottom-6 left-1/2 -translate-x-1/2';
  return (
    <div
      aria-hidden="true"
      className={`fixed ${positionClasses} z-dock rounded-full bg-white/5 backdrop-blur-sm border border-white/10 pointer-events-none ${
        isVertical ? 'w-16 h-64' : 'h-16 w-80'
      }`}
    />
  );
};

// [data-widget-portal] covers SettingsPanel, which portals outside its widget's .widget subtree — but only SettingsPanel carries data-widget-id, so any other portal falls back to topWidgetId.
// Null when focus is outside every widget — the topmost fallback there let a
// stray Escape/Delete hit whatever bringToFront had most recently raised.
function resolveTargetWidgetId(topWidgetId: string): string | null {
  const widgetAncestor = document.activeElement?.closest<HTMLElement>(
    '.widget, [data-widget-portal]'
  );
  if (!widgetAncestor) return null;
  return widgetAncestor.getAttribute('data-widget-id') ?? topWidgetId;
}

export const DashboardView: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showConfirm } = useDialog();
  const {
    activeDashboard,
    dashboards,
    addWidget,
    updateWidget,
    removeWidget,
    duplicateWidget,
    bringToFront,
    addToast,
    loadDashboard,
    minimizeAllWidgets,
    restoreAllWidgets,
    deleteAllWidgets,
    setSelectedWidgetId,
    updateDashboardSettings,
    zoom,
    setZoom,
    // Pending share ids — read here only to decide whether to mount the
    // lazy DeepLinkShareImporter (which owns the clear*/import machinery).
    pendingQuizShareId,
    pendingAssignmentShareId,
    pendingVideoActivityShareId,
    pendingRubricShareId,
    pendingSharedCollectionId,
    clearPendingSharedCollection,
    // Widget grouping
    groupWidgets,
    groupBuildMode,
    setGroupBuildMode,
    selectedWidgetIds,
    setSelectedWidgetIds,
    annotationActive,
    isActiveBoardReadOnly,
  } = useDashboard();

  // Surface fire-and-forget PLC sync failures as a toast. Helpers
  // (`writePlcAssignment*`, `mirrorPlcAssignmentStatus`) log+swallow so
  // the canonical assignment commit isn't blocked, then dispatch this
  // event — see `utils/plcWriteNotifications.ts`. We coalesce by scope
  // so a burst of failures during one Firestore brownout shows one toast
  // per scope, not one per write.
  const lastPlcToastRef = React.useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<PlcWriteFailureDetail>).detail;
      if (!detail) return;
      const now = Date.now();
      const last = lastPlcToastRef.current.get(detail.scope) ?? 0;
      if (now - last < 10_000) return;
      lastPlcToastRef.current.set(detail.scope, now);
      addToast(
        t('plcDashboard.shareSyncFailed', {
          defaultValue:
            "Couldn't sync to your PLC. Your assignment is saved — retry from the assignment kebab.",
        }),
        'error'
      );
    };
    window.addEventListener(PLC_WRITE_FAILED_EVENT, handler);
    return () => window.removeEventListener(PLC_WRITE_FAILED_EVENT, handler);
  }, [addToast, t]);

  // Latch the deep-link share importer on the first time any pending share id
  // appears, then keep it mounted for the rest of the session. The importer's
  // effects clear the pending id synchronously, so a "mount only while a
  // pending id is set" gate would tear it down mid-import; latching avoids
  // that while still keeping the common (no-import) teacher load free of its
  // 5 Firestore listeners. Adjusting state during render (rather than in an
  // effect) mounts the child in the same pass, with the pending id still set.
  const [mountShareImporter, setMountShareImporter] = React.useState(false);
  if (
    !mountShareImporter &&
    (pendingQuizShareId ||
      pendingAssignmentShareId ||
      pendingVideoActivityShareId ||
      pendingRubricShareId)
  ) {
    setMountShareImporter(true);
  }

  const [panOffset, setPanOffset] = React.useState({ x: 0, y: 0 });

  // Notify DraggableWindow tool-menu positioning without triggering re-renders
  // on every context consumer — panOffset intentionally lives outside context.
  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent('board-pan'));
  }, [panOffset]);

  // Explicit "reset to canonical view" actions (FAB reset button, 100% preset)
  // dispatch this event so we snap pan to center alongside their setZoom(1).
  // Wheel zoom that incidentally crosses through z=1 does NOT fire this — the
  // cursor anchor must be preserved across the zoom = 1 boundary.
  React.useEffect(() => {
    const onCameraReset = () => setPanOffset({ x: 0, y: 0 });
    window.addEventListener('camera-reset', onCameraReset);
    return () => window.removeEventListener('camera-reset', onCameraReset);
  }, []);

  // Coalesce pan deltas into one update per animation frame: pointer events
  // can fire faster than the display refresh rate, and applying every delta
  // synchronously triggers React reconciliation per event. We accumulate the
  // deltas in a ref and flush once per rAF.
  const pendingPanRef = React.useRef({ dx: 0, dy: 0 });
  const panFrameRef = React.useRef<number | null>(null);
  // Mirror zoom on a ref so the rAF flush below uses the *current* zoom when
  // it fires — not whatever zoom was bound when the frame was scheduled.
  // Without this, a wheel-zoom-out mid-drag could clamp against the previous
  // (larger) bound for one frame before the render-body re-clamp catches it.
  const zoomRef = React.useRef(ZOOM_DEFAULT);
  React.useEffect(
    () => () => {
      if (panFrameRef.current !== null) {
        cancelAnimationFrame(panFrameRef.current);
        panFrameRef.current = null;
      }
    },
    []
  );

  // Re-clamp panOffset when the viewport shrinks — without this, an offset
  // that was inside the bound at the previous viewport size would leave the
  // widget surface dragged off-center after a window resize. Render-only
  // clamping doesn't catch this because no React state changes on resize.
  // rAF-throttled to match the resize listener pattern at lines ~414-427.
  React.useEffect(() => {
    let rafId: number | null = null;
    const onResize = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        setPanOffset((prev) => {
          const next = clampPan(
            prev,
            zoomRef.current,
            window.innerWidth,
            window.innerHeight
          );
          return next.x === prev.x && next.y === prev.y ? prev : next;
        });
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);
  const { uploadAndRegisterPdf } = useStorage();

  const [helpState, setHelpState] = React.useState<{
    open: boolean;
    tab: HelpTab;
    widgetType?: WidgetType;
  }>({ open: false, tab: 'shortcuts' });

  // Any surface (widget settings "?", future entry points) can open Help via this event.
  React.useEffect(() => {
    const handleOpenHelp = (e: Event) => {
      const detail = (e as CustomEvent<HelpOpenRequest>).detail ?? {};
      setHelpState({
        open: true,
        tab: detail.tab ?? getLastHelpTab() ?? 'guides',
        widgetType: detail.widgetType,
      });
    };
    window.addEventListener(HELP_OPEN_EVENT, handleOpenHelp);
    return () => window.removeEventListener(HELP_OPEN_EVENT, handleOpenHelp);
  }, []);
  const onboardingShownRef = React.useRef(false);

  // Auto-add onboarding widget for brand-new users on their first empty board.
  // onboardingShownRef guards against duplicate adds within a session;
  // localStorage persists the flag across reloads so the widget is never re-added.
  // Skipped in auth-bypass mode (E2E / local dev) to keep tests deterministic.
  React.useEffect(() => {
    if (!activeDashboard) return;
    if (onboardingShownRef.current) return;
    if (import.meta.env.VITE_AUTH_BYPASS === 'true') return;
    try {
      if (localStorage.getItem('spart_onboarding_shown') === 'true') return;
    } catch {
      // Storage unavailable — treat as not yet shown
    }
    const totalWidgets = dashboards.reduce(
      (sum, d) => sum + d.widgets.length,
      0
    );
    if (totalWidgets === 0) {
      onboardingShownRef.current = true;
      try {
        localStorage.setItem('spart_onboarding_shown', 'true');
      } catch {
        // Non-critical — onboardingShownRef still prevents duplicates this session
      }
      addWidget('onboarding', { x: 60, y: 80, w: 380, h: 440 });
    }
  }, [activeDashboard, dashboards, addWidget]);

  // WIDGET POSITION RESCUE
  // Refs keep values fresh inside stable callbacks without re-registering
  // the resize listener on every widget move/resize (per CLAUDE.md ref pattern).
  //
  // (The legacy "proportional layout scaling" pass — which scaled pixel widget
  // bounds based on the dashboard's saved viewport — was removed when widget
  // bounds were promoted to canonical proportional storage. DashboardContext
  // now hydrates pixel x/y/w/h from xProp/yProp/wProp/hProp on dashboard load
  // and on window resize.)

  const rescueWidgetsRef = React.useRef(activeDashboard?.widgets);
  rescueWidgetsRef.current = activeDashboard?.widgets;
  const updateWidgetRef = React.useRef(updateWidget);
  updateWidgetRef.current = updateWidget;
  const hasOpenModalRef = React.useRef(false);
  hasOpenModalRef.current = useHasOpenModal();

  // Stable callback — reads fresh values via refs, never recreated.
  // Pulls every widget into the world rectangle (the area visible at
  // ZOOM_MIN). Maximized widgets render at viewport size on the fly and
  // shouldn't be repositioned, so they're skipped.
  const rescueWidgets = React.useCallback(() => {
    const widgets = rescueWidgetsRef.current;
    if (!widgets) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    widgets.forEach(({ id, x, y, w, h, maximized }) => {
      if (maximized) return;
      const c = clampWidgetToWorld(x, y, w, h, vw, vh);
      if (c.x !== x || c.y !== y) {
        updateWidgetRef.current(id, { x: c.x, y: c.y });
      }
    });
  }, []); // stable: reads refs, never needs to re-register

  // Run rescue when the active dashboard changes (covers cross-screen load).
  React.useEffect(() => {
    rescueWidgets();
  }, [activeDashboard?.id, rescueWidgets]);

  // Single rAF-throttled resize listener — registered once, never torn down on
  // widget moves because rescueWidgets is stable.
  React.useEffect(() => {
    let rafId: number | null = null;
    const onResize = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rescueWidgets();
        rafId = null;
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, [rescueWidgets]); // rescueWidgets is stable ([] deps), so listener is registered once

  const { canAccessFeature } = useAuth();

  const {
    session,
    students,
    startSession,
    updateSessionConfig,
    updateSessionBackground,
    endSession,
    removeStudent,
    toggleFreezeStudent,
    toggleGlobalFreeze,
  } = useLiveSession(
    user?.uid,
    'teacher',
    undefined,
    canAccessFeature('live-session')
  );

  const [lastDashboardId, setLastDashboardId] = React.useState<
    string | undefined
  >(activeDashboard?.id);
  // Store the previous index in a ref so we can compare it to currentIndex
  // during render to determine animation direction, without causing an extra render.
  const prevIndexRef = React.useRef<number>(-1);
  const [isMinimized, setIsMinimized] = React.useState(false);

  const dashboardRef = React.useRef<HTMLDivElement>(null);
  // Cached per-gesture: did the touch start inside a scrollable widget?
  const touchStartInScrollable = React.useRef(false);
  const suppressCurrentGesture = React.useRef(false);

  // Prevent iOS Safari viewport bounce on the board background.
  // Strategy:
  //  - On touchstart: walk the DOM once (getComputedStyle is expensive) to
  //    determine whether the touch originated inside a scrollable element.
  //    Cache the result so touchmove is O(1).
  //  - On touchmove: prevent the bounce (and let our custom swipe handlers
  //    win) only when the gesture did NOT start inside a scrollable widget.
  //    Applies to single- and multi-touch alike, so two-finger scrolling
  //    inside a widget's own content stays a scroll.
  //  - Guard every preventDefault() with e.cancelable (required by spec when
  //    the listener is already in a non-cancelable scroll sequence).
  React.useEffect(() => {
    const el = dashboardRef.current;
    if (!el) return;

    const hasScrollableAncestor = (target: EventTarget | null): boolean => {
      let node: Node | null = target as Node;
      while (node && node !== el) {
        if (node instanceof HTMLElement) {
          const { overflowY, overflowX } = window.getComputedStyle(node);
          const scrollableY =
            (overflowY === 'auto' || overflowY === 'scroll') &&
            node.scrollHeight > node.clientHeight;
          const scrollableX =
            (overflowX === 'auto' || overflowX === 'scroll') &&
            node.scrollWidth > node.clientWidth;
          if (scrollableY || scrollableX) return true;
        }
        node = (node as HTMLElement).parentElement;
      }
      return false;
    };

    const onTouchStart = (e: TouchEvent) => {
      // Fires once per finger; a later finger landing outside the widget must not erase the first one's scrollable origin.
      touchStartInScrollable.current =
        (e.touches.length > 1 && touchStartInScrollable.current) ||
        hasScrollableAncestor(e.target);
    };

    const onTouchEnd = (e: TouchEvent) => {
      // Clear on the last finger up so the next gesture starts fresh.
      if (e.touches.length === 0) touchStartInScrollable.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!e.cancelable) return;
      if (document.body.classList.contains('is-dragging-widget')) {
        e.preventDefault();
        return;
      }
      // A gesture that started inside a scrollable widget belongs to that
      // widget — let the browser scroll it. This now covers multi-touch too:
      // preventDefault()ing every 2-finger move killed native two-finger
      // scrolling inside a Note or Checklist and handed the gesture to the
      // board handlers below, which minimized the widget instead.
      if (touchStartInScrollable.current) return;
      e.preventDefault();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  // Track the peak touch count across a gesture.  At gesture end (`last`),
  // `touches` has already decremented to 0 as fingers lift, so we cannot
  // rely on it there to distinguish 1-finger from 2-finger gestures.
  const gestureFingerCount = React.useRef(0);

  useGesture(
    {
      onDrag: ({
        first,
        last,
        swipe: [swipeX],
        direction: [dirX],
        delta: [dx, dy],
        movement: [mx, my],
        touches,
        initial: [initialX],
        event,
      }) => {
        // Update peak finger count — touches has already dropped to 0 by the
        // time `last` fires, so we capture the high-water mark here instead.
        if (first) {
          gestureFingerCount.current = touches;
          suppressCurrentGesture.current = false;
        } else if (touches > gestureFingerCount.current) {
          gestureFingerCount.current = touches;
        }

        if (document.body.classList.contains('is-dragging-widget')) {
          suppressCurrentGesture.current = true;
        }

        // Ink must never queue board gestures: suppress whenever the global
        // annotation pen is active, the pointer is a stylus, or the gesture
        // started on a drawing surface (whiteboard/annotation canvases).
        if (
          annotationActive ||
          ('pointerType' in event && event.pointerType === 'pen') ||
          !!(event.target as HTMLElement | null)?.closest?.(
            '[data-inking-surface]'
          )
        ) {
          suppressCurrentGesture.current = true;
        }

        if (suppressCurrentGesture.current) {
          if (last) {
            gestureFingerCount.current = 0;
            suppressCurrentGesture.current = false;
          }
          return;
        }

        const widgetEl = (event.target as HTMLElement).closest<HTMLElement>(
          '.widget'
        );

        if (!last) {
          // 1-finger drag on empty background while zoomed → pan.
          // Disabled when the gesture starts on a widget to avoid interfering
          // with widget interactions.
          if (gestureFingerCount.current === 1 && zoom !== 1 && !widgetEl) {
            // Accumulate the delta and schedule a single flush per animation
            // frame. Window dimensions match the dashboard root (h-screen
            // w-screen) without forcing a synchronous layout read.
            pendingPanRef.current.dx += dx;
            pendingPanRef.current.dy += dy;
            panFrameRef.current ??= requestAnimationFrame(() => {
              panFrameRef.current = null;
              const { dx: pdx, dy: pdy } = pendingPanRef.current;
              pendingPanRef.current = { dx: 0, dy: 0 };
              if (pdx === 0 && pdy === 0) return;
              // Read zoom from the ref so the bound matches the *current*
              // zoom, not whatever was captured when this frame scheduled.
              // clampPan returns range [0, 0] at zoom = 1 (collapsing pan to
              // center) and widens symmetrically as zoom moves either way.
              setPanOffset((prev) =>
                clampPan(
                  { x: prev.x + pdx, y: prev.y + pdy },
                  zoomRef.current,
                  window.innerWidth,
                  window.innerHeight
                )
              );
            });
          }
          return;
        }

        // === Gesture ended — evaluate action ===
        const peakFingers = gestureFingerCount.current;
        gestureFingerCount.current = 0;

        if (peakFingers >= 2) {
          // Use cumulative movement (total displacement from gesture start)
          // for direction detection.  Velocity-based `swipe` values are only
          // non-zero on the last frame, when `touches` is already 0 — making
          // them unreliable for multi-touch swipes.
          const isVertical =
            Math.abs(my) > Math.abs(mx) &&
            Math.abs(my) >= SWIPE_MIN_DISTANCE_PX;

          const isHorizontal =
            Math.abs(mx) > Math.abs(my) &&
            Math.abs(mx) >= SWIPE_MIN_DISTANCE_PX;

          if (isHorizontal) {
            // 2-Finger Swipe LEFT/RIGHT → switch boards (wrap-around)
            if (dashboards.length > 1 && !touchStartInScrollable.current) {
              if (mx < 0) {
                const nextIdx = (currentIndex + 1) % dashboards.length;
                loadDashboard(dashboards[nextIdx].id);
                addToast(dashboards[nextIdx].name, 'info');
              } else {
                const nextIdx =
                  (currentIndex - 1 + dashboards.length) % dashboards.length;
                loadDashboard(dashboards[nextIdx].id);
                addToast(dashboards[nextIdx].name, 'info');
              }
            }
          } else if (isVertical && !touchStartInScrollable.current) {
            if (my > 0) {
              // 2-Finger Swipe DOWN:
              //   - On maximized widget → restore to normal size
              //   - On normal widget → minimize it (SWIPE_MINIMIZE_ENABLED)
              //   - On background → minimize all widgets (same flag)
              if (widgetEl) {
                const id = widgetEl.dataset.widgetId;
                if (id) {
                  const w = activeDashboard?.widgets.find((w) => w.id === id);
                  if (w?.maximized) {
                    updateWidget(id, { maximized: false });
                  } else if (SWIPE_MINIMIZE_ENABLED) {
                    updateWidget(id, { minimized: true, flipped: false });
                  }
                }
              } else if (SWIPE_MINIMIZE_ENABLED) {
                minimizeAllWidgets();
              }
            } else {
              // 2-Finger Swipe UP → maximize (or spotlight if already maximized)
              if (widgetEl) {
                const id = widgetEl.dataset.widgetId;
                if (id) {
                  const w = activeDashboard?.widgets.find((w) => w.id === id);
                  if (w) {
                    if (!w.maximized) {
                      updateWidget(id, { maximized: true });
                    } else {
                      updateDashboardSettings({ spotlightWidgetId: id });
                    }
                  }
                }
              } else {
                restoreAllWidgets();
              }
            }
          }
        } else if (peakFingers === 1) {
          // Single touch (not a mouse drag): left-edge swipe → open sidebar.
          // Gated to peakFingers === 1 so a desktop mouse drag near the left
          // edge (peakFingers = 0) never accidentally opens the sidebar.
          // Restricted to zoom === 1 so the sidebar swipe never collides
          // with the 1-finger pan gesture (which is enabled at zoom !== 1).
          if (widgetEl) return;
          if (
            zoom === 1 &&
            swipeX > 0 &&
            dirX > 0 &&
            initialX < SIDEBAR_EDGE_SWIPE_WIDTH_PX
          ) {
            window.dispatchEvent(new CustomEvent('open-sidebar'));
          }
        }
      },
      onWheel: ({ event }) => {
        // Only intercept Ctrl/Meta + scroll — leave normal scrolling alone.
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        if (event.deltaY === 0) return;
        const WHEEL_ZOOM_STEP = 0.1;
        const next =
          event.deltaY < 0 ? zoom + WHEEL_ZOOM_STEP : zoom - WHEEL_ZOOM_STEP;
        const nextZoom = clampZoom(next);
        // Bail when the zoom hits its cap — no jitter, no spurious pan delta.
        if (nextZoom === zoom) return;
        // Anchor the wrapper-coordinate under the cursor so a corner widget
        // grows under the cursor instead of sliding toward viewport center.
        const nextPan = computeCursorAnchoredPan(
          { x: event.clientX, y: event.clientY },
          zoom,
          panOffset,
          nextZoom,
          window.innerWidth,
          window.innerHeight
        );
        // React batches both setState calls inside this event handler, so
        // zoom + pan flush together — no intermediate frame with a mismatched
        // pair.
        setZoom(nextZoom);
        setPanOffset(nextPan);
      },
    },
    {
      target: dashboardRef,
      eventOptions: { passive: false },
      drag: { swipe: { velocity: 0.5, distance: 50 } },
    }
  );

  const handleDoubleTap = React.useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        /* ignore */
      });
    } else {
      document.exitFullscreen().catch(() => {
        /* ignore */
      });
    }
  }, []);

  // Background YouTube audio control
  const ytIframeRef = React.useRef<HTMLIFrameElement>(null);
  const [isBgMuted, setIsBgMuted] = React.useState(true);

  const toggleBgMute = React.useCallback(() => {
    if (!ytIframeRef.current?.contentWindow) return;
    const newMuted = !isBgMuted;
    setIsBgMuted(newMuted);

    ytIframeRef.current.contentWindow.postMessage(
      JSON.stringify({
        event: 'command',
        func: newMuted ? 'mute' : 'unMute',
        args: [],
      }),
      '*'
    );

    if (!newMuted) {
      ytIframeRef.current.contentWindow.postMessage(
        JSON.stringify({
          event: 'command',
          func: 'setVolume',
          args: [100],
        }),
        '*'
      );
    }
  }, [isBgMuted]);

  const currentIndex = useMemo(() => {
    if (!activeDashboard) return -1;
    return dashboards.findIndex((d) => d.id === activeDashboard.id);
  }, [activeDashboard, dashboards]);

  // Compute animation class by comparing current index with the previous one
  // tracked in our ref. This correctly evaluates the direction during the render
  // where the index changed.
  const animationClass = useMemo(() => {
    const prevIndex = prevIndexRef.current;
    if (prevIndex === -1 || currentIndex === -1 || prevIndex === currentIndex) {
      return 'animate-fade-in';
    }
    return currentIndex > prevIndex
      ? 'animate-slide-left-in'
      : 'animate-slide-right-in';
  }, [currentIndex]);

  // Ensure activeDashboard is always in the list passed to the mount cache.
  // In production dashboards always includes activeDashboard, but tests may
  // set dashboards:[] while supplying an activeDashboard, so we guard here
  // rather than fixing every individual test.
  const mountableDashboards = useMemo(() => {
    if (!activeDashboard) return dashboards;
    const has = dashboards.some((d) => d.id === activeDashboard.id);
    return has ? dashboards : [activeDashboard, ...dashboards];
  }, [dashboards, activeDashboard]);

  // Stable sessions Map for MountedBoardsLayer — memoized so each render
  // doesn't produce a new Map that invalidates useMountedBoardCache's memo.
  //
  // Pinning limitation: useLiveSession() returns the session bound to the
  // currently active board. When the teacher switches away, `session`
  // becomes null and we lose the pin. Fixing this requires lifting session
  // ownership to a board-keyed map at the data layer (deferred).
  const sessions = useMemo<Map<string, LiveSession> | undefined>(() => {
    if (!session?.isActive || !activeDashboard) return undefined;
    return new Map([[activeDashboard.id, session]]);
  }, [session, activeDashboard]);

  // One-time tripwire: log when a session first goes active so the pinning
  // limitation is visible in monitoring. useLiveSession() does not expose a
  // stable hostBoardId across board switches, meaning useMountedBoardCache
  // never receives a pin for a non-active board. Fixing requires lifting
  // session ownership to a board-keyed data layer (deferred).
  const pinningWarnedRef = React.useRef(false);
  if (session?.isActive && !pinningWarnedRef.current) {
    pinningWarnedRef.current = true;
    logError(
      'MountedBoardsLayer.pinningLimitation',
      new Error(
        'Live session pinning is bound to the active board only — non-active boards cannot be pinned until session ownership is lifted to a board-keyed data layer'
      ),
      { activeBoardId: activeDashboard?.id, sessionCode: session.code }
    );
  }
  if (!session?.isActive) {
    pinningWarnedRef.current = false;
  }

  if (activeDashboard?.id !== lastDashboardId) {
    setLastDashboardId(activeDashboard?.id);
    if (isMinimized) {
      setIsMinimized(false);
    }
    if (panOffset.x !== 0 || panOffset.y !== 0) {
      setPanOffset({ x: 0, y: 0 });
    }
  }

  // Keep prevIndexRef in sync AFTER we've computed the animationClass
  // so the next render will have the updated previous value.
  React.useEffect(() => {
    if (currentIndex !== -1) {
      prevIndexRef.current = currentIndex;
    }
  }, [currentIndex]);

  // Mirror the latest zoom on a ref so the rAF-deferred pan flush above
  // sees the current value when it fires (not the value captured when the
  // frame was scheduled).
  zoomRef.current = zoom;

  // Re-clamp panOffset during render when zoom changes. clampPan returns
  // range [0, 0] at zoom = 1 (snap-to-center), and the symmetric range
  // around |zoom − 1| means a zoom-in or zoom-out can shrink the allowed
  // offset and require pulling pan back inside. Use window.innerWidth/
  // innerHeight rather than the dashboard ref's getBoundingClientRect() —
  // the root is h-screen w-screen so the values match, and avoiding a
  // layout read in the render body prevents synchronous reflow.
  const clampedPan = clampPan(
    panOffset,
    zoom,
    window.innerWidth,
    window.innerHeight
  );
  if (clampedPan.x !== panOffset.x || clampedPan.y !== panOffset.y) {
    setPanOffset(clampedPan);
  }

  // Keyboard Navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // A portalled Modal (or anything nested inside one — a confirm/prompt
      // dialog, an in-modal dropdown) owns Escape. Bail before any widget- or
      // group-build handling so the modal's own handler runs unaffected. This
      // must run before the group-build branch below, which would otherwise
      // consume Escape (exiting group-build mode) and swallow it while a modal
      // is open, leaving the modal stuck.
      if (e.key === 'Escape' && hasOpenModalRef.current) return;

      // Escape: Exit group-build mode first (highest priority modal state).
      // Guard: if focus is inside a typing field, let the second Escape branch
      // handle it (blur the field) — don't exit group-build mode unexpectedly.
      if (e.key === 'Escape' && groupBuildMode) {
        if (!isEscapeFromWidgetInput(e) && !isTypingFieldActive()) {
          e.preventDefault();
          setGroupBuildMode(false);
          setSelectedWidgetIds([]);
          return;
        }
      }

      // Escape: Close top-most widget or blur input
      if (e.key === 'Escape') {
        if (isTypingFieldActive()) {
          (document.activeElement as HTMLElement | null)?.blur();
          return;
        }

        // Shift + Escape: Minimize all widgets
        if (e.shiftKey) {
          e.preventDefault();
          // Capture what was actually visible so Undo restores exactly that,
          // rather than also un-minimizing widgets the teacher had put away.
          const wasVisible = (activeDashboard?.widgets ?? [])
            .filter((w) => !w.minimized)
            .map((w) => w.id);
          minimizeAllWidgets();
          if (wasVisible.length > 0) {
            addToast(t('widgetWindow.minimizedAllToast'), 'info', {
              label: t('widgetWindow.undo'),
              onClick: () => {
                for (const id of wasVisible) {
                  updateWidget(id, { minimized: false });
                }
              },
            });
          }
          return;
        }

        if (activeDashboard && activeDashboard.widgets.length > 0) {
          const sorted = [...activeDashboard.widgets].sort((a, b) => b.z - a.z);
          const topWidget = sorted[0];

          const targetId = resolveTargetWidgetId(topWidget.id);

          if (!targetId) return;

          // Always dispatch — even when the target widget's settings panel is
          // already open (SettingsPanel's own document-level handler may have
          // just closed it in this same event). DashboardView can't see
          // DraggableWindow's local `showConfirm` state, so skipping the
          // dispatch here would also swallow Escape for an open delete-confirm
          // dialog on a flipped widget, leaving it stuck. DraggableWindow's
          // handleCustomKeyboard avoids the resulting redundant flip-back
          // write itself, via a ref set synchronously by SettingsPanel's
          // onClose (see justClosedSettingsRef).
          // Dispatch custom event to notify the specific widget
          const event = new CustomEvent('widget-keyboard-action', {
            detail: { widgetId: targetId, key: 'Escape', shiftKey: e.shiftKey },
          });
          window.dispatchEvent(event);
        }
        return;
      }

      // Delete / Backspace: clear board when shift or alt is held; otherwise
      // (Delete only) target the focused/top widget. Backspace mirrors the
      // Alt/Shift clear-board shortcut that previously lived in DraggableWindow
      // (commonly Option+Delete on macOS), but plain Backspace is intentionally
      // ignored to avoid accidental whole-widget deletes.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't intercept when the user is typing in an input, textarea,
        // or contentEditable — let the browser's default deletion behaviour run.
        // This mirrors the Escape key guard above and fixes a bug where pressing
        // Delete inside any text field on the board would be silently swallowed
        // (e.preventDefault() was called before this check was added).
        if (isTypingFieldActive()) return;

        if (e.shiftKey || e.altKey) {
          e.preventDefault();
          const handleClearAll = async () => {
            const confirmed = await showConfirm(
              t('sidebar.confirmClearBoard'),
              {
                title: 'Clear Board',
                variant: 'danger',
                confirmLabel: 'Clear All',
              }
            );
            if (confirmed) deleteAllWidgets();
          };
          void handleClearAll();
          return;
        }

        // Plain Delete targets a single widget; plain Backspace is a no-op.
        if (
          e.key === 'Delete' &&
          activeDashboard &&
          activeDashboard.widgets.length > 0
        ) {
          e.preventDefault();
          const sorted = [...activeDashboard.widgets].sort((a, b) => b.z - a.z);
          const topWidget = sorted[0];

          const targetId = resolveTargetWidgetId(topWidget.id);

          if (targetId) {
            const event = new CustomEvent('widget-keyboard-action', {
              detail: { widgetId: targetId, key: 'Delete', shiftKey: false },
            });
            window.dispatchEvent(event);
          }
        }
        return;
      }

      // Ctrl + /: Open Help Center
      // Guard: don't intercept Ctrl+/ while the user is typing in a form
      // field — Ctrl+/ is a common "comment/uncomment" shortcut in many
      // text editors and widgets that embed rich-text inputs.
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        if (isTypingFieldActive()) return;
        e.preventDefault();
        setHelpState((prev) => ({
          open: !prev.open,
          tab: 'shortcuts',
          widgetType: undefined,
        }));
        return;
      }

      // Alt + P: Pin/Unpin top or focused widget
      if (e.altKey && e.key.toLowerCase() === 'p') {
        // Guard: don't intercept Alt shortcuts while the user is typing in a
        // form field (mirrors the Escape / Delete guards above).
        if (isTypingFieldActive()) return;

        e.preventDefault();
        if (activeDashboard && activeDashboard.widgets.length > 0) {
          const sorted = [...activeDashboard.widgets].sort((a, b) => b.z - a.z);
          const topWidget = sorted[0];

          // Pin has no vanishing-widget hazard, so it keeps the topmost fallback.
          const targetId = resolveTargetWidgetId(topWidget.id) ?? topWidget.id;

          if (targetId) {
            const event = new CustomEvent('widget-keyboard-action', {
              detail: { widgetId: targetId, key: 'Pin', shiftKey: false },
            });
            window.dispatchEvent(event);
          }
        }
        return;
      }

      // Alt + Left/Right: Navigate boards (with wrap-around)
      // Guard: Alt + ArrowLeft/Right is word-navigation in text fields on
      // macOS and many Linux keyboard layouts. Don't intercept it there.
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        if (isTypingFieldActive()) return;

        e.preventDefault();
        if (dashboards.length > 1) {
          const nextIdx =
            e.key === 'ArrowLeft'
              ? (currentIndex - 1 + dashboards.length) % dashboards.length
              : (currentIndex + 1) % dashboards.length;
          loadDashboard(dashboards[nextIdx].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentIndex,
    dashboards,
    loadDashboard,
    activeDashboard,
    minimizeAllWidgets,
    deleteAllWidgets,
    showConfirm,
    t,
    addToast,
    updateWidget,
    groupBuildMode,
    setGroupBuildMode,
    setSelectedWidgetIds,
  ]);

  const handleDragOver = (e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes('application/sticker') ||
      e.dataTransfer.types.includes('application/spart-sticker')
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      return;
    }
    // Allow PDF files dragged from the filesystem
    if (e.dataTransfer.types.includes('Files')) {
      const items = Array.from(e.dataTransfer.items);
      if (items.some((item) => item.type === 'application/pdf')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    // The widget surface renders inside a translate()-then-scale() camera
    // (see the "ZOOMABLE WIDGET SURFACE" transform below), so a raw
    // e.clientX/clientY is a SCREEN point, not the board-space coordinate
    // widgets are positioned in. Without unprojecting through the current
    // zoom/pan, anything dropped while zoomed or panned lands away from the
    // cursor. dropPoint() is the shared conversion for every drop branch below.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dropPoint = (clientX: number, clientY: number) =>
      viewportToWrapper({ x: clientX, y: clientY }, zoom, panOffset, vw, vh);

    // Handle PDF files dragged from the filesystem
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      const pdfFile = files.find((f) => f.type === 'application/pdf');
      if (pdfFile && user) {
        e.preventDefault();
        if (pdfFile.size > MAX_PDF_SIZE_BYTES) {
          addToast(t('toasts.imageTooLarge'), 'error');
          return;
        }
        const w = 600;
        const h = 750;
        const boardPoint = dropPoint(e.clientX, e.clientY);
        const dropX = Math.max(0, boardPoint.x - w / 2);
        const dropY = Math.max(0, boardPoint.y - h / 2);
        addToast(t('sidebar.header.syncingChanges'), 'info');
        void (async () => {
          try {
            const pdfData = await uploadAndRegisterPdf(user.uid, pdfFile);
            addWidget('pdf', {
              x: dropX,
              y: dropY,
              w: 600,
              h: 750,
              config: {
                activePdfId: pdfData.id,
                activePdfUrl: pdfData.storageUrl,
                activePdfName: pdfData.name,
              },
            });
            addToast(
              `"${pdfData.name}" ${t('sidebar.header.allChangesSavedTooltip')}`,
              'success'
            );
          } catch (err) {
            console.error('PDF drop upload failed', err);
            addToast(t('common.error'), 'error');
          }
        })();
        return;
      }
    }

    const stickerData = e.dataTransfer.getData('application/sticker');
    const spartStickerData = e.dataTransfer.getData(
      'application/spart-sticker'
    );

    if (spartStickerData) {
      e.preventDefault();
      try {
        const { icon, color, label, url } = JSON.parse(
          spartStickerData
        ) as SpartStickerDropPayload;
        const w = 150;
        const h = 150;
        const clientX = e.clientX ?? vw / 2;
        const clientY = e.clientY ?? vh / 2;
        const boardPoint = dropPoint(clientX, clientY);

        const x = boardPoint.x - w / 2;
        const y = boardPoint.y - h / 2;

        addWidget('sticker', {
          x,
          y,
          w,
          h,
          config: {
            icon: url ? undefined : icon,
            url,
            color,
            label,
            rotation: 0,
          },
        });
      } catch (err) {
        console.error('Failed to parse spart-sticker data', err);
      }
      return;
    }

    if (stickerData) {
      e.preventDefault();
      try {
        const parsed = JSON.parse(stickerData) as {
          url?: string;
          ratio?: number | null;
        };
        const url = parsed.url;

        if (typeof url !== 'string') {
          throw new Error('Invalid sticker payload: missing url');
        }

        let ratio = parsed.ratio ?? 1;
        if (
          typeof ratio !== 'number' ||
          !Number.isFinite(ratio) ||
          ratio <= 0
        ) {
          ratio = 1;
        }

        const baseSize = 200;
        let w = baseSize;
        let h = baseSize;

        if (ratio > 1) {
          h = baseSize / ratio;
        } else {
          w = baseSize * ratio;
        }

        const clientX = e.clientX ?? vw / 2;
        const clientY = e.clientY ?? vh / 2;
        const boardPoint = dropPoint(clientX, clientY);

        const x = boardPoint.x - w / 2;
        const y = boardPoint.y - h / 2;

        addWidget('sticker', {
          x,
          y,
          w,
          h,
          config: { url, rotation: 0 },
        });
      } catch (err) {
        console.error('Failed to parse sticker data', err);
      }
    }
  };

  const youTubeVideoId = useMemo(
    () =>
      activeDashboard ? extractYouTubeId(activeDashboard.background) : null,
    [activeDashboard]
  );

  // Reset mute state during render when the video changes — no effect needed.
  const [prevYouTubeVideoId, setPrevYouTubeVideoId] =
    React.useState(youTubeVideoId);
  if (youTubeVideoId !== prevYouTubeVideoId) {
    setPrevYouTubeVideoId(youTubeVideoId);
    setIsBgMuted(true);
  }

  const backgroundStyles = useMemo(() => {
    if (!activeDashboard) return {};
    const bg = activeDashboard.background;

    // YouTube backgrounds are rendered via an iframe — skip CSS background
    if (youTubeVideoId) return {};

    // The background lives outside the pan/zoom transform now (see render
    // tree below), so it needs no transform of its own.
    const styles: React.CSSProperties = {};

    // Custom user-created colors/gradients (custom: prefix)
    if (isCustomBackground(bg)) {
      Object.assign(styles, getCustomBackgroundStyle(bg));
      return styles;
    }

    // Check if it's a URL or Base64 image
    if (isExternalBackground(bg)) {
      Object.assign(styles, {
        backgroundImage: `url("${bg}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      });
    }
    return styles;
  }, [activeDashboard, youTubeVideoId]);

  const backgroundClasses = useMemo(() => {
    if (!activeDashboard) return '';
    const bg = activeDashboard.background;
    // URLs, YouTube, and custom backgrounds don't use Tailwind classes
    if (isExternalBackground(bg) || isCustomBackground(bg)) return '';
    return bg;
  }, [activeDashboard]);

  // Derive brand colors before any early return so the useEffect hook below
  // is always called unconditionally (Rules of Hooks).
  const activeGlobalStyle =
    activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const primary =
    activeGlobalStyle.primaryColor ?? DEFAULT_GLOBAL_STYLE.primaryColor;
  const accent =
    activeGlobalStyle.accentColor ?? DEFAULT_GLOBAL_STYLE.accentColor;
  const windowTitle =
    activeGlobalStyle.windowTitleColor ?? DEFAULT_GLOBAL_STYLE.windowTitleColor;

  // Also apply to documentElement so portaled elements (maximized/spotlighted
  // widgets rendered via createPortal outside #dashboard-root) can inherit them.
  useEffect(() => {
    const root = document.documentElement;
    if (primary) root.style.setProperty('--spart-primary', primary);
    if (accent) root.style.setProperty('--spart-accent', accent);
    if (windowTitle)
      root.style.setProperty('--spart-window-title', windowTitle);
    return () => {
      root.style.removeProperty('--spart-primary');
      root.style.removeProperty('--spart-accent');
      root.style.removeProperty('--spart-window-title');
    };
  }, [primary, accent, windowTitle]);

  if (!activeDashboard) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="font-black uppercase tracking-[0.3em] text-xs">
            {t('common.loading')}
          </span>
        </div>
      </div>
    );
  }

  const globalStyle = activeDashboard.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const fontClass = `font-${globalStyle.fontFamily} font-bold`;

  // Inject brand colors as CSS custom properties so widgets/components can
  // reference var(--spart-primary), var(--spart-accent), var(--spart-window-title)
  // without hardcoding the brand-blue/brand-red Tailwind tokens.
  const cssVars: React.CSSProperties = {
    '--spart-primary': primary,
    '--spart-accent': accent,
    '--spart-window-title': windowTitle,
  } as React.CSSProperties;

  return (
    <div
      ref={dashboardRef}
      id="dashboard-root"
      style={cssVars}
      className={`relative h-screen w-screen overflow-hidden transition-all duration-1000 ${fontClass}`}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedWidgetId(null);
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDoubleClick={(e) => {
        // A double-tap while inking (drawing surfaces, or the global pen
        // overlay) must not toggle fullscreen.
        if (
          annotationActive ||
          (e.target as HTMLElement | null)?.closest?.('[data-inking-surface]')
        ) {
          return;
        }
        const nativeEvent = e.nativeEvent;
        if (
          'pointerType' in nativeEvent &&
          (nativeEvent as PointerEvent).pointerType !== 'mouse'
        ) {
          handleDoubleTap();
        }
      }}
    >
      {/* BACKGROUND LAYER: Always covers the viewport at full size, regardless
          of zoom or pan. Decoupling the background from the transform below
          guarantees no white edge ever shows when panning a zoomed board, and
          that color/pattern/image backgrounds still fill the viewport at
          sub-100% zoom. */}
      <div
        className={`absolute inset-0 ${backgroundClasses}`}
        style={backgroundStyles}
      >
        {/* Ambient YouTube Video Layer */}
        {youTubeVideoId && (
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none bg-black">
            <iframe
              ref={ytIframeRef}
              src={`https://www.youtube.com/embed/${youTubeVideoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${youTubeVideoId}&disablekb=1&modestbranding=1&enablejsapi=1`}
              className="absolute top-1/2 left-1/2 w-[100vw] h-[56.25vw] min-h-screen min-w-[177.78vh] -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-80"
              allow="autoplay; encrypted-media"
              title="Ambient background video"
            />
          </div>
        )}

        {/* Background Overlay for Depth */}
        <div className="absolute inset-0 bg-black/10 pointer-events-none" />
      </div>

      {/* ZOOMABLE WIDGET SURFACE: widgets and the annotation canvas get pan/zoom. */}
      <div
        id="dashboard-zoom-surface"
        className="absolute inset-0 transition-transform duration-300 ease-out"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
        }}
      >
        {/* Empty Board Hint */}
        {activeDashboard.widgets.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-10">
            <div className="flex flex-col items-center gap-3 text-center opacity-25">
              <LayoutGrid className="w-12 h-12 text-white" />
              <p className="text-white font-black uppercase tracking-widest text-base">
                {t('widgets.dashboard.emptyBoardHint')}
              </p>
              <p className="text-white/80 text-sm">
                {t('widgets.dashboard.switchBoardsHint')}
              </p>
            </div>
          </div>
        )}

        {/* Dynamic Widget Surface — Board state (timers, drawings) is
            preserved across switches via the LRU mount window in
            MountedBoardsLayer / useMountedBoardCache. */}
        <MountedBoardsLayer
          activeId={activeDashboard?.id ?? null}
          dashboards={mountableDashboards}
          isMinimized={isMinimized}
          animationClass={animationClass}
          sessions={sessions}
          students={students}
          emptyStudents={EMPTY_STUDENTS}
          updateSessionConfig={updateSessionConfig}
          updateSessionBackground={updateSessionBackground}
          startSession={startSession}
          endSession={endSession}
          removeStudent={removeStudent}
          toggleFreezeStudent={toggleFreezeStudent}
          toggleGlobalFreeze={toggleGlobalFreeze}
          updateWidget={updateWidget}
          removeWidget={removeWidget}
          duplicateWidget={duplicateWidget}
          bringToFront={bringToFront}
          addToast={addToast}
          updateDashboardSettings={updateDashboardSettings}
        />
      </div>

      {/* Group-building mode floating action bar */}
      {groupBuildMode &&
        createPortal(
          <>
            {/* Instruction banner */}
            <div className="fixed top-6 left-1/2 -translate-x-1/2 z-toast px-6 py-3 bg-blue-600/90 backdrop-blur-xl text-white rounded-full shadow-2xl font-sans text-sm font-medium pointer-events-none">
              {t('widgetWindow.group.tapToAdd')}
            </div>
            {/* Action bar */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-toast flex items-center gap-3 px-6 py-3 bg-white/90 backdrop-blur-xl rounded-full shadow-2xl border border-white/50">
              <button
                onClick={() => {
                  setGroupBuildMode(false);
                  setSelectedWidgetIds([]);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                disabled={selectedWidgetIds.length < 2}
                onClick={() => {
                  groupWidgets(selectedWidgetIds);
                  setGroupBuildMode(false);
                  setSelectedWidgetIds([]);
                  addToast(t('widgetWindow.group.widgetsGrouped'));
                }}
                className={`px-5 py-2 text-sm font-semibold rounded-full transition-colors ${
                  selectedWidgetIds.length >= 2
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {t('widgetWindow.group.groupCount', {
                  count: selectedWidgetIds.length,
                })}
              </button>
            </div>
          </>,
          document.body
        )}

      {/* FIXED UI: Outside the zoom container. Sidebar + Dock are code-split
          (see the React.lazy declarations near the top of this file) so the
          board canvas paints before their chunks load; they stream in on the
          next microtask behind this Suspense boundary. The fallback reserves
          the dock footprint only when the dock will actually render, so an
          annotation/read-only board (no dock) shows no skeleton.
          The LazyChunkErrorBoundary turns a failed chunk load (e.g. a stale
          hash after a redeploy while the teacher had the tab open) into a
          one-shot auto-reload instead of a white-screened, dock-less
          dashboard. */}
      <LazyChunkErrorBoundary>
        <React.Suspense
          fallback={!isActiveBoardReadOnly ? <ShellPlaceholder /> : null}
        >
          <Sidebar />
          {!isActiveBoardReadOnly && <Dock />}
        </React.Suspense>
      </LazyChunkErrorBoundary>
      <AnnotationOverlay />
      <ToastContainer />
      <AnnouncementOverlay />
      <ShareStatusBanner />
      <ImportShareModePicker />
      {pendingSharedCollectionId && (
        <ImportSharedCollectionModal
          shareId={pendingSharedCollectionId}
          onClose={clearPendingSharedCollection}
          onImported={(result) => {
            // Use firstBoardId returned directly from importSharedCollection
            // rather than searching dashboards — the Firestore snapshot may not
            // have updated yet when this callback fires.
            if (result.firstBoardId) loadDashboard(result.firstBoardId);
          }}
        />
      )}
      <BoardActionsFab
        onOpenHelp={() =>
          setHelpState({
            open: true,
            tab: getLastHelpTab() ?? 'guides',
            widgetType: undefined,
          })
        }
      />

      {/* Deep-link share-import machinery (Quiz / Video-Activity / PLC) —
          mounted lazily only once a pending share id appears, so the common
          teacher load never opens its 5 Firestore listeners. Once mounted it
          stays for the session (imports are rare and clear their id
          synchronously); it renders the import mode-picker modal when needed
          and null otherwise. */}
      {mountShareImporter && (
        <LazyChunkErrorBoundary>
          <React.Suspense fallback={null}>
            <DeepLinkShareImporter />
          </React.Suspense>
        </LazyChunkErrorBoundary>
      )}

      {/* Spotlight Dimming Overlay */}
      {activeDashboard.settings?.spotlightWidgetId &&
        createPortal(
          <div
            className="fixed inset-0 z-backdrop bg-slate-900/80 transition-opacity duration-500 ease-in-out"
            onClick={() => updateDashboardSettings({ spotlightWidgetId: null })}
            aria-hidden="true"
          />,
          document.body
        )}

      {/* Board Navigation FAB cluster (bottom-left) */}
      <BoardNavFab />

      {/* Background YouTube Mute Toggle */}
      {youTubeVideoId && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleBgMute();
          }}
          title={
            isBgMuted
              ? 'Enable background video sound'
              : 'Mute background video'
          }
          className={`fixed left-4 z-dock w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white/60 hover:text-white/90 flex items-center justify-center transition-colors backdrop-blur-sm ${
            dashboards.length > 1 ? 'bottom-16' : 'bottom-6'
          }`}
          aria-label="Toggle background video sound"
        >
          <div className="relative flex items-center justify-center w-full h-full">
            <Music className="w-4 h-4" />
            {isBgMuted && (
              <div className="absolute inset-0 flex items-center justify-center text-red-500 pointer-events-none">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-6 h-6 opacity-80"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
              </div>
            )}
          </div>
        </button>
      )}

      {/* Only mount Help when open — its body builds the whole shortcut tree. */}
      {helpState.open && (
        <HelpCenterModal
          isOpen={helpState.open}
          tab={helpState.tab}
          onTabChange={(tab) => setHelpState((prev) => ({ ...prev, tab }))}
          onClose={() => setHelpState((prev) => ({ ...prev, open: false }))}
        />
      )}
    </div>
  );
};
