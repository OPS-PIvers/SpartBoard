import type { QuizResponse } from '@/types';

/** Auto mode moves on once every student still taking the quiz has submitted (not just drafted) this question. */
export function everyoneAnsweredQuestion(
  responses: readonly Pick<QuizResponse, 'status' | 'answers'>[],
  questionId: string
): boolean {
  const taking = responses.filter((r) => r.status !== 'completed');
  return (
    taking.length > 0 &&
    taking.every((r) =>
      r.answers.some((a) => a.questionId === questionId && a.status !== 'draft')
    )
  );
}
