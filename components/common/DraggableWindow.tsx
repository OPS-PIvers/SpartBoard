import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
} from 'react';
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
  Copy,
  Eraser,
  Undo2,
  Trash2,
  Highlighter,
  LayoutTemplate,
  LayoutGrid,
  Lock,
  Pin,
} from 'lucide-react';
import {
  WidgetData,
  WidgetType,
  GlobalStyle,
  Path,
  DashboardSettings,
} from '@/types';
import { SNAP_LAYOUTS, SnapZone } from '@/config/snapLayouts';
import { calculateSnapBounds, SNAP_LAYOUT_CONSTANTS } from '@/utils/layoutMath';
import { useScreenshot } from '@/hooks/useScreenshot';
import { useDashboard } from '@/context/useDashboard';
import { GlassCard } from './GlassCard';
import { SettingsPanel } from './SettingsPanel';
import { useClickOutside } from '@/hooks/useClickOutside';
import { AnnotationCanvas } from './AnnotationCanvas';
import { IconButton } from '@/components/common/IconButton';
import { WIDGET_PALETTE } from '@/config/colors';
import { Z_INDEX } from '@/config/zIndex';
import { useDialog } from '@/context/useDialog';

// Widgets that cannot be snapshotted due to CORS/Technical limitations
const SCREENSHOT_BLACKLIST: WidgetType[] = ['webcam', 'embed'];

// Custom size picker grid dimensions
const GRID_COLS = 8;
const GRID_ROWS = 6;

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

// const MIN_GESTURE_SWIPE_DISTANCE = 100;
const DRAG_CLICK_THRESHOLD_PX = 25;
const INVISIBLE_EDGE_PAD = 20; // px of invisible grab zone extending outside widget bounds
const INNER_EDGE_PAD = 16; // px of invisible drag zone inside widget bounds
const INNER_EDGE_CORNER_INSET = 24; // px inset at corners to avoid resize handle overlap

