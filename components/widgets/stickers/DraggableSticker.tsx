import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowUp,
  ArrowDown,
  RotateCw,
  Trash2,
  MoreVertical,
} from 'lucide-react';
import { WidgetData, StickerConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useDialog } from '@/context/useDialog';
import { FloatingPanel } from '@/components/common/FloatingPanel';

interface DraggableStickerProps {
  widget: WidgetData;
  children: React.ReactNode;
}

export const DraggableSticker: React.FC<DraggableStickerProps> = ({
  widget,
  children,
}) => {
  const {
    updateWidget,
    removeWidget,
    bringToFront,
    moveWidgetLayer,
    deleteAllWidgets,
  } = useDashboard();
  const { showConfirm } = useDialog();
  const [isSelected, setIsSelected] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const nodeRef = useRef<HTMLDivElement>(null);

  useClickOutside(nodeRef, () => {
    if (!isDragging) {
      setIsSelected(false);
      setShowMenu(false);
    }
  });

  const config = widget.config as StickerConfig;
  const rotation = config.rotation ?? 0;

  useEffect(() => {
    const handleEscapePress = (e: Event) => {
      const customEvent = e as CustomEvent<{ widgetId: string }>;
      if (customEvent.detail?.widgetId !== widget.id) return;
      setIsSelected(false);
      setShowMenu(false);
    };

    const handleCustomKeyboard = (e: Event) => {
      const { widgetId, key, shiftKey } = (
        e as CustomEvent<{ widgetId: string; key: string; shiftKey: boolean }>
      ).detail;
      if (widgetId !== widget.id || shiftKey) return;

      if (key === 'Escape') {
        setIsSelected(false);
        setShowMenu(false);
      } else if (key === 'Delete' || key === 'Backspace') {
        removeWidget(widget.id);
      }
    };

    window.addEventListener('widget-escape-press', handleEscapePress);
    window.addEventListener('widget-keyboard-action', handleCustomKeyboard);
    return () => {
      window.removeEventListener('widget-escape-press', handleEscapePress);
      window.removeEventListener(
        'widget-keyboard-action',
        handleCustomKeyboard
      );
    };
  }, [widget.id, removeWidget]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // If clicking menu or handles, don't drag
    if ((e.target as HTMLElement).closest('.sticker-control')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Explicitly focus the sticker so it can receive keyboard events
    (e.currentTarget as HTMLElement).focus();

    setIsSelected(true);
    // Select and bring this sticker to the front on click or drag start.
    bringToFront(widget.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = widget.x;
    const origY = widget.y;
    let hasMoved = false;

    const onPointerMove = (ev: PointerEvent) => {
      hasMoved = true;
      setIsDragging(true);
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      updateWidget(widget.id, { x: origX + dx, y: origY + dy });
    };

    const onPointerUp = () => {
      setIsDragging(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (!hasMoved) {
        // Just a click
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !e.shiftKey && !e.altKey && !e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      setIsSelected(false);
      setShowMenu(false);
      return;
    }

    if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      !e.shiftKey &&
      !e.altKey &&
      !e.ctrlKey
    ) {
      e.preventDefault();
      e.stopPropagation();
      removeWidget(widget.id);
      return;
    }

    // Alt + Delete: Clear all widgets
    if ((e.key === 'Delete' || e.key === 'Backspace') && e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      const confirmed = await showConfirm(
        'Are you sure you want to clear the entire board?',
        {
          title: 'Clear Board',
          variant: 'danger',
          confirmLabel: 'Clear All',
        }
      );
      if (confirmed) deleteAllWidgets();
      return;
    }
  };

  const handleRotateStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = nodeRef.current?.getBoundingClientRect();
    if (!rect) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const onPointerMove = (ev: PointerEvent) => {
      const angle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX);
      const deg = angle * (180 / Math.PI) + 90;
      updateWidget(widget.id, {
        config: { ...config, rotation: deg },
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleResizeStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const startW = widget.w;
    const startH = widget.h;
    const startX = e.clientX;
    const startY = e.clientY;

    // Rotation in radians
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const onPointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      // Project screen delta onto local axes
      // For 0 deg (cos=1, sin=0): localDx = dx, localDy = dy.
      // For 90 deg (cos=0, sin=1): localDx = dy, localDy = -dx.

      const localDx = dx * cos + dy * sin;
      const localDy = -dx * sin + dy * cos;

      updateWidget(widget.id, {
        w: Math.max(50, startW + localDx),
        h: Math.max(50, startH + localDy),
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <div
      ref={nodeRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      data-widget-id={widget.id}
      className="absolute group select-none widget focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
      style={{
        left: widget.x,
        top: widget.y,
        width: widget.w,
        height: widget.h,
        zIndex: widget.z,
        transform: `rotate(${rotation}deg)`,
        cursor: 'move',
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
    >
      <div className="w-full h-full relative">
        {children}

        {/* Selected Overlay/Border */}
        {isSelected && (
          <div className="absolute inset-0 border-2 rounded-lg pointer-events-none border-blue-400/50" />
        )}

        {/* Handles & Menu */}
        {isSelected && !isDragging && (
          <>
            {/* Rotate Handle */}
            <div
              className="sticker-control absolute -top-8 left-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing"
              onPointerDown={handleRotateStart}
            >
              <div className="p-1.5 bg-white shadow rounded-full text-blue-600 border border-blue-100">
                <RotateCw size={14} />
              </div>
              <div className="h-4 w-0.5 bg-blue-400 mx-auto" />
            </div>

            {/* Resize Handle (Corner) */}
            <div
              className="sticker-control absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-0.5"
              onPointerDown={handleResizeStart}
            >
              <div className="w-3 h-3 border-r-2 border-b-2 border-blue-500 bg-white rounded-br-[2px]" />
            </div>

            {/* Menu Button (Top Right) */}
            <div
              className="sticker-control absolute -top-3 -right-3 z-sticker-control"
              style={{ transform: `rotate(${-rotation}deg)` }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1.5 bg-white hover:bg-slate-50 text-slate-700 shadow-md border border-slate-100 rounded-full transition-colors"
                  title="Sticker Options"
                >
                  <MoreVertical size={16} />
                </button>

                {/* Dropdown Menu */}
                {showMenu && (
                  <FloatingPanel
                    padding="none"
                    overflow="hidden"
                    className="absolute top-full right-0 mt-2 w-40 origin-top-right py-1"
                  >
                    <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-50 mb-1">
                      Layers
                    </div>
                    <button
                      onClick={() => {
                        moveWidgetLayer(widget.id, 'up');
                        setShowMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2"
                    >
                      <ArrowUp size={14} />
                      Bring Forward
                    </button>
                    <button
                      onClick={() => {
                        moveWidgetLayer(widget.id, 'down');
                        setShowMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2"
                    >
                      <ArrowDown size={14} />
                      Send Backward
                    </button>

                    <div className="h-px bg-slate-100 my-1" />

                    <button
                      onClick={() => removeWidget(widget.id)}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </FloatingPanel>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
