import React from 'react';
import { QuizLeaderboardEntry } from '@/types';
import { PresentStandings } from './PresentStandings';

interface PresentSelfPacedProps {
  counts: { notStarted: number; inProgress: number; done: number };
  total: number;
  standings: QuizLeaderboardEntry[];
  showNames: boolean;
  /** Live standings only make sense while points are actually in play. */
  isGamified: boolean;
  unit: 'pts' | '%';
}

export const PresentSelfPaced: React.FC<PresentSelfPacedProps> = ({
  counts,
  total,
  standings,
  showNames,
  isGamified,
  unit,
}) => {
  const pct = total > 0 ? Math.round((counts.done / total) * 100) : 0;
  return (
    <>
      <p
        className="font-sans font-bold text-white tabular-nums leading-none"
        style={{ fontSize: 'clamp(2.5rem, 11vw, 9rem)' }}
      >
        {counts.done} of {total}
      </p>
      <p
        className="font-sans uppercase tracking-widest text-brand-blue-lighter"
        style={{ fontSize: 'clamp(0.9rem, 2vw, 1.8rem)' }}
      >
        finished
      </p>
      <div
        className="w-[70vw] bg-white/15 rounded-full overflow-hidden"
        style={{ height: '2.4vh' }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Class progress"
      >
        <div
          className="h-full bg-emerald-400 rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p
        className="font-sans text-white/70 tabular-nums"
        style={{ fontSize: 'clamp(1rem, 2.2vw, 2rem)' }}
      >
        {counts.inProgress} working · {counts.notStarted} not started
      </p>
      {isGamified && (
        <PresentStandings
          entries={standings}
          showNames={showNames}
          unit={unit}
        />
      )}
    </>
  );
};
