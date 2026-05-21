import type { QuizBehaviorSettings, QuizMetadata } from '@/types';

export const DEFAULT_QUIZ_BEHAVIOR: QuizBehaviorSettings = {
  sessionMode: 'teacher',
  sessionOptions: {
    tabWarningsEnabled: true,
    showResultToStudent: false,
    showCorrectAnswerToStudent: false,
    showCorrectOnBoard: false,
    shuffleQuestions: false,
    shuffleAnswerOptions: true,
    speedBonusEnabled: false,
    streakBonusEnabled: false,
    showPodiumBetweenQuestions: false,
    soundEffectsEnabled: false,
  },
  attemptLimit: 1,
};

export function getQuizBehavior(
  meta: Pick<QuizMetadata, 'behavior'>
): QuizBehaviorSettings {
  return meta.behavior ?? DEFAULT_QUIZ_BEHAVIOR;
}
