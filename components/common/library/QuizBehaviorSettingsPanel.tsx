/**
 * QuizBehaviorSettingsPanel — reusable behavior settings UI for Quiz.
 *
 * Renders the AssignmentSettingsToggleGroup (integrity / feedback /
 * randomization toggles + attempt limit) and the gamification
 * CollapsibleSection. The session mode is fixed by the caller.
 *
 * Driven by the structured `QuizBehaviorSettings` shape. All edits call
 * `onChange` with a new `QuizBehaviorSettings` value — the parent owns state.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { QuizBehaviorSettings, QuizSessionOptions } from '@/types';
import {
  DEFAULT_QUIZ_HAND_RAISE_MODE,
  type QuizHandRaiseMode,
} from '@/utils/quizHandRaise';
import { TabAwayLimitRow, TabWarningThresholdRow } from './TabWarningRows';
import { tourTypeAttr } from '@/config/tourAnchors';
import { AssignmentSettingsToggleGroup } from './AssignmentSettingsToggleGroup';
import { CollapsibleSection } from './CollapsibleSection';
import { ToggleRow } from './AssignmentSettingsToggleGroup';
import { QUIZ_STUDENT_MODE_LABEL } from '@/utils/quizBehavior';
import { QuizTimeLimitRow } from './QuizTimeLimitRow';
import { useQuizRuleGates } from './assignStepper/QuizRuleStepGates';
import { patchQuizSessionOptions } from './assignStepper/QuizRuleStepValues';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

/**
 * Which options the panel shows:
 * - `live`: gamification kept (a launched assignment's mode is fixed).
 * - `quiz`: assessment only; no board reveal or gamification (D8/D9).
 * - `review`: reserved for the Review launch; behaves as `live` until that lands.
 */
export type QuizBehaviorPanelVariant = 'live' | 'quiz' | 'review';

export interface QuizBehaviorSettingsPanelProps {
  value: QuizBehaviorSettings;
  onChange: (next: QuizBehaviorSettings) => void;
  /** When true, the toggles are disabled (e.g. live assignment). Default false. */
  modeLocked?: boolean;
  /** Which options show; defaults to `live`. */
  variant?: QuizBehaviorPanelVariant;
  /** Shows the "Read aloud" toggle; the host resolves the 'quiz-read-aloud' gate. */
  readAloudAvailable?: boolean;
  /** Admin raise-hand gate; the checkbox is hidden unless this is 'teacher-choice'. */
  handRaiseMode?: QuizHandRaiseMode;
  /** A question needs a teacher grade, so "Show score on submit" is unavailable. */
  hasManualGrading?: boolean;
}

export const QuizBehaviorSettingsPanel: React.FC<
  QuizBehaviorSettingsPanelProps
