import React from 'react';
import { QuizSession, QuizConfig } from '@/types';

interface QuizSettingsScreenProps {
  session: QuizSession;
  config: QuizConfig;
  hideLiveScoreboard: boolean;
  hasNames: boolean;
  onUpdateSession: (updates: Partial<QuizSession>) => void;
  onUpdateConfig: (updates: Partial<QuizConfig>) => void;
}

const SettingRow: React.FC<{
  label: string;
  description: string;
  on: boolean;
  onToggle: () => void;
}> = ({ label, description, on, onToggle }) => (
  <div
    className="flex items-center justify-between bg-white border border-brand-gray-lighter rounded-lg"
    style={{
      padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
      gap: 'min(10px, 2.5cqmin)',
    }}
  >
    <div className="min-w-0">
      <p
        className="font-sans font-semibold text-brand-gray-dark"
        style={{ fontSize: 'min(13px, 4.5cqmin)' }}
      >
        {label}
      </p>
      <p
        className="text-brand-gray-primary"
        style={{ fontSize: 'min(11px, 3.8cqmin)' }}
      >
        {description}
      </p>
    </div>
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`shrink-0 rounded-full transition-colors ${
        on ? 'bg-brand-blue-primary' : 'bg-brand-gray-lighter'
      }`}
      style={{
        width: 'min(36px, 12cqmin)',
        height: 'min(20px, 7cqmin)',
        padding: 'min(2px, 0.7cqmin)',
      }}
    >
      <span
        className="block bg-white rounded-full transition-transform"
        style={{
          width: 'min(16px, 5.6cqmin)',
          height: 'min(16px, 5.6cqmin)',
          transform: on ? 'translateX(min(16px, 5cqmin))' : 'translateX(0)',
        }}
      />
    </button>
  </div>
);

export const QuizSettingsScreen: React.FC<QuizSettingsScreenProps> = ({
  session,
  config,
  hideLiveScoreboard,
  hasNames,
  onUpdateSession,
  onUpdateConfig,
}) => (
  <div className="flex flex-col" style={{ gap: 'min(8px, 2cqmin)' }}>
    <SettingRow
      label="Tab warnings"
      description="Flag students who leave the quiz tab."
      on={session.tabWarningsEnabled !== false}
      onToggle={() =>
        onUpdateSession({
          tabWarningsEnabled: !(session.tabWarningsEnabled !== false),
        })
      }
    />
    <SettingRow
      label="Podium between questions"
      description="Show a leaderboard podium during review."
      on={session.showPodiumBetweenQuestions ?? false}
      onToggle={() =>
        onUpdateSession({
          showPodiumBetweenQuestions: !(
            session.showPodiumBetweenQuestions ?? false
          ),
        })
      }
    />
    <SettingRow
      label="Answer reveal on board"
      description="Allow revealing the correct answer to the class."
      on={session.showCorrectOnBoard ?? false}
      onToggle={() =>
        onUpdateSession({
          showCorrectOnBoard: !(session.showCorrectOnBoard ?? false),
        })
      }
    />
    {!hideLiveScoreboard && (
      <>
        <SettingRow
          label="Sync to scoreboard widget"
          description="Publish live scores to a board scoreboard."
          on={config.liveScoreboardEnabled ?? false}
          onToggle={() =>
            onUpdateConfig(
              config.liveScoreboardEnabled
                ? { liveScoreboardEnabled: false }
                : {
                    liveScoreboardEnabled: true,
                    liveScoreboardMode:
                      config.liveScoreboardMode ?? (hasNames ? 'name' : 'pin'),
                    liveScoreboardScoring:
                      config.liveScoreboardScoring ?? 'per-question',
                  }
            )
          }
        />
        {(config.liveScoreboardEnabled ?? false) && (
          <div
            className="flex flex-wrap items-center"
            style={{
              gap: 'min(6px, 1.5cqmin)',
              paddingLeft: 'min(12px, 3cqmin)',
            }}
          >
            <select
              value={config.liveScoreboardMode ?? (hasNames ? 'name' : 'pin')}
              onChange={(e) =>
                onUpdateConfig({
                  liveScoreboardMode: e.target.value as 'pin' | 'name',
                })
              }
              aria-label="Scoreboard display"
              className="rounded-md border border-brand-gray-lighter bg-white text-brand-gray-dark font-sans"
              style={{
                fontSize: 'min(11px, 3.8cqmin)',
                padding: 'min(4px, 1cqmin) min(6px, 1.5cqmin)',
              }}
            >
              <option value="name" disabled={!hasNames}>
                Show names
              </option>
              <option value="pin">Show PINs</option>
            </select>
            <select
              value={config.liveScoreboardScoring ?? 'per-question'}
              onChange={(e) =>
                onUpdateConfig({
                  liveScoreboardScoring: e.target.value as
                    | 'completion'
                    | 'per-question',
                })
              }
              aria-label="Scoreboard scoring"
              className="rounded-md border border-brand-gray-lighter bg-white text-brand-gray-dark font-sans"
              style={{
                fontSize: 'min(11px, 3.8cqmin)',
                padding: 'min(4px, 1cqmin) min(6px, 1.5cqmin)',
              }}
            >
              <option value="per-question">Score each question</option>
              <option value="completion">Score on completion</option>
            </select>
          </div>
        )}
      </>
    )}
  </div>
);
