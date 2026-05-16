import React, { useRef } from 'react';
import { Folder, GripVertical } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import type { Collection } from '@/types';

interface CollectionCardProps {
  collection: Collection;
  childCollectionsCount: number;
  childBoardsCount: number;
  isSelected: boolean;
  isSelectMode: boolean;
  onClick: () => void;
  onLongPress: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const LONG_PRESS_MS = 350;

export const CollectionCard: React.FC<CollectionCardProps> = ({
  collection,
  childCollectionsCount,
  childBoardsCount,
  isSelected,
  isSelectMode,
  onClick,
  onLongPress,
  onContextMenu,
}) => {
  const { t } = useTranslation();
  const longPressTimer = useRef<number | null>(null);

  const draggableId = `collection:${collection.id}`;
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: draggableId });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: draggableId });

  // Combine drag + drop refs for this dual-purpose element.
  const setRef = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  const handlePointerDown = () => {
    longPressTimer.current = window.setTimeout(() => {
      onLongPress();
      longPressTimer.current = null;
    }, LONG_PRESS_MS);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div
      ref={setRef}
      {...attributes}
      className={`relative group rounded-xl border bg-slate-50 p-4 cursor-pointer transition-all hover:shadow-md ${
        isDragging ? 'opacity-50' : ''
      } ${
        isOver ? 'bg-brand-blue-lighter ring-2 ring-brand-blue-primary' : ''
      } ${
        isSelected
          ? 'border-brand-blue-primary ring-2 ring-brand-blue-primary/30'
          : 'border-slate-200'
      }`}
      onClick={() => {
        if (isSelectMode) onLongPress();
        else onClick();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e);
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
    >
      <button
        {...listeners}
        aria-label={t('boardsModal.dragToMove', {
          defaultValue: 'Drag to move',
        })}
        className="absolute top-2 right-2 p-1 rounded text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-slate-100 transition cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        data-drag-handle="collection"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      <Folder
        className="w-7 h-7 mb-2"
        style={collection.color ? { color: collection.color } : undefined}
      />
      <div className="text-sm font-bold text-slate-800 truncate mb-1">
        {collection.name}
      </div>
      <div className="text-xxs text-slate-400">
        {childCollectionsCount > 0 && `${childCollectionsCount} folders · `}
        {childBoardsCount} boards
      </div>
    </div>
  );
};
