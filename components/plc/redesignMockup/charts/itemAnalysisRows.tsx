// Row models for the item-analysis bars: correct, the most common wrong answer, the rest.

import React from 'react';
import { RotateCcw } from 'lucide-react';
import type { ItemAnalysisQuestion } from '@/utils/plcDataOverview';
import type { BarRow } from './BarRows';
import { ANSWER_BG } from './chartTokens';

export const ITEM_LEGEND = [
  { label: 'Correct', swatch: ANSWER_BG.correct },
  { label: 'Most common wrong answer', swatch: ANSWER_BG.wrong },
  { label: 'Other wrong answers', swatch: ANSWER_BG.rest },
];

export function itemAnalysisRows(
  questions: ItemAnalysisQuestion[],
  options: {
    flagReteach: boolean;
    breakAfterReteach: boolean;
    targetOf?: Record<string, string>;
  }
): BarRow[] {
  return questions.map((q, i) => {
    const correct = q.correctPercent ?? 0;
    const wrong = q.dominantWrong?.percent ?? 0;
    const rest = Math.max(0, 100 - correct - wrong);
    const target = options.targetOf?.[q.questionId];
    const prev = questions[i - 1];
    return {
      key: q.questionId,
      breakBefore:
        options.breakAfterReteach && !!prev && prev.reteach && !q.reteach,
      label: (
        <span className="flex min-w-0 items-center gap-2">
          <span className="w-7 shrink-0 font-bold tabular-nums text-slate-800">
            Q{q.number}
          </span>
          <span className="truncate" title={q.text}>
            {q.text}
          </span>
          {options.flagReteach && q.reteach && (
            <span className="inline-flex shrink-0 items-center gap-1 text-xxs font-bold uppercase tracking-wider text-brand-red-primary">
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Reteach
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
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="w-9 shrink-0 text-right text-sm font-bold tabular-nums text-slate-800">
            {correct}%
          </span>
          {q.dominantWrong && (
            <span className="truncate" title={q.dominantWrong.label}>
              Most chose {q.dominantWrong.label}, {wrong}%
            </span>
          )}
        </span>
      ),
      ariaLabel: `Question ${q.number}, ${correct} percent correct${
        q.dominantWrong
          ? `, most common wrong answer ${q.dominantWrong.label} at ${wrong} percent`
          : ''
      }`,
      tip: {
        heading: `Q${q.number} · ${q.text}`,
        rows: [
          {
            value: `${correct}%`,
            label: `correct (${Math.round((correct / 100) * q.answered)} of ${q.answered})`,
            swatch: ANSWER_BG.correct,
          },
          ...(q.dominantWrong
            ? [
                {
                  value: `${wrong}%`,
                  label: `chose ${q.dominantWrong.label}`,
                  swatch: ANSWER_BG.wrong,
                },
              ]
            : []),
          {
            value: `${rest}%`,
            label: 'other wrong answers',
            swatch: ANSWER_BG.rest,
          },
          ...(target ? [{ value: target, label: 'learning target' }] : []),
        ],
      },
    };
  });
}
