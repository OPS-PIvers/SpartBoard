import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Z_INDEX } from '@/config/zIndex';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import { isExternalBackground } from '@/utils/backgrounds';
import { useAuth } from '@/context/useAuth';
import { useLiveSession } from '@/hooks/useLiveSession';
import { useStorage, MAX_PDF_SIZE_BYTES } from '@/hooks/useStorage';
import { Sidebar } from './sidebar/Sidebar';
import { Dock } from './Dock';
import { WidgetRenderer } from '@/components/widgets/WidgetRenderer';
import { AnnouncementOverlay } from '@/components/announcements/AnnouncementOverlay';
import { CheatSheetModal } from '@/components/common/CheatSheetModal';
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
    deleteAllWidgets,
    setSelectedWidgetId,
    updateDashboardSettings,
    setZoom,
  } = useDashboard();
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
  const [animationClass, setAnimationClass] =
    React.useState<string>('animate-fade-in');
  const [isMinimized, setIsMinimized] = React.useState(false);

  const dashboardRef = React.useRef<HTMLDivElement>(null);
  // Cached per-gesture: did the touch start inside a scrollable widget?
  const touchStartInScrollable = React.useRef(false);

  // Prevent iOS Safari viewport bounce on the board background.
  // Strategy:
  //  - On touchstart: walk the DOM once (getComputedStyle is expensive) to
  //    determine whether the touch originated inside a scrollable element.
  //    Cache the result so touchmove is O(1).
  //  - On touchmove: multi-touch (pinch / 4-finger gestures) always calls
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
      // Multi-touch gestures (pinch-zoom, 4-finger swipe) must always be
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

  React.useEffect(() => {
    setIsMinimized(false);
    setZoom(1);
  }, [activeDashboard?.id, currentIndex, setZoom]);

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
          if (confirm(t('sidebar.confirmClearBoard'))) {
            deleteAllWidgets();
          }
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

  React.useEffect(() => {
    if (currentIndex !== -1 && prevIndex !== -1 && currentIndex !== prevIndex) {
      if (currentIndex > prevIndex) {
        setAnimationClass('animate-slide-left-in');
      } else {
        setAnimationClass('animate-slide-right-in');
      }
    } else {
      setAnimationClass('animate-fade-in');
    }
    setPrevIndex(currentIndex);
  }, [currentIndex, prevIndex]);

  const youTubeVideoId = useMemo(
    () =>
      activeDashboard ? extractYouTubeId(activeDashboard.background) : null,
    [activeDashboard]
  );

  React.useEffect(() => {
    setIsBgMuted(true);
  }, [youTubeVideoId]);

  const backgroundStyles = useMemo(() => {
    if (!activeDashboard) return {};
    const bg = activeDashboard.background;

    // YouTube backgrounds are rendered via an iframe — skip CSS background
    if (youTubeVideoId) return {};

    // Check if it's a URL or Base64 image
    if (isExternalBackground(bg)) {
      return {
        backgroundImage: `url("${bg}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      };
    }
    return {};
  }, [activeDashboard, youTubeVideoId]);

  const backgroundClasses = useMemo(() => {
    if (!activeDashboard) return '';
    const bg = activeDashboard.background;
    // If it's a URL (including YouTube), don't apply the Tailwind class
    if (isExternalBackground(bg)) return '';
    return bg;
  }, [activeDashboard]);

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

  return (
    <div
      ref={dashboardRef}
      id="dashboard-root"
      className={`relative h-screen w-screen overflow-hidden transition-all duration-1000 ${backgroundClasses} ${fontClass}`}
      style={backgroundStyles}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedWidgetId(null);
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
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

      {/* Background Overlay for Depth (especially for images and videos) */}
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

      {/* Spotlight Dimming Overlay — rendered as a portal at document.body so it
          sits in the root stacking context. The spotlighted widget is also 
          rendered via a portal in DraggableWindow, ensuring it sits above 
          this backdrop regardless of parent stacking contexts (like animations). */}
      {activeDashboard.settings?.spotlightWidgetId &&
        createPortal(
          <div
            className="fixed inset-0 bg-slate-900/80 transition-all duration-500 ease-in-out"
            style={{ zIndex: Z_INDEX.backdrop }}
            onClick={() => updateDashboardSettings({ spotlightWidgetId: null })}
            aria-hidden="true"
          />,
          document.body
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

      <Sidebar />
      <Dock />
      <ToastContainer />
      <AnnouncementOverlay />

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
          className="fixed bottom-6 left-4 z-50 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white/60 hover:text-white/90 flex items-center justify-center transition-all backdrop-blur-sm"
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
        className="fixed bottom-6 right-4 z-50 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white/60 hover:text-white/90 flex items-center justify-center transition-all backdrop-blur-sm"
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
