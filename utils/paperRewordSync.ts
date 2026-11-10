/** Client half of `paperRewordSyncV1`: what a teacher's own paper test says at each letter. */
import type { QuizData } from '@/types';
import { rowsFromQuestion } from './quizChoiceRows';

export const PAPER_REWORD_SYNC_FEATURE = 'paper-reword-sync';

// The callable's limits; one oversized question must not fail the whole sync.
const MAX_SYNC_CHOICES = 8;
const MAX_SYNC_QUESTIONS = 500;
const MAX_SYNC_CHOICE_LENGTH = 5000;

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
    }))
    .filter(
      (q) =>
        q.choices.length > 0 &&
        q.choices.length <= MAX_SYNC_CHOICES &&
        q.choices.every((c) => c.length <= MAX_SYNC_CHOICE_LENGTH)
    )
    .slice(0, MAX_SYNC_QUESTIONS);
}
