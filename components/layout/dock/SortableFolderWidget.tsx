import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X } from 'lucide-react';
import { useLongPress } from '@/hooks/useLongPress';
import { DockIcon } from './DockIcon';
import { Z_INDEX } from '@/config/zIndex';
import { WidgetType, ToolMetadata, InternalToolType } from '@/types';

interface SortableFolderWidgetProps {
  type: WidgetType | InternalToolType;
  tool: ToolMetadata;
  minimizedCount: number;
  isEditMode: boolean;
  onRemove: () => void;
  onAdd: () => void;
  onLongPress: () => void;
}

// Sortable Widget Icon within Folder
export const SortableFolderWidget = React.memo(
  ({
    type,
    tool,
    minimizedCount,
    isEditMode,
    onRemove,
    onAdd,
    onLongPress,
  }: SortableFolderWidgetProps) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({
      id: type,
      disabled: !isEditMode,
    });

    const longPress = useLongPress(onLongPress, {
      disabled: isEditMode,
      onPointerDown: listeners?.onPointerDown,
    });

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
        className="relative group/item flex flex-col items-center gap-1"
      >
        <div className="relative">
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={() => {
              if (isEditMode) return;
              onAdd();
            }}
            onPointerDown={longPress.onPointerDown}
            onPointerUp={longPress.onPointerUp}
            onPointerLeave={longPress.onPointerUp}
            onPointerMove={longPress.onPointerMove}
            className={`relative ${
              isEditMode
                ? 'cursor-grab active:cursor-grabbing'
                : 'cursor-pointer'
            }`}
          >
            <DockIcon
              color={tool.color}
              className={`flex items-center justify-center shadow-md ${
                isEditMode ? '' : 'group-hover:scale-110'
              }`}
              badgeCount={minimizedCount}
            >
              <tool.icon className="w-5 h-5" />
            </DockIcon>
          </button>

          {isEditMode && (
            <div
              role="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove();
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                // Do not preventDefault here if it blocks the click, but usually stopPropagation is enough for dnd-kit
              }}
              className="absolute -top-2 -right-2 z-widget-drag bg-red-500 text-white rounded-full p-1 shadow-md hover:scale-110 transition-all cursor-pointer"
            >
              <X className="w-2.5 h-2.5" />
            </div>
          )}
        </div>
        <span className="text-xxxs font-bold uppercase text-slate-600 truncate w-full text-center">
          {tool.label}
        </span>
      </div>
    );
  }
);

SortableFolderWidget.displayName = 'SortableFolderWidget';
