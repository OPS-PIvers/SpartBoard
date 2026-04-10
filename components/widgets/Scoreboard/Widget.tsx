import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetData,
  ScoreboardConfig,
  ScoreboardTeam,
  DEFAULT_GLOBAL_STYLE,
} from '@/types';
import { Trophy, LayoutGrid, List } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { ScoreboardItem } from './components/ScoreboardItem';
import { ScoreboardRowItem } from './components/ScoreboardRowItem';
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
  const layout = config.layout ?? 'cards';

  const sortedTeams = useMemo(
    () =>
      layout === 'rows' ? [...teams].sort((a, b) => b.score - a.score) : teams,
    [teams, layout]
  );

  const toggleLayout = useCallback(() => {
    updateWidget(widget.id, {
      config: {
        ...config,
        layout: layout === 'cards' ? 'rows' : 'cards',
      },
    });
  }, [widget.id, updateWidget, config, layout]);

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
          className={`relative h-full w-full font-${globalStyle.fontFamily}`}
        >
          {/* LIVE badge when being synced from a quiz widget */}
          {config.liveQuizWidgetId && (
            <div
              className="absolute z-10 flex items-center bg-red-500 text-white rounded-full"
              style={{
                top: 'min(4px, 1cqmin)',
                left: 'min(4px, 1cqmin)',
                fontSize: 'min(10px, 3cqmin)',
                padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
                gap: 'min(4px, 1cqmin)',
              }}
            >
              <span
                className="bg-white rounded-full animate-pulse"
                style={{
                  width: 'min(6px, 1.5cqmin)',
                  height: 'min(6px, 1.5cqmin)',
                }}
              />
              LIVE
            </div>
          )}

          {teams.length === 0 ? (
            <div className="h-full">
              <ScaledEmptyState
                icon={Trophy}
                title="No Teams"
                subtitle="Flip to add teams."
                className="opacity-40"
              />
            </div>
          ) : (
            <div className="flex flex-col h-full w-full">
              {layout === 'cards' ? (
                <div
                  className="grid grid-cols-[repeat(auto-fit,minmax(min(120px,100%),1fr))] auto-rows-[1fr] flex-1 w-full bg-transparent overflow-y-auto custom-scrollbar"
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
                </div>
              ) : (
                <div
                  className="flex flex-col flex-1 w-full overflow-y-auto custom-scrollbar"
                  style={{
                    gap: 'min(4px, 1cqmin)',
                    padding: 'min(8px, 2cqmin)',
                  }}
                >
                  {sortedTeams.map((team, index) => (
                    <ScoreboardRowItem
                      key={team.id}
                      team={team}
                      rank={index + 1}
                      onUpdateScore={handleUpdateScore}
                    />
                  ))}
                </div>
              )}
              {/* Layout toggle — inline at bottom to avoid overlapping rows and resize handles */}
              <div
                className="flex justify-center border-t border-slate-200/30 shrink-0"
                style={{ padding: 'min(4px, 1cqmin)' }}
              >
                <button
                  onClick={toggleLayout}
                  className="flex items-center bg-white/70 hover:bg-white/90 text-slate-500 hover:text-slate-700 backdrop-blur-sm rounded-lg transition-all active:scale-95"
                  style={{
                    gap: 'min(4px, 1cqmin)',
                    padding: 'min(4px, 1cqmin) min(10px, 2.5cqmin)',
                    fontSize: 'min(10px, 3cqmin)',
                  }}
                  aria-label={
                    layout === 'cards'
                      ? 'Switch to list view'
                      : 'Switch to card view'
                  }
                >
                  {layout === 'cards' ? (
                    <List
                      style={{
                        width: 'min(14px, 4cqmin)',
                        height: 'min(14px, 4cqmin)',
                      }}
                    />
                  ) : (
                    <LayoutGrid
                      style={{
                        width: 'min(14px, 4cqmin)',
                        height: 'min(14px, 4cqmin)',
                      }}
                    />
                  )}
                  {layout === 'cards' ? 'List' : 'Grid'}
                </button>
              </div>
            </div>
          )}
        </div>
      }
    />
  );
};
