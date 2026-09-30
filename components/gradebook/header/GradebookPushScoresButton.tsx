import React, { useState } from 'react';
import { useGradebookLmsPush } from '@/hooks/useGradebookLmsPush';
import type { GradebookCellData, GradebookColumnRef } from '../slotTypes';

/** D22 Push for the header popover's `pushControl` slot; renders nothing when the column has no LMS link. */
export const GradebookPushScoresButton: React.FC<{
  column: GradebookColumnRef;
  columnCells: GradebookCellData[];
  onNotify?: (message: string) => void;
}> = ({ column, columnCells, onNotify }) => {
  const { link, push } = useGradebookLmsPush(column, columnCells);
  const [pushing, setPushing] = useState(false);
  if (!link) return null;
  const lms = link.lms === 'classroom' ? 'Google Classroom' : 'Schoology';
  return (
    <button
      type="button"
      disabled={pushing}
      title={`Send final scores to ${lms}`}
      aria-label={`Push final scores to ${lms}`}
      onClick={() => {
        setPushing(true);
        void push()
          .then((outcome) => outcome && onNotify?.(outcome.message))
          .finally(() => setPushing(false));
      }}
      className="inline-flex h-[34px] items-center justify-center whitespace-nowrap rounded-lg border border-slate-300 bg-white px-2 text-[13px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary disabled:pointer-events-none disabled:opacity-50"
    >
      {pushing ? 'Pushing…' : 'Push'}
    </button>
  );
};
