/**
 * Default + reader for the behavior settings that travel with a quiz.
 * Mirrors `utils/videoActivityBehavior.ts` for the Quiz widget.
 *
 * Also exports `formatSessionMode` and `formatBehaviorSummary` so both the
 * standalone QuizManager assign modal (Task 9) and the PLC assign modals
 * (Task 10) can render the same read-only behavior summary without
 * duplicating the formatting logic.
 */

import type {
  QuizBehaviorSettings,
  QuizMetadata,
  QuizSessionMode,
} from '@/types';

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

/** Human-readable label for a quiz session mode. */
export function formatSessionMode(mode: QuizSessionMode): string {
  if (mode === 'teacher') return 'Teacher-paced';
  if (mode === 'auto') return 'Auto-progress';
  return 'Self-paced';
}

/**
 * Build a compact read-only behavior summary string from a quiz's behavior
 * settings.
 *
 * Example: "Teacher-paced · 1 attempt · shuffles answers"
 */
export function formatBehaviorSummary(behavior: QuizBehaviorSettings): string {
  const parts: string[] = [formatSessionMode(behavior.sessionMode)];
  if (behavior.attemptLimit === null) {
    parts.push('unlimited attempts');
  } else if (behavior.attemptLimit === 1) {
    parts.push('1 attempt');
  } else {
    parts.push(`${behavior.attemptLimit} attempts`);
  }
  if (behavior.sessionOptions.shuffleAnswerOptions)
    parts.push('shuffles answers');
  if (behavior.sessionOptions.shuffleQuestions)
    parts.push('shuffles questions');
  if (behavior.sessionOptions.showResultToStudent) parts.push('shows results');
  if (behavior.sessionOptions.speedBonusEnabled) parts.push('speed bonus');
  return parts.join(' · ');
}
