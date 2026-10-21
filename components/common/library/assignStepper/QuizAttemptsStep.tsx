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
import { patchQuizSessionOptions } from './QuizRuleStepValues';
import { StepNumberField, StepToggleRow } from './QuizStepRows';
import { tourFieldAttr } from '@/config/tourAnchors';

export interface QuizRuleStepProps {
  value: QuizBehaviorSettings;
  onChange: (next: QuizBehaviorSettings) => void;
}

const FINAL_SCORE_OPTIONS: {
  value: NonNullable<QuizBehaviorSettings['finalScore']>;
  label: string;
}[] = [
  { value: 'latest', label: 'Latest' },
  { value: 'highest', label: 'Highest' },
  { value: 'average', label: 'Average' },
];

/** "Attempts and order": attempts, time limit, shuffle questions, shuffle answer options (D8). */
export const QuizAttemptsStep: React.FC<QuizRuleStepProps> = ({
  value,
  onChange,
}) => {
  const { t } = useTranslation();
  const { timeLimitOn, finalScoreOn } = useQuizRuleGates();
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
      {finalScoreOn && value.attemptLimit !== 1 && (
        <div className="flex min-h-[2rem] items-center justify-between gap-3">
          <span className="text-sm font-bold text-brand-blue-dark">
            Final score
          </span>
          <div
            role="group"
            aria-label="Final score"
            className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            {FINAL_SCORE_OPTIONS.map((opt) => {
              const active = (value.finalScore ?? 'latest') === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ ...value, finalScore: opt.value })}
                  {...tourFieldAttr(
                    'assign-rule.final-score',
                    'assign',
                    opt.value
                  )}
                  className={
                    'px-3 py-1.5 text-xs font-bold transition ' +
                    (active
                      ? 'bg-brand-blue-primary text-white'
                      : 'text-slate-600 hover:bg-slate-50')
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {timeLimitOn && (
        <StepToggleRow
          label={timeLabel}
          anchor={tourFieldAttr('assign-rule.toggle', 'assign', 'time-limit')}
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
                anchor={tourFieldAttr(
                  'assign-rule.number',
                  'assign',
                  'time-limit'
                )}
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
        anchor={tourFieldAttr(
          'assign-rule.toggle',
          'assign',
          'shuffle-questions'
        )}
        checked={o.shuffleQuestions ?? false}
        onChange={(shuffleQuestions) =>
          onChange(patchQuizSessionOptions(value, { shuffleQuestions }))
        }
      />
      <StepToggleRow
        label="Shuffle answer options"
        anchor={tourFieldAttr(
          'assign-rule.toggle',
          'assign',
          'shuffle-answers'
        )}
        checked={o.shuffleAnswerOptions ?? true}
        onChange={(shuffleAnswerOptions) =>
          onChange(patchQuizSessionOptions(value, { shuffleAnswerOptions }))
        }
      />
    </div>
  );
};
