import React from 'react';
import { useTranslation } from 'react-i18next';
import type { QuizBehaviorSettings } from '@/types';
import {
  DEFAULT_QUIZ_TIME_LIMIT_MINUTES,
  QUIZ_TIME_LIMIT_MAX_MINUTES,
  QUIZ_TIME_LIMIT_MIN_MINUTES,
  clampQuizTimeLimitMinutes,
} from '@/utils/quizTimeLimit';
import { AttemptLimitRow } from '../AssignmentSettingsToggleGroup';
import { useQuizRuleGates } from './QuizRuleStepGates';
import { tourAttr } from '@/config/tourAnchors';
import { patchQuizSessionOptions } from './QuizRuleStepValues';
import { StepNumberField, StepToggleRow } from './QuizStepRows';

export interface QuizRuleStepProps {
  value: QuizBehaviorSettings;
  onChange: (next: QuizBehaviorSettings) => void;
}

/** "Attempts and order": attempts, time limit, shuffle questions, shuffle answer options (D8). */
export const QuizAttemptsStep: React.FC<QuizRuleStepProps> = ({
  value,
  onChange,
}) => {
  const { t } = useTranslation();
  const { timeLimitOn } = useQuizRuleGates();
  const o = value.sessionOptions;
  const minutes = clampQuizTimeLimitMinutes(o.timeLimitMinutes);
  const timeLabel = t('quizTimeLimit.label', 'Time limit');

  return (
    <div className="space-y-1.5">
      <div className="flex min-h-[2rem] flex-col justify-center">
        <AttemptLimitRow
          label="Attempts allowed"
          value={value.attemptLimit}
          onChange={(attemptLimit) => onChange({ ...value, attemptLimit })}
        />
      </div>
      {timeLimitOn && (
        <StepToggleRow
          label={timeLabel}
          anchor={tourAttr('stepper.time-limit')}
          checked={minutes != null}
          onChange={(on) =>
            onChange(
              patchQuizSessionOptions(value, {
                timeLimitMinutes: on ? DEFAULT_QUIZ_TIME_LIMIT_MINUTES : null,
              })
            )
          }
          field={
            minutes != null && (
              <StepNumberField
                value={minutes}
                min={QUIZ_TIME_LIMIT_MIN_MINUTES}
                max={QUIZ_TIME_LIMIT_MAX_MINUTES}
                ariaLabel={t('quizTimeLimit.minutes', 'Minutes')}
                unit={t('quizTimeLimit.unit', 'min')}
                onCommit={(timeLimitMinutes) =>
                  onChange(patchQuizSessionOptions(value, { timeLimitMinutes }))
                }
              />
            )
          }
        />
      )}
      <StepToggleRow
        label="Shuffle questions"
        checked={o.shuffleQuestions ?? false}
        onChange={(shuffleQuestions) =>
          onChange(patchQuizSessionOptions(value, { shuffleQuestions }))
        }
      />
      <StepToggleRow
        label="Shuffle answer options"
        checked={o.shuffleAnswerOptions ?? true}
        onChange={(shuffleAnswerOptions) =>
          onChange(patchQuizSessionOptions(value, { shuffleAnswerOptions }))
        }
      />
    </div>
  );
};
