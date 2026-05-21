/**
 * VideoActivityBehaviorSettingsPanel — reusable behavior settings UI for
 * Video Activity.
 *
 * Renders the mode selector (Teacher-paced / Auto-progress / Self-paced),
 * the AssignmentSettingsToggleGroup (integrity / feedback / randomization
 * toggles + attempt limit), and VA-specific scoring options
 * (scoreVisibility in a Scoring CollapsibleSection).
 *
 * Driven by the structured `VideoActivityBehaviorSettings` shape. All edits
 * call `onChange` with a new `VideoActivityBehaviorSettings` value — the
 * parent owns state.
 *
 * Built fresh (no pre-existing VA assignment-settings modal extractable for
 * this UI). Mirrors `QuizBehaviorSettingsPanel` in structure.
 */

import React from 'react';
import { User, Zap, Clock } from 'lucide-react';
import type {
  VideoActivityBehaviorSettings,
  VideoActivityScoreVisibility,
  QuizSessionMode,
} from '@/types';
import { AssignmentSettingsToggleGroup } from './AssignmentSettingsToggleGroup';
import { CollapsibleSection } from './CollapsibleSection';
import type { AssignModeOption } from './types';

export interface VideoActivityBehaviorSettingsPanelProps {
  value: VideoActivityBehaviorSettings;
  onChange: (next: VideoActivityBehaviorSettings) => void;
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

const SCORE_VISIBILITY_OPTIONS: {
  value: VideoActivityScoreVisibility;
  label: string;
  hint: string;
}[] = [
  {
    value: 'none',
    label: 'Hidden',
    hint: "Students see 'Submitted' only — no score.",
  },
  {
    value: 'score-only',
    label: 'Score',
    hint: 'Students see their final score, no per-question detail.',
  },
  {
    value: 'score-and-responses',
    label: 'Score + responses',
    hint: 'Students see their score and which questions they got right/wrong.',
  },
  {
    value: 'score-responses-and-answers',
    label: 'Full review',
    hint: 'Students see their score, right/wrong, and the correct answers.',
  },
];

export const VideoActivityBehaviorSettingsPanel: React.FC<
  VideoActivityBehaviorSettingsPanelProps
> = ({ value, onChange, modeLocked = false }) => {
  const modes: AssignModeOption[] = MODES_BASE.map((m) => ({
    ...m,
    disabled: modeLocked,
  }));

  const handleModeChange = (id: string) => {
    if (modeLocked) return;
    onChange({ ...value, sessionMode: id as QuizSessionMode });
  };

  const currentVisibility =
    value.sessionOptions.scoreVisibility ?? 'score-only';

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

      {/* Toggle group: integrity / feedback / randomization + VA scoring */}
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
          <CollapsibleSection label="Scoring">
            <div className="space-y-3">
              <div>
                <p className="text-xxs font-bold text-brand-blue-primary/60 uppercase tracking-widest mb-2">
                  Score Visibility
                </p>
                <div className="grid gap-1.5">
                  {SCORE_VISIBILITY_OPTIONS.map((opt) => {
                    const selected = currentVisibility === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          onChange({
                            ...value,
                            sessionOptions: {
                              ...value.sessionOptions,
                              scoreVisibility: opt.value,
                            },
                          })
                        }
                        className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                          selected
                            ? 'border-brand-blue-primary bg-brand-blue-lighter/30'
                            : 'border-slate-200 hover:border-brand-blue-primary hover:bg-brand-blue-lighter/10'
                        }`}
                      >
                        <p className="text-xs font-bold text-slate-800">
                          {opt.label}
                        </p>
                        <p className="text-xxs text-slate-500 mt-0.5">
                          {opt.hint}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </CollapsibleSection>
        }
      />
    </>
  );
};
