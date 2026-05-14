import React from 'react';
import { ScoreboardTeam } from '@/types';
import { Plus, Minus } from 'lucide-react';

import { SCOREBOARD_COLORS, ScoreboardColor } from '@/config/scoreboard';

const DEFAULT_TEAM_COLOR: ScoreboardColor = 'bg-blue-500';
const KNOWN_TEAM_COLORS = new Set<string>(SCOREBOARD_COLORS);

// Per-color text class used for the +/- button icons on white chips.
// The row body itself now uses the solid team color as background with
// white text, so we no longer need the /15 tinted-bg variants.
const COLOR_TEXT: Record<ScoreboardColor, string> = {
  'bg-sky-500': 'text-sky-700',
  'bg-blue-500': 'text-blue-700',
  'bg-indigo-500': 'text-indigo-700',
  'bg-violet-500': 'text-violet-700',
  'bg-purple-500': 'text-purple-700',
  'bg-fuchsia-500': 'text-fuchsia-700',
  'bg-pink-500': 'text-pink-700',
  'bg-rose-500': 'text-rose-700',
  'bg-red-500': 'text-red-700',
  'bg-orange-500': 'text-orange-700',
  'bg-amber-500': 'text-amber-700',
  'bg-yellow-500': 'text-yellow-700',
  'bg-lime-500': 'text-lime-700',
  'bg-green-500': 'text-green-700',
  'bg-emerald-500': 'text-emerald-700',
  'bg-teal-600': 'text-teal-700',
  'bg-cyan-500': 'text-cyan-700',
  'bg-slate-600': 'text-slate-700',
};

const getText = (color: string) =>
  COLOR_TEXT[color as ScoreboardColor] ?? 'text-blue-700';

export const ScoreboardRowItem = React.memo(
  ({
    team,
    rank,
    onUpdateScore,
  }: {
    team: ScoreboardTeam;
    rank: number;
    onUpdateScore: (id: string, delta: number) => void;
  }) => {
    // Normalize the persisted color through the known-palette set before
    // it lands in className — an unknown value would interpolate into
    // `bg-something-500` that Tailwind has no rule for, leaving white
    // text on no background.
    const rawColor = team.color ?? DEFAULT_TEAM_COLOR;
    const colorClass = KNOWN_TEAM_COLORS.has(rawColor)
      ? rawColor
      : DEFAULT_TEAM_COLOR;
    const buttonIconColor = getText(colorClass);

    return (
      <div
        className={`flex items-center ${colorClass} text-white rounded-xl border border-white/20 shadow-sm transition-all`}
        style={{
          padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
          gap: 'min(8px, 2cqmin)',
        }}
      >
        {/* Rank */}
        <span
          className="text-white/70 font-black tabular-nums shrink-0 text-center"
          style={{
            fontSize: 'min(11px, 3.5cqmin)',
            width: 'min(24px, 6cqmin)',
          }}
        >
          {rank}
        </span>

        {/* Name */}
        <span
          className="flex-1 font-bold text-white truncate min-w-0"
          style={{ fontSize: 'min(13px, 4cqmin)' }}
        >
          {team.name}
        </span>

        {/* Score */}
        <span
          className="font-black text-white tabular-nums shrink-0"
          style={{
            fontSize: 'min(16px, 5cqmin)',
            minWidth: 'min(32px, 8cqmin)',
            textAlign: 'right',
          }}
        >
          {team.score}
        </span>

        {/* Buttons */}
        <div
          className="flex items-center shrink-0"
          style={{ gap: 'min(4px, 1cqmin)' }}
        >
          <button
            onClick={() => onUpdateScore(team.id, -1)}
            aria-label="Decrease score"
            className={`bg-white ${buttonIconColor} rounded-lg shadow-sm hover:bg-slate-50 active:scale-95 transition-all`}
            style={{
              padding: 'min(4px, 1cqmin)',
            }}
          >
            <Minus
              style={{
                width: 'min(12px, 3.5cqmin)',
                height: 'min(12px, 3.5cqmin)',
              }}
            />
          </button>
          <button
            onClick={() => onUpdateScore(team.id, 1)}
            aria-label="Increase score"
            className={`bg-white ${buttonIconColor} rounded-lg shadow-sm hover:bg-slate-50 active:scale-95 transition-all`}
            style={{
              padding: 'min(4px, 1cqmin)',
            }}
          >
            <Plus
              style={{
                width: 'min(12px, 3.5cqmin)',
                height: 'min(12px, 3.5cqmin)',
              }}
            />
          </button>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.onUpdateScore === nextProps.onUpdateScore &&
      prevProps.rank === nextProps.rank &&
      prevProps.team.id === nextProps.team.id &&
      prevProps.team.name === nextProps.team.name &&
      prevProps.team.score === nextProps.team.score &&
      prevProps.team.color === nextProps.team.color &&
      prevProps.team.linkedGroupId === nextProps.team.linkedGroupId
    );
  }
);

ScoreboardRowItem.displayName = 'ScoreboardRowItem';
