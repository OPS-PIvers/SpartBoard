/**
 * Default + reader for the behavior settings that travel with a VideoActivity.
 * Mirrors `utils/quizBehavior.ts` for the VA widget.
 *
 * Also exports `formatVideoActivityBehaviorSummary` so both the standalone
 * VideoActivityManager assign modal (VA Task 9 parity) and the PLC assign
 * modals (VA Task 10 parity) can render the same read-only behavior summary
 * without duplicating the formatting logic.
 */

import type {
  VideoActivityBehaviorSettings,
  VideoActivityMetadata,
  QuizSessionMode,
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

/** Human-readable label for a VA session mode (matches quiz formatter). */
export function formatVASessionMode(mode: QuizSessionMode): string {
  if (mode === 'teacher') return 'Teacher-paced';
  if (mode === 'auto') return 'Auto-progress';
  return 'Self-paced';
}

/**
 * Build a compact read-only behavior summary string from a VA's behavior
 * settings. Mirrors `formatBehaviorSummary` in `utils/quizBehavior.ts` but
 * covers VA-specific knobs: rewind, penalty, and score visibility.
 *
 * Example: "Teacher-paced · 1 attempt · rewind 15s · score only"
 */
export function formatVideoActivityBehaviorSummary(
  behavior: VideoActivityBehaviorSettings
): string {
  const parts: string[] = [formatVASessionMode(behavior.sessionMode)];

  if (behavior.attemptLimit === null) {
    parts.push('unlimited attempts');
  } else if (behavior.attemptLimit === 1) {
    parts.push('1 attempt');
  } else {
    parts.push(`${behavior.attemptLimit} attempts`);
  }

  const rewind = behavior.sessionOptions.rewindOnIncorrectSeconds ?? 0;
  if (rewind > 0) parts.push(`rewind ${rewind}s`);

  const penalty = behavior.sessionOptions.pointPenaltyOnIncorrect ?? 0;
  if (penalty > 0) parts.push(`−${penalty} pts penalty`);

  const visibility = behavior.sessionOptions.scoreVisibility ?? 'score-only';
  if (visibility === 'none') parts.push('scores hidden');
  else if (visibility === 'score-only') parts.push('score only');
  else if (visibility === 'score-and-responses')
    parts.push('score + responses');
  else if (visibility === 'score-responses-and-answers')
    parts.push('full review');

  if (behavior.sessionOptions.shuffleAnswerOptions)
    parts.push('shuffles answers');
  if (behavior.sessionOptions.shuffleQuestions)
    parts.push('shuffles questions');

  return parts.join(' · ');
}
