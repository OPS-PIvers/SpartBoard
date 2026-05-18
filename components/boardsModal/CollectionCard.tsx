import React from 'react';
import { Folder } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import type { Collection } from '@/types';
import { hexToRgba, collectionTextColor } from '@/utils/collectionColor';

interface CollectionCardProps {
  collection: Collection;
  childCollectionsCount: number;
  childBoardsCount: number;
  isSelected: boolean;
  onClick: () => void;
  onToggleSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export const CollectionCard: React.FC<CollectionCardProps> = ({
  collection,
  childCollectionsCount,
  childBoardsCount,
  isSelected,
  onClick,
  onToggleSelect,
  onContextMenu,
}) => {
  const { t } = useTranslation();

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

  // Tint the card with a faded wash of the Collection color so the visual
  // tie between this card, its badge on Board cards, and its sidebar entry
  // is obvious at a glance. Selection and drop-over states still win — they
  // need the strong brand-blue highlight to read as "happening right now".
  const tintColor =
    !isSelected && !isOver && collection.color ? collection.color : undefined;
  const useColorTint = Boolean(tintColor);
  const tintStyle = tintColor
    ? {
        backgroundColor: hexToRgba(tintColor, 0.08),
        borderColor: hexToRgba(tintColor, 0.4),
      }
    : undefined;
  // Text takes the Collection color too — full hue when the color is dark
  // enough to read on the faded background, blended toward slate-900 when
  // the color is too light. Subtitle uses the same color at reduced
  // opacity so the visual hierarchy survives the hue shift.
  const textColor = tintColor ? collectionTextColor(tintColor) : undefined;

  return (
    <div
      ref={setRef}
      {...attributes}
      {...listeners}
      className={`relative group rounded-xl border p-4 cursor-grab active:cursor-grabbing transition-all hover:shadow-md ${
        isDragging ? 'opacity-50' : ''
      } ${
        isOver
          ? 'bg-brand-blue-lighter ring-2 ring-brand-blue-primary border-brand-blue-primary'
          : isSelected
            ? 'bg-slate-50 border-brand-blue-primary ring-2 ring-brand-blue-primary/30'
            : useColorTint
              ? ''
              : 'bg-slate-50 border-slate-200'
      }`}
      style={tintStyle}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e);
      }}
    >
      {/* Always-visible selection checkbox — click to toggle without
          navigating into the Collection. dnd-kit's drag listeners are on
          the parent div but the 15px activation threshold means a tap on
          this small target won't accidentally start a drag. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={
          isSelected
            ? t('boardsModal.deselect', { defaultValue: 'Deselect' })
            : t('boardsModal.select', { defaultValue: 'Select' })
        }
        aria-pressed={isSelected}
        className={`absolute top-2 right-2 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition hover:scale-110 motion-reduce:hover:scale-100 shadow-md ring-1 ring-black/10 ${
          isSelected
            ? 'bg-brand-blue-primary border-brand-blue-primary'
            : 'bg-white border-slate-300 hover:border-slate-500'
        }`}
      >
        {isSelected && (
          <svg
            viewBox="0 0 20 20"
            className="w-3.5 h-3.5 text-white fill-current"
          >
            <path d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4L8.5 12.1l6.8-6.8a1 1 0 011.4 0z" />
          </svg>
        )}
      </button>

      <Folder
        className="w-7 h-7 mb-2"
        // When a Collection has a color, fill the folder solid (matching
        // the stroke) so the icon visually anchors the card the same way
        // the badge anchors a Board card. Unstyled (outline-only) when
        // the Collection has no color set.
        style={
          collection.color
            ? { color: collection.color, fill: collection.color }
            : undefined
        }
      />
      <div
        className={`text-sm font-bold truncate mb-1 pr-7 ${textColor ? '' : 'text-slate-800'}`}
        style={textColor ? { color: textColor } : undefined}
      >
        {collection.name}
      </div>
      <div
        className={`text-xxs ${textColor ? '' : 'text-slate-400'}`}
        style={textColor ? { color: textColor, opacity: 0.6 } : undefined}
      >
        {childCollectionsCount > 0 && `${childCollectionsCount} folders · `}
        {childBoardsCount} boards
      </div>
    </div>
  );
};

// Lightweight visual stand-in rendered inside DndContext's <DragOverlay>
// while a Collection is being dragged. Same tint and folder treatment as
// the real card so the drag preview reads as "this Collection" without
// needing any DnD wiring or click handlers attached.
export const CollectionCardDragPreview: React.FC<{
  collection: Collection;
}> = ({ collection }) => {
  const tintColor = collection.color;
  const tintStyle = tintColor
    ? {
        backgroundColor: hexToRgba(tintColor, 0.08),
        borderColor: hexToRgba(tintColor, 0.4),
      }
    : undefined;
  const textColor = tintColor ? collectionTextColor(tintColor) : undefined;
  return (
    <div
      className={`rounded-xl border p-4 shadow-2xl opacity-90 pointer-events-none w-[180px] ${
        tintColor ? '' : 'bg-slate-50 border-slate-200'
      }`}
      style={tintStyle}
    >
      <Folder
        className="w-7 h-7 mb-2"
        style={
          collection.color
            ? { color: collection.color, fill: collection.color }
            : undefined
        }
      />
      <div
        className={`text-sm font-bold truncate ${textColor ? '' : 'text-slate-800'}`}
        style={textColor ? { color: textColor } : undefined}
      >
        {collection.name}
      </div>
    </div>
  );
};
