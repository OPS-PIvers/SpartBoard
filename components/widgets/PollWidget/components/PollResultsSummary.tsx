import React from 'react';
import { CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PollQuestionSummary } from '@/utils/pollResults';

const MAX_TEXTS_SHOWN = 5;

/** Every question's results in one list: counts, percent, average and typed answers. */
export const PollResultsSummary: React.FC<{
  summaries: PollQuestionSummary[];
}> = ({ summaries }) => {
  const { t } = useTranslation();
  return (
    <ol
      data-testid="poll-results-summary"
      className="divide-y divide-slate-100 border-y border-slate-100"
    >
      {summaries.map((s, qi) => (
        <li key={qi} className="py-2.5 space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 text-xs font-bold text-slate-700 wrap-anywhere">
              {qi + 1}. {s.question}
            </p>
            <span className="shrink-0 text-xxs font-bold text-slate-500 tabular-nums">
              {t('widgetSettings.poll.answeredCount', { count: s.answered })}
            </span>
          </div>
          {s.options.length > 0 && (
            <ul className="space-y-0.5">
              {s.options.map((o, oi) => (
                <li
                  key={oi}
                  className="flex items-baseline justify-between gap-3 text-xs text-slate-600"
                >
                  <span className="min-w-0 flex items-center gap-1 wrap-anywhere">
                    {o.label}
                    {o.correct && (
                      <CircleCheck
                        className="w-3 h-3 shrink-0 text-emerald-600"
                        aria-label={t('widgetSettings.poll.correctAnswer')}
                      />
                    )}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">
                    {o.count} · {o.percent}%
                  </span>
                </li>
              ))}
            </ul>
          )}
          {s.average !== null && (
            <p className="text-xs font-bold text-slate-600 tabular-nums">
              {t('widgetSettings.poll.averageValue', {
                value: s.average.toFixed(1),
              })}
            </p>
          )}
          {s.texts.length > 0 && (
            <ul className="space-y-0.5">
              {s.texts.slice(0, MAX_TEXTS_SHOWN).map((x, xi) => (
                <li
                  key={xi}
                  className="flex items-baseline justify-between gap-3 text-xs text-slate-600"
                >
                  <span className="min-w-0 wrap-anywhere">{x.text}</span>
                  {x.count > 1 && (
                    <span className="shrink-0 font-mono tabular-nums">
                      {x.count}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
};
