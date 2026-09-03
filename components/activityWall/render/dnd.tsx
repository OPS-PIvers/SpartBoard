import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';

// Static (non-absolute) so it sits in its own gutter column and never overlaps card text.
const gripClass =
  'flex shrink-0 cursor-grab items-start rounded p-1 text-slate-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60';

type DraggableBindings = ReturnType<typeof useDraggable>;

interface DragHandleProps {
  attributes: DraggableBindings['attributes'];
  listeners: DraggableBindings['listeners'];
  size: string;
}

/** Dedicated grip so the card's own buttons stay clickable and focusable. */
export const DragHandle: React.FC<DragHandleProps> = ({
  attributes,
  listeners,
  size,
}) => (
  <button
    type="button"
    aria-label="Drag to move"
    className={gripClass}
    {...attributes}
    {...listeners}
  >
    <GripVertical aria-hidden="true" style={{ width: size, height: size }} />
  </button>
);

interface DraggableCardProps {
  id: string;
  disabled?: boolean;
  handleSize: string;
  children: React.ReactNode;
}

/** Wraps a card so a teacher can drag it between columns or table cells. */
export const DraggableCard: React.FC<DraggableCardProps> = ({
  id,
  disabled,
  handleSize,
  children,
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-start ${isDragging ? 'opacity-50' : ''}`}
      style={{ gap: '4px' }}
    >
      {!disabled && (
        <DragHandle
          attributes={attributes}
          listeners={listeners}
          size={handleSize}
        />
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};

interface DropZoneProps {
  id: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/** A column or table cell that accepts dragged cards. */
export const DropZone: React.FC<DropZoneProps> = ({
  id,
  disabled,
  className,
  style,
  children,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      data-testid={`aw-dropzone-${id}`}
      className={`${className ?? ''} ${isOver ? 'ring-2 ring-white/60' : ''}`}
      style={style}
    >
      {children}
    </div>
  );
};
