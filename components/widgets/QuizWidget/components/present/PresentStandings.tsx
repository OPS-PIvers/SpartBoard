import React from 'react';
import { QuizLeaderboardEntry } from '@/types';
import { rankOrdinal } from '@/utils/reviewLaunch';

interface PresentStandingsProps {
  entries: QuizLeaderboardEntry[];
  /** Teacher opt-in, off by default — scores alone identify nobody. */
  showNames: boolean;
  /** Points when gamification is on, percent otherwise. */
  unit: 'pts' | '%';
  limit?: number;
  heading?: string;
}

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
  // A long Review ranking wraps into columns so it fits the projector.
  const dense = rows.length > 5;
  const columns = Math.min(4, Math.ceil(rows.length / 8));
  return (
    <div className="flex flex-col items-center" style={{ gap: '1.2vh' }}>
      <p
        className="font-sans uppercase tracking-widest text-white/50"
        style={{ fontSize: 'clamp(0.7rem, 1.2vw, 1.1rem)' }}
      >
        {heading}
      </p>
      <div
        className={dense ? 'grid text-left' : 'contents'}
        style={
          dense
            ? {
                gridAutoFlow: 'column',
                gridTemplateRows: `repeat(${Math.ceil(rows.length / columns)}, auto)`,
                columnGap: '4vw',
                rowGap: '0.6vh',
              }
            : undefined
        }
      >
        {rows.map((entry, i) => (
          <p
            key={`${entry.studentUid ?? entry.pin ?? entry.rank}`}
            className="font-sans font-semibold tabular-nums text-white"
            style={{
              fontSize: dense
                ? 'clamp(0.9rem, 1.6vw, 1.6rem)'
                : 'clamp(1.1rem, 2.6vw, 2.4rem)',
            }}
          >
            {rankOrdinal(i + 1)}
            {showNames && entry.name
              ? ` · ${firstName(entry.name)}`
              : ''} — {entry.score}
            {unit === 'pts' ? ' pts' : '%'}
          </p>
        ))}
      </div>
    </div>
  );
};