> = ({
  value,
  onChange,
  modeLocked = false,
  variant = 'live',
  readAloudAvailable = false,
  handRaiseMode = DEFAULT_QUIZ_HAND_RAISE_MODE,
  hasManualGrading = false,
}) => {
  const { t } = useTranslation();
  const assessmentOnly = variant === 'quiz';
  const gates = useQuizRuleGates();
  const { tabAwayTimerOn, scoreOnSubmitOn } = gates;
  const timeLimitOn =
    gates.timeLimitOn && (assessmentOnly || value.sessionMode === 'student');
  const patch = (next: Partial<QuizSessionOptions>) =>
    onChange(patchQuizSessionOptions(value, next));
  const scoreOnSubmit =
    !hasManualGrading && value.sessionOptions.showScoreOnSubmit === true;
  return (
    <>
      {/* Toggle group: integrity / feedback / randomization + gamification */}
      <AssignmentSettingsToggleGroup
        modeLocked={modeLocked}
        anchors={{
          focusMode: tourTypeAttr('quiz-settings.focus-mode', 'quiz'),
          copyPaste: tourTypeAttr('quiz-settings.block-copy-paste', 'quiz'),
          shuffleQuestions: tourTypeAttr(
            'quiz-settings.shuffle-questions',
            'quiz'
          ),
          shuffleAnswerOptions: tourTypeAttr(
            'quiz-settings.shuffle-answers',
            'quiz'
          ),
        }}
        showCopyPasteToggle
        showLearningTargetsToggle
        hideCorrectOnBoard={assessmentOnly}
        feedbackLeadingSlot={
          scoreOnSubmitOn && (
            <ToggleRow
              compact
              label={t('quizScoreOnSubmit.label', 'Show score on submit')}
              anchor={tourFieldAttr(
                'assign-quiz-behavior.toggle',
                'assign',
                'score-on-submit'
              )}
              checked={scoreOnSubmit}
              disabled={hasManualGrading}
              onChange={(v) => patch({ showScoreOnSubmit: v })}
              hint={
                hasManualGrading
                  ? t(
                      'quizScoreOnSubmit.unavailable',
                      'Not available with free-response questions.'
                    )
                  : scoreOnSubmit
                    ? t(
                        'quizScoreOnSubmit.on',
                        'Students see their score as soon as they submit.'
                      )
                    : t(
                        'quizScoreOnSubmit.off',
                        'Students see their score when you publish results.'
                      )
              }
            />
          )
        }
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
        onOptionsChange={(next) => patch(next)}
        attemptLimit={value.attemptLimit}
        onAttemptLimitChange={(v) => onChange({ ...value, attemptLimit: v })}
        afterAttemptLimitSlot={
          timeLimitOn && (
            <QuizTimeLimitRow
              minutes={value.sessionOptions.timeLimitMinutes}
              onChange={(next) => patch({ timeLimitMinutes: next })}
            />
          )
        }
        shuffleQuestionsAvailable={
          assessmentOnly || value.sessionMode === 'student'
        }
        shuffleQuestionsHint={`${QUIZ_STUDENT_MODE_LABEL} only.`}
        afterTabWarningsSlot={
          (value.sessionOptions.tabWarningsEnabled ?? true) && (
            <>
              <TabWarningThresholdRow
                value={value.sessionOptions.tabWarningThreshold}
                onChange={(next) => patch({ tabWarningThreshold: next })}
              />
              {tabAwayTimerOn && (
                <TabAwayLimitRow
                  autoSubmit={value.sessionOptions.tabAwayAutoSubmit}
                  seconds={value.sessionOptions.tabAwayLimitSeconds}
                  onChange={(next) => patch(next)}
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
                anchor={tourFieldAttr(
                  'assign-quiz-behavior.toggle',
                  'assign',
                  'raise-hand'
                )}
                checked={value.sessionOptions.handRaiseEnabled ?? false}
                onChange={(v) => patch({ handRaiseEnabled: v })}
              />
            )}
            {readAloudAvailable && (
              <ToggleRow
                label={t('quizReadAloud.label', 'Read aloud')}
                anchor={tourFieldAttr(
                  'assign-quiz-behavior.toggle',
                  'assign',
                  'read-aloud'
                )}
                checked={value.sessionOptions.readAloudAll ?? false}
                onChange={(v) => patch({ readAloudAll: v })}
                hint={t('quizReadAloud.help', 'Signed-in students only.')}
              />
            )}
            {!assessmentOnly && (
              <CollapsibleSection
                label="Gamification"
                anchor={tourAttr('assign-quiz-behavior.gamification')}
              >
                <ToggleRow
                  compact
                  label="Speed Bonus Points"
                  anchor={tourFieldAttr(
                    'assign-quiz-behavior.toggle',
                    'assign',
                    'speed-bonus'
                  )}
                  checked={value.sessionOptions.speedBonusEnabled ?? false}
                  onChange={(v) => patch({ speedBonusEnabled: v })}
                  hint="Up to 50% bonus for fast answers"
                />
                <ToggleRow
                  compact
                  label="Streak Bonuses"
                  anchor={tourFieldAttr(
                    'assign-quiz-behavior.toggle',
                    'assign',
                    'streak-bonus'
                  )}
                  checked={value.sessionOptions.streakBonusEnabled ?? false}
                  onChange={(v) => patch({ streakBonusEnabled: v })}
                />
                <ToggleRow
                  compact
                  label="Podium Between Questions"
                  anchor={tourFieldAttr(
                    'assign-quiz-behavior.toggle',
                    'assign',
                    'podium'
                  )}
                  checked={
                    value.sessionOptions.showPodiumBetweenQuestions ?? false
                  }
                  onChange={(v) => patch({ showPodiumBetweenQuestions: v })}
                />
                <ToggleRow
                  compact
                  label="Sound Effects"
                  checked={value.sessionOptions.soundEffectsEnabled ?? false}
                  onChange={(v) => patch({ soundEffectsEnabled: v })}
                />
              </CollapsibleSection>
            )}
          </>
        }
      />
    </>
  );
};
