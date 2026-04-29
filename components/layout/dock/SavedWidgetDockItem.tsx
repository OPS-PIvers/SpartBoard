import React from 'react';
import { Trash2, X, Puzzle } from 'lucide-react';
import { SavedWidget, DockPosition } from '@/types';
import { getCustomWidgetIcon } from '@/config/customWidgetIcons';
import { useLongPress } from '@/hooks/useLongPress';
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
  // Reuse the shared long-press hook so the saved-widget icon matches the
  // cancel-on-drag / hold-delay behavior of every other dock icon.
  const longPress = useLongPress(onLongPress, { disabled: isEditMode });

  const handleClick = (e: React.MouseEvent) => {
    if (isEditMode) {
      e.preventDefault();
      e.stopPropagation();
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
          onPointerDown={longPress.onPointerDown}
          onPointerUp={longPress.onPointerUp}
          onPointerLeave={longPress.onPointerUp}
          onPointerMove={longPress.onPointerMove}
          onPointerCancel={longPress.onPointerCancel}
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
