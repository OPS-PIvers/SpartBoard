/**
 * Default + reader for the behavior settings that travel with a VideoActivity.
 * Mirrors `utils/quizBehavior.ts` for the VA widget.
 */

import type {
  VideoActivityBehaviorSettings,
  VideoActivityMetadata,
} from '@/types';

export const DEFAULT_VA_BEHAVIOR: VideoActivityBehaviorSettings = {
  sessionMode: 'teacher',
  sessionOptions: {
    tabWarningsEnabled: true,
    showResultToStudent: false,
    showCorrectAnswerToStudent: false,
    showCorrectOnBoard: false,
    shuffleQuestions: false,
    shuffleAnswerOptions: true,
    rewindOnIncorrectSeconds: 0,
    pointPenaltyOnIncorrect: 0,
    scoreVisibility: 'score-only',
  },
  attemptLimit: 1,
};

export function getVideoActivityBehavior(
  meta: Pick<VideoActivityMetadata, 'behavior'>
): VideoActivityBehaviorSettings {
  return meta.behavior ?? DEFAULT_VA_BEHAVIOR;
}
