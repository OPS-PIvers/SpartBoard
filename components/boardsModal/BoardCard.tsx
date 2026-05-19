import React from 'react';
import { Star, Pin, Folder, Copy, Share2 } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import type { Dashboard } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { hexToRgba, pickReadableForeground } from '@/utils/collectionColor';
import { BoardThumbnail } from './BoardThumbnail';

interface BoardCardProps {
  board: Dashboard;
  isSelected: boolean;
  // Set when the card is rendered inside the "All Boards" view and the
  // Board lives in a Collection. Renders a small folder-icon + name badge
  // so the user can see at a glance which Collection each Board belongs to.
  // null when in a Collection-scoped view (every Board there shares the
  // header Collection already) or when the Board is at root.
  collectionBadge?: { name: string; color?: string } | null;
  canShare: boolean;
  onClick: () => void;
  onToggleSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDuplicate: () => void;
  onShare: () => void;
}

export const BoardCard: React.FC<BoardCardProps> = ({
  board,
  isSelected,
  collectionBadge,
  canShare,
  onClick,
  onToggleSelect,
  onContextMenu,
  onDuplicate,
  onShare,
}) => {
  const { unpinBoard, pinBoard } = useDashboard();
  const { t } = useTranslation();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `board:${board.id}`,
  });

  const widgetCount = board.widgets?.length ?? 0;
  const lastEdited = board.updatedAt
    ? new Date(board.updatedAt).toLocaleDateString()
    : '—';

  // Border accent for boards that live in a Collection — visually ties
  // the card to its parent. Multi-select still wins outright (deliberate
  // in-modal user action). Active state intentionally has no border
  // treatment — the active board is implicit context the user already has.
  const borderColor =
    !isSelected && collectionBadge?.color ? collectionBadge.color : undefined;
  const useCollectionBorder = Boolean(borderColor);
  const borderStyle = borderColor
    ? { borderColor: hexToRgba(borderColor, 0.6) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`relative group rounded-xl border bg-white p-4 cursor-grab active:cursor-grabbing transition-all hover:shadow-md ${
        isDragging ? 'opacity-50' : ''
      } ${
        isSelected
          ? 'border-brand-blue-primary ring-2 ring-brand-blue-primary/30'
          : useCollectionBorder
            ? ''
            : 'border-slate-200'
      }`}
      style={borderStyle}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e);
      }}
    >
      {/* Always-visible selection checkbox — click to toggle without
          opening the board. dnd-kit's drag listeners are on the parent
          div but the 15px activation threshold means a tap on this
          small target won't accidentally start a drag. */}
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

      <BoardThumbnail
        widgets={board.widgets ?? []}
        background={board.background}
        className="mb-3"
      />

      <div className="flex items-start gap-2 mb-1">
        {board.isDefault && (
          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
        )}
        {board.isPinned && (
          <Pin className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
        )}
        <div className="text-sm font-bold text-slate-800 truncate pr-7 flex-1">
          {board.name}
        </div>
      </div>
      {/* Reserve right-side runway for the absolute-positioned action row
          below. Without this padding the metadata + collection badge run
          under the Share/Duplicate/Pin icons on narrower cards. */}
      <div className="text-xxs text-slate-400 mb-1 pr-20">
        {widgetCount} widgets · edited {lastEdited}
      </div>
      {collectionBadge &&
        (collectionBadge.color ? (
          <div className="pr-20">
            <div
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xxs font-bold max-w-full"
              style={{
                backgroundColor: collectionBadge.color,
                color: pickReadableForeground(collectionBadge.color),
              }}
            >
              <Folder className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="truncate">{collectionBadge.name}</span>
            </div>
          </div>
        ) : (
          <div className="pr-20">
            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-xxs text-slate-600 max-w-full">
              <Folder className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="truncate">{collectionBadge.name}</span>
            </div>
          </div>
        ))}

      {/* Always-visible action row — touch-discoverable surface for the
          actions teachers need at-a-glance (share, duplicate, pin).
          Right-click context menu still lists these too. Each button stops
          propagation on click + pointerdown so it doesn't trigger card-open
          or dnd-kit drag-start. */}
      <div className="absolute bottom-2 right-2 flex items-center gap-0.5">
        {canShare && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShare();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={t('boardsModal.share', { defaultValue: 'Share' })}
            className="p-1 rounded text-slate-300 hover:text-brand-blue-primary hover:bg-brand-blue-lighter transition"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={t('boardsModal.duplicate', { defaultValue: 'Duplicate' })}
          className="p-1 rounded text-slate-300 hover:text-slate-700 hover:bg-slate-100 transition"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            // Action toasts + rolls back on failure; .catch keeps the
            // rethrow from surfacing as an unhandled rejection.
            const op = board.isPinned
              ? unpinBoard(board.id)
              : pinBoard(board.id);
            op.catch(() => undefined);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={
            board.isPinned
              ? t('boardsModal.unpin', { defaultValue: 'Unpin' })
              : t('boardsModal.pin', { defaultValue: 'Pin' })
          }
          className="p-1 rounded text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition"
        >
          <Pin
            className={`w-3.5 h-3.5 ${board.isPinned ? 'fill-amber-500 text-amber-500' : ''}`}
          />
        </button>
      </div>
    </div>
  );
};

// Lightweight visual stand-in rendered inside DndContext's <DragOverlay>
// while a Board is being dragged. Mirrors the real card's silhouette
// (border + name + optional Collection badge) without any DnD wiring,
// click handlers, or buttons — those would be inert and confusing here.
export const BoardCardDragPreview: React.FC<{
  board: Dashboard;
  collectionBadge?: { name: string; color?: string } | null;
}> = ({ board, collectionBadge }) => {
  const widgetCount = board.widgets?.length ?? 0;
  const borderColor = collectionBadge?.color;
  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-2xl opacity-90 pointer-events-none w-[220px] ${
        borderColor ? '' : 'border-slate-200'
      }`}
      style={
        borderColor ? { borderColor: hexToRgba(borderColor, 0.6) } : undefined
      }
    >
      <div className="text-sm font-bold text-slate-800 truncate mb-1">
        {board.name}
      </div>
      <div className="text-xxs text-slate-400 mb-1">{widgetCount} widgets</div>
      {collectionBadge &&
        (collectionBadge.color ? (
          <div
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xxs font-bold max-w-full"
            style={{
              backgroundColor: collectionBadge.color,
              color: pickReadableForeground(collectionBadge.color),
            }}
          >
            <Folder className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="truncate">{collectionBadge.name}</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-xxs text-slate-600 max-w-full">
            <Folder className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="truncate">{collectionBadge.name}</span>
          </div>
        ))}
    </div>
  );
};
