import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCcw, Trash2, Plus, X } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useLongPress } from '@/hooks/useLongPress';
import { GlassCard } from '@/components/common/GlassCard';
import { DockIcon } from './DockIcon';
import { DockLabel } from './DockLabel';
import { getTitle } from '@/utils/widgetHelpers';
import { Z_INDEX } from '@/config/zIndex';
import { ToolMetadata, WidgetData, GlobalStyle, DockPosition } from '@/types';

interface ToolDockItemProps {
  tool: ToolMetadata;
  minimizedWidgets: WidgetData[];
  onAdd: () => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
  onRemoveFromDock: () => void;
  isEditMode: boolean;
  onLongPress: () => void;
  globalStyle: GlobalStyle;
  customIcon?: React.ComponentType<{ className?: string }>;
  customLabel?: string;
  customColor?: string;
  onClickOverride?: (e: React.MouseEvent) => void;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  dockPosition?: DockPosition;
}

// Tool Item with Popover Logic
export const ToolDockItem = React.memo(
  ({
    tool,
    minimizedWidgets,
    onAdd,
    onRestore,
    onDelete,
    onDeleteAll,
    onRemoveFromDock,
    isEditMode,
    onLongPress,
    globalStyle,
    customIcon,
    customLabel,
    customColor,
    onClickOverride,
    buttonRef: externalButtonRef,
    dockPosition = 'bottom',
  }: ToolDockItemProps) => {
    const Icon = customIcon ?? tool.icon;
    const label = customLabel ?? tool.label;
    const color = customColor ?? tool.color;

    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({
      id: tool.type,
      disabled: !isEditMode, // Only allow dragging in Edit Mode
    });

    const [showPopover, setShowPopover] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);
    const internalButtonRef = useRef<HTMLButtonElement>(null);
    const buttonRef = externalButtonRef ?? internalButtonRef;
    const [popoverPos, setPopoverPos] = useState<{
      left: number;
      bottom: number;
    } | null>(null);

    const longPress = useLongPress(onLongPress, {
      disabled: isEditMode,
      onPointerDown: listeners?.onPointerDown,
    });

    // Close popover when clicking outside
    useClickOutside(popoverRef, () => setShowPopover(false), [buttonRef]);

    const handleClick = (e: React.MouseEvent) => {
      if (isEditMode) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (onClickOverride) {
        onClickOverride(e);
        return;
      }

      if (minimizedWidgets.length > 0) {
        if (showPopover) {
          setShowPopover(false);
        } else {
          if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPopoverPos({
              left: rect.left + rect.width / 2,
              bottom: window.innerHeight - rect.top + 10,
            });
          }
          setShowPopover(true);
        }
      } else {
        onAdd();
      }
    };

    const style = {
      transform: CSS.Translate.toString(transform),
      transition,
      opacity: isDragging ? 0.3 : 1,
      zIndex: isDragging ? Z_INDEX.dockDragging : 'auto',
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="relative flex flex-col items-center"
      >
        {/* Popover Menu - Rendered in Portal to avoid clipping */}
        {showPopover &&
          !isEditMode &&
          minimizedWidgets.length > 0 &&
          popoverPos &&
          createPortal(
            <GlassCard
              globalStyle={globalStyle}
              ref={popoverRef}
              style={{
                position: 'fixed',
                left: popoverPos.left,
                bottom: popoverPos.bottom,
                transform: 'translateX(-50%)',
                zIndex: Z_INDEX.popover,
              }}
              className="w-56 overflow-hidden animate-in slide-in-from-bottom-2 duration-200"
            >
              <div className="bg-white/50 px-3 py-2 border-b border-white/30 flex justify-between items-center">
                <span className="text-xxs font-black uppercase text-slate-600 tracking-wider">
                  Restorable
                </span>
                <span className="bg-white/60 text-slate-700 text-xxs font-bold px-1.5 py-0.5 rounded-full">
                  {minimizedWidgets.length}
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto p-1 space-y-0.5">
                {minimizedWidgets.map((widget) => (
                  <div
                    key={widget.id}
                    className="w-full flex items-center justify-between px-2 py-2 hover:bg-white/50 rounded-lg group transition-colors"
                  >
                    <button
                      onClick={() => {
                        onRestore(widget.id);
                        if (minimizedWidgets.length <= 1) setShowPopover(false);
                      }}
                      className="flex-1 text-left flex items-center gap-2 min-w-0"
                    >
                      <span className="truncate text-xs text-slate-800 font-medium">
                        {getTitle(widget)}
                      </span>
                      <RefreshCcw className="w-3 h-3 text-brand-blue-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </button>
                    <button
                      onClick={() => {
                        onDelete(widget.id);
                        if (minimizedWidgets.length <= 1) setShowPopover(false);
                      }}
                      className="relative p-1 text-slate-500 hover:text-red-600 hover:bg-red-50/50 rounded-md transition-[color,background-color,opacity] opacity-0 group-hover:opacity-100 touch-target-expand"
                      aria-label="Close Widget"
                      title="Close Widget"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="p-1 border-t border-white/30 grid grid-cols-2 gap-1">
                <button
                  onClick={() => {
                    onAdd();
                    setShowPopover(false);
                  }}
                  className="flex items-center justify-center gap-0.5 px-1 py-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-xxs font-bold rounded-lg transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>Create</span>
                </button>
                <button
                  onClick={() => {
                    onDeleteAll();
                    setShowPopover(false);
                  }}
                  className="flex items-center justify-center gap-0.5 px-1 py-1.5 bg-white/50 hover:bg-red-50/80 text-slate-700 hover:text-red-700 text-xxs font-bold rounded-lg transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              </div>
            </GlassCard>,
            document.body
          )}

        <div
          className={`relative group/icon ${isEditMode ? 'animate-jiggle' : ''}`}
        >
          {/* Remove Button (Visible in Edit Mode) */}
          {isEditMode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFromDock();
              }}
              className="absolute -top-2 -right-2 z-controls bg-red-500 text-white rounded-full p-1 shadow-md hover:scale-110 transition-transform animate-in zoom-in duration-200"
              aria-label="Remove from Dock"
              title="Remove from Dock"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}

          <button
            ref={buttonRef}
            {...attributes}
            {...listeners}
            onPointerDown={longPress.onPointerDown}
            onPointerUp={longPress.onPointerUp}
            onPointerLeave={longPress.onPointerUp}
            onPointerMove={longPress.onPointerMove}
            onPointerCancel={longPress.onPointerCancel}
            onClick={handleClick}
            data-tool-id={tool.type}
            className={`group flex flex-col items-center gap-1 min-w-[50px] transition-transform active:scale-90 relative ${
              isEditMode
                ? 'cursor-grab active:cursor-grabbing touch-none'
                : dockPosition === 'left' || dockPosition === 'right'
                  ? 'touch-pan-y'
                  : 'touch-pan-x'
            }`}
          >
            <DockIcon
              color={color}
              className={`flex items-center justify-center ${
                isEditMode ? '' : 'group-hover:scale-110'
              }`}
              badgeCount={minimizedWidgets.length}
            >
              <Icon className="w-5 h-5 md:w-6 md:h-6" />
            </DockIcon>
            <DockLabel>{label}</DockLabel>
          </button>
        </div>
      </div>
    );
  }
);

ToolDockItem.displayName = 'ToolDockItem';
