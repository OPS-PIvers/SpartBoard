/**
 * How a run a substitute starts behaves — the only part of a launch its caller
 * supplies (plan §3.6). Everything a student can read is derived server-side
 * from the bundled answer key, and `launchSubAssignmentV1` refuses any field
 * outside its two allowlists by name, so every key here is deliberate.
 */

import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';
import { DEFAULT_VA_BEHAVIOR } from '@/utils/videoActivityBehavior';
import type { SubShareContentKind } from '@/types';

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
function quizRunSettings(
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

/**
 * A video activity is always self-paced — a student works through the video on
 * their own device — so there is no pacing choice to make here. The player's
 * own defaults stand: no autoplay, skipping allowed, and the shared behaviour
 * bag for everything else.
 */
function videoActivityRunSettings(className: string): SubLaunchRunSettings {
  const settings = {
    autoPlay: false,
    requireCorrectAnswer: false,
    allowSkipping: true,
  };
  // `attemptLimit` lives beside the bag in the behaviour type but inside it on
  // a session doc, which is where the player reads the cap from. Same fold the
  // teacher's own assign does in VideoActivityWidget/Widget.tsx.
  const sessionOptions = {
    ...DEFAULT_VA_BEHAVIOR.sessionOptions,
    attemptLimit: DEFAULT_VA_BEHAVIOR.attemptLimit,
  };
  return {
    session: {
      status: 'active',
      mode: 'submissions',
      settings,
      sessionOptions,
      assignmentName: className,
    },
    assignment: {
      status: 'active',
      mode: 'submissions',
      className,
      sessionSettings: settings,
      sessionOptions,
      scoreVisibility: 'score-only',
    },
  };
}

/**
 * A guided activity paces itself step by step on the student's own device, and
 * the teacher publishes its scores afterwards, so there is nothing to choose
 * here beyond starting it. The class is named by the rosters, which the server
 * writes, so the run carries no `className` of its own.
 */
function guidedLearningRunSettings(): SubLaunchRunSettings {
  return {
    session: { assignmentMode: 'submissions' },
    assignment: { status: 'active', assignmentMode: 'submissions' },
  };
}

/**
 * A flashcard run has one setting a sub could choose and it is not theirs to
 * choose: the Study kind, which the server derives, is the teacher's own
 * default, while a graded Check brings a mastery threshold and a
 * score-visibility setting that can reveal answers.
 */
function flashcardRunSettings(): SubLaunchRunSettings {
  return {
    session: { status: 'active' },
    assignment: { status: 'active' },
  };
}

/** The run settings for whichever kind the substitute is starting. */
export function subLaunchRunSettings(
  kind: SubShareContentKind,
  className: string,
  startedAt: number
): SubLaunchRunSettings {
  if (kind === 'videoActivity') return videoActivityRunSettings(className);
  if (kind === 'guidedLearning') return guidedLearningRunSettings();
  if (kind === 'flashcards') return flashcardRunSettings();
  return quizRunSettings(className, startedAt);
}
