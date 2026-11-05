import type { QuizReadAloudManifest, QuizSession } from '@/types';
import { normalizeQuizSession } from '@/utils/quizQuestionNormalize';

export const QUIZ_CONTENT_COLLECTION = 'content';
export const QUIZ_CONTENT_DOC = 'questions';
/** `content/readAloud`: the per-period read-aloud audio paths, under the same period gate. */
export const QUIZ_READ_ALOUD_DOC = 'readAloud';

/** `quiz_sessions/{id}/content/questions`: what a per-period session hides until the period opens. */
export type QuizSessionContent = Pick<
  QuizSession,
  'publicQuestions' | 'stimuli' | 'readAloudTextByStimulusId'
>;

/** Folds the content doc into a per-period session; other sessions pass through unchanged. */
export function mergeQuizSessionContent(
  session: QuizSession | null,
  content: QuizSessionContent | null,
  readAloudPaths: Partial<QuizReadAloudManifest> | null = null
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
    ...(readAloudPaths
      ? {
          readAloud: {
            ...session.readAloud,
            ...readAloudPaths,
          } as QuizReadAloudManifest,
        }
      : {}),
  });
}