interface DraggableWindowProps {
  widget: WidgetData;
  children: React.ReactNode;
  settings: React.ReactNode;
  appearanceSettings?: React.ReactNode;
  title: string;
  style?: React.CSSProperties; // Added style prop
  isSpotlighted?: boolean; // Added isSpotlighted prop
  updateDashboardSettings?: (updates: Partial<DashboardSettings>) => void;
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
  appearanceSettings,
  title,
  style,
  isSpotlighted = false,
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
    selectedWidgetId,
    setSelectedWidgetId,
    zoom,
  } = useDashboard();
  const { showConfirm: showConfirmDialog } = useDialog();

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const showTools = selectedWidgetId === widget.id;
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(widget.customTitle ?? title);
  const [shouldRenderSettings, setShouldRenderSettings] = useState(
    widget.flipped
  );

  const [showSnapMenu, setShowSnapMenu] = useState(false);
  const [snapPreviewZone, setSnapPreviewZone] = useState<
    SnapZone | 'maximize' | 'minimize' | null
  >(null);
  const snapPreviewZoneRef = useRef<SnapZone | 'maximize' | 'minimize' | null>(
    null
  );
  const [customGrid, setCustomGrid] = useState<{
    start: { col: number; row: number } | null;
    end: { col: number; row: number } | null;
    selecting: boolean;
  }>({ start: null, end: null, selecting: false });
  const customGridRef = useRef(customGrid);
  customGridRef.current = customGrid;

  // Pre-cached zones for edge detection optimization
  const splitLayout = useMemo(
    () => SNAP_LAYOUTS.find((l) => l.id === 'split-half'),
    []
  );
  const leftHalfZone = useMemo(
    () => splitLayout?.zones.find((z) => z.id === 'left-half') ?? null,
    [splitLayout]
  );
  const rightHalfZone = useMemo(
    () => splitLayout?.zones.find((z) => z.id === 'right-half') ?? null,
    [splitLayout]
  );

  // Four Grid zones for corner snapping
  const gridLayout = useMemo(
    () => SNAP_LAYOUTS.find((l) => l.id === 'grid-2x2'),
    []
  );
  const topLeftZone = useMemo(
    () => gridLayout?.zones.find((z) => z.id === 'top-left') ?? null,
    [gridLayout]
  );
  const topRightZone = useMemo(
    () => gridLayout?.zones.find((z) => z.id === 'top-right') ?? null,
    [gridLayout]
  );
  const bottomLeftZone = useMemo(
    () => gridLayout?.zones.find((z) => z.id === 'bottom-left') ?? null,
    [gridLayout]
  );
  const bottomRightZone = useMemo(
    () => gridLayout?.zones.find((z) => z.id === 'bottom-right') ?? null,
    [gridLayout]
  );

  // Top half zone
  const verticalSplitLayout = useMemo(
    () => SNAP_LAYOUTS.find((l) => l.id === 'split-vertical'),
    []
  );
  const topHalfZone = useMemo(
    () => verticalSplitLayout?.zones.find((z) => z.id === 'top') ?? null,
    [verticalSplitLayout]
  );

  // Adjusting state while rendering: close snap menu when the tool overlay is dismissed
  if (!showTools && showSnapMenu) {
    setShowSnapMenu(false);
    setSnapPreviewZone(null);
    snapPreviewZoneRef.current = null;
  }

  // OPTIMIZATION: Transient drag state for direct DOM manipulation
  // This allows us to update the DOM directly during drag/resize without triggering React re-renders for the whole tree
  const dragState = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // OPTIMIZATION: Lazy initialization of settings
  // Latch to true once the widget is flipped for the first time so the settings
  // chunk is never unmounted after being loaded (prevents re-mount cost).
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
  const snapMenuRef = useRef<HTMLDivElement>(null);
  const snapButtonRef = useRef<HTMLButtonElement>(null);
  const dragDistanceRef = useRef(0);

  const saveTitle = useCallback(() => {
    if (tempTitle.trim()) {
      updateWidget(widget.id, { customTitle: tempTitle.trim() });
    } else {
      // If empty, revert to default (remove custom title)
      updateWidget(widget.id, { customTitle: null });
      setTempTitle(title);
    }
    setIsEditingTitle(false);
  }, [tempTitle, title, widget.id, updateWidget]);

  const stateRef = useRef({ isEditingTitle, saveTitle });
  stateRef.current = { isEditingTitle, saveTitle };

  const handleCloseTools = useCallback(() => {
    setSelectedWidgetId(null);
    const { isEditingTitle, saveTitle } = stateRef.current;
    if (isEditingTitle) {
      saveTitle();
    }
  }, [setSelectedWidgetId]);

  useClickOutside(menuRef, handleCloseTools, [windowRef, snapMenuRef]);
  useClickOutside(snapMenuRef, () => setShowSnapMenu(false));

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
  const isLocked = widget.isLocked ?? false;
  const isPinned = widget.isPinned ?? false;
  const canScreenshot = !SCREENSHOT_BLACKLIST.includes(widget.type);

  const handlePointerDown = (e: React.PointerEvent) => {
    // DO NOT stop propagation here, otherwise DashboardView misses 2-finger swipes
    bringToFront(widget.id);
    // Explicitly focus the widget so it can receive keyboard events
    (e.currentTarget as HTMLElement).focus();
  };

  const handleMaximizeToggle = useCallback(() => {
    if (isLocked) return;
    const newMaximized = !isMaximized;
    if (isPinned && newMaximized) return;
    updateWidget(widget.id, { maximized: newMaximized, flipped: false });
    if (newMaximized) {
      bringToFront(widget.id);
    }
  }, [isLocked, isPinned, isMaximized, widget.id, updateWidget, bringToFront]);

  const handleSnapToZone = useCallback(
    (zone: SnapZone) => {
      if (isLocked || isPinned) return;
      const { x, y, w, h } = calculateSnapBounds(zone);

      updateWidget(widget.id, {
        x,
        y,
        w,
        h,
        maximized: false, // Ensure we break out of maximize state
        minimized: false,
      });

      setShowSnapMenu(false);
      handleCloseTools();
    },
    [isLocked, isPinned, widget.id, updateWidget, handleCloseTools]
  );

  const getCellFromPointer = (
    e: React.PointerEvent,
    el: HTMLElement
  ): { col: number; row: number } => {
    const rect = el.getBoundingClientRect();
    const col = Math.max(
      0,
      Math.min(
        GRID_COLS - 1,
        Math.floor(((e.clientX - rect.left) / rect.width) * GRID_COLS)
      )
    );
    const row = Math.max(
      0,
      Math.min(
        GRID_ROWS - 1,
        Math.floor(((e.clientY - rect.top) / rect.height) * GRID_ROWS)
      )
    );
    return { col, row };
  };

  const handleCustomGridApply = useCallback(
    (
      start: { col: number; row: number },
      end: { col: number; row: number }
    ) => {
      const c0 = Math.min(start.col, end.col);
      const c1 = Math.max(start.col, end.col);
      const r0 = Math.min(start.row, end.row);
      const r1 = Math.max(start.row, end.row);
      const zone: SnapZone = {
        id: 'custom',
        x: c0 / GRID_COLS,
        y: r0 / GRID_ROWS,
        w: (c1 - c0 + 1) / GRID_COLS,
        h: (r1 - r0 + 1) / GRID_ROWS,
      };
      handleSnapToZone(zone);
      setCustomGrid({ start: null, end: null, selecting: false });
    },
    [handleSnapToZone]
  );

  const handleKeyDown = async (e: React.KeyboardEvent) => {
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
      // NEW BEHAVIOR: Delete removes the widget (blocked for locked widgets)
      if (isLocked) return;
      e.preventDefault();
      e.stopPropagation();
      if (skipCloseConfirmation) {
        removeWidget(widget.id);
      } else {
        setShowConfirm(true);
        handleCloseTools();
      }
      return;
    }

    // Alt + Delete or Alt + Backspace: Clear all widgets
    if ((e.key === 'Delete' || e.key === 'Backspace') && e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      const confirmed = await showConfirmDialog(
        t('widgetWindow.clearEntireBoard'),
        {
          title: t('widgetWindow.clearBoardTitle'),
          variant: 'danger',
          confirmLabel: t('widgetWindow.clearAll'),
        }
      );
      if (confirmed) deleteAllWidgets();
      return;
    }

    // ALT Shortcuts
    if (e.altKey) {
      switch (e.key.toLowerCase()) {
        case 's': // Settings
          e.preventDefault();
          updateWidget(widget.id, { flipped: !widget.flipped });
          handleCloseTools();
          break;
        case 'd': // Draw tool
          e.preventDefault();
          setIsAnnotating((prev) => !prev);
          handleCloseTools();
          break;
        case 'm': // Maximize/Restore
          e.preventDefault();
          handleMaximizeToggle();
          break;
        case 'r': // Reset size
          if (isLocked || isPinned) break;
          e.preventDefault();
          resetWidgetSize(widget.id);
          break;
        case 'p': // Pin/Unpin position
          if (isLocked) break;
          e.preventDefault();
          if (!isPinned) setShowSnapMenu(false);
          updateWidget(widget.id, { isPinned: !isPinned });
          handleCloseTools();
          break;
      }
    }
  };

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleDragStart = (e: React.PointerEvent) => {
    if (isMaximized) return;
    if (isLocked || isPinned) return;

    // Don't drag if clicking interactive elements or resize handle
    const target = e.target as HTMLElement;
    const isInteractive = target.closest(DRAG_BLOCKING_SELECTOR);
    if (isInteractive) return;

    // Don't drag if annotating
    if (isAnnotating) return;

    // Don't start a drag on a non-primary touch/pen pointer — if isPrimary is
    // false another touch is already active, meaning this is a multi-touch gesture.
    if ((e.pointerType === 'touch' || e.pointerType === 'pen') && !e.isPrimary)
      return;

    clearLongPressTimer();
    if (twoFingerLongPressTimer.current) {
      clearTimeout(twoFingerLongPressTimer.current);
      twoFingerLongPressTimer.current = null;
    }

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
    dragDistanceRef.current = 0;

    document.body.classList.add('is-dragging-widget');
    const initialMouseX = e.clientX;
    const initialMouseY = e.clientY;

    // Use pointer capture to ensure we get events even if pointer leaves the element
    const targetElement = e.currentTarget as HTMLElement;
    try {
      targetElement.setPointerCapture(e.pointerId);
    } catch (_err) {
      console.warn('Failed to set pointer capture:', _err);
    }

    let dragAnimationFrame: number | null = null;

    const onPointerMove = (moveEvent: PointerEvent) => {
      // Only process the same pointer that started the drag
      if (moveEvent.pointerId !== e.pointerId) return;

      if (dragAnimationFrame !== null) {
        cancelAnimationFrame(dragAnimationFrame);
      }

      dragAnimationFrame = requestAnimationFrame(() => {
        // If a second touch arrived mid-drag, freeze the widget and clear snap
        // preview — wait for pointerup to commit/clean up normally.
        if (activeTouchCount.current > 1) {
          setSnapPreviewZone(null);
          snapPreviewZoneRef.current = null;
          return;
        }

        dragDistanceRef.current = Math.sqrt(
          Math.pow(moveEvent.clientX - initialMouseX, 2) +
            Math.pow(moveEvent.clientY - initialMouseY, 2)
        );

        // Edge Detection Threshold for Large Touch Panels
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const threshold = SNAP_LAYOUT_CONSTANTS.EDGE_THRESHOLD;

        const isLeftEdge = moveEvent.clientX <= threshold;
        const isRightEdge = moveEvent.clientX >= screenW - threshold;
        const isTopEdge = moveEvent.clientY <= threshold;
        const isBottomEdge = moveEvent.clientY >= screenH - threshold;

        let newZone: SnapZone | 'maximize' | 'minimize' | null = null;

        if (isLeftEdge && isTopEdge) {
          newZone = topLeftZone;
        } else if (isRightEdge && isTopEdge) {
          newZone = topRightZone;
        } else if (isLeftEdge && isBottomEdge) {
          newZone = bottomLeftZone;
        } else if (isRightEdge && isBottomEdge) {
          newZone = bottomRightZone;
        } else if (isLeftEdge) {
          newZone = leftHalfZone;
        } else if (isRightEdge) {
          newZone = rightHalfZone;
        } else if (isTopEdge) {
          newZone = topHalfZone;
        } else if (isBottomEdge) {
          newZone = 'minimize';
        }

        if (snapPreviewZoneRef.current !== newZone) {
          snapPreviewZoneRef.current = newZone;
          setSnapPreviewZone(newZone);
        }

        // Calculate movements relative to initial position, scaled by current zoom
        const deltaX = (moveEvent.clientX - initialMouseX) / zoom;
        const deltaY = (moveEvent.clientY - initialMouseY) / zoom;

        const newX = widget.x + deltaX;
        const newY = widget.y + deltaY;

        // OPTIMIZATION: If widget is not position-aware, update DOM directly and skip React render cycle
        if (
          !POSITION_AWARE_WIDGETS.includes(widget.type) &&
          windowRef.current
        ) {
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
      });
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== e.pointerId) return;

      if (dragAnimationFrame !== null) {
        cancelAnimationFrame(dragAnimationFrame);
      }

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

      const finalSnapZone = snapPreviewZoneRef.current;
      if (finalSnapZone) {
        if (finalSnapZone === 'maximize') {
          handleMaximizeToggle();
        } else if (finalSnapZone === 'minimize') {
          updateWidget(widget.id, { minimized: true, flipped: false });
          handleCloseTools();
        } else {
          handleSnapToZone(finalSnapZone);
        }
        setSnapPreviewZone(null);
        snapPreviewZoneRef.current = null;
      } else {
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
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const handleResizeStart = (e: React.PointerEvent, direction: string) => {
    if (isMaximized) return;
    if (isLocked || isPinned) return;
    e.stopPropagation();
    e.preventDefault();

    clearLongPressTimer();
    if (twoFingerLongPressTimer.current) {
      clearTimeout(twoFingerLongPressTimer.current);
      twoFingerLongPressTimer.current = null;
    }

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

    let resizeAnimationFrame: number | null = null;

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== e.pointerId) return;

      if (resizeAnimationFrame !== null) {
        cancelAnimationFrame(resizeAnimationFrame);
      }

      resizeAnimationFrame = requestAnimationFrame(() => {
        const dx = (moveEvent.clientX - startX) / zoom;
        const dy = (moveEvent.clientY - startY) / zoom;

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
        if (
          !POSITION_AWARE_WIDGETS.includes(widget.type) &&
          windowRef.current
        ) {
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
      });
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== e.pointerId) return;

      if (resizeAnimationFrame !== null) {
        cancelAnimationFrame(resizeAnimationFrame);
      }

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

  // Force 100% opacity when spotlighted so it stands out against the dimming overlay
  // This prevents the "dimmed text" issue reported by users.
  const transparency = isSpotlighted
    ? 1
    : (widget.transparency ?? globalStyle.windowTransparency);
  const isSelected =
    !isMaximized && (showTools || isDragging || isResizing || widget.flipped);

  const handleWidgetClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Avoid triggering when clicking interactive elements
    const target = e.target as HTMLElement;
    const isInteractive = target.closest(INTERACTIVE_ELEMENTS_SELECTOR);
    if (isInteractive) return;

    // Only toggle tools if it wasn't a drag (less than the threshold movement)
    if (!isEditingTitle && dragDistanceRef.current < DRAG_CLICK_THRESHOLD_PX) {
      if (showTools) {
        handleCloseTools();
      } else {
        setSelectedWidgetId(widget.id);
      }
    }
    dragDistanceRef.current = 0;
  };

  // TOOL MENU POSITIONING
  // useLayoutEffect runs synchronously after the DOM is mutated but before paint,
  // guaranteeing offsetHeight/offsetWidth are final when we read them.
  // position:fixed is required from the start so that offsetWidth is measured
  // as shrink-to-fit content width. Without it the element is position:static
  // inside document.body and offsetWidth equals the full viewport width, which
  // makes the centering formula produce a wildly negative idealLeft value that
  // gets clamped to the left margin on every first/re-selection.
  const [snapMenuStyle, setSnapMenuStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    visibility: 'hidden',
  });

  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    visibility: 'hidden',
  });

  // Stable ref to the latest updatePosition fn — lets the board-pan listener
  // always call the current version without being in its dependency array.
  const updatePositionRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    if (showTools && windowRef.current) {
      const updatePosition = () => {
        const rect = windowRef.current?.getBoundingClientRect();
        const menuEl = menuRef.current;
        if (!rect || !menuEl) return;

        if (isMaximized) {
          setMenuStyle({
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: Z_INDEX.toolMenu,
            visibility: 'visible',
          });
          return;
        }

        const MARGIN = 8;
        const menuHeight = menuEl.offsetHeight;
        const menuWidth = menuEl.offsetWidth;

        const effectiveLeft = rect.left;
        const effectiveTop = rect.top;
        const effectiveWidth = rect.width;
        const effectiveHeight = rect.height;
        const effectiveBottom = effectiveTop + effectiveHeight;

        // Vertical: prefer above; flip below only when space above is tight AND
        // there is room below. If neither side fits, pick whichever has more space
        // and clamp to keep the toolbar on-screen.
        const spaceAbove = effectiveTop;
        const spaceBelow = window.innerHeight - effectiveBottom;
        const showBelow =
          spaceAbove < menuHeight + MARGIN && spaceBelow >= spaceAbove;
        const rawTopPos = showBelow
          ? effectiveBottom + MARGIN
          : effectiveTop - menuHeight - MARGIN;
        const clampedTop = Math.max(
          MARGIN,
          Math.min(rawTopPos, window.innerHeight - menuHeight - MARGIN)
        );

        // Horizontal: center on widget, clamp so toolbar never overflows viewport
        const idealLeft = effectiveLeft + effectiveWidth / 2 - menuWidth / 2;
        const clampedLeft = Math.max(
          MARGIN,
          Math.min(idealLeft, window.innerWidth - menuWidth - MARGIN)
        );

        setMenuStyle({
          position: 'fixed',
          top: clampedTop,
          left: clampedLeft,
          zIndex: Z_INDEX.toolMenu,
          visibility: 'visible',
        });
      };

      updatePositionRef.current = updatePosition;
      updatePosition();
      window.addEventListener('resize', updatePosition);
      return () => {
        updatePositionRef.current = null;
        window.removeEventListener('resize', updatePosition);
      };
    } else {
      // Keep position:fixed on reset so offsetWidth measures content width
      // (not viewport width) the next time the toolbar opens.
      setMenuStyle({ position: 'fixed', visibility: 'hidden' });
    }
    return undefined;
  }, [
    showTools,
    widget.x,
    widget.y,
    widget.w,
    widget.h,
    widget.flipped,
    widget.customTitle,
    isMaximized,
    zoom,
    isEditingTitle,
    title,
  ]);

  const updateSnapMenuPositionRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    if (showSnapMenu && snapButtonRef.current) {
      const updatePosition = () => {
        const buttonRect = snapButtonRef.current?.getBoundingClientRect();
        const menuEl = snapMenuRef.current;
        if (!buttonRect || !menuEl) return;

        const MARGIN = 8;
        const menuHeight = menuEl.offsetHeight;
        const menuWidth = menuEl.offsetWidth;

        // Ideal position: Centered below the button
        const idealTop = buttonRect.bottom + 8; // 8px gap
        const idealLeft =
          buttonRect.left + buttonRect.width / 2 - menuWidth / 2;

        // Vertical boundary checks
        const spaceBelow = window.innerHeight - buttonRect.bottom;
        const spaceAbove = buttonRect.top;

        let clampedTop = idealTop;
        // If it doesn't fit below, and there's more room above, flip it above
        if (spaceBelow < menuHeight + MARGIN && spaceAbove > spaceBelow) {
          clampedTop = buttonRect.top - menuHeight - 8;
        }

        // Clamp vertically to viewport
        clampedTop = Math.max(
          MARGIN,
          Math.min(clampedTop, window.innerHeight - menuHeight - MARGIN)
        );

        // Clamp horizontally to viewport
        const clampedLeft = Math.max(
          MARGIN,
          Math.min(idealLeft, window.innerWidth - menuWidth - MARGIN)
        );

        setSnapMenuStyle({
          position: 'fixed',
          top: clampedTop,
          left: clampedLeft,

          visibility: 'visible',
        });
      };

      updateSnapMenuPositionRef.current = updatePosition;
      updatePosition();
      window.addEventListener('resize', updatePosition);
      return () => {
        updateSnapMenuPositionRef.current = null;
        window.removeEventListener('resize', updatePosition);
      };
    } else {
      setSnapMenuStyle({ position: 'fixed', visibility: 'hidden' });
    }
    return undefined;
  }, [showSnapMenu]);

  useEffect(() => {
    if (!showSnapMenu) return;
    const handlePan = () => updateSnapMenuPositionRef.current?.();
    window.addEventListener('board-pan', handlePan);
    return () => window.removeEventListener('board-pan', handlePan);
  }, [showSnapMenu]);

  // Reposition the tool menu on board pan without subscribing to panOffset in
  // context (which would cause every widget to re-render on every pan frame).
  useEffect(() => {
    if (!showTools) return;
    const handlePan = () => updatePositionRef.current?.();
    window.addEventListener('board-pan', handlePan);
    return () => window.removeEventListener('board-pan', handlePan);
  }, [showTools]);

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
        if (!isLocked) {
          if (skipCloseConfirmation) {
            removeWidget(widget.id);
          } else {
            setShowConfirm(true);
            handleCloseTools();
          }
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
    isLocked,
    skipCloseConfirmation,
    removeWidget,
    updateWidget,
    handleCloseTools,
  ]);

  const twoFingerLongPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressStartPos = useRef<{ x: number; y: number } | null>(null);
  const longPressMoved = useRef(0);
  const activeTouchCount = useRef(0);

  const handleWidgetPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') {
      activeTouchCount.current++;

      const target = e.target as HTMLElement;
      if (target.closest(TOUCH_GESTURE_BLOCKING_SELECTOR)) return;

      // 2-Finger Long-Press (~600ms) → Toggle annotation draw mode
      if (activeTouchCount.current === 2) {
        // Cancel any pending 1-finger long press since we now have 2 fingers
        clearLongPressTimer();
        // Start a 2-finger long press timer
        twoFingerLongPressTimer.current = setTimeout(() => {
          twoFingerLongPressTimer.current = null;
          if (activeTouchCount.current >= 2) {
            setIsAnnotating((prev) => !prev);
            handleCloseTools();
          }
        }, 600);
      }

      // 1-Finger Long-Press (Screenshot)
      if (activeTouchCount.current === 1) {
        longPressStartPos.current = { x: e.clientX, y: e.clientY };
        longPressMoved.current = 0;
        longPressTimer.current = setTimeout(() => {
          longPressTimer.current = null;
          const LONG_PRESS_MOVE_TOLERANCE_PX = 15;
          if (
            activeTouchCount.current === 1 &&
            longPressMoved.current < LONG_PRESS_MOVE_TOLERANCE_PX
          ) {
            if (canScreenshot && !isCapturing) {
              void takeScreenshot();
              handleCloseTools();
            }
          }
        }, 600);
      }
    }
  };

  const handleWidgetPointerMove = (e: React.PointerEvent) => {
    if (
      (e.pointerType === 'touch' || e.pointerType === 'pen') &&
      longPressTimer.current &&
      longPressStartPos.current
    ) {
      const dx = e.clientX - longPressStartPos.current.x;
      const dy = e.clientY - longPressStartPos.current.y;
      longPressMoved.current = Math.sqrt(dx * dx + dy * dy);
    }
  };

  const handleWidgetPointerUp = () => {
    activeTouchCount.current = Math.max(0, activeTouchCount.current - 1);
    clearLongPressTimer();
    // Cancel 2-finger long press if either finger lifts before threshold
    if (activeTouchCount.current < 2 && twoFingerLongPressTimer.current) {
      clearTimeout(twoFingerLongPressTimer.current);
      twoFingerLongPressTimer.current = null;
    }
  };

  // Fallback to widget state if not dragging/resizing or if position-aware
  const shouldUseDragState =
    (isDragging || isResizing) &&
    !POSITION_AWARE_WIDGETS.includes(widget.type) &&
    dragState.current;

  const UNIVERSAL_TEXT_SIZES: Record<string, string> = {
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl',
  };

  const universalStyleClasses = [
    widget.fontFamily ? `font-${widget.fontFamily}` : '',
    widget.baseTextSize ? UNIVERSAL_TEXT_SIZES[widget.baseTextSize] : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <GlassCard
      globalStyle={globalStyle}
      ref={windowRef}
      tabIndex={0}
      data-widget-id={widget.id}
      onPointerDown={handlePointerDown}
      onClick={handleWidgetClick}
      onKeyDown={handleKeyDown}
      onPointerDownCapture={handleWidgetPointerDown}
      onPointerMoveCapture={handleWidgetPointerMove}
      onPointerUpCapture={handleWidgetPointerUp}
      onPointerCancelCapture={handleWidgetPointerUp}
      onContextMenu={(e) => e.preventDefault()}
      transparency={transparency}
      disableBlur={isDragging || isResizing}
      allowInvisible={true}
      selected={isSelected}
      cornerRadius={isMaximized ? 'none' : undefined}
      className={`absolute select-none widget group will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 ${
        isMaximized ? 'border-none !shadow-none' : ''
      }`}
      bgClass={widget.backgroundColor}
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
        className={`h-full w-full flex flex-col rounded-[inherit] overflow-hidden ${universalStyleClasses}`}
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
                  if (!isLocked) removeWidget(widget.id);
                }}
                disabled={isLocked}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="absolute inset-0 bg-white z-widget-internal-overlay animate-out fade-out duration-300 pointer-events-none isFlashing"
            />
          )}
          {children}

          {/* Inner edge drag zones — invisible grab strips along the inside perimeter
              so users can drag full-interactive widgets (embed, text, etc.) from within
              the visible widget boundary instead of only from outside it. */}
          {!isMaximized && !isAnnotating && !isPinned && !isLocked && (
            <>
              {/* Top */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: INNER_EDGE_CORNER_INSET,
                  right: INNER_EDGE_CORNER_INSET,
                  height: INNER_EDGE_PAD,
                  zIndex: Z_INDEX.widgetResize,
                  touchAction: 'none',
                  cursor: 'grab',
                  pointerEvents: 'auto',
                }}
                onPointerDown={handleDragStart}
              />
              {/* Bottom */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: INNER_EDGE_CORNER_INSET,
                  right: INNER_EDGE_CORNER_INSET,
                  height: INNER_EDGE_PAD,
                  zIndex: Z_INDEX.widgetResize,
                  touchAction: 'none',
                  cursor: 'grab',
                  pointerEvents: 'auto',
                }}
                onPointerDown={handleDragStart}
              />
              {/* Left */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: INNER_EDGE_CORNER_INSET,
                  bottom: INNER_EDGE_CORNER_INSET,
                  width: INNER_EDGE_PAD,
                  zIndex: Z_INDEX.widgetResize,
                  touchAction: 'none',
                  cursor: 'grab',
                  pointerEvents: 'auto',
                }}
                onPointerDown={handleDragStart}
              />
              {/* Right */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: INNER_EDGE_CORNER_INSET,
                  bottom: INNER_EDGE_CORNER_INSET,
                  width: INNER_EDGE_PAD,
                  zIndex: Z_INDEX.widgetResize,
                  touchAction: 'none',
                  cursor: 'grab',
                  pointerEvents: 'auto',
                }}
                onPointerDown={handleDragStart}
              />
            </>
          )}

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
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-widget-internal-overlay flex items-center gap-1 p-1 bg-white/90 backdrop-blur shadow-lg rounded-full border border-slate-200 animate-in slide-in-from-bottom-2 fade-in duration-200">
                <div className="flex items-center gap-1 px-1">
                  {WIDGET_PALETTE.slice(0, 5).map((c) => (
                    <button
                      key={c}
                      onClick={(e) => {
                        e.stopPropagation();
                        setAnnotationColor(c);
                      }}
                      aria-label={`Select annotation color ${c}`}
                      aria-pressed={annotationColor === c}
                      className={`w-5 h-5 rounded-full border border-slate-100 transition-transform touch-target-expand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${annotationColor === c ? 'scale-125 ring-2 ring-slate-400 z-10' : 'hover:scale-110'}`}
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
                  className="px-2 py-0.5 text-xxs font-bold bg-brand-blue-primary text-white rounded-full hover:bg-brand-blue-dark transition-colors"
                >
                  {t('widgetWindow.done')}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Resize Handles (Corners Only) */}
        {!isLocked && !isPinned && (
          <>
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
          </>
        )}
      </div>

      {/* Invisible edge grab zones — extend INVISIBLE_EDGE_PAD px outside the widget's visual
          bounds so users can reliably grab and drag widgets whose content fills edge-to-edge.
          No visual appearance; only the pointer hit area is expanded. */}
      {!isMaximized && !isAnnotating && !isPinned && !isLocked && (
        <>
          {/* Top */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -INVISIBLE_EDGE_PAD,
              left: 0,
              right: 0,
              height: INVISIBLE_EDGE_PAD,
              touchAction: 'none',
              cursor: 'grab',
            }}
            onPointerDown={handleDragStart}
          />
          {/* Bottom */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              bottom: -INVISIBLE_EDGE_PAD,
              left: 0,
              right: 0,
              height: INVISIBLE_EDGE_PAD,
              touchAction: 'none',
              cursor: 'grab',
            }}
            onPointerDown={handleDragStart}
          />
          {/* Left */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: -INVISIBLE_EDGE_PAD,
              top: 0,
              bottom: 0,
              width: INVISIBLE_EDGE_PAD,
              touchAction: 'none',
              cursor: 'grab',
            }}
            onPointerDown={handleDragStart}
          />
          {/* Right */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: -INVISIBLE_EDGE_PAD,
              top: 0,
              bottom: 0,
              width: INVISIBLE_EDGE_PAD,
              touchAction: 'none',
              cursor: 'grab',
            }}
            onPointerDown={handleDragStart}
          />
        </>
      )}

      {/* Drag-to-Edge Visual Preview Overlay */}
      {snapPreviewZone &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-testid="snap-preview"
            className="fixed z-snap-preview bg-brand-blue-primary/20 border-2 border-brand-blue-light/50 backdrop-blur-[2px] rounded-2xl transition-all duration-200 ease-out pointer-events-none"
            style={
              snapPreviewZone === 'maximize'
                ? { top: 0, left: 0, width: '100vw', height: '100vh' }
                : snapPreviewZone === 'minimize'
                  ? {
                      bottom: 'env(safe-area-inset-bottom, 0px)',
                      left: '50%',
                      width: 'min(400px, 80vw)',
                      height: '12px',
                      transform: 'translateX(-50%)',
                      borderRadius: '12px 12px 0 0',
                    }
                  : (() => {
                      const bounds = calculateSnapBounds(snapPreviewZone);
                      return {
                        top: bounds.y,
                        left: bounds.x,
                        width: bounds.w,
                        height: bounds.h,
                      };
                    })()
            }
          />,
          document.body
        )}

      {/* Persistent Restore FAB for Maximized State */}
      {isMaximized && (
        <div className="absolute bottom-6 right-6 z-widget-control pointer-events-auto flex items-center justify-center">
          <IconButton
            icon={<Minimize2 className="w-6 h-6" />}
            label={t('widgetWindow.restore')}
            onClick={(e) => {
              e.stopPropagation();
              handleMaximizeToggle();
            }}
            size="xl"
            variant="brand-ghost"
            className="shadow-2xl !bg-white/90 hover:!bg-white backdrop-blur-md border border-slate-200 animate-in zoom-in-50 duration-300"
          />
        </div>
      )}
    </GlassCard>
  );

  return (
    <>
      {(isMaximized || isSpotlighted) && typeof document !== 'undefined'
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
                  <div className="flex items-center gap-1 -mr-1">
                    <IconButton
                      onClick={() => {
                        updateWidget(widget.id, {
                          flipped: !widget.flipped,
                        });
                        handleCloseTools();
                      }}
                      icon={<Settings className="w-3.5 h-3.5" />}
                      label={
                        widget.flipped
                          ? `${t('widgetWindow.closeSettings')} (Alt+S)`
                          : `${t('widgetWindow.settings')} (Alt+S)`
                      }
                      size="sm"
                      variant="glass"
                      active={widget.flipped}
                      className={
                        widget.flipped
                          ? '!bg-brand-blue-lighter/60 !text-brand-blue-primary'
                          : ''
                      }
                    />
                  </div>
                </div>
              )}

              <div className="h-4 w-px bg-slate-300/50 mx-1" />

              <div className="flex items-center gap-1">
                <IconButton
                  onClick={() => {
                    if (isLocked) return;
                    const nextPinned = !isPinned;
                    if (nextPinned) setShowSnapMenu(false);
                    updateWidget(widget.id, { isPinned: nextPinned });
                  }}
                  icon={<Pin className="w-3.5 h-3.5" />}
                  label={
                    isPinned
                      ? `${t('widgetWindow.unpin')} (Alt+P)`
                      : `${t('widgetWindow.pin')} (Alt+P)`
                  }
                  size="sm"
                  variant="glass"
                  active={isPinned}
                  disabled={isLocked}
                  className={isPinned ? '!bg-amber-500/20 !text-amber-600' : ''}
                />
                {headerActions && (
                  <div className="flex items-center text-slate-700">
                    {headerActions}
                  </div>
                )}
                {canScreenshot && (
                  <IconButton
                    onClick={() => {
                      void takeScreenshot();
                      let shownTips: string[] = [];
                      try {
                        const raw = localStorage.getItem('spart_shown_tips');
                        const parsed: unknown = raw ? JSON.parse(raw) : [];
                        if (
                          Array.isArray(parsed) &&
                          parsed.every((v) => typeof v === 'string')
                        ) {
                          shownTips = parsed;
                        }
                      } catch {
                        // Corrupted storage value — treat as empty
                      }
                      if (!shownTips.includes('screenshot-gesture')) {
                        shownTips.push('screenshot-gesture');
                        localStorage.setItem(
                          'spart_shown_tips',
                          JSON.stringify(shownTips)
                        );
                        setTimeout(() => {
                          addToast(
                            t('widgetWindow.screenshotGestureProTip'),
                            'info'
                          );
                        }, 1200);
                      }
                    }}
                    disabled={isCapturing}
                    icon={<Camera className="w-3.5 h-3.5" />}
                    label={t('widgetWindow.takeScreenshotLongPress')}
                    size="sm"
                    variant="glass"
                  />
                )}
                <IconButton
                  onClick={() => {
                    setIsAnnotating(!isAnnotating);
                    handleCloseTools();
                  }}
                  icon={<Highlighter className="w-3.5 h-3.5" />}
                  label={`${t('widgetWindow.annotate')} (Alt+D)`}
                  size="sm"
                  variant="glass"
                  active={isAnnotating}
                  className={
                    isAnnotating
                      ? '!bg-brand-blue-lighter !text-brand-blue-primary'
                      : ''
                  }
                />
                <IconButton
                  onClick={() => duplicateWidget(widget.id)}
                  icon={<Copy className="w-3.5 h-3.5" />}
                  label={t('widgetWindow.duplicate')}
                  size="sm"
                  variant="glass"
                />

                {/* NEW: Snap Layouts Button & Popover */}
                <div className="relative flex items-center">
                  <IconButton
                    ref={snapButtonRef}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSnapMenu(!showSnapMenu);
                    }}
                    icon={<LayoutTemplate className="w-3.5 h-3.5" />}
                    label={t('widgetWindow.snapLayout')}
                    size="sm"
                    variant="glass"
                    active={showSnapMenu}
                    disabled={isPinned || isLocked}
                  />
                  {showSnapMenu &&
                    typeof document !== 'undefined' &&
                    createPortal(
                      <div
                        ref={snapMenuRef}
                        className="fixed z-modal p-3 bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-2xl w-72 animate-in slide-in-from-top-2 fade-in duration-200"
                        style={snapMenuStyle}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-2 mb-2 px-1">
                          <LayoutTemplate className="w-3.5 h-3.5 text-brand-blue-primary" />
                          <span className="text-xxs font-black text-slate-500 uppercase tracking-widest">
                            {t('widgetWindow.chooseLayout')}
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-1.5">
                          {SNAP_LAYOUTS.map((layout) => (
                            <div
                              key={layout.id}
                              className="group relative p-1 rounded-lg hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
                            >
                              <div className="relative w-full h-7 bg-slate-50 rounded-md overflow-hidden">
                                {layout.zones.map((zone) => (
                                  <button
                                    key={zone.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSnapToZone(zone);
                                    }}
                                    className="absolute bg-slate-300 hover:bg-brand-blue-primary transition rounded-[2px] border border-white/50 active:scale-90"
                                    style={{
                                      left: `${zone.x * 100}%`,
                                      top: `${zone.y * 100}%`,
                                      width: `${zone.w * 100}%`,
                                      height: `${zone.h * 100}%`,
                                    }}
                                    title={`${t('widgetWindow.snapTo')} ${t(`widgetWindow.layouts.${layout.nameKey}`)}`}
                                    aria-label={`${t('widgetWindow.snapTo')} ${t(`widgetWindow.layouts.${layout.nameKey}`)} - ${zone.id}`}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="my-2 border-t border-slate-200" />

                        <div className="flex items-center gap-2 mb-1.5 px-1">
                          <LayoutGrid className="w-3.5 h-3.5 text-brand-blue-primary" />
                          <span className="text-xxs font-black text-slate-500 uppercase tracking-widest">
                            Custom Size
                          </span>
                          {customGrid.start && customGrid.end && (
                            <span className="ml-auto text-xxs font-bold text-brand-blue-primary">
                              {Math.abs(
                                customGrid.end.col - customGrid.start.col
                              ) + 1}{' '}
                              ×{' '}
                              {Math.abs(
                                customGrid.end.row - customGrid.start.row
                              ) + 1}
                            </span>
                          )}
                        </div>

                        <div
                          className="rounded-lg overflow-hidden select-none touch-none cursor-crosshair"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
                            gap: '2px',
                            padding: '2px',
                            background: '#f1f5f9',
                          }}
                          onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            const cell = getCellFromPointer(e, e.currentTarget);
                            setCustomGrid({
                              start: cell,
                              end: cell,
                              selecting: true,
                            });
                          }}
                          onPointerMove={(e) => {
                            if (!customGridRef.current.selecting) return;
                            const cell = getCellFromPointer(e, e.currentTarget);
                            setCustomGrid((prev) => ({ ...prev, end: cell }));
                          }}
                          onPointerUp={() => {
                            const g = customGridRef.current;
                            if (g.selecting && g.start && g.end) {
                              handleCustomGridApply(g.start, g.end);
                            } else {
                              setCustomGrid({
                                start: null,
                                end: null,
                                selecting: false,
                              });
                            }
                          }}
                        >
                          {Array.from(
                            { length: GRID_COLS * GRID_ROWS },
                            (_, i) => {
                              const col = i % GRID_COLS;
                              const row = Math.floor(i / GRID_COLS);
                              const selected =
                                customGrid.start !== null &&
                                customGrid.end !== null &&
                                col >=
                                  Math.min(
                                    customGrid.start.col,
                                    customGrid.end.col
                                  ) &&
                                col <=
                                  Math.max(
                                    customGrid.start.col,
                                    customGrid.end.col
                                  ) &&
                                row >=
                                  Math.min(
                                    customGrid.start.row,
                                    customGrid.end.row
                                  ) &&
                                row <=
                                  Math.max(
                                    customGrid.start.row,
                                    customGrid.end.row
                                  );
                              return (
                                <div
                                  key={i}
                                  className={`rounded-[2px] transition-colors ${selected ? 'bg-brand-blue-light' : 'bg-slate-300'}`}
                                  style={{ height: '14px' }}
                                />
                              );
                            }
                          )}
                        </div>
                        <p className="text-xxs text-slate-400 text-center mt-1">
                          Drag to set custom size
                        </p>
                      </div>,
                      document.body
                    )}
                </div>
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
                      ? `${t('widgetWindow.restore')} (Alt+M)`
                      : `${t('widgetWindow.maximize')} (Alt+M)`
                  }
                  size="sm"
                  variant="glass"
                  disabled={isLocked || (isPinned && !isMaximized)}
                />
                <IconButton
                  onClick={() =>
                    updateWidget(widget.id, {
                      minimized: true,
                      flipped: false,
                    })
                  }
                  icon={<Minus className="w-3.5 h-3.5" />}
                  label={`${t('widgetWindow.minimize')} (Esc)`}
                  size="sm"
                  variant="glass"
                />
                {isLocked ? (
                  <div
                    role="img"
                    aria-label="Widget is locked by admin"
                    title="Widget is locked by admin"
                    className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400"
                  >
                    <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  </div>
                ) : (
                  <IconButton
                    onClick={() => {
                      if (skipCloseConfirmation) {
                        removeWidget(widget.id);
                      } else {
                        setShowConfirm(true);
                        handleCloseTools();
                      }
                    }}
                    icon={<X className="w-3.5 h-3.5" />}
                    label={t('widgetWindow.close')}
                    size="sm"
                    variant="danger"
                    className="hover:!bg-red-500/20"
                  />
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* SETTINGS PANEL PORTAL */}
      {widget.flipped && typeof document !== 'undefined' && (
        <SettingsPanel
          key={widget.id}
          widget={widget}
          widgetRef={windowRef}
          settings={settings}
          appearanceSettings={appearanceSettings}
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
