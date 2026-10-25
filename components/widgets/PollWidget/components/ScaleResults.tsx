import React from 'react';
import type { PollOption } from '@/types';

interface ScaleResultsProps {
  options: PollOption[];
  hidden: boolean;
  low?: string;
  high?: string;
  fontFamily: string;
  barColor: string;
  disabled: boolean;
  onVote: (index: number) => void;
}

/** A rating scale question on the board: one column per number, lowest to highest. */
export const ScaleResults: React.FC<ScaleResultsProps> = ({
  options,
  hidden,
  low,
  high,
  fontFamily,
  barColor,
  disabled,
  onVote,
}) => {
  const max = Math.max(1, ...options.map((o) => o.votes));
  return (
    <div
      data-testid="poll-scale-results"
      className={`flex-1 flex flex-col font-${fontFamily}`}
      style={{ gap: 'min(6px, 1.5cqmin)' }}
    >
      <div
        className="flex-1 flex items-stretch"
        style={{ gap: 'min(8px, 1.5cqmin)' }}
      >
        {options.map((o, i) => (
          <button // no-tour-anchor: scale columns are tallies, tours point at the question
            key={o.id ?? i}
            type="button"
            onClick={() => onVote(i)}
            disabled={disabled}
            aria-label={hidden ? o.label : `${o.label}: ${o.votes}`}
            className="flex-1 min-w-0 flex flex-col items-center text-slate-600"
            style={{ gap: 'min(4px, 1cqmin)' }}
          >
            {!hidden && (
              <span
                className="shrink-0 font-mono font-bold tabular-nums"
                style={{ fontSize: 'min(14px, 4.5cqmin)' }}
              >
                {o.votes}
              </span>
            )}
            <div
              className="w-full flex-1 flex items-end bg-slate-100 rounded-md overflow-hidden border border-slate-200/50"
              style={{ minHeight: 'min(32px, 9cqmin)' }}
            >
              <div
                className={`w-full transition-all duration-500 motion-reduce:transition-none ${barColor}`}
                style={{ height: hidden ? '0%' : `${(o.votes / max) * 100}%` }}
              />
            </div>
            <span
              className="shrink-0 font-black tabular-nums"
              style={{ fontSize: 'min(16px, 5.5cqmin)' }}
            >
              {o.label}
            </span>
          </button>
        ))}
      </div>
      {(!!low || !!high) && (
        <div
          className="shrink-0 flex justify-between font-bold uppercase tracking-wider text-slate-500"
          style={{ fontSize: 'min(12px, 4cqmin)', gap: 'min(16px, 3cqmin)' }}
        >
          <span className="min-w-0 [overflow-wrap:anywhere]">{low}</span>
          <span className="min-w-0 text-right [overflow-wrap:anywhere]">
            {high}
          </span>
        </div>
      )}
    </div>
  );
};
