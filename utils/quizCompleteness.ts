import type { QuizResponseAnswer } from '@/types';

/** The only fields completeness reads — keeps callers free of full-answer shapes. */
export type CompletenessAnswer = Pick<
  QuizResponseAnswer,
  'questionId' | 'unresponded' | 'artifacts'
>;

/**
 * A recording take whose artifacts all failed to upload never reaches the
 * teacher, so it fills no slot — the same rule `countCommittedTakes` applies,
 * including its treatment of an empty `artifacts` array as nothing committed.
 * Legacy answers carry no `artifacts` key at all and are unaffected.
 */
function isCommittedEntry(answer: CompletenessAnswer): boolean {
  if (answer.unresponded) return false;
  const artifacts = answer.artifacts;
  if (!artifacts) return true;
  return artifacts.some((art) => art?.uploadState !== 'failed');
}

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
  return answers.some(
    (a) => a.questionId === questionId && isCommittedEntry(a)
  );
}

/**
 * True when the student could still act on the question: nothing committed
 * and nothing closed it. A slot the prep timer closed, or one a dead
 * microphone marked `capture-unavailable`, is resolved rather than open — the
 * student cannot fill it, so it must never be counted against them at submit.
 */
export function isQuestionOpen(
  answers: CompletenessAnswer[],
  questionId: string
): boolean {
  if (isQuestionAnswered(answers, questionId)) return false;
  return !answers.some((a) => a.questionId === questionId && a.unresponded);
}

/** Which of `questionIds` the student can still answer, in the order given. */
export function listOpenQuestions(
  answers: CompletenessAnswer[],
  questionIds: string[]
): string[] {
  return questionIds.filter((id) => isQuestionOpen(answers, id));
}

/** How many of `questionIds` the student can still answer. */
export function countOpenQuestions(
  answers: CompletenessAnswer[],
  questionIds: string[]
): number {
  return listOpenQuestions(answers, questionIds).length;
}

/** Student-facing binary count: how many of `questionIds` are answered. */
export function countAnsweredQuestions(
  answers: CompletenessAnswer[],
  questionIds: string[]
): number {
  return questionIds.filter((id) => isQuestionAnswered(answers, id)).length;
}
