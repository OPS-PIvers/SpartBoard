/**
 * FIB translation review gates (PR4 round-2). A FIB locale entry is only
 * publishable when it carries a translated answer (whenever English has one)
 * and keeps the same number of blank runs as the English stem.
 */

import type { QuestionTranslation, QuizQuestion } from '@/types';

const FIB_BLANK_RE = /_{2,}/g;

/** A run of two or more underscores is how a FIB stem writes a blank. */
export function countFibBlanks(text: string): number {
  return (text ?? '').match(FIB_BLANK_RE)?.length ?? 0;
}

export type FibTranslationIssue = 'missingAnswer' | 'blankCount';

/** `null` when the entry is publishable for this question. */
export function fibTranslationIssue(
  question: Pick<QuizQuestion, 'type' | 'text' | 'correctAnswer'>,
  entry: QuestionTranslation | undefined
): FibTranslationIssue | null {
  if (question.type !== 'FIB' || !entry) return null;
  if (
    (question.correctAnswer ?? '').trim() !== '' &&
    (entry.answer ?? '').trim() === ''
  )
    return 'missingAnswer';
  if (countFibBlanks(entry.text) !== countFibBlanks(question.text ?? ''))
    return 'blankCount';
  return null;
}
