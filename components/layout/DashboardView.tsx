import React, { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useGesture } from '@use-gesture/react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { isExternalBackground } from '@/utils/backgrounds';
import { useAuth } from '@/context/useAuth';
import { useLiveSession } from '@/hooks/useLiveSession';
import { useStorage, MAX_PDF_SIZE_BYTES } from '@/hooks/useStorage';
import { Sidebar } from './sidebar/Sidebar';
import { Dock } from './Dock';
import { WidgetRenderer } from '@/components/widgets/WidgetRenderer';
import { AnnouncementOverlay } from '@/components/announcements/AnnouncementOverlay';
import { CheatSheetModal } from '@/components/common/CheatSheetModal';
import { BoardZoomControl } from './BoardZoomControl';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  Loader2,
  HelpCircle,
  LayoutGrid,
  Music,
} from 'lucide-react';
import {
  DEFAULT_GLOBAL_STYLE,
  LiveStudent,
  SpartStickerDropPayload,
} from '@/types';
import { extractYouTubeId } from '@/utils/url';

const EMPTY_STUDENTS: LiveStudent[] = [];

// Gesture constants
const SWIPE_MIN_DISTANCE_PX = 60; // minimum travel to count as a deliberate swipe
const SIDEBAR_EDGE_SWIPE_WIDTH_PX = 40; // left-edge zone that triggers sidebar open

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useDashboard();
  return (
    <div
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

        return (
          <div
            key={toast.id}
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
                  className="w-fit px-2 py-1 bg-black/5 hover:bg-black/10 rounded-lg text-xxs font-black uppercase tracking-widest transition-all"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

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
  } = useDashboard();

  const [panOffset, setPanOffset] = React.useState({ x: 0, y: 0 });

  // Notify DraggableWindow tool-menu positioning without triggering re-renders
  // on every context consumer — panOffset intentionally lives outside context.
  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent('board-pan'));
  }, [panOffset]);
  const { uploadAndRegisterPdf } = useStorage();

  const [isCheatSheetOpen, setIsCheatSheetOpen] = React.useState(false);
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
  const rescueWidgetsRef = React.useRef(activeDashboard?.widgets);
  rescueWidgetsRef.current = activeDashboard?.widgets;
  const updateWidgetRef = React.useRef(updateWidget);
  updateWidgetRef.current = updateWidget;

  // Stable callback — reads fresh values via refs, never recreated.
  const rescueWidgets = React.useCallback(() => {
    const widgets = rescueWidgetsRef.current;
    if (!widgets) return;
    const MIN_VISIBLE = 80;
    const TITLE_BAR = 40;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    widgets.forEach(({ id, x, y, w }) => {
      // Small widgets (w <= MIN_VISIBLE) must be fully on-screen; the general
      // formula would produce a positive lower-bound that incorrectly shifts them.
      let newX: number;
      if (w <= MIN_VISIBLE) {
        const maxX = Math.max(0, vw - w);
        newX = Math.max(0, Math.min(x, maxX));
      } else {
        newX = Math.max(-(w - MIN_VISIBLE), Math.min(x, vw - MIN_VISIBLE));
      }
      const newY = Math.max(0, Math.min(y, vh - TITLE_BAR));
      if (newX !== x || newY !== y) {
        updateWidgetRef.current(id, { x: newX, y: newY });
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

  const [prevIndex, setPrevIndex] = React.useState<number>(-1);
  const [isMinimized, setIsMinimized] = React.useState(false);

  const dashboardRef = React.useRef<HTMLDivElement>(null);
  // Cached per-gesture: did the touch start inside a scrollable widget?
  const touchStartInScrollable = React.useRef(false);

  // Prevent iOS Safari viewport bounce on the board background.
  // Strategy:
  //  - On touchstart: walk the DOM once (getComputedStyle is expensive) to
  //    determine whether the touch originated inside a scrollable element.
  //    Cache the result so touchmove is O(1).
  //  - On touchmove: multi-touch (2-finger gestures) always calls
  //    preventDefault() so our custom zoom/swipe handlers win regardless of
  //    where the fingers landed.  Single-touch only prevents the bounce if
  //    the gesture did NOT start inside a scrollable widget.
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
      touchStartInScrollable.current = hasScrollableAncestor(e.target);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!e.cancelable) return;
      // Multi-touch gestures (2-finger swipe, etc.) must always be
      // intercepted so our custom handlers aren't bypassed by the browser.
      if (e.touches.length > 1) {
        e.preventDefault();
        return;
      }
      // Single touch: allow the browser to handle it (so widget lists can
      // scroll) only if the gesture started inside a scrollable ancestor.
      if (!touchStartInScrollable.current) {
        e.preventDefault();
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
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
        if (first) gestureFingerCount.current = touches;
        else if (touches > gestureFingerCount.current) {
          gestureFingerCount.current = touches;
        }

        const widgetEl = (event.target as HTMLElement).closest<HTMLElement>(
          '.widget'
        );

        if (!last) {
          // 1-finger drag on empty background while zoomed → pan.
          // Disabled when the gesture starts on a widget to avoid interfering
          // with widget interactions.
          if (gestureFingerCount.current === 1 && zoom > 1 && !widgetEl) {
            setPanOffset((prev) => ({
              x: prev.x + dx,
              y: prev.y + dy,
            }));
            window.dispatchEvent(new CustomEvent('board-pan'));
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
          } else if (isVertical) {
            if (my > 0) {
              // 2-Finger Swipe DOWN:
              //   - On maximized widget → restore to normal size
              //   - On normal widget → minimize it
              //   - On background → minimize all widgets
              if (widgetEl) {
                const id = widgetEl.dataset.widgetId;
                if (id) {
                  const w = activeDashboard?.widgets.find((w) => w.id === id);
                  if (w?.maximized) {
                    updateWidget(id, { maximized: false });
                  } else {
                    updateWidget(id, { minimized: true, flipped: false });
                  }
                }
              } else {
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
          // Also disabled while zoomed to avoid conflict with 1-finger pan.
          if (widgetEl) return;
          if (
            zoom <= 1 &&
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
        setZoom(Math.min(5, Math.max(1, next)));
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

  // Compute animation class from prevIndex (which lags one render behind currentIndex).
  // prevIndex is updated in the effect below, after commit, so on the render where
  // currentIndex changes, prevIndex still holds the old value — giving us the direction.
  const animationClass = useMemo(() => {
    if (prevIndex === -1 || currentIndex === -1 || prevIndex === currentIndex) {
      return 'animate-fade-in';
    }
    return currentIndex > prevIndex
      ? 'animate-slide-left-in'
      : 'animate-slide-right-in';
  }, [currentIndex, prevIndex]);

  React.useEffect(() => {
    setIsMinimized(false);
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    if (currentIndex !== -1) {
      setPrevIndex(currentIndex);
    }
  }, [activeDashboard?.id, currentIndex, setZoom]);

  React.useEffect(() => {
    if (zoom === 1) {
      setPanOffset({ x: 0, y: 0 });
    }
  }, [zoom]);

  // Keyboard Navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape: Close top-most widget or blur input
      if (e.key === 'Escape') {
        const activeElement = document.activeElement as HTMLElement;
        const isInput =
          ['INPUT', 'TEXTAREA'].includes(activeElement?.tagName || '') ||
          activeElement?.isContentEditable;

        if (isInput) {
          activeElement.blur();
          return;
        }

        // Shift + Escape: Minimize all widgets
        if (e.shiftKey) {
          e.preventDefault();
          minimizeAllWidgets();
          return;
        }

        if (activeDashboard && activeDashboard.widgets.length > 0) {
          const sorted = [...activeDashboard.widgets].sort((a, b) => b.z - a.z);
          const topWidget = sorted[0];

          // Use the focused element if it's a widget, otherwise target top widget
          const targetId = document.activeElement?.closest('.widget')
            ? (document.activeElement as HTMLElement).getAttribute(
                'data-widget-id'
              )
            : topWidget.id;

          if (!targetId) return;

          // Dispatch custom event to notify the specific widget
          const event = new CustomEvent('widget-keyboard-action', {
            detail: { widgetId: targetId, key: 'Escape', shiftKey: e.shiftKey },
          });
          window.dispatchEvent(event);
        }
        return;
      }

      // Delete: Handle clear board if shift or alt is pressed, otherwise target focused/top widget
      if (e.key === 'Delete') {
        e.preventDefault();

        if (e.shiftKey || e.altKey) {
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
        } else if (activeDashboard && activeDashboard.widgets.length > 0) {
          const sorted = [...activeDashboard.widgets].sort((a, b) => b.z - a.z);
          const topWidget = sorted[0];

          const targetId = document.activeElement?.closest('.widget')
            ? (document.activeElement as HTMLElement).getAttribute(
                'data-widget-id'
              )
            : topWidget.id;

          if (targetId) {
            const event = new CustomEvent('widget-keyboard-action', {
              detail: { widgetId: targetId, key: 'Delete', shiftKey: false },
            });
            window.dispatchEvent(event);
          }
        }
        return;
      }

      // Ctrl + /: Open Cheat Sheet
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setIsCheatSheetOpen((prev) => !prev);
        return;
      }

      // Alt + Left/Right: Navigate boards (with wrap-around)
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        if (dashboards.length > 1) {
          const nextIdx =
            (currentIndex - 1 + dashboards.length) % dashboards.length;
          loadDashboard(dashboards[nextIdx].id);
        }
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        if (dashboards.length > 1) {
          const nextIdx = (currentIndex + 1) % dashboards.length;
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
        const dropX = Math.max(0, e.clientX - w / 2);
        const dropY = Math.max(0, e.clientY - h / 2);
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
        const fallbackClientX =
          typeof window !== 'undefined' ? window.innerWidth / 2 : 0;
        const fallbackClientY =
          typeof window !== 'undefined' ? window.innerHeight / 2 : 0;
        const clientX = e.clientX ?? fallbackClientX;
        const clientY = e.clientY ?? fallbackClientY;

        const x = clientX - w / 2;
        const y = clientY - h / 2;

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

        const fallbackClientX =
          typeof window !== 'undefined' ? window.innerWidth / 2 : 0;
        const fallbackClientY =
          typeof window !== 'undefined' ? window.innerHeight / 2 : 0;
        const clientX = e.clientX ?? fallbackClientX;
        const clientY = e.clientY ?? fallbackClientY;

        const x = clientX - w / 2;
        const y = clientY - h / 2;

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

    const styles: React.CSSProperties = {
      transform: `scale(${zoom})`,
      transformOrigin: 'center center',
    };

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
  }, [activeDashboard, youTubeVideoId, zoom]);

  const backgroundClasses = useMemo(() => {
    if (!activeDashboard) return '';
    const bg = activeDashboard.background;
    // If it's a URL (including YouTube), don't apply the Tailwind class
    if (isExternalBackground(bg)) return '';
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
        const nativeEvent = e.nativeEvent;
        if (
          'pointerType' in nativeEvent &&
          (nativeEvent as PointerEvent).pointerType !== 'mouse'
        ) {
          handleDoubleTap();
        }
      }}
    >
      {/* ZOOMABLE SURFACE: Contains background and widgets */}
      <div
        className={`absolute inset-0 transition-transform duration-300 ease-out ${backgroundClasses}`}
        style={{
          ...backgroundStyles,
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
        }}
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

        {/* Dynamic Widget Surface */}
        <div
          key={activeDashboard.id}
          className={`relative w-full h-full ${animationClass} transition-all duration-500 ease-in-out`}
          style={{
            // Note: transform and opacity transitions here create CSS stacking contexts.
            // Spotlighted widgets escape this by portaling to document.body.
            transform: isMinimized ? 'translateY(80vh)' : undefined,
            transformOrigin: isMinimized ? 'bottom center' : 'center center',
            opacity: isMinimized ? 0 : 1,
            pointerEvents: isMinimized ? 'none' : 'auto',
          }}
        >
          {activeDashboard.widgets.map((widget) => {
            const isLive =
              session?.isActive && session?.activeWidgetId === widget.id;
            return (
              <WidgetRenderer
                key={widget.id}
                widget={widget}
                isStudentView={false}
                sessionCode={session?.code}
                isGlobalFrozen={session?.frozen ?? false}
                isLive={isLive ?? false}
                students={isLive ? students : EMPTY_STUDENTS}
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
                globalStyle={globalStyle}
                dashboardBackground={activeDashboard.background}
                dashboardSettings={activeDashboard.settings}
                updateDashboardSettings={updateDashboardSettings}
              />
            );
          })}
        </div>
      </div>

      {/* FIXED UI: Outside the zoom container */}
      <Sidebar />
      <Dock />
      <ToastContainer />
      <AnnouncementOverlay />
      <BoardZoomControl />

      {/* Spotlight Dimming Overlay */}
      {activeDashboard.settings?.spotlightWidgetId &&
        createPortal(
          <div
            className="fixed inset-0 z-backdrop bg-slate-900/80 transition-all duration-500 ease-in-out"
            onClick={() => updateDashboardSettings({ spotlightWidgetId: null })}
            aria-hidden="true"
          />,
          document.body
        )}

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
          className="fixed bottom-6 left-4 z-dock w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white/60 hover:text-white/90 flex items-center justify-center transition-all backdrop-blur-sm"
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

      {/* Cheat Sheet Help Button */}
      <button
        onClick={() => setIsCheatSheetOpen(true)}
        title={`${t('widgets.cheatSheet.title')} (Ctrl+/)`}
        className="fixed bottom-6 right-4 z-dock w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white/60 hover:text-white/90 flex items-center justify-center transition-all backdrop-blur-sm"
        aria-label={t('widgets.cheatSheet.title')}
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      <CheatSheetModal
        isOpen={isCheatSheetOpen}
        onClose={() => setIsCheatSheetOpen(false)}
      />
    </div>
  );
};
