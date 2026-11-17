// Reprint for a device assignment's printed group copies: pick whole groups or single students.

import React from 'react';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { ClassRoster, PaperBatch, QuizData } from '@/types';
import type { printPaperSheets } from '@/utils/paperSheetPrint';
import type { PrintedTranslation } from '@/utils/paperPrintedVersions';
import { PaperStacksReprintDialog, ReprintCheckRow } from './PaperReprintModal';

/** One printed group's stack, with the quiz version it printed. */
export interface PaperReprintGroup {
  label: string;
  quiz: QuizData;
  batch: PaperBatch;
  translation?: PrintedTranslation;
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
                  <ReprintCheckRow
                    key={g.batch.id}
                    label={g.label}
                    detail={
                      keys.length === 1
                        ? '1 student'
                        : `${keys.length} students`
                    }
                    strong
                    checked={all}
                    onToggle={() => {
                      const next = new Set(picked);
                      for (const k of keys)
                        if (all) next.delete(k);
                        else next.add(k);
                      setPicked(next);
                    }}
                    anchor={tourFieldAttr(
                      'quiz-reprint.group',
                      'quiz',
                      String(i + 1)
                    )}
                  />
                );
              })}
            </div>
          )
        : undefined
    }
  />
);
