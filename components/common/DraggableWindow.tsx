import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  X,
  Settings,
  Minus,
  Pencil,
  Camera,
  Maximize,
  Minimize2,
  ChevronRight,
  Copy,
  Eraser,
  Undo2,
  Trash2,
  Highlighter,
} from 'lucide-react';
import { WidgetData, WidgetType, GlobalStyle, Path } from '../../types';
import { useScreenshot } from '../../hooks/useScreenshot';
import { useDashboard } from '../../context/useDashboard';
import { GlassCard } from './GlassCard';
import { SettingsPanel } from './SettingsPanel';
import { useClickOutside } from '../../hooks/useClickOutside';
import { AnnotationCanvas } from './AnnotationCanvas';
import { IconButton } from '@/components/common/IconButton';
import { WIDGET_PALETTE } from '../../config/colors';
import { Z_INDEX } from '../../config/zIndex';

// Widgets that cannot be snapshotted due to CORS/Technical limitations
const SCREENSHOT_BLACKLIST: WidgetType[] = ['webcam', 'embed'];

// Widgets that require real-time position updates for inter-widget functionality
const POSITION_AWARE_WIDGETS: WidgetType[] = [
  'catalyst',
  'catalyst-instruction',
  'catalyst-visual',
];

const INTERACTIVE_ELEMENTS_SELECTOR =
  'button, input, textarea, select, canvas, iframe, label, a, summary, [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], .cursor-pointer, [contenteditable="true"]';

const SCROLLABLE_ELEMENTS_SELECTOR =
  '.overflow-y-auto, .overflow-auto, .overflow-x-auto, [data-scrollable="true"], [style*="overflow:auto"], [style*="overflow: auto"], [style*="overflow-y:auto"], [style*="overflow-y: auto"], [style*="overflow-x:auto"], [style*="overflow-x: auto"]';

const DRAG_BLOCKING_SELECTOR = `${INTERACTIVE_ELEMENTS_SELECTOR}, .resize-handle, [draggable="true"], [data-no-drag="true"]`;

const TOUCH_GESTURE_BLOCKING_SELECTOR = `${DRAG_BLOCKING_SELECTOR}, ${SCROLLABLE_ELEMENTS_SELECTOR}`;

const MIN_GESTURE_SWIPE_DISTANCE = 100;

interface DraggableWindowProps {
  widget: WidgetData;
  children: React.ReactNode;
  settings: React.ReactNode;
  title: string;
  style?: React.CSSProperties; // Added style prop
  skipCloseConfirmation?: boolean;
  headerActions?: React.ReactNode;
  globalStyle: GlobalStyle;
}

