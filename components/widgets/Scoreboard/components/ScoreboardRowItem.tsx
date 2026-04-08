import React from 'react';
import { ScoreboardTeam } from '@/types';
import { Plus, Minus } from 'lucide-react';

import {
  SCOREBOARD_COLORS as TEAM_COLORS,
  ScoreboardColor,
} from '@/config/scoreboard';

const COLOR_BG: Record<ScoreboardColor, string> = {
  'bg-blue-500': 'bg-blue-500/15',
  'bg-red-500': 'bg-red-500/15',
  'bg-green-500': 'bg-green-500/15',
  'bg-yellow-500': 'bg-yellow-500/15',
  'bg-purple-500': 'bg-purple-500/15',
  'bg-pink-500': 'bg-pink-500/15',
  'bg-indigo-500': 'bg-indigo-500/15',
  'bg-orange-500': 'bg-orange-500/15',
  'bg-teal-600': 'bg-teal-600/15',
  'bg-cyan-500': 'bg-cyan-500/15',
};

const COLOR_TEXT: Record<ScoreboardColor, string> = {
  'bg-blue-500': 'text-blue-700',
  'bg-red-500': 'text-red-700',
  'bg-green-500': 'text-green-700',
  'bg-yellow-500': 'text-yellow-700',
  'bg-purple-500': 'text-purple-700',
  'bg-pink-500': 'text-pink-700',
  'bg-indigo-500': 'text-indigo-700',
  'bg-orange-500': 'text-orange-700',
  'bg-teal-600': 'text-teal-700',
  'bg-cyan-500': 'text-cyan-700',
};

const getBg = (color: string) =>
  COLOR_BG[color as ScoreboardColor] ?? 'bg-blue-500/15';
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
    const colorClass = team.color ?? 'bg-blue-500';
    const textColor = getText(colorClass);

    return (
      <div
        className={`flex items-center ${getBg(colorClass)} rounded-xl border border-slate-200/60 transition-all`}
        style={{
          padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
          gap: 'min(8px, 2cqmin)',
        }}
      >
        {/* Rank */}
        <span
          className="text-slate-400 font-black tabular-nums shrink-0 text-center"
          style={{
            fontSize: 'min(11px, 3.5cqmin)',
            width: 'min(24px, 6cqmin)',
          }}
        >
          {rank}
        </span>

        {/* Color dot */}
        <div
          className={`${colorClass} rounded-full shrink-0`}
          style={{
            width: 'min(10px, 2.5cqmin)',
            height: 'min(10px, 2.5cqmin)',
          }}
        />

        {/* Name */}
        <span
          className={`flex-1 font-bold ${textColor} truncate min-w-0`}
          style={{ fontSize: 'min(13px, 4cqmin)' }}
        >
          {team.name}
        </span>

        {/* Score */}
        <span
          className={`font-black ${textColor} tabular-nums shrink-0`}
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
            className="bg-white text-slate-500 rounded-lg shadow-sm hover:bg-slate-50 active:scale-95 transition-all"
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
            className={`${colorClass} text-white rounded-lg shadow-sm hover:brightness-110 active:scale-95 transition-all`}
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

export { TEAM_COLORS };
