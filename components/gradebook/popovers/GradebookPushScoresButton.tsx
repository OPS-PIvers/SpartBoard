import React, { useState } from 'react';
import { useGradebookLmsPush } from '@/hooks/useGradebookLmsPush';
import { Btn } from './popoverParts';
import type { GradebookCellData, GradebookColumnRef } from './types';

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
    <Btn
      className="px-2"
      disabled={pushing}
      title={`Send final scores to ${lms}`}
      aria-label={`Push final scores to ${lms}`}
      onClick={() => {
        setPushing(true);
        void push()
          .then((outcome) => outcome && onNotify?.(outcome.message))
          .finally(() => setPushing(false));
      }}
    >
      {pushing ? 'Pushing…' : 'Push'}
    </Btn>
  );
};
