import React, { useEffect, useRef } from 'react';
import { Star, Pin, GripVertical } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import type { Dashboard } from '@/types';
import { useDashboard } from '@/context/useDashboard';

interface BoardCardProps {
  board: Dashboard;
  isActive: boolean;
  isSelected: boolean;
  isSelectMode: boolean;
  onClick: () => void;
  onLongPress: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const LONG_PRESS_MS = 350;

export const BoardCard: React.FC<BoardCardProps> = ({
  board,
  isActive,
  isSelected,
  isSelectMode,
  onClick,
  onLongPress,
  onContextMenu,
}) => {
  const { unpinBoard, pinBoard } = useDashboard();
  const { t } = useTranslation();
  const longPressTimer = useRef<number | null>(null);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `board:${board.id}`,
  });

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

  // Guarantee the pending long-press timer is cleared if the card
  // unmounts mid-press (e.g. modal closes between pointerdown and
  // the 350ms fire). Without this the callback would run against a
  // stale closure on an unmounted component.
  useEffect(
    () => () => {
      if (longPressTimer.current !== null) {
        window.clearTimeout(longPressTimer.current);
      }
    },
    []
  );

  const widgetCount = board.widgets?.length ?? 0;
  const lastEdited = board.updatedAt
    ? new Date(board.updatedAt).toLocaleDateString()
    : '—';

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      className={`relative group rounded-xl border bg-white p-4 cursor-pointer transition-all hover:shadow-md ${
        isDragging ? 'opacity-50' : ''
      } ${
        isSelected
          ? 'border-brand-blue-primary ring-2 ring-brand-blue-primary/30'
          : isActive
            ? 'border-amber-300'
            : 'border-slate-200'
      }`}
      onClick={() => {
        if (isSelectMode)
          onLongPress(); // toggle selection in select mode
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
      {/* Drag handle (top-right) */}
      <button
        {...listeners}
        aria-label={t('boardsModal.dragToMove', {
          defaultValue: 'Drag to move',
        })}
        className="absolute top-2 right-2 p-1 rounded text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-slate-100 transition cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        data-drag-handle="board"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      {/* Selection checkbox (top-left, visible in select mode) */}
      {isSelectMode && (
        <div
          className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition ${
            isSelected
              ? 'bg-brand-blue-primary border-brand-blue-primary'
              : 'bg-white border-slate-300'
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
        </div>
      )}

      <div className="flex items-start gap-2 mb-2 mt-2">
        {board.isDefault && (
          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
        )}
        {board.isPinned && (
          <Pin className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
        )}
      </div>

      <div className="text-sm font-bold text-slate-800 truncate mb-1">
        {board.name}
      </div>
      <div className="text-xxs text-slate-400">
        {widgetCount} widgets · edited {lastEdited}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          // Action toasts + rolls back on failure; .catch keeps the
          // rethrow from surfacing as an unhandled rejection.
          const op = board.isPinned ? unpinBoard(board.id) : pinBoard(board.id);
          op.catch(() => undefined);
        }}
        aria-label={
          board.isPinned
            ? t('boardsModal.unpin', { defaultValue: 'Unpin' })
            : t('boardsModal.pin', { defaultValue: 'Pin' })
        }
        className="absolute bottom-2 right-2 p-1 rounded text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition"
      >
        <Pin
          className={`w-3.5 h-3.5 ${board.isPinned ? 'fill-amber-500 text-amber-500' : ''}`}
        />
      </button>
    </div>
  );
};
