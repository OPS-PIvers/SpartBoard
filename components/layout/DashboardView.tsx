import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '../../context/useDashboard';
import { useAuth } from '../../context/useAuth';
import { useLiveSession } from '../../hooks/useLiveSession';
import { useStorage, MAX_PDF_SIZE_BYTES } from '../../hooks/useStorage';
import { Sidebar } from './sidebar/Sidebar';
import { Dock } from './Dock';
import { WidgetRenderer } from '../widgets/WidgetRenderer';
import { AnnouncementOverlay } from '@/components/announcements/AnnouncementOverlay';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import {
  DEFAULT_GLOBAL_STYLE,
  LiveStudent,
  SpartStickerDropPayload,
} from '../../types';

const EMPTY_STUDENTS: LiveStudent[] = [];

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useDashboard();
  return (
    <div className="fixed top-6 right-6 z-toast space-y-3 pointer-events-none">
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
  } = useDashboard();
  const { uploadAndRegisterPdf } = useStorage();

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
  } = useLiveSession(user?.uid, 'teacher');

  const [prevIndex, setPrevIndex] = React.useState<number>(-1);
  const [animationClass, setAnimationClass] =
    React.useState<string>('animate-fade-in');
  const [isMinimized, setIsMinimized] = React.useState(false);
  const [zoom, setZoom] = React.useState(1);
  const [zoomOrigin, setZoomOrigin] = React.useState({ x: 50, y: 50 });

  // Gesture Tracking
  const gestureStart = React.useRef<{ x: number; y: number } | null>(null);
  const gestureCurrent = React.useRef<{ x: number; y: number } | null>(null);
  const isFourFingerGesture = React.useRef(false);
  const initialPinchDistance = React.useRef<number | null>(null);
  const initialZoom = React.useRef<number>(1);
  const MIN_SWIPE_DISTANCE_PX = 100;

  const currentIndex = useMemo(() => {
    if (!activeDashboard) return -1;
    return dashboards.findIndex((d) => d.id === activeDashboard.id);
  }, [activeDashboard, dashboards]);

  React.useEffect(() => {
    setIsMinimized(false);
    setZoom(1);
  }, [activeDashboard?.id, currentIndex]);

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

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 4) {
      isFourFingerGesture.current = true;
      gestureStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      gestureCurrent.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    } else if (e.touches.length === 2) {
      // Pinch tracking
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(
        touch1.clientX - touch2.clientX,
        touch1.clientY - touch2.clientY
      );
      initialPinchDistance.current = dist;
      initialZoom.current = zoom;

      // Set zoom origin to midpoint of the two fingers
      const midX = (touch1.clientX + touch2.clientX) / 2;
      const midY = (touch1.clientY + touch2.clientY) / 2;
      const percentX = (midX / window.innerWidth) * 100;
      const percentY = (midY / window.innerHeight) * 100;
      setZoomOrigin({ x: percentX, y: percentY });
    } else {
      isFourFingerGesture.current = false;
      gestureStart.current = null;
      gestureCurrent.current = null;
      initialPinchDistance.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isFourFingerGesture.current && gestureStart.current) {
      if (e.touches.length !== 4) {
        isFourFingerGesture.current = false;
        gestureStart.current = null;
        gestureCurrent.current = null;
        return;
      }

      e.preventDefault();
      gestureCurrent.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    } else if (
      e.touches.length === 2 &&
      initialPinchDistance.current !== null
    ) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(
        touch1.clientX - touch2.clientX,
        touch1.clientY - touch2.clientY
      );

      const ratio = dist / initialPinchDistance.current;
      const newZoom = Math.min(Math.max(0.5, initialZoom.current * ratio), 3);
      setZoom(newZoom);
    }
  };

  const handleTouchEnd = () => {
    if (
      isFourFingerGesture.current &&
      gestureStart.current &&
      gestureCurrent.current
    ) {
      const deltaX = gestureCurrent.current.x - gestureStart.current.x;
      const deltaY = gestureCurrent.current.y - gestureStart.current.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Determine dominant direction
      if (absY > absX && absY > MIN_SWIPE_DISTANCE_PX) {
        // Vertical Swipe
        if (deltaY > 0) {
          // Swipe Down -> Minimize All to Dock
          minimizeAllWidgets();
        } else {
          // Swipe Up -> Restore
          setIsMinimized(false);
        }
      } else if (absX > absY && absX > MIN_SWIPE_DISTANCE_PX) {
        // Horizontal Swipe (with wrapping)
        if (deltaX < 0) {
          // Swipe Left -> Next Board
          if (dashboards.length > 1) {
            const nextIdx = (currentIndex + 1) % dashboards.length;
            loadDashboard(dashboards[nextIdx].id);
          }
        } else {
          // Swipe Right -> Prev Board
          if (dashboards.length > 1) {
            const nextIdx =
              (currentIndex - 1 + dashboards.length) % dashboards.length;
            loadDashboard(dashboards[nextIdx].id);
          }
        }
      }

      // Reset
      isFourFingerGesture.current = false;
      gestureStart.current = null;
      gestureCurrent.current = null;
    }
    initialPinchDistance.current = null;
  };

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
        const x = e.clientX - w / 2;
        const y = e.clientY - h / 2;

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const parsed = JSON.parse(stickerData);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const url = parsed.url as string;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const ratio = (parsed.ratio as number) || 1;

        const baseSize = 200;
        let w = baseSize;
        let h = baseSize;

        if (ratio > 1) {
          h = baseSize / ratio;
        } else {
          w = baseSize * ratio;
        }

        const x = e.clientX - w / 2;
        const y = e.clientY - h / 2;

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

  const backgroundStyles = useMemo(() => {
    if (!activeDashboard) return {};
    const bg = activeDashboard.background;

    // Check if it's a URL or Base64 image
    if (bg.startsWith('http') || bg.startsWith('data:')) {
      return {
        backgroundImage: `url("${bg}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      };
    }
    return {};
  }, [activeDashboard]);

  const backgroundClasses = useMemo(() => {
    if (!activeDashboard) return '';
    const bg = activeDashboard.background;
    // If it's a URL, don't apply the class
    if (bg.startsWith('http') || bg.startsWith('data:')) return '';
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
      id="dashboard-root"
      className={`relative h-screen w-screen overflow-hidden transition-all duration-1000 ${backgroundClasses} ${fontClass}`}
      style={backgroundStyles}
      onClick={(e) => e.stopPropagation()}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background Overlay for Depth (especially for images) */}
      <div className="absolute inset-0 bg-black/10 pointer-events-none" />

      {/* Dynamic Widget Surface */}
      <div
        key={activeDashboard.id}
        className={`relative w-full h-full ${animationClass} transition-all duration-500 ease-in-out`}
        style={{
          transform: isMinimized
            ? `translateY(80vh) scale(${zoom})`
            : `scale(${zoom})`,
          transformOrigin: isMinimized
            ? 'bottom center'
            : `${zoomOrigin.x}% ${zoomOrigin.y}%`,
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
            />
          );
        })}
      </div>

      <Sidebar />
      <Dock />
      <ToastContainer />
      <AnnouncementOverlay />
    </div>
  );
};
