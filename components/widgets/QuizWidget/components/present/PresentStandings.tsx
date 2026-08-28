import React from 'react';
import { QuizLeaderboardEntry } from '@/types';

interface PresentStandingsProps {
  entries: QuizLeaderboardEntry[];
  /** Teacher opt-in, off by default — scores alone identify nobody. */
  showNames: boolean;
  /** Points when gamification is on, percent otherwise. */
  unit: 'pts' | '%';
  limit?: number;
  heading?: string;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

/** Projector shows first names only — a full roster name is more exposure. */
const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

export const PresentStandings: React.FC<PresentStandingsProps> = ({
  entries,
  showNames,
  unit,
  limit = 3,
  heading = 'Standings',
}) => {
  const rows = entries.slice(0, limit);
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col items-center" style={{ gap: '1.2vh' }}>
      <p
        className="font-sans uppercase tracking-widest text-white/50"
        style={{ fontSize: 'clamp(0.7rem, 1.2vw, 1.1rem)' }}
      >
        {heading}
      </p>
      {rows.map((entry, i) => (
        <p
          key={`${entry.studentUid ?? entry.pin ?? entry.rank}`}
          className="font-sans font-semibold tabular-nums text-white"
          style={{ fontSize: 'clamp(1.1rem, 2.6vw, 2.4rem)' }}
        >
          {ORDINALS[i] ?? `${entry.rank}th`}
          {showNames && entry.name ? ` · ${firstName(entry.name)}` : ''} —{' '}
          {entry.score}
          {unit === 'pts' ? ' pts' : '%'}
        </p>
      ))}
    </div>
  );
};
