/**
 * How a run a substitute starts behaves — the only part of a launch its caller
 * supplies (plan §3.6). Everything a student can read is derived server-side
 * from the bundled answer key, and `launchSubAssignmentV1` refuses any field
 * outside its two allowlists by name, so every key here is deliberate.
 */

import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';

/**
 * Self-paced, unlike the teacher's own default. A substitute cannot pace a
 * question-by-question session through material they have not taught, and a
 * teacher-paced session nobody advances leaves the class on a waiting screen.
 */
export const SUB_LAUNCH_SESSION_MODE = 'student';

export interface SubLaunchRunSettings {
  session: Record<string, unknown>;
  assignment: Record<string, unknown>;
}

/**
 * The teacher's own authored behaviour does not travel in a share, so a
 * sub-launched run takes the shared defaults every quiz starts from.
 */
export function subLaunchRunSettings(
  className: string,
  startedAt: number
): SubLaunchRunSettings {
  const opts = DEFAULT_QUIZ_BEHAVIOR.sessionOptions;
  return {
    session: {
      status: 'active',
      sessionMode: SUB_LAUNCH_SESSION_MODE,
      currentQuestionIndex: 0,
      startedAt,
      endedAt: null,
      questionPhase: 'answering',
      completenessModel: 1,
      attemptLimit: DEFAULT_QUIZ_BEHAVIOR.attemptLimit,
      tabWarningsEnabled: opts.tabWarningsEnabled ?? true,
      blockCopyPaste: opts.blockCopyPaste ?? false,
      showResultToStudent: opts.showResultToStudent ?? false,
      showCorrectAnswerToStudent: opts.showCorrectAnswerToStudent ?? false,
      showCorrectOnBoard: opts.showCorrectOnBoard ?? false,
      shuffleQuestions: opts.shuffleQuestions ?? false,
      shuffleAnswerOptions: opts.shuffleAnswerOptions ?? true,
      speedBonusEnabled: opts.speedBonusEnabled ?? false,
      streakBonusEnabled: opts.streakBonusEnabled ?? false,
      showPodiumBetweenQuestions: opts.showPodiumBetweenQuestions ?? false,
      soundEffectsEnabled: opts.soundEffectsEnabled ?? false,
    },
    assignment: {
      status: 'active',
      mode: 'submissions',
      className,
      sessionMode: SUB_LAUNCH_SESSION_MODE,
      // Required on a `QuizAssignment`, and read unguarded by the teacher's
      // own settings panel, so a sub-launched run has to carry it.
      sessionOptions: { ...opts },
      attemptLimit: DEFAULT_QUIZ_BEHAVIOR.attemptLimit,
    },
  };
}
