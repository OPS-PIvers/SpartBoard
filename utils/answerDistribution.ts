import type { QuizQuestion } from '@/types';
import { groupAnswersByOption } from '@/utils/quizQuestionDrilldown';
import { normalizeAnswer } from '@/hooks/useQuizSession';
import { displayFibAnswer } from '@/utils/quizFibBlanks';

export interface AnswerDistributionRow {
  label: string;
  count: number;
  isCorrect: boolean;
}

export interface AnswerDistribution {
  totalAnswered: number;
  /** Ordered rows: MC/MA use the option list, others group normalized answers. */
  rows: AnswerDistributionRow[];
}

type DistributionQuestion = Pick<
  QuizQuestion,
  'type' | 'correctAnswer' | 'incorrectAnswers'
>;

/** Bar rows for a set of submitted answer strings, one per student. */
export function distributionFromAnswers<Q extends DistributionQuestion>(
  question: Q,
  answers: readonly string[],
  gradeAnswer: (q: Q, answer: string) => { isCorrect: boolean }
): AnswerDistribution {
  const entries = answers.map((answer) => ({ answer, item: null }));
  return {
    totalAnswered: entries.length,
    rows: groupAnswersByOption(question, entries).map((g) => ({
      label: displayFibAnswer(g.label),
      count: g.items.length,
      isCorrect: g.isKey ?? gradeAnswer(question, g.label).isCorrect,
    })),
  };
}

/** Bar rows for one question across responses; a response without an answer is not counted. */
export function buildDistribution<
  Q extends DistributionQuestion & { id: string },
  R extends {
    answers: readonly { questionId: string; answer: string }[];
  },
>(
  question: Q,
  responses: readonly R[],
  gradeAnswer: (q: Q, answer: string) => { isCorrect: boolean },
  /** Grades each student's answer on its own (random numbers); a row is right when any of its students was. */
  gradeForResponse?: (response: R, answer: string) => boolean
): AnswerDistribution {
  const answers: string[] = [];
  const rightAnswers = new Set<string>();
  for (const r of responses) {
    const ans = r.answers.find((a) => a.questionId === question.id);
    if (!ans) continue;
    answers.push(ans.answer);
    if (gradeForResponse?.(r, ans.answer))
      rightAnswers.add(normalizeAnswer(ans.answer));
  }
  if (!gradeForResponse) {
    return distributionFromAnswers(question, answers, gradeAnswer);
  }
  return distributionFromAnswers(question, answers, (_q, label) => ({
    isCorrect: rightAnswers.has(normalizeAnswer(label)),
  }));
}
