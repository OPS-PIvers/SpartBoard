// Compact item analysis for a note Data block; wraps long question and answer text instead of cutting it.

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ItemAnalysisQuestion } from '@/utils/plcDataOverview';
import { BarRows } from '@/components/plc/redesignMockup/charts/BarRows';
import { itemAnalysisRows } from '@/components/plc/redesignMockup/charts/itemAnalysisRows';

export const NoteItemAnalysisChart: React.FC<{
  questions: ItemAnalysisQuestion[];
}> = ({ questions }) => {
  const { t } = useTranslation();
  const rows = itemAnalysisRows(questions, {
    flagReteach: false,
    breakAfterReteach: false,
  }).map((row, i) => {
    const q = questions[i];
    const correct = q.correctPercent ?? 0;
    return {
      ...row,
      label: (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="w-7 shrink-0 font-bold tabular-nums text-slate-800">
            Q{q.number}
          </span>
          <span className="min-w-0 break-words leading-snug">{q.text}</span>
        </span>
      ),
      value: (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="w-9 shrink-0 text-right text-sm font-bold tabular-nums text-slate-800">
            {correct}%
          </span>
          {q.dominantWrong && (
            <span className="min-w-0 break-words leading-snug">
              {t('teams.notes.data.mostChose', {
                defaultValue: 'Most chose {{answer}}, {{pct}}%',
                answer: q.dominantWrong.label,
                pct: q.dominantWrong.percent,
              })}
            </span>
          )}
        </span>
      ),
    };
  });
  return (
    <BarRows
      rows={rows}
      columns="grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,14rem)]"
    />
  );
};
