import React from 'react';
import type { DropMode } from './dropIndicator';

interface DropInsertionBarProps {
  mode: DropMode | null;
  /** Grid cards flow horizontally; tree rows stack vertically. */
  orientation: 'horizontal' | 'vertical';
}

/** Insertion line drawn in the gap before/after a drop target. */
export const DropInsertionBar: React.FC<DropInsertionBarProps> = ({
  mode,
  orientation,
}) => {
  if (mode !== 'before' && mode !== 'after') return null;
  const placement =
    orientation === 'horizontal'
      ? `top-1 bottom-1 w-1 ${mode === 'before' ? '-left-2' : '-right-2'}`
      : `left-1 right-1 h-0.5 ${mode === 'before' ? '-top-px' : '-bottom-px'}`;
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute z-20 rounded-full bg-brand-blue-primary ${placement}`}
    />
  );
};
