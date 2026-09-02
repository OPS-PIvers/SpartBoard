import type { QuizResponseAnswer } from '@/types';

/** The only fields completeness reads — keeps callers free of full-answer shapes. */
export type CompletenessAnswer = Pick<
  QuizResponseAnswer,
  'questionId' | 'unresponded'
>;

/**
 * The one binary "is this question answered" check for student-facing
 * progress and gate surfaces. Today a question is answered iff it has at
 * least one `answers[]` entry without an `unresponded` marker; multiple takes
 * of the same question still fill exactly one slot. Once brief 3.5 adds
 * per-question required-slot counts, extend here rather than in each caller.
 * Legacy documents carry no `unresponded` field, so any present entry counts
 * as answered — identical to the pre-field behaviour.
 */
export function isQuestionAnswered(
  answers: CompletenessAnswer[],
  questionId: string
): boolean {
  return answers.some((a) => a.questionId === questionId && !a.unresponded);
}

/** Student-facing binary count: how many of `questionIds` are answered. */
export function countAnsweredQuestions(
  answers: CompletenessAnswer[],
  questionIds: string[]
): number {
  return questionIds.filter((id) => isQuestionAnswered(answers, id)).length;
}
