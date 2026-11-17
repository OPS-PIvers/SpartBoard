// Reprint for a device assignment's printed group copies: pick the group, then its students.

import React, { useState } from 'react';
import { tourTypeAttr } from '@/config/tourAnchors';
import type { PaperBatch, QuizData } from '@/types';
import {
  PaperReprintModal,
  type PaperReprintModalProps,
} from './PaperReprintModal';

/** One printed group's stack, with the quiz version it printed. */
export interface PaperReprintGroup {
  label: string;
  quiz: QuizData;
  batch: PaperBatch;
}

/** Reprint for a device assignment's printed groups: pick the group, then its students. */
export const PaperGroupReprintModal: React.FC<
  Omit<PaperReprintModalProps, 'quiz' | 'batch' | 'header' | 'writtenOnly'> & {
    groups: readonly PaperReprintGroup[];
  }
> = ({ groups, ...rest }) => {
  const [index, setIndex] = useState(0);
  const current = groups[index] ?? groups[0];
  if (!current) return null;
  return (
    <PaperReprintModal
      key={current.batch.id}
      {...rest}
      quiz={current.quiz}
      batch={current.batch}
      header={
        groups.length > 1 ? (
          <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700">
            Group
            <select
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
              {...tourTypeAttr('quiz-reprint.group', 'quiz')}
              className="h-8 w-44 rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-normal text-slate-700 touch:h-11"
            >
              {groups.map((g, i) => (
                <option key={g.batch.id} value={i}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
        ) : undefined
      }
    />
  );
};
