import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetData,
  ScoreboardConfig,
  ScoreboardTeam,
  DEFAULT_GLOBAL_STYLE,
} from '@/types';
import { Trophy } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { ScoreboardItem } from './components/ScoreboardItem';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';

const DEFAULT_TEAMS: ScoreboardTeam[] = [
  { id: 'team-a', name: 'Team A', score: 0, color: 'bg-blue-500' },
  { id: 'team-b', name: 'Team B', score: 0, color: 'bg-red-500' },
];

export const ScoreboardWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, activeDashboard } = useDashboard();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const config = widget.config as ScoreboardConfig;

  // Auto-migration: If no teams array, convert legacy A/B to teams
  useEffect(() => {
    if (!Array.isArray(config.teams)) {
      const newTeams: ScoreboardTeam[] = [
        {
          id: 'team-a',
          name: config.teamA ?? 'Team A',
          score: config.scoreA ?? 0,
          color: 'bg-blue-500',
        },
        {
          id: 'team-b',
          name: config.teamB ?? 'Team B',
          score: config.scoreB ?? 0,
          color: 'bg-red-500',
        },
      ];
      updateWidget(widget.id, {
        config: { ...config, teams: newTeams },
      });
    }
  }, [config, widget.id, updateWidget]);

  const teams = Array.isArray(config.teams) ? config.teams : DEFAULT_TEAMS;

  const [localTeams, setLocalTeams] = useState<ScoreboardTeam[]>(teams);

  // Track the most recently computed teams to handle rapid clicks synchronously
  const latestTeamsRef = useRef<ScoreboardTeam[]>(teams);

  const [prevTeams, setPrevTeams] = useState<ScoreboardTeam[]>(teams);

  // Sync localTeams when config.teams changes externally (e.g., remote control or initialization)
  if (JSON.stringify(teams) !== JSON.stringify(prevTeams)) {
    setLocalTeams(teams);
    setPrevTeams(teams);
  }

  // Effect solely to ensure latestTeamsRef is updated securely, never triggering renders
  useEffect(() => {
    latestTeamsRef.current = localTeams;
  }, [localTeams]);

  const handleUpdateScore = useCallback(
    (teamId: string, delta: number) => {
      // Compute the new state synchronously based on the latest known local state
      const currentTeams = latestTeamsRef.current;
      const newTeams = currentTeams.map((t) =>
        t.id === teamId ? { ...t, score: Math.max(0, t.score + delta) } : t
      );

      // Update both local state and our tracking ref immediately
      latestTeamsRef.current = newTeams;
      setLocalTeams(newTeams);

      // Fire the side-effect to sync back to global state outside of the React updater function
      updateWidget(widget.id, {
        config: { teams: newTeams },
      });
    },
    [widget.id, updateWidget]
  );

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`grid grid-cols-[repeat(auto-fit,minmax(min(120px,100%),1fr))] auto-rows-[1fr] h-full w-full bg-transparent overflow-y-auto custom-scrollbar font-${globalStyle.fontFamily}`}
          style={{
            gap: 'min(16px, 3.5cqmin)',
            padding: 'min(16px, 3.5cqmin)',
          }}
        >
          {localTeams.map((team) => (
            <ScoreboardItem
              key={team.id}
              team={team}
              onUpdateScore={handleUpdateScore}
            />
          ))}
          {localTeams.length === 0 && (
            <div className="col-span-full h-full">
              <ScaledEmptyState
                icon={Trophy}
                title="No Teams"
                subtitle="Flip to add teams."
                className="opacity-40"
              />
            </div>
          )}
        </div>
      }
    />
  );
};
