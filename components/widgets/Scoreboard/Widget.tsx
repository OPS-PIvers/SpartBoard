import React, { useEffect, useRef, useCallback } from 'react';
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

  // Keep a ref to the latest config to ensure handleUpdateScore is stable
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const handleUpdateScore = useCallback(
    (teamId: string, delta: number) => {
      const currentConfig = configRef.current;

      let currentTeams: ScoreboardTeam[];
      if (Array.isArray(currentConfig.teams)) {
        currentTeams = currentConfig.teams;
      } else if (
        'teamA' in currentConfig ||
        'teamB' in currentConfig ||
        'scoreA' in currentConfig ||
        'scoreB' in currentConfig
      ) {
        currentTeams = [
          {
            id: 'team-a',
            name: currentConfig.teamA ?? 'Team A',
            score: currentConfig.scoreA ?? 0,
            color: 'bg-blue-500',
          },
          {
            id: 'team-b',
            name: currentConfig.teamB ?? 'Team B',
            score: currentConfig.scoreB ?? 0,
            color: 'bg-red-500',
          },
        ];
      } else {
        currentTeams = DEFAULT_TEAMS;
      }

      const newTeams = currentTeams.map((t) =>
        t.id === teamId ? { ...t, score: Math.max(0, t.score + delta) } : t
      );
      const nextConfig = { ...currentConfig, teams: newTeams };

      // Update ref synchronously to prevent stale state on rapid clicks
      configRef.current = nextConfig;

      updateWidget(widget.id, {
        config: nextConfig,
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
          {teams.map((team) => (
            <ScoreboardItem
              key={team.id}
              team={team}
              onUpdateScore={handleUpdateScore}
            />
          ))}
          {teams.length === 0 && (
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
