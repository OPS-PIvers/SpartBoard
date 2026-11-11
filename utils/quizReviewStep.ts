// Review before submit and Mark for review (docs/plans/QUIZ_MCA_PRACTICE.md M23–M25).
import type {
  QuizPublicQuestion,
  QuizResponseAnswer,
  QuizSession,
} from '@/types';
import { cleanBlankAnswer } from './quizFibBlanks';

/** Self-paced sessions stamped with the flag end on the review screen; every other mode is unchanged (M25). */
export function reviewStepActive(
  session: Pick<QuizSession, 'reviewStep' | 'sessionMode'>
): boolean {
  return session.reviewStep === true && session.sessionMode === 'student';
}

/** True when a stored or in-progress answer says something, by the question's wire format. */
export function hasAnswerContent(
  type: QuizPublicQuestion['type'],
  raw: string | null | undefined
): boolean {
  if (!raw) return false;
  if (type === 'FIB') return cleanBlankAnswer(raw) !== '';
  if (type === 'Matching')
    return raw.split('|').some((pair) => {
      const sep = pair.indexOf(':');
      return sep >= 0 && pair.slice(sep + 1).trim() !== '';
    });
  return raw.trim() !== '';
}

export type ReviewStatus = 'answered' | 'unanswered' | 'locked';

export interface ReviewRow {
  id: string;
  /** Position in the student's own order, 0-based. */
  index: number;
  text: string;
  status: ReviewStatus;
  marked: boolean;
}

/** One row per question in the student's order; a typed answer that has not saved yet still counts. */
export function reviewRows(
  questions: readonly Pick<QuizPublicQuestion, 'id' | 'type' | 'text'>[],
  answers: readonly Pick<
    QuizResponseAnswer,
    'questionId' | 'answer' | 'artifacts'
  >[],
  pending: Readonly<Record<string, string>>,
  marked: ReadonlySet<string>,
  isLocked: (questionId: string) => boolean
): ReviewRow[] {
  return questions.map((q, index) => {
    const saved = answers.filter((a) => a.questionId === q.id);
    const answered =
      q.id in pending
        ? hasAnswerContent(q.type, pending[q.id])
        : saved.some(
            (a) =>
              hasAnswerContent(q.type, a.answer) ||
              (a.artifacts?.length ?? 0) > 0
          );
    return {
      id: q.id,
      index,
      text: q.text,
      status: isLocked(q.id) ? 'locked' : answered ? 'answered' : 'unanswered',
      marked: marked.has(q.id),
    };
  });
}

/** Counts for the review screen's summary line. */
export function reviewCounts(rows: readonly ReviewRow[]) {
  return {
    answered: rows.filter((r) => r.status === 'answered').length,
    unanswered: rows.filter((r) => r.status === 'unanswered').length,
    marked: rows.filter((r) => r.marked).length,
  };
}
