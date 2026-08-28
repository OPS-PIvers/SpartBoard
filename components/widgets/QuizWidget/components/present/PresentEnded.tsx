import React from 'react';
import { QuizLeaderboardEntry } from '@/types';
import { PresentStandings } from './PresentStandings';

interface PresentEndedProps {
  standings: QuizLeaderboardEntry[];
  showNames: boolean;
  unit: 'pts' | '%';
  /** Mean percentage across scoreable submissions; null when none. */
  classAverage: number | null;
  completed: number;
  total: number;
}

export const PresentEnded: React.FC<PresentEndedProps> = ({
  standings,
  showNames,
  unit,
  classAverage,
  completed,
  total,
}) => (
  <>
    <p
      className="font-sans font-bold text-white leading-none"
      style={{ fontSize: 'clamp(2rem, 7vw, 5.5rem)' }}
    >
      Finished
    </p>
    <PresentStandings
      entries={standings}
      showNames={showNames}
      unit={unit}
      limit={5}
      heading="Final standings"
    />
    <p
      className="font-sans text-white/70 tabular-nums"
      style={{ fontSize: 'clamp(1rem, 2.2vw, 2rem)' }}
    >
      {completed} of {total} submitted
      {classAverage != null && ` · class average ${classAverage}%`}
    </p>
  </>
);
