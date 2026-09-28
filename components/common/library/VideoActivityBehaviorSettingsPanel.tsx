/**
 * VideoActivityBehaviorSettingsPanel — reusable behavior settings UI for
 * Video Activity.
 *
 * Renders the AssignmentSettingsToggleGroup (integrity / feedback / randomization
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

import React, { useContext } from 'react';
import type {
  VideoActivityBehaviorSettings,
  VideoActivityScoreVisibility,
} from '@/types';
import { AssignmentSettingsToggleGroup } from './AssignmentSettingsToggleGroup';
import { CollapsibleSection } from './CollapsibleSection';
import { PUBLISH_LEVEL_OPTIONS } from './publishScoreLevels';
import { TabAwayLimitRow, TabWarningThresholdRow } from './TabWarningRows';
import { AuthContext } from '@/context/AuthContextValue';

export interface VideoActivityBehaviorSettingsPanelProps {
  value: VideoActivityBehaviorSettings;
  onChange: (next: VideoActivityBehaviorSettings) => void;
  /** When true, the settings controls are locked (e.g. live assignment). */
  modeLocked?: boolean;
}

const SCORE_VISIBILITY_OPTIONS: {
  value: VideoActivityScoreVisibility;
  label: string;
}[] = [
  { value: 'none', label: 'Hidden' },
  ...PUBLISH_LEVEL_OPTIONS.map((opt) => ({
    value: opt.id as VideoActivityScoreVisibility,
    label: opt.title,
  })),
];

export const VideoActivityBehaviorSettingsPanel: React.FC<
  VideoActivityBehaviorSettingsPanelProps
> = ({ value, onChange, modeLocked = false }) => {
  // Read via context so a provider-less host hides the rows instead of throwing.
  const tabAwayTimerOn =
    useContext(AuthContext)?.canAccessFeature?.('tab-away-timer') === true;
  const currentVisibility =
    value.sessionOptions.scoreVisibility ?? 'score-only';

  return (
    <>
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
        hideShuffleQuestions
        afterTabWarningsSlot={
          tabAwayTimerOn &&
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
            </>
          )
        }
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
