import type { QuizBehaviorSettings, QuizSessionOptions } from '@/types';
import { clampQuizTimeLimitMinutes } from '@/utils/quizTimeLimit';

/** Feature gates shared by the legacy Quiz settings panel and the stepper's Quiz rule steps. */
export interface QuizRuleGates {
  timeLimitOn: boolean;
  tabAwayTimerOn: boolean;
  scoreOnSubmitOn: boolean;
}

export interface QuizRuleStepContext extends Partial<QuizRuleGates> {
  /** A question needs a teacher grade, so "Show score on submit" is unavailable. */
  hasManualGrading?: boolean;
}

export const patchQuizSessionOptions = (
  value: QuizBehaviorSettings,
  patch: Partial<QuizSessionOptions>
): QuizBehaviorSettings => ({
  ...value,
  sessionOptions: { ...value.sessionOptions, ...patch },
});

/** Collapsed value for "Attempts and order". */
export function formatQuizAttemptsValue(
  value: QuizBehaviorSettings,
  context: QuizRuleStepContext = {}
): string {
  const o = value.sessionOptions;
  const parts: string[] = [
    value.attemptLimit === null
      ? 'Unlimited attempts'
      : `${value.attemptLimit} attempt${value.attemptLimit === 1 ? '' : 's'}`,
  ];
  const minutes = context.timeLimitOn
    ? clampQuizTimeLimitMinutes(o.timeLimitMinutes)
    : null;
  if (minutes != null) parts.push(`${minutes} min`);
  const shuffleQ = o.shuffleQuestions ?? false;
  const shuffleA = o.shuffleAnswerOptions ?? true;
  if (shuffleQ && shuffleA) parts.push('Shuffled');
  else if (shuffleQ) parts.push('Shuffled questions');
  else if (shuffleA) parts.push('Shuffled answers');
  return parts.join(', ');
}

/** Collapsed value for "Quiz integrity". */
export function formatQuizIntegrityValue(value: QuizBehaviorSettings): string {
  const o = value.sessionOptions;
  const parts: string[] = [];
  if (o.tabWarningsEnabled ?? true) parts.push('Focus mode');
  if (o.blockCopyPaste ?? false) parts.push('No copy and paste');
  return parts.join(', ') || 'Off';
}

/** Collapsed value for "What students see". */
export function formatQuizFeedbackValue(
  value: QuizBehaviorSettings,
  context: QuizRuleStepContext = {}
): string {
  const o = value.sessionOptions;
  const score =
    context.scoreOnSubmitOn === true &&
    !context.hasManualGrading &&
    o.showScoreOnSubmit === true;
  const rightWrong = o.showResultToStudent ?? false;
  const reveal = o.showCorrectAnswerToStudent ?? false;
  if (score && rightWrong && reveal)
    return 'Score, right and wrong, and the correct answers';
  if (score && rightWrong) return 'Their score and which answers were right';
  if (score) return 'Their score';
  if (!rightWrong && !reveal) return 'Nothing until I release results';
  return 'Custom';
}
