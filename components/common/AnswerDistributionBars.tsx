import React from 'react';
import { Check } from 'lucide-react';

export interface DistributionBarRow {
  /** Defaults to the label. */
  key?: string;
  label: string;
  count: number;
  isCorrect: boolean;
  /** Drawn in gray, as for a catch-all bucket. */
  muted?: boolean;
}

interface AnswerDistributionBarsProps {
  rows: readonly DistributionBarRow[];
  /** Denominator for bar widths. */
  total: number;
  /** Marks rows whose isCorrect is set. */
  showCorrect: boolean;
  /** Visible text beside a correct row, so correctness is not shown by colour alone. */
  correctLabel?: string;
  labelSize?: string;
  countSize?: string;
  barHeight?: string;
  gap?: string;
}

/** Labelled horizontal bars for an answer distribution (Quiz monitor, VA live board). */
export const AnswerDistributionBars: React.FC<AnswerDistributionBarsProps> = ({
  rows,
  total,
  showCorrect,
  correctLabel,
  labelSize = 'min(12px, 4cqmin)',
  countSize = 'min(11px, 3.8cqmin)',
  barHeight = 'min(8px, 2cqmin)',
  gap = 'min(6px, 1.5cqmin)',
}) => (
  <div className="flex flex-col" style={{ gap }}>
    {rows.map((row) => {
      const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
      const correct = showCorrect && row.isCorrect;
      return (
        <div key={row.key ?? row.label} data-testid="answer-distribution-row">
          <div
            className="flex items-center justify-between"
            style={{
              gap: 'min(8px, 2cqmin)',
              marginBottom: 'min(2px, 0.5cqmin)',
            }}
          >
            <span
              className={`font-sans truncate inline-flex items-center ${
                correct
                  ? 'text-emerald-700 font-semibold'
                  : 'text-brand-gray-dark'
              }`}
              style={{ fontSize: labelSize, gap: 'min(4px, 1cqmin)' }}
            >
              {correct && (
                <Check
                  aria-label="Correct answer"
                  className="shrink-0"
                  style={{ width: labelSize, height: labelSize }}
                />
              )}
              <span className="truncate">{row.label}</span>
              {correct && correctLabel && (
                <span className="shrink-0 font-bold uppercase tracking-wide">
                  {correctLabel}
                </span>
              )}
            </span>
            <span
              className="text-brand-gray-primary tabular-nums shrink-0"
              style={{ fontSize: countSize }}
              data-testid="answer-distribution-count"
            >
              {row.count}
            </span>
          </div>
          <div
            className="bg-brand-gray-lightest rounded-full overflow-hidden"
            style={{ height: barHeight }}
          >
            <div
              className={`h-full rounded-full ${
                correct
                  ? 'bg-emerald-500'
                  : row.muted
                    ? 'bg-slate-300'
                    : 'bg-brand-blue-light'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    })}
  </div>
);
