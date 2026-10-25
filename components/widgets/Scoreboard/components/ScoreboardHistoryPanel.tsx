import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ScoreboardHistoryEntry, ScoreboardTeam } from '@/types';
import { normalizeScoreboardColor } from '@/config/scoreboard';
import { formatScoreDelta, teamScoreHistory } from '../history';

const PER_TEAM_LIMIT = 8;

const formatTime = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const ScoreboardHistoryPanel: React.FC<{
  teams: ScoreboardTeam[];
  history: ScoreboardHistoryEntry[] | undefined;
}> = ({ teams, history }) => {
  const { t } = useTranslation();
  const hasAny = Array.isArray(history) && history.length > 0;

  return (
    <div
      className="h-full w-full overflow-y-auto custom-scrollbar bg-white text-slate-700"
      style={{ padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)' }}
    >
      <div
        className="font-black uppercase tracking-wider text-slate-500"
        style={{
          fontSize: 'max(10px, min(12px, 3cqmin))',
          marginBottom: 'min(6px, 1.5cqmin)',
        }}
      >
        {t('widgets.scoreboard.recentChanges')}
      </div>
      {!hasAny ? (
        <div
          className="text-slate-500"
          style={{ fontSize: 'max(11px, min(14px, 3.5cqmin))' }}
        >
          {t('widgets.scoreboard.noChanges')}
        </div>
      ) : (
        <ul className="divide-y divide-slate-200">
          {teams.map((team) => {
            const items = teamScoreHistory(history, team.id, PER_TEAM_LIMIT);
            return (
              <li
                key={team.id}
                className="flex items-baseline"
                style={{
                  gap: 'min(10px, 2.5cqmin)',
                  padding: 'min(6px, 1.5cqmin) 0',
                  fontSize: 'max(11px, min(14px, 3.5cqmin))',
                }}
              >
                <span className="flex items-center font-bold shrink-0 max-w-[45%] break-words">
                  <span
                    aria-hidden="true"
                    className={`inline-block rounded-full shrink-0 ${normalizeScoreboardColor(team.color)}`}
                    style={{
                      width: 'min(8px, 2cqmin)',
                      height: 'min(8px, 2cqmin)',
                      marginRight: 'min(6px, 1.5cqmin)',
                    }}
                  />
                  {team.name}
                </span>
                <span
                  className="flex flex-wrap tabular-nums text-slate-600 min-w-0"
                  style={{ columnGap: 'min(8px, 2cqmin)' }}
                >
                  {items.length === 0 ? (
                    <span className="text-slate-400">
                      {t('widgets.scoreboard.noChanges')}
                    </span>
                  ) : (
                    items.map((item) => (
                      <span key={item.id} title={formatTime(item.at)}>
                        {item.reset
                          ? t('widgets.scoreboard.reset')
                          : formatScoreDelta(item.delta)}
                        <span className="sr-only">
                          {' '}
                          <time dateTime={new Date(item.at).toISOString()}>
                            {formatTime(item.at)}
                          </time>
                        </span>
                      </span>
                    ))
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
