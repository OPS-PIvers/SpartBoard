// Messages the preview card puts in the chat; each names the item so Claude can find it.
import type {
  QuestionView,
  QuizView,
  RubricCriterionView,
  RubricView,
} from './types';

const MAX_ASK = 2000;
const PREFIX = 'From the preview card:';
export { MAX_ASK };

/** Collapses what the host refuses in a message: long runs of blank lines and spaces. */
export function cleanMessage(text: string): string {
  return text
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]{65,}/g, ' ')
    .trim();
}

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export const quizName = (v: QuizView) =>
  `the ${v.kind === 'quiz' ? 'quiz' : 'question bank'} "${v.title}" (${v.kind === 'quiz' ? 'quiz_id' : 'bank_id'} ${v.id})`;

export function questionMessage(
  v: QuizView,
  q: QuestionView,
  ask: string
): string {
  return cleanMessage(
    `${PREFIX} in ${quizName(v)}, change question ${q.n}: ${clip(ask.trim(), MAX_ASK)}`
  );
}

export function rubricDraftMessage(v: QuizView, q: QuestionView): string {
  return cleanMessage(
    `${PREFIX} draft a scoring rubric for question ${q.n} of ${quizName(v)} and attach it to that question. Ask me anything you need first. The question reads: "${clip(q.text, 400)}"`
  );
}

export function wholeQuizMessage(v: QuizView, ask: string): string {
  return cleanMessage(
    `${PREFIX} change ${quizName(v)}: ${clip(ask.trim(), MAX_ASK)}`
  );
}

export function criterionMessage(
  v: RubricView,
  c: RubricCriterionView,
  ask: string
): string {
  return cleanMessage(
    `${PREFIX} in the rubric "${v.title}" (rubric_id ${v.rubric_id}), change the "${c.name}" criterion: ${clip(ask.trim(), MAX_ASK)}`
  );
}

export function wholeRubricMessage(v: RubricView, ask: string): string {
  return cleanMessage(
    `${PREFIX} change the rubric "${v.title}" (rubric_id ${v.rubric_id}): ${clip(ask.trim(), MAX_ASK)}`
  );
}
