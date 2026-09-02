import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';

interface DraggableCardProps {
  id: string;
  disabled?: boolean;
  children: React.ReactNode;
}

/** Wraps a card so a teacher can drag it between columns or table cells. */
export const DraggableCard: React.FC<DraggableCardProps> = ({
  id,
  disabled,
  children,
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? 'opacity-50' : undefined}
      {...attributes}
      {...listeners}
    >
      {children}
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
