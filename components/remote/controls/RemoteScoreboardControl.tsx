import React from 'react';
import { Plus, Minus, RotateCcw } from 'lucide-react';
import { WidgetData, ScoreboardConfig, ScoreboardTeam } from '@/types';

interface RemoteScoreboardControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

const DEFAULT_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b'];

export const RemoteScoreboardControl: React.FC<
  RemoteScoreboardControlProps
> = ({ widget, updateWidget }) => {
  const config = widget.config as ScoreboardConfig;

  const teams: ScoreboardTeam[] =
    config.teams && config.teams.length > 0
      ? config.teams
      : [
          {
            id: 'a',
            name: config.teamA ?? 'Team A',
            score: config.scoreA ?? 0,
            color: DEFAULT_COLORS[0],
          },
          {
            id: 'b',
            name: config.teamB ?? 'Team B',
            score: config.scoreB ?? 0,
            color: DEFAULT_COLORS[1],
          },
        ];

  const adjustScore = (teamId: string, delta: number) => {
    const updatedTeams = teams.map((t) =>
      t.id === teamId ? { ...t, score: Math.max(0, t.score + delta) } : t
    );
    updateWidget(widget.id, { config: { ...config, teams: updatedTeams } });
  };

  const resetAll = () => {
    const resetTeams = teams.map((t) => ({ ...t, score: 0 }));
    updateWidget(widget.id, { config: { teams: resetTeams } });
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 h-full justify-center">
      <div className="text-white/60 text-xs uppercase tracking-widest font-bold">
        Scoreboard
      </div>

      <div className="w-full flex flex-col gap-3">
        {teams.map((team) => (
          <div
            key={team.id}
            className="flex items-center gap-3 bg-white/5 rounded-2xl p-3 border border-white/10"
          >
            {/* Team Color Bar */}
            <div
              className="w-1.5 h-12 rounded-full shrink-0"
              style={{ background: team.color ?? DEFAULT_COLORS[0] }}
            />

            {/* Team Name + Score */}
            <div className="flex-1 min-w-0">
              <div className="text-white/70 text-xs font-bold truncate uppercase tracking-wide">
                {team.name}
              </div>
              <div
                className="text-white font-black tabular-nums"
                style={{ fontSize: '2.5rem', lineHeight: 1 }}
              >
                {team.score}
              </div>
            </div>

            {/* +/- Buttons */}
            <div className="flex flex-col gap-2 shrink-0">
              <button
                onClick={() => adjustScore(team.id, 1)}
                className="touch-manipulation w-12 h-12 rounded-xl bg-green-500/20 hover:bg-green-500/40 border border-green-500/30 text-green-400 flex items-center justify-center transition-all active:scale-95"
                aria-label={`Add 1 to ${team.name}`}
              >
                <Plus className="w-5 h-5" />
              </button>
              <button
                onClick={() => adjustScore(team.id, -1)}
                className="touch-manipulation w-12 h-12 rounded-xl bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 text-red-400 flex items-center justify-center transition-all active:scale-95"
                aria-label={`Remove 1 from ${team.name}`}
              >
                <Minus className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={resetAll}
        className="touch-manipulation flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white/70 text-sm font-bold transition-all active:scale-95"
        aria-label="Reset all scores"
      >
        <RotateCcw className="w-4 h-4" />
        Reset Scores
      </button>
    </div>
  );
};
