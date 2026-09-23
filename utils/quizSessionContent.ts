import type { QuizSession } from '@/types';
import { normalizeQuizSession } from '@/utils/quizQuestionNormalize';

export const QUIZ_CONTENT_COLLECTION = 'content';
export const QUIZ_CONTENT_DOC = 'questions';

/** `quiz_sessions/{id}/content/questions`: what a per-period session hides until the period opens. */
export type QuizSessionContent = Pick<
  QuizSession,
  'publicQuestions' | 'stimuli' | 'readAloudTextByStimulusId'
>;

/** Folds the content doc into a per-period session; other sessions pass through unchanged. */
export function mergeQuizSessionContent(
  session: QuizSession | null,
  content: QuizSessionContent | null
): QuizSession | null {
  if (!session?.questionsInContent || !content) return session;
  return normalizeQuizSession({
    ...session,
    publicQuestions: Array.isArray(content.publicQuestions)
      ? content.publicQuestions
      : [],
    ...(content.stimuli ? { stimuli: content.stimuli } : {}),
    ...(content.readAloudTextByStimulusId
      ? { readAloudTextByStimulusId: content.readAloudTextByStimulusId }
      : {}),
  });
}
