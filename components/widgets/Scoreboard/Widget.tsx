import React, {
  useEffect,
  useEffectEvent,
  useRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  useGlobalStyle,
  useDashboardActions,
  useDashboardCanvasSelector,
} from '@/context/dashboardCanvasStore';
import {
  WidgetData,
  ScoreboardConfig,
  ScoreboardTeam,
  RandomConfig,
  RandomGroup,
} from '@/types';
import { useConnectionsEnabled } from '@/hooks/useConnectionsEnabled';
import { followLeaderId } from '@/utils/connectionEngine';
import { hasConnectionTab } from '@/components/connections/connectionSummary';
import { randomizerGroups, sameTeams, teamsFromGroups } from './groupTeams';
import { History, Trophy, Undo2 } from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { ScoreboardItem } from './components/ScoreboardItem';
import { ScoreboardRowItem } from './components/ScoreboardRowItem';
import { ScoreboardHistoryPanel } from './components/ScoreboardHistoryPanel';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { appendScoreHistory, undoLastScoreChange } from './history';
import {
  scoreboardLeaders,
  scoreboardPointValues,
  scoreboardRank,
} from './points';

const isTypingFieldActive = (): boolean => {
  const activeEl = document.activeElement as HTMLElement | null;
  return (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl?.tagName ?? '') ||
    !!activeEl?.isContentEditable
  );
};

const DEFAULT_TEAMS: ScoreboardTeam[] = [
  { id: 'team-a', name: 'Team A', score: 0, color: 'bg-blue-500' },
  { id: 'team-b', name: 'Team B', score: 0, color: 'bg-red-500' },
];

