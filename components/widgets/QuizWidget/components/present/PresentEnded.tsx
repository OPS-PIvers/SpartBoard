import React from 'react';
import { QuizLeaderboardEntry } from '@/types';
import { PresentStandings } from './PresentStandings';
import { PresentPodium } from './PresentPodium';

interface PresentEndedProps {
  standings: QuizLeaderboardEntry[];
  showNames: boolean;
  unit: 'pts' | '%';
  /** Mean percentage across scoreable submissions; null when none. */
  classAverage: number | null;
  completed: number;
  total: number;
  /** Final standings rows; Review sets this at launch (D21). */
  rankRows?: number;
  /** Review's game board: podium and confetti. */
  game?: boolean;
}

const CONFETTI_COLORS = [
  'bg-brand-blue-primary',
  'bg-brand-red-primary',
  'bg-amber-400',
  'bg-brand-blue-light',
  'bg-orange-400',
];

// Deterministic scatter so re-renders don't reshuffle the pieces.
const CONFETTI = Array.from({ length: 40 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 53) % 150) / 100,
  duration: 3 + ((i * 29) % 20) / 10,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}));

const Confetti: React.FC = () => (
  <div
    className="fixed inset-0 pointer-events-none overflow-hidden motion-reduce:hidden"
    aria-hidden
  >
    {CONFETTI.map((piece, i) => (
      <span
        key={i}
        className={`absolute top-0 animate-confetti-fall ${piece.color}`}
        style={{
          left: `${piece.left}%`,
          width: '1vw',
          height: '1vw',
          animationDelay: `${piece.delay}s`,
          animationDuration: `${piece.duration}s`,
        }}
      />
    ))}
  </div>
);

export const PresentEnded: React.FC<PresentEndedProps> = ({
  standings,
  showNames,
  unit,
  classAverage,
  completed,
  total,
  rankRows = 5,
  game = false,
}) =>
  game ? (
    <>
      {standings.length > 0 && <Confetti />}
      <p
        className="font-sans font-medium uppercase tracking-widest text-brand-gray-primary"
        style={{ fontSize: 'clamp(0.8rem, 1.4vw, 1.4rem)' }}
      >
        Final
      </p>
      <PresentPodium
        entries={standings}
        showNames={showNames}
        unit={unit}
        limit={rankRows}
        size="final"
      />
      <p
        className="font-sans text-brand-gray-primary tabular-nums"
        style={{ fontSize: 'clamp(1rem, 2vw, 1.8rem)' }}
      >
        {completed} of {total}
        {classAverage != null && ` · Avg ${classAverage}%`}
      </p>
    </>
  ) : (
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
        limit={rankRows}
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
