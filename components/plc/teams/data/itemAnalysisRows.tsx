// Item-analysis bar rows like the mock kit's, but question and answer text wrap instead of truncating.

import React from 'react';
import type { TFunction } from 'i18next';
import { RotateCcw } from 'lucide-react';
import type { ItemAnalysisQuestion } from '@/utils/plcDataOverview';
import type { BarRow } from '@/components/plc/redesignMockup/charts/BarRows';
import { ANSWER_BG } from '@/components/plc/redesignMockup/charts/chartTokens';

export const ITEM_COLUMNS =
  'grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,15rem)]';

export function itemLegend(t: TFunction) {
  return [
    {
      label: t('plcDataOverview.legend.correct', { defaultValue: 'Correct' }),
      swatch: ANSWER_BG.correct,
    },
    {
      label: t('plcDataOverview.legend.wrong', {
        defaultValue: 'Most common wrong answer',
      }),
      swatch: ANSWER_BG.wrong,
    },
    {
      label: t('plcDataOverview.legend.rest', {
        defaultValue: 'Other wrong answers',
      }),
      swatch: ANSWER_BG.rest,
    },
  ];
}

export function buildItemRows(
  t: TFunction,
  questions: ItemAnalysisQuestion[],
  options: { breakAfterReteach: boolean; targetOf?: Record<string, string> }
): BarRow[] {
  return questions.map((q, i) => {
    const correct = q.correctPercent ?? 0;
    const wrong = q.dominantWrong?.percent ?? 0;
    const rest = Math.max(0, 100 - correct - wrong);
    const target = options.targetOf?.[q.questionId];
    const prev = questions[i - 1];
    const chose = q.dominantWrong
      ? t('plcDataOverview.mostChose', {
          answer: q.dominantWrong.label,
          percent: wrong,
          defaultValue: 'Most chose {{answer}}, {{percent}}%',
        })
      : '';
    return {
      key: q.questionId,
      breakBefore:
        options.breakAfterReteach && !!prev && prev.reteach && !q.reteach,
      label: (
        <span className="flex min-w-0 items-start gap-2 py-1.5">
          <span className="w-7 shrink-0 font-bold tabular-nums text-slate-800">
            Q{q.number}
          </span>
          <span className="min-w-0 break-words">{q.text}</span>
          {q.reteach && (
            <span className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-xxs font-bold uppercase tracking-wider text-brand-red-primary">
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              {t('plcDataOverview.reteach', { defaultValue: 'Reteach' })}
            </span>
          )}
        </span>
      ),
      segments: [
        { value: correct, bg: ANSWER_BG.correct },
        { value: wrong, bg: ANSWER_BG.wrong },
        { value: rest, bg: ANSWER_BG.rest },
      ],
      value: (
        <span className="flex min-w-0 items-baseline gap-2 py-1.5">
          <span className="w-9 shrink-0 text-right text-sm font-bold tabular-nums text-slate-800">
            {q.correctPercent === null ? '' : `${correct}%`}
          </span>
          {chose && <span className="min-w-0 break-words">{chose}</span>}
        </span>
      ),
      ariaLabel: `Q${q.number}, ${correct}%${chose ? `, ${chose}` : ''}`,
      tip: {
        heading: `Q${q.number} · ${q.text}`,
        rows: [
          {
            value: `${correct}%`,
            label: t('plcDataOverview.tip.correct', {
              count: Math.round((correct / 100) * q.answered),
              total: q.answered,
              defaultValue: 'correct ({{count}} of {{total}})',
            }),
            swatch: ANSWER_BG.correct,
          },
          ...(q.dominantWrong
            ? [
                {
                  value: `${wrong}%`,
                  label: t('plcDataOverview.tip.chose', {
                    answer: q.dominantWrong.label,
                    defaultValue: 'chose {{answer}}',
                  }),
                  swatch: ANSWER_BG.wrong,
                },
              ]
            : []),
          {
            value: `${rest}%`,
            label: t('plcDataOverview.tip.rest', {
              defaultValue: 'other wrong answers',
            }),
            swatch: ANSWER_BG.rest,
          },
          ...(target
            ? [
                {
                  value: target,
                  label: t('plcDataOverview.tip.target', {
                    defaultValue: 'learning target',
                  }),
                },
              ]
            : []),
        ],
      },
    };
  });
}
