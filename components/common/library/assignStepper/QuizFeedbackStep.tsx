import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_QUIZ_HAND_RAISE_MODE,
  type QuizHandRaiseMode,
} from '@/utils/quizHandRaise';
import type { QuizRuleStepProps } from './QuizAttemptsStep';
import { useQuizRuleGates } from './QuizRuleStepGates';
import { patchQuizSessionOptions } from './QuizRuleStepValues';
import { StepToggleRow } from './QuizStepRows';
import { tourFieldAttr } from '@/config/tourAnchors';

export interface QuizFeedbackStepProps extends QuizRuleStepProps {
  /** A question needs a teacher grade, so "Show score on submit" is unavailable. */
  hasManualGrading?: boolean;
  /** Admin raise-hand gate; the row shows only for 'teacher-choice'. */
  handRaiseMode?: QuizHandRaiseMode;
  /** Shows "Read aloud"; the host resolves the 'quiz-read-aloud' gate. */
  readAloudAvailable?: boolean;
}

/** "What students see": score on submit, right and wrong, correct answer, learning targets, raise a hand (D8). */
export const QuizFeedbackStep: React.FC<QuizFeedbackStepProps> = ({
  value,
  onChange,
  hasManualGrading = false,
  handRaiseMode = DEFAULT_QUIZ_HAND_RAISE_MODE,
  readAloudAvailable = false,
}) => {
  const { t } = useTranslation();
  const { scoreOnSubmitOn } = useQuizRuleGates();
  const o = value.sessionOptions;
  const patch = (next: Parameters<typeof patchQuizSessionOptions>[1]) =>
    onChange(patchQuizSessionOptions(value, next));
  const rightWrong = o.showResultToStudent ?? false;

  return (
    <div className="space-y-1.5">
      {scoreOnSubmitOn && (
        <StepToggleRow
          label={t('quizScoreOnSubmit.label', 'Show score on submit')}
          anchor={tourFieldAttr(
            'assign-rule.toggle',
            'assign',
            'score-on-submit'
          )}
          checked={!hasManualGrading && o.showScoreOnSubmit === true}
          disabled={hasManualGrading}
          hint={
            hasManualGrading
              ? t(
                  'quizScoreOnSubmit.unavailable',
                  'Not available with free-response questions.'
                )
              : undefined
          }
          onChange={(showScoreOnSubmit) => patch({ showScoreOnSubmit })}
        />
      )}
      <StepToggleRow
        label="Show right and wrong to students"
        anchor={tourFieldAttr(
          'assign-rule.toggle',
          'assign',
          'show-right-wrong'
        )}
        checked={rightWrong}
        onChange={(showResultToStudent) => patch({ showResultToStudent })}
      />
      <StepToggleRow
        label="Reveal correct answer to students"
        anchor={tourFieldAttr('assign-rule.toggle', 'assign', 'reveal-correct')}
        checked={o.showCorrectAnswerToStudent ?? false}
        disabled={!rightWrong}
        onChange={(showCorrectAnswerToStudent) =>
          patch({ showCorrectAnswerToStudent })
        }
      />
      <StepToggleRow
        label="Group results by learning target"
        anchor={tourFieldAttr(
          'assign-rule.toggle',
          'assign',
          'learning-targets'
        )}
        checked={o.showLearningTargets ?? false}
        onChange={(showLearningTargets) => patch({ showLearningTargets })}
      />
      {handRaiseMode === 'teacher-choice' && (
        <StepToggleRow
          label={t('quizHandRaise.label', 'Allow students to raise a hand')}
          anchor={tourFieldAttr('assign-rule.toggle', 'assign', 'raise-hand')}
          checked={o.handRaiseEnabled ?? false}
          onChange={(handRaiseEnabled) => patch({ handRaiseEnabled })}
        />
      )}
      {readAloudAvailable && (
        <StepToggleRow
          label={t('quizReadAloud.label', 'Read aloud')}
          anchor={tourFieldAttr('assign-rule.toggle', 'assign', 'read-aloud')}
          checked={o.readAloudAll ?? false}
          hint={t('quizReadAloud.help', 'Signed-in students only.')}
          onChange={(readAloudAll) => patch({ readAloudAll })}
        />
      )}
    </div>
  );
};
