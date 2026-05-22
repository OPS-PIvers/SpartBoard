/**
 * QuizBehaviorSettingsPanel — reusable behavior settings UI for Quiz.
 *
 * Renders the mode selector (Teacher-paced / Auto-progress / Self-paced),
 * the AssignmentSettingsToggleGroup (integrity / feedback / randomization
 * toggles + attempt limit), and the gamification CollapsibleSection.
 *
 * Driven by the structured `QuizBehaviorSettings` shape. All edits call
 * `onChange` with a new `QuizBehaviorSettings` value — the parent owns state.
 *
 * Extracted from `QuizAssignmentSettingsModal` so the same UI can be
 * mounted inside the quiz editor (Task 7+).
 */

import React from 'react';
import { User, Zap, Clock } from 'lucide-react';
import type { QuizBehaviorSettings, QuizSessionMode } from '@/types';
import { AssignmentSettingsToggleGroup } from './AssignmentSettingsToggleGroup';
import { CollapsibleSection } from './CollapsibleSection';
import { ToggleRow } from './AssignmentSettingsToggleGroup';
import type { AssignModeOption } from './types';

export interface QuizBehaviorSettingsPanelProps {
  value: QuizBehaviorSettings;
  onChange: (next: QuizBehaviorSettings) => void;
  /**
   * When true, the mode selector buttons are disabled (e.g. live assignment).
   * Default false.
   */
  modeLocked?: boolean;
}

const MODES_BASE: Omit<AssignModeOption, 'disabled'>[] = [
  {
    id: 'teacher',
    label: 'Teacher-paced',
    description: 'You control when to move to the next question.',
    icon: User,
  },
  {
    id: 'auto',
    label: 'Auto-progress',
    description: 'Moves automatically once everyone has answered.',
    icon: Zap,
  },
  {
    id: 'student',
    label: 'Self-paced',
    description: 'Students move through questions at their own speed.',
    icon: Clock,
  },
];

export const QuizBehaviorSettingsPanel: React.FC<
  QuizBehaviorSettingsPanelProps
> = ({ value, onChange, modeLocked = false }) => {
  const modes: AssignModeOption[] = MODES_BASE.map((m) => ({
    ...m,
    disabled: modeLocked,
  }));

  const handleModeChange = (id: string) => {
    if (modeLocked) return;
    onChange({ ...value, sessionMode: id as QuizSessionMode });
  };

  return (
    <>
      {/* Mode selector */}
      <div className="space-y-3">
        <p className="text-xxs font-bold text-brand-blue-primary/60 uppercase tracking-widest">
          Session Mode
        </p>
        <div className="grid gap-2">
          {modes.map((mode) => {
            const Icon = mode.icon;
            const selected = mode.id === value.sessionMode;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleModeChange(mode.id)}
                disabled={mode.disabled}
                aria-pressed={selected}
                className={`w-full text-left p-3 rounded-xl border-2 transition-all flex items-start gap-3 group ${
                  selected
                    ? 'border-brand-blue-primary bg-brand-blue-lighter/30'
                    : 'border-slate-200 hover:border-brand-blue-primary hover:bg-brand-blue-lighter/20'
                } ${mode.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {Icon && (
                  <div
                    className={`p-2 rounded-lg transition-colors shrink-0 ${
                      selected
                        ? 'bg-brand-blue-primary text-white'
                        : 'bg-slate-100 text-brand-blue-primary'
                    }`}
                  >
                    <Icon size={18} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-black text-sm text-slate-800 leading-tight">
                    {mode.label}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                    {mode.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toggle group: integrity / feedback / randomization + gamification */}
      <AssignmentSettingsToggleGroup
        modeLocked={modeLocked}
        options={{
          tabWarningsEnabled: value.sessionOptions.tabWarningsEnabled,
          showResultToStudent: value.sessionOptions.showResultToStudent,
          showCorrectAnswerToStudent:
            value.sessionOptions.showCorrectAnswerToStudent,
          showCorrectOnBoard: value.sessionOptions.showCorrectOnBoard,
          shuffleQuestions: value.sessionOptions.shuffleQuestions,
          shuffleAnswerOptions: value.sessionOptions.shuffleAnswerOptions,
        }}
        onOptionsChange={(next) =>
          onChange({
            ...value,
            sessionOptions: { ...value.sessionOptions, ...next },
          })
        }
        attemptLimit={value.attemptLimit}
        onAttemptLimitChange={(v) => onChange({ ...value, attemptLimit: v })}
        shuffleQuestionsAvailable={value.sessionMode === 'student'}
        trailingSlot={
          <CollapsibleSection label="Gamification">
            <ToggleRow
              compact
              label="Speed Bonus Points"
              checked={value.sessionOptions.speedBonusEnabled ?? false}
              onChange={(v) =>
                onChange({
                  ...value,
                  sessionOptions: {
                    ...value.sessionOptions,
                    speedBonusEnabled: v,
                  },
                })
              }
              hint="Up to 50% bonus for fast answers"
            />
            <ToggleRow
              compact
              label="Streak Bonuses"
              checked={value.sessionOptions.streakBonusEnabled ?? false}
              onChange={(v) =>
                onChange({
                  ...value,
                  sessionOptions: {
                    ...value.sessionOptions,
                    streakBonusEnabled: v,
                  },
                })
              }
              hint="Multiplier for consecutive correct answers"
            />
            <ToggleRow
              compact
              label="Podium Between Questions"
              checked={value.sessionOptions.showPodiumBetweenQuestions ?? false}
              onChange={(v) =>
                onChange({
                  ...value,
                  sessionOptions: {
                    ...value.sessionOptions,
                    showPodiumBetweenQuestions: v,
                  },
                })
              }
              hint="Show top 3 leaderboard after each question"
            />
            <ToggleRow
              compact
              label="Sound Effects"
              checked={value.sessionOptions.soundEffectsEnabled ?? false}
              onChange={(v) =>
                onChange({
                  ...value,
                  sessionOptions: {
                    ...value.sessionOptions,
                    soundEffectsEnabled: v,
                  },
                })
              }
              hint="Chimes, ticks, and fanfares during the quiz"
            />
          </CollapsibleSection>
        }
      />
    </>
  );
};
