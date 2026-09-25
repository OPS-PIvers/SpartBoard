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

import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import type { QuizBehaviorSettings, QuizSessionMode } from '@/types';
import {
  DEFAULT_QUIZ_HAND_RAISE_MODE,
  type QuizHandRaiseMode,
} from '@/utils/quizHandRaise';
import { AuthContext } from '@/context/AuthContextValue';
import { TabAwayLimitRow, TabWarningThresholdRow } from './TabWarningRows';
import { AssignmentSettingsToggleGroup } from './AssignmentSettingsToggleGroup';
import { CollapsibleSection } from './CollapsibleSection';
import { ToggleRow } from './AssignmentSettingsToggleGroup';
import type { AssignModeOption } from './types';
import { SESSION_MODES } from './sessionModes';

export interface QuizBehaviorSettingsPanelProps {
  value: QuizBehaviorSettings;
  onChange: (next: QuizBehaviorSettings) => void;
  /**
   * When true, the mode selector buttons are disabled (e.g. live assignment).
   * Default false.
   */
  modeLocked?: boolean;
  /** Shows the "Read aloud" toggle; the host resolves the 'quiz-read-aloud' gate. */
  readAloudAvailable?: boolean;
  /** Admin raise-hand gate; the checkbox is hidden unless this is 'teacher-choice'. */
  handRaiseMode?: QuizHandRaiseMode;
}

export const QuizBehaviorSettingsPanel: React.FC<
  QuizBehaviorSettingsPanelProps
> = ({
  value,
  onChange,
  modeLocked = false,
  readAloudAvailable = false,
  handRaiseMode = DEFAULT_QUIZ_HAND_RAISE_MODE,
}) => {
  const { t } = useTranslation();
  // Read via context so a provider-less host hides the row instead of throwing.
  const tabAwayTimerOn =
    useContext(AuthContext)?.canAccessFeature?.('tab-away-timer') === true;
  const modes: AssignModeOption[] = SESSION_MODES.map((m) => ({
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
                  {mode.description && (
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                      {mode.description}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toggle group: integrity / feedback / randomization + gamification */}
      <AssignmentSettingsToggleGroup
        modeLocked={modeLocked}
        showCopyPasteToggle
        showLearningTargetsToggle
        options={{
          tabWarningsEnabled: value.sessionOptions.tabWarningsEnabled,
          blockCopyPaste: value.sessionOptions.blockCopyPaste,
          showResultToStudent: value.sessionOptions.showResultToStudent,
          showCorrectAnswerToStudent:
            value.sessionOptions.showCorrectAnswerToStudent,
          showCorrectOnBoard: value.sessionOptions.showCorrectOnBoard,
          showLearningTargets: value.sessionOptions.showLearningTargets,
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
        afterTabWarningsSlot={
          (value.sessionOptions.tabWarningsEnabled ?? true) && (
            <>
              <TabWarningThresholdRow
                value={value.sessionOptions.tabWarningThreshold}
                onChange={(next) =>
                  onChange({
                    ...value,
                    sessionOptions: {
                      ...value.sessionOptions,
                      tabWarningThreshold: next,
                    },
                  })
                }
              />
              {tabAwayTimerOn && (
                <TabAwayLimitRow
                  autoSubmit={value.sessionOptions.tabAwayAutoSubmit}
                  seconds={value.sessionOptions.tabAwayLimitSeconds}
                  onChange={(next) =>
                    onChange({
                      ...value,
                      sessionOptions: { ...value.sessionOptions, ...next },
                    })
                  }
                />
              )}
            </>
          )
        }
        trailingSlot={
          <>
            {handRaiseMode === 'teacher-choice' && (
              <ToggleRow
                label={t(
                  'quizHandRaise.label',
                  'Allow students to raise a hand'
                )}
                checked={value.sessionOptions.handRaiseEnabled ?? false}
                onChange={(v) =>
                  onChange({
                    ...value,
                    sessionOptions: {
                      ...value.sessionOptions,
                      handRaiseEnabled: v,
                    },
                  })
                }
              />
            )}
            {readAloudAvailable && (
              <ToggleRow
                label={t('quizReadAloud.label', 'Read aloud')}
                checked={value.sessionOptions.readAloudAll ?? false}
                onChange={(v) =>
                  onChange({
                    ...value,
                    sessionOptions: {
                      ...value.sessionOptions,
                      readAloudAll: v,
                    },
                  })
                }
                hint={t('quizReadAloud.help', 'Signed-in students only.')}
              />
            )}
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
              />
              <ToggleRow
                compact
                label="Podium Between Questions"
                checked={
                  value.sessionOptions.showPodiumBetweenQuestions ?? false
                }
                onChange={(v) =>
                  onChange({
                    ...value,
                    sessionOptions: {
                      ...value.sessionOptions,
                      showPodiumBetweenQuestions: v,
                    },
                  })
                }
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
              />
            </CollapsibleSection>
          </>
        }
      />
    </>
  );
};
