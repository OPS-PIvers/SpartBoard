import React from 'react';
import { scoreColorClasses } from '@/utils/scoreColor';

interface ScorePillProps {
  /** 0–100 percentage; ignored when display is 'count' or 'hidden'. */
  score: number;
  display: 'percent' | 'count' | 'hidden';
  /** Answered count, used when display is 'count'. */
  count?: number;
  /** Total questions, used when display is 'count'. */
  total?: number;
  /** Gamified sessions show raw points in brand-blue rather than a graded color. */
  gamified?: boolean;
  /** Raw points to show when gamified. */
  points?: number;
  /** Optional unit suffix appended to the value (e.g. ' pts' for gamified points). */
  suffix?: string;
}

/**
 * Score chip colored via the unified scoreColor helper. Supports the three
 * teacher score-display modes (percent / raw count / hidden) plus the gamified
 * points variant used by the live scoreboard.
 */
export const ScorePill: React.FC<ScorePillProps> = ({
  score,
  display,
  count,
  total,
  gamified = false,
  points,
  suffix,
}) => {
  if (display === 'hidden') return null;
  const colorClass = gamified
    ? 'text-brand-blue-dark'
    : display === 'count'
      ? 'text-slate-600'
      : scoreColorClasses(score).text;
  let text: string;
  if (gamified) text = `${points ?? 0}`;
  else if (display === 'count') text = `${count ?? 0}/${total ?? 0}`;
  else text = `${Number.isFinite(score) ? Math.round(score) : 0}%`;
  if (suffix) text += suffix;
  return (
    <span
      data-testid="score-pill"
      className={`font-black tabular-nums shrink-0 ${colorClass}`}
      style={{ fontSize: 'min(14px, 4.5cqmin)' }}
    >
      {text}
    </span>
  );
};