const ResizeHandleIcon = ({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <path d="M8 2L2 8" stroke="currentColor" strokeLinecap="round" />
    <path d="M8 5.5L5.5 8" stroke="currentColor" strokeLinecap="round" />
    <path d="M8 9L9 8" stroke="currentColor" strokeLinecap="round" />
  </svg>
);

interface KeyboardActionDetail {
  widgetId: string;
  key: string;
  shiftKey: boolean;
}

export const DraggableWindow: React.FC<DraggableWindowProps> = ({
  widget,
  children,
  settings,
  title,
  style,
  skipCloseConfirmation = false,
  headerActions,
  globalStyle,
}) => {
  const { t } = useTranslation();
  const {
    updateWidget,
    removeWidget,
    duplicateWidget,
    bringToFront,
    addToast,
    resetWidgetSize,
    deleteAllWidgets,
  } = useDashboard();

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(widget.customTitle ?? title);
  const [shouldRenderSettings, setShouldRenderSettings] = useState(
    widget.flipped
  );

  // OPTIMIZATION: Transient drag state for direct DOM manipulation
  // This allows us to update the DOM directly during drag/resize without triggering React re-renders for the whole tree
  const dragState = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // OPTIMIZATION: Lazy initialization of settings
  // We only set this to true once the widget is opened for the first time.
  // This prevents downloading and rendering the settings chunk for every widget on load.
  useEffect(() => {
    if (widget.flipped && !shouldRenderSettings) {
      setShouldRenderSettings(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.flipped]);

  // Annotation state
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotationColor, setAnnotationColor] = useState(
    widget.annotation?.color ?? WIDGET_PALETTE[0]
  );
  const [annotationWidth, _setAnnotationWidth] = useState(
    widget.annotation?.width ?? 4
  );

  const windowRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dragDistanceRef = useRef(0);

  // Gesture tracking for multi-touch actions
  const gestureStartRef = useRef<{
    startY: number;
    currentY: number;
    touches: number;
  } | null>(null);

  useClickOutside(menuRef, () => setShowTools(false), [windowRef]);

  // Ref specifically for the inner content we want to capture
  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-generate filename: "Classroom-[WidgetType]-[Date]"
  // Use ISO format YYYY-MM-DD
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `Classroom-${widget.type.charAt(0).toUpperCase() + widget.type.slice(1)}-${dateStr}`;

  const handleScreenshotSuccess = useCallback(() => {
    addToast(t('widgetWindow.screenshotSaved'), 'success');
  }, [addToast, t]);

  const handleScreenshotError = useCallback(
    (err: unknown) => {
      console.error('Screenshot error:', err);
      addToast(t('widgetWindow.screenshotFailed'), 'error');
    },
    [addToast, t]
  );

  const { takeScreenshot, isFlashing, isCapturing } = useScreenshot(
    contentRef,
    fileName,
    {
      onSuccess: handleScreenshotSuccess,
      onError: handleScreenshotError,
    }
  );

  const isMaximized = widget.maximized ?? false;
  const canScreenshot = !SCREENSHOT_BLACKLIST.includes(widget.type);

  const handlePointerDown = (e: React.PointerEvent) => {
    bringToFront(widget.id);
    // Explicitly focus the widget so it can receive keyboard events
    (e.currentTarget as HTMLElement).focus();
  };

  const handleMaximizeToggle = useCallback(() => {
    const newMaximized = !isMaximized;
    updateWidget(widget.id, { maximized: newMaximized, flipped: false });
    if (newMaximized) {
      bringToFront(widget.id);
    }
  }, [isMaximized, widget.id, updateWidget, bringToFront]);

  const saveTitle = () => {
    if (tempTitle.trim()) {
      updateWidget(widget.id, { customTitle: tempTitle.trim() });
    } else {
      // If empty, revert to default (remove custom title)
      updateWidget(widget.id, { customTitle: null });
      setTempTitle(title);
    }
    setIsEditingTitle(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Stop propagation if we're in an input to prevent global shortcuts
    const target = e.target as HTMLElement;
    const isInput =
      ['INPUT', 'TEXTAREA'].includes(target?.tagName || '') ||
      target?.isContentEditable;

    if (isInput) {
      if (e.key === 'Escape') {
        target.blur();
        e.stopPropagation();
      }
      return;
    }

    // Keyboard Shortcuts for Focused Widget
    if (e.key === 'Escape' && !e.shiftKey && !e.altKey && !e.ctrlKey) {
      // NEW BEHAVIOR: Esc minimizes the widget (unless in sub-state like confirm or settings)
      e.preventDefault();
      e.stopPropagation();
      if (showConfirm) {
        setShowConfirm(false);
      } else if (widget.flipped) {
        updateWidget(widget.id, { flipped: false });
      } else if (isAnnotating) {
        setIsAnnotating(false);
      } else {
        updateWidget(widget.id, { minimized: true, flipped: false });
      }
      return;
    }

    if (e.key === 'Delete' && !e.shiftKey && !e.altKey && !e.ctrlKey) {
      // NEW BEHAVIOR: Delete removes the widget
      e.preventDefault();
      e.stopPropagation();
      if (skipCloseConfirmation) {
        removeWidget(widget.id);
      } else {
        setShowConfirm(true);
        setShowTools(false);
      }
      return;
    }

    // Alt + Delete: Clear all widgets
    if (e.key === 'Delete' && e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      if (confirm(t('widgetWindow.clearEntireBoard'))) {
        deleteAllWidgets();
      }
      return;
    }

    // ALT Shortcuts
    if (e.altKey) {
      switch (e.key.toLowerCase()) {
        case 's': // Settings
          e.preventDefault();
          updateWidget(widget.id, { flipped: !widget.flipped });
          setShowTools(false);
          break;
        case 'd': // Draw tool
          e.preventDefault();
          setIsAnnotating((prev) => !prev);
          setShowTools(false);
          break;
        case 'm': // Maximize/Restore
          e.preventDefault();
          handleMaximizeToggle();
          break;
        case 'r': // Reset size
          e.preventDefault();
          resetWidgetSize(widget.id);
          break;
      }
    }
  };

  const handleDragStart = (e: React.PointerEvent) => {
    if (isMaximized) return;

    // Don't drag if clicking interactive elements or resize handle
    const target = e.target as HTMLElement;
    const isInteractive = target.closest(DRAG_BLOCKING_SELECTOR);
    if (isInteractive) return;

    // Don't drag if annotating
    if (isAnnotating) return;

    // Close settings panel on drag start to prevent position desync
    // (panel position is based on widget.x/y which don't update during DOM-level drag)
    if (widget.flipped) {
      updateWidget(widget.id, { flipped: false });
    }

    // Prevent default browser behavior (like scroll or selection)
    e.preventDefault();

    setIsDragging(true);
    // Initialize transient state
    dragState.current = { x: widget.x, y: widget.y, w: widget.w, h: widget.h };

    document.body.classList.add('is-dragging-widget');
    const startX = e.clientX - widget.x;
    const startY = e.clientY - widget.y;
    const initialMouseX = e.clientX;
    const initialMouseY = e.clientY;

    // Use pointer capture to ensure we get events even if pointer leaves the element
    const targetElement = e.currentTarget as HTMLElement;
    try {
      targetElement.setPointerCapture(e.pointerId);
    } catch (_err) {
      console.warn('Failed to set pointer capture:', _err);
    }

    const onPointerMove = (moveEvent: PointerEvent) => {
      // Only process the same pointer that started the drag
      if (moveEvent.pointerId !== e.pointerId) return;

      dragDistanceRef.current = Math.sqrt(
        Math.pow(moveEvent.clientX - initialMouseX, 2) +
          Math.pow(moveEvent.clientY - initialMouseY, 2)
      );

      const newX = moveEvent.clientX - startX;
      const newY = moveEvent.clientY - startY;

      // OPTIMIZATION: If widget is not position-aware, update DOM directly and skip React render cycle
      if (!POSITION_AWARE_WIDGETS.includes(widget.type) && windowRef.current) {
        windowRef.current.style.left = `${newX}px`;
        windowRef.current.style.top = `${newY}px`;
        if (dragState.current) {
          dragState.current.x = newX;
          dragState.current.y = newY;
        }
      } else {
        updateWidget(widget.id, {
          x: newX,
          y: newY,
        });
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== e.pointerId) return;

      setIsDragging(false);
      document.body.classList.remove('is-dragging-widget');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      try {
        if (targetElement.hasPointerCapture(e.pointerId)) {
          targetElement.releasePointerCapture(e.pointerId);
        }
      } catch (_err) {
        // Ignore capture release errors
      }

      // Commit final position if using direct DOM manipulation
      if (
        !POSITION_AWARE_WIDGETS.includes(widget.type) &&
        dragState.current &&
        (dragState.current.x !== widget.x || dragState.current.y !== widget.y)
      ) {
        updateWidget(widget.id, {
          x: dragState.current.x,
          y: dragState.current.y,
        });
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const handleResizeStart = (e: React.PointerEvent, direction: string) => {
    if (isMaximized) return;
    e.stopPropagation();
    e.preventDefault();

    // Close settings panel on resize start to prevent position desync
    if (widget.flipped) {
      updateWidget(widget.id, { flipped: false });
    }

    setIsResizing(true);
    // Initialize transient state
    dragState.current = { x: widget.x, y: widget.y, w: widget.w, h: widget.h };

    document.body.classList.add('is-dragging-widget');
    const startW = widget.w;
    const startH = widget.h;
    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = widget.x;
    const startPosY = widget.y;

    const targetElement = e.currentTarget as HTMLElement;
    try {
      targetElement.setPointerCapture(e.pointerId);
    } catch (_err) {
      console.warn('Failed to set pointer capture:', _err);
    }

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== e.pointerId) return;

      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      let newW = startW;
      let newH = startH;
      let newX = startPosX;
      let newY = startPosY;

      if (direction.includes('e')) {
        newW = Math.max(150, startW + dx);
      }
      if (direction.includes('w')) {
        const potentialW = startW - dx;
        if (potentialW >= 150) {
          newW = potentialW;
          newX = startPosX + dx;
        }
      }
      if (direction.includes('s')) {
        newH = Math.max(100, startH + dy);
      }
      if (direction.includes('n')) {
        const potentialH = startH - dy;
        if (potentialH >= 100) {
          newH = potentialH;
          newY = startPosY + dy;
        }
      }

      // OPTIMIZATION: If widget is not position-aware, update DOM directly and skip React render cycle
      if (!POSITION_AWARE_WIDGETS.includes(widget.type) && windowRef.current) {
        windowRef.current.style.width = `${newW}px`;
        windowRef.current.style.height = `${newH}px`;
        windowRef.current.style.left = `${newX}px`;
        windowRef.current.style.top = `${newY}px`;
        if (dragState.current) {
          dragState.current.w = newW;
          dragState.current.h = newH;
          dragState.current.x = newX;
          dragState.current.y = newY;
        }
      } else {
        updateWidget(widget.id, {
          w: newW,
          h: newH,
          x: newX,
          y: newY,
        });
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== e.pointerId) return;

      setIsResizing(false);
      document.body.classList.remove('is-dragging-widget');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      try {
        if (targetElement.hasPointerCapture(e.pointerId)) {
          targetElement.releasePointerCapture(e.pointerId);
        }
      } catch (_err) {
        // Ignore capture release errors
      }

      // Commit final position/size if using direct DOM manipulation
      if (
        !POSITION_AWARE_WIDGETS.includes(widget.type) &&
        dragState.current &&
        (dragState.current.w !== widget.w ||
          dragState.current.h !== widget.h ||
          dragState.current.x !== widget.x ||
          dragState.current.y !== widget.y)
      ) {
        updateWidget(widget.id, {
          w: dragState.current.w,
          h: dragState.current.h,
          x: dragState.current.x,
          y: dragState.current.y,
        });
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const transparency = widget.transparency ?? globalStyle.windowTransparency;
  const isSelected =
    !isMaximized && (showTools || isDragging || isResizing || widget.flipped);

  const handleWidgetClick = (e: React.MouseEvent) => {
    // Avoid triggering when clicking interactive elements
    const target = e.target as HTMLElement;
    const isInteractive = target.closest(INTERACTIVE_ELEMENTS_SELECTOR);
    if (isInteractive) return;

    // Only toggle tools if it wasn't a drag (less than 15px movement)
    if (!isEditingTitle && dragDistanceRef.current < 15) {
      setShowTools(!showTools);
    }
    dragDistanceRef.current = 0;
  };

  // TOOL MENU POSITIONING
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (showTools && windowRef.current) {
      const updatePosition = () => {
        const rect = windowRef.current?.getBoundingClientRect();
        if (!rect) return;

        if (isMaximized) {
          setMenuStyle({
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: Z_INDEX.toolMenu,
          });
          return;
        }

        const spaceAbove = rect.top;
        const menuHeight = 56; // approximate height including spacing
        const shouldShowBelow = spaceAbove < menuHeight + 20;

        setMenuStyle({
          position: 'fixed',
          top: shouldShowBelow ? rect.bottom + 12 : rect.top - 56,
          left: rect.left + rect.width / 2,
          transform: 'translateX(-50%)',
          zIndex: Z_INDEX.toolMenu,
        });
      };

      updatePosition();
      // Update on scroll or resize just in case, though widgets are absolute
      window.addEventListener('resize', updatePosition);
      return () => window.removeEventListener('resize', updatePosition);
    }
    return undefined;
  }, [showTools, widget.x, widget.y, widget.w, widget.h, isMaximized]);

  useEffect(() => {
    const handleCustomKeyboard = (e: Event) => {
      const { widgetId, key, shiftKey } = (
        e as CustomEvent<KeyboardActionDetail>
      ).detail;
      if (widgetId !== widget.id || shiftKey) return;

      if (key === 'Escape') {
        if (showConfirm) {
          setShowConfirm(false);
        } else if (widget.flipped) {
          updateWidget(widget.id, { flipped: false });
        } else if (isAnnotating) {
          setIsAnnotating(false);
        } else {
          updateWidget(widget.id, { minimized: true, flipped: false });
        }
      } else if (key === 'Delete') {
        if (skipCloseConfirmation) {
          removeWidget(widget.id);
        } else {
          setShowConfirm(true);
          setShowTools(false);
        }
      }
    };

    window.addEventListener('widget-keyboard-action', handleCustomKeyboard);
    return () =>
      window.removeEventListener(
        'widget-keyboard-action',
        handleCustomKeyboard
      );
  }, [
    widget.id,
    widget.flipped,
    showConfirm,
    isAnnotating,
    skipCloseConfirmation,
    removeWidget,
    updateWidget,
  ]);

  // --- MULTI-TOUCH GESTURE HANDLERS ---
  const handleTouchStart = (e: React.TouchEvent) => {
    // Scroll protection: Don't start gesture if touching scrollable/interactive element
    if ((e.target as HTMLElement).closest(TOUCH_GESTURE_BLOCKING_SELECTOR)) {
      return;
    }

    // Check computed style for scrollable elements (fallback for non-inline styles)
    const target = e.target as HTMLElement;
    const computedStyle = window.getComputedStyle(target);
    const isScrollable =
      ['auto', 'scroll'].includes(computedStyle.overflowY) ||
      ['auto', 'scroll'].includes(computedStyle.overflow);

    if (isScrollable && target.scrollHeight > target.clientHeight) {
      return;
    }

    if (e.touches.length < 2) return;

    // Prevent default to avoid conflicts with pointer events (drag) and native scroll/zoom
    // This ensures we have exclusive control for the gesture
    e.preventDefault();

    // Calculate average Y position of all touches
    let totalY = 0;
    for (let i = 0; i < e.touches.length; i++) {
      totalY += e.touches[i].clientY;
    }
    const avgY = totalY / e.touches.length;

    gestureStartRef.current = {
      startY: avgY,
      currentY: avgY,
      touches: e.touches.length,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!gestureStartRef.current) return;

    // Validate touch count consistency
    if (e.touches.length !== gestureStartRef.current.touches) {
      gestureStartRef.current = null;
      return;
    }

    // Prevent default to maintain exclusive control
    if (e.cancelable) {
      e.preventDefault();
    }

    // Update current Y (average of all touches)
    let totalY = 0;
    for (let i = 0; i < e.touches.length; i++) {
      totalY += e.touches[i].clientY;
    }
    const avgY = totalY / e.touches.length;

    gestureStartRef.current.currentY = avgY;
  };

  const handleTouchEnd = (_e: React.TouchEvent) => {
    if (!gestureStartRef.current) return;

    // Use stored currentY which was updated in touchMove
    const { startY, currentY, touches } = gestureStartRef.current;

    // Reset immediately to avoid double triggers
    gestureStartRef.current = null;

    const deltaY = currentY - startY;

    if (Math.abs(deltaY) < MIN_GESTURE_SWIPE_DISTANCE) return;

    if (touches === 2 && deltaY > 0) {
      // 2-Finger Swipe Down: Minimize
      updateWidget(widget.id, { minimized: true, flipped: false });
      setShowTools(false);
    } else if (touches === 3) {
      if (deltaY > 0 && canScreenshot && !isCapturing) {
        // 3-Finger Swipe Down: Screenshot
        void takeScreenshot();
        setShowTools(false);
      } else if (deltaY < 0) {
        // 3-Finger Swipe Up: Annotate
        setIsAnnotating((prev) => !prev);
        setShowTools(false);
      }
    }
  };
  // ------------------------------------

  // Fallback to widget state if not dragging/resizing or if position-aware
  const shouldUseDragState =
    (isDragging || isResizing) &&
    !POSITION_AWARE_WIDGETS.includes(widget.type) &&
    dragState.current;

  const content = (
    <GlassCard
      globalStyle={globalStyle}
      ref={windowRef}
      tabIndex={0}
      data-widget-id={widget.id}
      onPointerDown={handlePointerDown}
      onClick={handleWidgetClick}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      transparency={transparency}
      allowInvisible={true}
      selected={isSelected}
      cornerRadius={isMaximized ? 'none' : undefined}
      className={`absolute select-none widget group will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 ${
        isMaximized ? 'border-none !shadow-none' : ''
      } `}
      style={{
        left: isMaximized
          ? 0
          : shouldUseDragState && dragState.current
            ? dragState.current.x
            : widget.x,
        top: isMaximized
          ? 0
          : shouldUseDragState && dragState.current
            ? dragState.current.y
            : widget.y,
        width: isMaximized
          ? '100vw'
          : shouldUseDragState && dragState.current
            ? dragState.current.w
            : widget.w,
        height: isMaximized
          ? '100vh'
          : shouldUseDragState && dragState.current
            ? dragState.current.h
            : widget.h,
        zIndex: isMaximized ? Z_INDEX.maximized : widget.z,
        display: 'flex',
        flexDirection: 'column',
        containerType: 'size',
        opacity: widget.minimized ? 0 : 1,
        pointerEvents: widget.minimized ? 'none' : 'auto',
        touchAction: 'none', // Critical for preventing scroll interference
        ...style, // Merge custom styles
      }}
    >
      {/* Widget Content (always visible) */}
      <div
        data-testid="drag-surface"
        className="h-full w-full flex flex-col rounded-[inherit] overflow-hidden"
        onPointerDown={handleDragStart}
        style={{ touchAction: 'none' }}
      >
        {showConfirm && (
          <div
            className="absolute inset-0 z-confirm-overlay bg-slate-900/95 flex flex-col items-center justify-center p-4 text-center animate-in fade-in duration-200 backdrop-blur-sm rounded-[inherit]"
            role="alertdialog"
            aria-labelledby={`dialog-title-${widget.id}`}
            aria-describedby={`dialog-desc-${widget.id}`}
          >
            <p
              id={`dialog-title-${widget.id}`}
              className="text-white font-semibold mb-4 text-sm"
            >
              {t('widgetWindow.closeWidget')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowConfirm(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-700 text-white text-xs font-bold hover:bg-slate-600 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeWidget(widget.id);
                }}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors"
              >
                {t('widgetWindow.close')}
              </button>
            </div>
          </div>
        )}

        <div ref={contentRef} className="flex-1 overflow-hidden relative p-0">
          {/* Flash Overlay */}
          {isFlashing && (
            <div
              data-screenshot="flash"
              className="absolute inset-0 bg-white z-50 animate-out fade-out duration-300 pointer-events-none isFlashing"
            />
          )}
          {children}

          {isAnnotating && (
            <>
              <AnnotationCanvas
                className="absolute inset-0 z-40 pointer-events-auto"
                paths={widget.annotation?.paths ?? []}
                color={annotationColor}
                width={annotationWidth}
                canvasWidth={isMaximized ? window.innerWidth : widget.w}
                canvasHeight={isMaximized ? window.innerHeight : widget.h}
                onPathsChange={(newPaths: Path[]) => {
                  updateWidget(widget.id, {
                    annotation: {
                      mode: 'window',
                      paths: newPaths,
                      color: annotationColor,
                      width: annotationWidth,
                    },
                  });
                }}
              />
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 p-1 bg-white/90 backdrop-blur shadow-lg rounded-full border border-slate-200 animate-in slide-in-from-bottom-2 fade-in duration-200">
                <div className="flex items-center gap-1 px-1">
                  {WIDGET_PALETTE.slice(0, 5).map((c) => (
                    <button
                      key={c}
                      onClick={(e) => {
                        e.stopPropagation();
                        setAnnotationColor(c);
                      }}
                      className={`w-5 h-5 rounded-full border border-slate-100 transition-transform ${annotationColor === c ? 'scale-125 ring-2 ring-slate-400 z-10' : 'hover:scale-110'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="w-px h-4 bg-slate-300 mx-1" />
                <IconButton
                  onClick={(e) => {
                    e.stopPropagation();
                    setAnnotationColor('eraser');
                  }}
                  icon={<Eraser className="w-3.5 h-3.5" />}
                  label={t('widgetWindow.eraser')}
                  size="sm"
                  variant="ghost"
                  active={annotationColor === 'eraser'}
                />
                <IconButton
                  onClick={(e) => {
                    e.stopPropagation();
                    const paths = widget.annotation?.paths ?? [];
                    if (paths.length > 0) {
                      updateWidget(widget.id, {
                        annotation: {
                          ...widget.annotation,
                          mode: 'window',
                          paths: paths.slice(0, -1),
                        },
                      });
                    }
                  }}
                  icon={<Undo2 className="w-3.5 h-3.5" />}
                  label={t('widgetWindow.undo')}
                  size="sm"
                  variant="ghost"
                />
                <IconButton
                  onClick={(e) => {
                    e.stopPropagation();
                    updateWidget(widget.id, {
                      annotation: {
                        mode: 'window',
                        paths: [],
                        color: annotationColor,
                        width: annotationWidth,
                      },
                    });
                  }}
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                  label={t('widgetWindow.clearAll')}
                  size="sm"
                  variant="danger"
                />
                <div className="w-px h-4 bg-slate-300 mx-1" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAnnotating(false);
                  }}
                  className="px-2 py-0.5 text-xxs font-bold bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors"
                >
                  {t('widgetWindow.done')}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Resize Handles (Corners Only) */}
        <div
          onPointerDown={(e) => handleResizeStart(e, 'nw')}
          className="resize-handle absolute top-0 left-0 w-6 h-6 cursor-nw-resize z-widget-resize touch-none"
        />
        <div
          onPointerDown={(e) => handleResizeStart(e, 'ne')}
          className="resize-handle absolute top-0 right-0 w-6 h-6 cursor-ne-resize z-widget-resize touch-none"
        />
        <div
          onPointerDown={(e) => handleResizeStart(e, 'sw')}
          className="resize-handle absolute bottom-0 left-0 w-6 h-6 cursor-sw-resize z-widget-resize touch-none"
        />
        <div
          onPointerDown={(e) => handleResizeStart(e, 'se')}
          className="resize-handle absolute bottom-0 right-0 w-6 h-6 cursor-se-resize flex items-end justify-end p-1.5 z-widget-resize touch-none"
        >
          <ResizeHandleIcon
            className="text-slate-400"
            style={{ opacity: isSelected ? 1 : transparency }}
          />
        </div>
      </div>
    </GlassCard>
  );

  return (
    <>
      {isMaximized && typeof document !== 'undefined'
        ? createPortal(content, document.body)
        : content}

      {/* TOOL MENU PORTAL */}
      {showTools &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            data-settings-exclude
            style={menuStyle}
            className={`flex items-center gap-1.5 p-1.5 bg-white/40 backdrop-blur-xl rounded-full border border-white/50 shadow-2xl font-${globalStyle.fontFamily}`}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center min-w-0 px-2">
              {isEditingTitle ? (
                <input
                  autoFocus
                  type="text"
                  value={tempTitle}
                  onChange={(e) => setTempTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveTitle();
                    if (e.key === 'Escape') {
                      setTempTitle(widget.customTitle ?? title);
                      setIsEditingTitle(false);
                    }
                    e.stopPropagation();
                  }}
                  className="text-xxs font-bold text-slate-800 bg-white/50 border border-white/50 rounded-full px-3 py-1 outline-none w-32 shadow-sm"
                />
              ) : (
                <div className="flex items-center gap-1">
                  <div
                    className="flex items-center gap-2 group/title cursor-text px-2"
                    onClick={() => {
                      setTempTitle(widget.customTitle ?? title);
                      setIsEditingTitle(true);
                    }}
                  >
                    <span className="text-xxs font-bold text-slate-700 uppercase tracking-wider truncate max-w-[100px]">
                      {widget.customTitle ?? title}
                    </span>
                    <Pencil className="w-2.5 h-2.5 text-slate-400 opacity-0 group-hover/title:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex items-center -mr-1">
                    <IconButton
                      onClick={() => {
                        updateWidget(widget.id, {
                          flipped: !widget.flipped,
                        });
                        setShowTools(false);
                      }}
                      icon={<Settings className="w-3.5 h-3.5" />}
                      label={
                        widget.flipped
                          ? t('widgetWindow.closeSettings')
                          : t('widgetWindow.settings')
                      }
                      size="sm"
                      variant="glass"
                      active={widget.flipped}
                      className={
                        widget.flipped
                          ? '!bg-indigo-100/60 !text-indigo-600'
                          : ''
                      }
                    />
                    <IconButton
                      onClick={() => {
                        if (skipCloseConfirmation) {
                          removeWidget(widget.id);
                        } else {
                          setShowConfirm(true);
                          setShowTools(false);
                        }
                      }}
                      icon={<X className="w-3.5 h-3.5" />}
                      label={t('widgetWindow.close')}
                      size="sm"
                      variant="danger"
                      className="hover:!bg-red-500/20"
                    />
                    <IconButton
                      onClick={() => setIsToolbarExpanded(!isToolbarExpanded)}
                      icon={<ChevronRight className="w-3.5 h-3.5" />}
                      label={
                        isToolbarExpanded
                          ? t('widgetWindow.collapseToolbar')
                          : t('widgetWindow.expandToolbar')
                      }
                      size="sm"
                      variant="glass"
                      className={isToolbarExpanded ? 'rotate-180' : ''}
                    />
                  </div>
                </div>
              )}
            </div>

            <div
              className={`flex items-center gap-1 overflow-hidden transition-all duration-300 ease-in-out ${
                isToolbarExpanded
                  ? 'max-w-[500px] opacity-100 ml-0'
                  : 'max-w-0 opacity-0 ml-0'
              }`}
            >
              <div className="h-4 w-px bg-slate-300/50" />

              <div className="flex items-center gap-1">
                {headerActions && (
                  <div className="flex items-center text-slate-700">
                    {headerActions}
                  </div>
                )}
                {canScreenshot && (
                  <IconButton
                    onClick={() => void takeScreenshot()}
                    disabled={isCapturing}
                    icon={<Camera className="w-3.5 h-3.5" />}
                    label={t('widgetWindow.takeScreenshot')}
                    size="sm"
                    variant="glass"
                  />
                )}
                <IconButton
                  onClick={() => {
                    setIsAnnotating(!isAnnotating);
                    setShowTools(false);
                  }}
                  icon={<Highlighter className="w-3.5 h-3.5" />}
                  label={t('widgetWindow.annotate')}
                  size="sm"
                  variant="glass"
                  active={isAnnotating}
                  className={
                    isAnnotating ? '!bg-indigo-50 !text-indigo-600' : ''
                  }
                />
                <IconButton
                  onClick={() => duplicateWidget(widget.id)}
                  icon={<Copy className="w-3.5 h-3.5" />}
                  label={t('widgetWindow.duplicate')}
                  size="sm"
                  variant="glass"
                />
                <IconButton
                  onClick={handleMaximizeToggle}
                  icon={
                    isMaximized ? (
                      <Minimize2 className="w-3.5 h-3.5" />
                    ) : (
                      <Maximize className="w-3.5 h-3.5" />
                    )
                  }
                  label={
                    isMaximized
                      ? t('widgetWindow.restore')
                      : t('widgetWindow.maximize')
                  }
                  size="sm"
                  variant="glass"
                />
                <IconButton
                  onClick={() =>
                    updateWidget(widget.id, {
                      minimized: true,
                      flipped: false,
                    })
                  }
                  icon={<Minus className="w-3.5 h-3.5" />}
                  label={t('widgetWindow.minimize')}
                  size="sm"
                  variant="glass"
                />
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* SETTINGS PANEL PORTAL */}
      {widget.flipped && typeof document !== 'undefined' && (
        <SettingsPanel
          widget={widget}
          widgetRef={windowRef}
          settings={settings}
          shouldRenderSettings={shouldRenderSettings}
          onClose={() => updateWidget(widget.id, { flipped: false })}
          updateWidget={updateWidget}
          globalStyle={globalStyle}
          title={title}
        />
      )}
    </>
  );
};
