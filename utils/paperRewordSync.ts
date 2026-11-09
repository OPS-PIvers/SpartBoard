/** Client half of `paperRewordSyncV1`: what a teacher's own paper test says at each letter. */
import type { QuizData } from '@/types';
import { rowsFromQuestion } from './quizChoiceRows';

export const PAPER_REWORD_SYNC_FEATURE = 'paper-reword-sync';

export interface PaperRewordQuestion {
  questionId: string;
  choices: string[];
}

/** Every own-paper multiple choice question, in printed letter order. */
export function paperRewordQuestions(
  quiz: Pick<QuizData, 'questions'>
): PaperRewordQuestion[] {
  return quiz.questions
    .filter((q) => q.paperOwnTest && q.type === 'MC')
    .map((q) => ({
      questionId: q.id,
      choices: rowsFromQuestion(q).map((r) => r.text),
    }));
}
