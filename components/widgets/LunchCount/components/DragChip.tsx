import React from 'react';

interface DragChipProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  isDragging: boolean;
}

export const DragChip: React.FC<DragChipProps> = ({
  name,
  isDragging,
  className,
  ...props
}) => (
  <div
    role="button"
    tabIndex={0}
    data-no-drag="true"
    {...props}
    className={`${className} ${isDragging ? 'opacity-50 grayscale cursor-grabbing' : 'cursor-grab'} touch-none select-none`}
  >
    {name}
  </div>
);
