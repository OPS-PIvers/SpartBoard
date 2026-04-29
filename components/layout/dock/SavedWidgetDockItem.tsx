import React from 'react';
import { Trash2, X, Puzzle } from 'lucide-react';
import { SavedWidget, DockPosition } from '@/types';
import { getCustomWidgetIcon } from '@/config/customWidgetIcons';
import { DockIcon } from './DockIcon';
import { DockLabel } from './DockLabel';

interface SavedWidgetDockItemProps {
  widget: SavedWidget;
  isEditMode: boolean;
  onAdd: () => void;
  onUnpin: () => void;
  onDelete: () => void;
  onLongPress: () => void;
  dockPosition?: DockPosition;
}

/**
 * Dock item for a user-saved widget shortcut. In edit mode it surfaces TWO
 * controls so "remove from dock" (the standard X every dock icon shows) and
 * "delete the saved widget entirely" (the trash) stay distinct.
 */
export const SavedWidgetDockItem: React.FC<SavedWidgetDockItemProps> = ({
  widget,
  isEditMode,
  onAdd,
  onUnpin,
  onDelete,
  onLongPress,
  dockPosition = 'bottom',
}) => {
  // Long-press to enter edit mode, mirroring ToolDockItem's behavior so
  // saved widgets feel consistent with the rest of the dock.
  const longPressTimer = React.useRef<number | null>(null);
  const longPressFired = React.useRef(false);

  const startLongPress = () => {
    if (isEditMode) return;
    longPressFired.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      onLongPress();
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isEditMode) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (longPressFired.current) {
      e.preventDefault();
      return;
    }
    onAdd();
  };

  return (
    <div className="relative flex flex-col items-center">
      <div
        className={`relative group/icon ${isEditMode ? 'animate-jiggle' : ''}`}
      >
        {/* Delete (trash) — only on saved widgets, only in edit mode. Top-LEFT
            so it can never be confused with the universal top-right "Remove
            from dock" X every dock icon shows. */}
        {isEditMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute -top-2 -left-2 z-controls bg-slate-700 hover:bg-slate-900 text-white rounded-full p-1 shadow-md hover:scale-110 transition-transform animate-in zoom-in duration-200"
            aria-label="Delete saved widget"
            title="Delete saved widget (permanent)"
          >
            <Trash2 className="w-2.5 h-2.5" />
          </button>
        )}

        {/* Remove from dock — same UX as ToolDockItem's X */}
        {isEditMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUnpin();
            }}
            className="absolute -top-2 -right-2 z-controls bg-red-500 text-white rounded-full p-1 shadow-md hover:scale-110 transition-transform animate-in zoom-in duration-200"
            aria-label="Remove from Dock"
            title="Remove from Dock"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        )}

        <button
          onPointerDown={startLongPress}
          onPointerUp={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onPointerCancel={cancelLongPress}
          onClick={handleClick}
          className={`group flex flex-col items-center gap-1 min-w-[50px] transition-transform active:scale-90 relative ${
            isEditMode
              ? 'cursor-default touch-none'
              : dockPosition === 'left' || dockPosition === 'right'
                ? 'touch-pan-y'
                : 'touch-pan-x'
          }`}
        >
          <DockIcon
            color={widget.color}
            className={`flex items-center justify-center ${
              isEditMode ? '' : 'group-hover:scale-110'
            }`}
            title={widget.title}
          >
            {React.createElement(getCustomWidgetIcon(widget.icon) ?? Puzzle, {
              className: 'w-5 h-5 md:w-6 md:h-6',
            })}
          </DockIcon>
          <DockLabel>{widget.title}</DockLabel>
        </button>
      </div>
    </div>
  );
};