export const ScoreboardWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboardActions();
  const globalStyle = useGlobalStyle();
  const config = widget.config as ScoreboardConfig;
  const { t } = useTranslation();
  const isLive = !!config.liveQuizWidgetId;
  const [showHistory, setShowHistory] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  // Teams follow a connected Randomizer's groups; the key changes only when the groups or their names do.
  const connectionsOn = useConnectionsEnabled();
  const leaderGroupsKey = useDashboardCanvasSelector((s) => {
    const board = s.activeDashboard;
    if (!connectionsOn || !board) return '';
    const leaderId = followLeaderId(
      board.connections,
      board.widgets,
      widget.id,
      'teams'
    );
    const leader = leaderId
      ? board.widgets.find((w) => w.id === leaderId && w.type === 'random')
      : undefined;
    const groups = randomizerGroups(leader?.config as RandomConfig | undefined);
    if (!groups) return '';
    const ids = new Set(groups.map((g) => g.id));
    return JSON.stringify({
      groups: groups.map((g) => (g.id ? { id: g.id } : {})),
      shared: (board.sharedGroups ?? []).filter((sg) => ids.has(sg.id)),
    });
  });
  const showsConnectionTab = useDashboardCanvasSelector(
    (s) =>
      connectionsOn &&
      !!s.activeDashboard &&
      hasConnectionTab(
        s.activeDashboard.connections,
        s.activeDashboard.widgets,
        widget.id
      )
  );
  useEffect(() => {
    if (!leaderGroupsKey || config.liveQuizWidgetId) return;
    const { groups, shared } = JSON.parse(leaderGroupsKey) as {
      groups: RandomGroup[];
      shared: NonNullable<Parameters<typeof teamsFromGroups>[1]>;
    };
    const current = Array.isArray(config.teams) ? config.teams : [];
    const next = teamsFromGroups(groups, shared, current, (count) =>
      t('widgetSettings.scoreboard.groupName', { count })
    );
    if (!sameTeams(next, current)) {
      // Not an undo step: Undo would only restore stale teams that this sync puts back.
      updateWidget(
        widget.id,
        { config: { teams: next } },
        { skipHistory: true }
      );
    }
  }, [
    leaderGroupsKey,
    config.teams,
    config.liveQuizWidgetId,
    updateWidget,
    widget.id,
    t,
  ]);

  const teams = Array.isArray(config.teams) ? config.teams : DEFAULT_TEAMS;
  const layout = config.layout ?? 'cards';

  const sortRows = config.sortByScore !== false;
  const sortedTeams = useMemo(
    () =>
      layout === 'rows' && sortRows
        ? [...teams].sort((a, b) => b.score - a.score)
        : teams,
    [teams, layout, sortRows]
  );
  const pointValues = scoreboardPointValues(config);
  const leaders = useMemo(() => scoreboardLeaders(teams), [teams]);

  // Keep a ref to the latest config to ensure handleUpdateScore is stable.
  // Assigned inline in the render body (not in a useEffect) so the ref is
  // always current by the time any click handler fires in the same frame —
  // a useEffect sync would leave a stale window between render and paint
  // where rapid clicks or live-quiz score pushes could build off old data.
  const configRef = useRef(config);
  // eslint-disable-next-line react-hooks/refs -- intentional render-body ref sync
  configRef.current = config;

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
      const nextConfig: ScoreboardConfig = {
        ...currentConfig,
        teams: newTeams,
      };
      if (!currentConfig.liveQuizWidgetId) {
        const before = currentTeams.find((t) => t.id === teamId);
        const after = newTeams.find((t) => t.id === teamId);
        if (before && after) {
          nextConfig.history = appendScoreHistory(currentConfig.history, [
            { teamId, from: before.score, to: after.score },
          ]);
        }
      }

      // Update ref synchronously to prevent stale state on rapid clicks
      configRef.current = nextConfig;

      updateWidget(widget.id, {
        config: nextConfig,
      });
    },
    [widget.id, updateWidget]
  );

  const canUndo =
    !isLive && Array.isArray(config.history) && config.history.length > 0;

  const handleUndo = useCallback(() => {
    const currentConfig = configRef.current;
    if (currentConfig.liveQuizWidgetId || !Array.isArray(currentConfig.teams))
      return;
    const result = undoLastScoreChange(
      currentConfig.teams,
      currentConfig.history
    );
    if (!result) return;
    const nextConfig = { ...currentConfig, ...result };
    configRef.current = nextConfig;
    updateWidget(widget.id, { config: nextConfig });
  }, [widget.id, updateWidget]);

  // Capture phase so the board-level Ctrl+Z listener sees defaultPrevented and stands down.
  const onUndoKey = useEffectEvent((e: KeyboardEvent) => {
    if (!canUndo || widget.flipped) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if (e.key.toLowerCase() !== 'z' || e.defaultPrevented) return;
    if (isTypingFieldActive()) return;
    const windowEl = rootRef.current?.closest('[data-draggable-window]');
    if (!windowEl || !windowEl.contains(document.activeElement)) return;
    e.preventDefault();
    handleUndo();
  });

  useEffect(() => {
    const listener = (e: KeyboardEvent) => onUndoKey(e);
    window.addEventListener('keydown', listener, true);
    return () => window.removeEventListener('keydown', listener, true);
  }, []);

  const historyOpen = !isLive && showHistory;
  const showFooter = !isLive && teams.length > 0;
  const footerButtonClass =
    'flex items-center justify-center bg-white border border-slate-200 shadow-xs rounded-lg font-bold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-default disabled:active:scale-100';
  const footerButtonStyle: React.CSSProperties = {
    padding: 'min(5px, 1.2cqmin) min(10px, 2.5cqmin)',
    gap: 'min(5px, 1.2cqmin)',
    fontSize: 'max(11px, min(13px, 3cqmin))',
    minHeight: 'max(28px, min(36px, 8cqmin))',
  };
  const footerIconStyle: React.CSSProperties = {
    width: 'max(12px, min(16px, 3.5cqmin))',
    height: 'max(12px, min(16px, 3.5cqmin))',
  };

  return (
    <WidgetLayout
      padding="p-0"
      footer={
        showFooter ? (
          <div
            className={`flex items-center justify-end font-${globalStyle.fontFamily}`}
            style={{
              gap: 'min(8px, 2cqmin)',
              padding: '0 min(16px, 3.5cqmin) min(10px, 2.5cqmin)',
            }}
          >
            <button
              type="button"
              onClick={() => setShowHistory((open) => !open)}
              className={footerButtonClass}
              style={footerButtonStyle}
              {...tourAttr('scoreboard.history', widget.id, widget.type)}
            >
              {historyOpen ? (
                <Trophy style={footerIconStyle} aria-hidden="true" />
              ) : (
                <History style={footerIconStyle} aria-hidden="true" />
              )}
              {historyOpen
                ? t('widgets.scoreboard.scores')
                : t('widgets.scoreboard.history')}
            </button>
            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              title={t('widgets.scoreboard.undoShortcut')}
              className={footerButtonClass}
              style={footerButtonStyle}
              {...tourAttr('scoreboard.undo', widget.id, widget.type)}
            >
              <Undo2 style={footerIconStyle} aria-hidden="true" />
              {t('widgets.scoreboard.undo')}
            </button>
          </div>
        ) : undefined
      }
      content={
        <div
          ref={rootRef}
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

          {historyOpen ? (
            <ScoreboardHistoryPanel teams={teams} history={config.history} />
          ) : teams.length === 0 ? (
            <div className="h-full">
              <ScaledEmptyState
                icon={Trophy}
                title="No Teams"
                subtitle="Flip to add teams."
                className="opacity-40"
              />
            </div>
          ) : layout === 'cards' ? (
            <div
              className="grid grid-cols-[repeat(auto-fit,minmax(min(120px,100%),1fr))] auto-rows-[1fr] h-full w-full bg-transparent overflow-y-auto custom-scrollbar"
              style={{
                gap: 'min(16px, 3.5cqmin)',
                padding: 'min(16px, 3.5cqmin)',
                // Keeps the top-right team clear of the connection tab.
                ...(showsConnectionTab && { paddingTop: 28 }),
              }}
            >
              {teams.map((team, index) => (
                <ScoreboardItem
                  key={team.id}
                  team={team}
                  teamPosition={index + 1}
                  widgetId={widget.id}
                  onUpdateScore={handleUpdateScore}
                  pointValues={pointValues}
                  leader={leaders.get(team.id) ?? null}
                  showLeader={teams.length > 1}
                />
              ))}
            </div>
          ) : (
            <div
              className="flex flex-col h-full w-full overflow-y-auto custom-scrollbar"
              style={{
                gap: 'min(4px, 1cqmin)',
                padding: 'min(8px, 2cqmin)',
                ...(showsConnectionTab && { paddingTop: 28 }),
              }}
            >
              {sortedTeams.map((team, index) => (
                <ScoreboardRowItem
                  key={team.id}
                  team={team}
                  rank={scoreboardRank(teams, team)}
                  position={index + 1}
                  widgetId={widget.id}
                  onUpdateScore={handleUpdateScore}
                  pointValues={pointValues}
                  leader={leaders.get(team.id) ?? null}
                />
              ))}
            </div>
          )}
        </div>
      }
    />
  );
};
