// Reprint for a device assignment's printed group copies: pick whole groups or single students.

import React from 'react';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { ClassRoster, PaperBatch, QuizData } from '@/types';
import type { printPaperSheets } from '@/utils/paperSheetPrint';
import { PaperStacksReprintDialog } from './PaperReprintModal';

/** One printed group's stack, with the quiz version it printed. */
export interface PaperReprintGroup {
  label: string;
  quiz: QuizData;
  batch: PaperBatch;
}

export const PaperGroupReprintModal: React.FC<{
  groups: readonly PaperReprintGroup[];
  rosters: ClassRoster[];
  onClose: () => void;
  onError: (message: string) => void;
  print?: typeof printPaperSheets;
}> = ({ groups, ...rest }) => (
  <PaperStacksReprintDialog
    stacks={groups}
    {...rest}
    header={
      groups.length > 1
        ? ({ picked, setPicked, keysOf }) => (
            <div className="py-2">
              {groups.map((g, i) => {
                const keys = keysOf(i);
                if (keys.length === 0) return null;
                const all = keys.every((k) => picked.has(k));
                return (
                  <label
                    key={g.batch.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={all}
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            !all && keys.some((k) => picked.has(k));
                      }}
                      onChange={() => {
                        const next = new Set(picked);
                        for (const k of keys)
                          if (all) next.delete(k);
                          else next.add(k);
                        setPicked(next);
                      }}
                      {...tourFieldAttr(
                        'quiz-reprint.group',
                        'quiz',
                        String(i + 1)
                      )}
                      className="h-4 w-4 rounded-sm border-slate-300"
                    />
                    <span className="truncate">{g.label}</span>
                    <span className="ml-auto shrink-0 text-xs font-normal text-slate-500">
                      {keys.length === 1
                        ? '1 student'
                        : `${keys.length} students`}
                    </span>
                  </label>
                );
              })}
            </div>
          )
        : undefined
    }
  />
);
