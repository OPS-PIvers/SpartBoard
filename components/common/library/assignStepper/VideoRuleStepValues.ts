// Values and collapsed summaries for the Video Activity rule steps (va-quiz-alignment V4, V5).
import type {
  VideoActivityBehaviorSettings,
  VideoActivitySessionSettings,
} from '@/types';

/** The player honors shuffle, right and wrong, and reveal answer on sessions stamped `answerRulesSet`. */
export const VIDEO_ANSWER_ROWS_READY = true;

export type VideoBehaviorOptions =
  VideoActivityBehaviorSettings['sessionOptions'];

/** Everything the VA rule steps edit: assignment policy plus the player rules. */
export interface VideoAssignRules {
  behavior: VideoActivityBehaviorSettings;
  player: VideoActivitySessionSettings;
}

/** Matches the widget drawer's read defaults in settings.schema.ts. */
export const DEFAULT_VIDEO_PLAYER_SETTINGS: Readonly<VideoActivitySessionSettings> =
  Object.freeze({
    autoPlay: false,
    requireCorrectAnswer: true,
    allowSkipping: false,
  });

/** Prefill for the answer rows: Quiz's defaults (a shuffle per student, right and wrong, reveal). */
export const VIDEO_ANSWER_ROW_DEFAULTS: Readonly<
  Pick<
    VideoBehaviorOptions,
    | 'shuffleAnswerOptions'
    | 'showResultToStudent'
    | 'showCorrectAnswerToStudent'
  >
> = Object.freeze({
  shuffleAnswerOptions: true,
  showResultToStudent: true,
  showCorrectAnswerToStudent: true,
});

export const patchVideoBehaviorOptions = (
  value: VideoAssignRules,
  patch: Partial<VideoBehaviorOptions>
): VideoAssignRules => ({
  ...value,
  behavior: {
    ...value.behavior,
    sessionOptions: { ...value.behavior.sessionOptions, ...patch },
  },
});

export const patchVideoPlayer = (
  value: VideoAssignRules,
  patch: Partial<VideoActivitySessionSettings>
): VideoAssignRules => ({ ...value, player: { ...value.player, ...patch } });

/** Collapsed value for "Attempts and order". */
export function formatVideoAttemptsValue(
  value: VideoAssignRules,
  answerRows: boolean = VIDEO_ANSWER_ROWS_READY
): string {
  const limit = value.behavior.attemptLimit;
  const parts = [
    limit === null
      ? 'Unlimited attempts'
      : `${limit} attempt${limit === 1 ? '' : 's'}`,
  ];
  if (
    answerRows &&
    (value.behavior.sessionOptions.shuffleAnswerOptions ?? true)
  )
    parts.push('Shuffled answers');
  return parts.join(', ');
}

/** Collapsed value for "Video". */
export function formatVideoPlaybackValue(value: VideoAssignRules): string {
  const p = value.player;
  const parts: string[] = [];
  if (p.allowSkipping) parts.push('Skipping ahead');
  if (p.requireCorrectAnswer) parts.push('Rewind on wrong answer');
  if (p.autoPlay) parts.push('Autoplay');
  return parts.join(', ') || 'Off';
}

/** Collapsed value for "Integrity". */
export function formatVideoIntegrityValue(value: VideoAssignRules): string {
  return (value.behavior.sessionOptions.tabWarningsEnabled ?? true)
    ? 'Focus mode'
    : 'Off';
}

/** Collapsed value for "What students see". */
export function formatVideoFeedbackValue(value: VideoAssignRules): string {
  const o = value.behavior.sessionOptions;
  const rightWrong = o.showResultToStudent ?? true;
  const reveal = rightWrong && (o.showCorrectAnswerToStudent ?? true);
  if (rightWrong && reveal) return 'Right and wrong, and the correct answers';
  if (rightWrong) return 'Which answers were right';
  return 'Nothing until I release results';
}

/** Stepper value from saved behavior; saved shuffle/feedback values never took effect, so they deliberately reset to what the player does today. */
export function videoRulesFromBehavior(
  behavior: VideoActivityBehaviorSettings,
  player: VideoActivitySessionSettings = DEFAULT_VIDEO_PLAYER_SETTINGS
): VideoAssignRules {
  return {
    behavior: {
      ...behavior,
      sessionOptions: {
        ...behavior.sessionOptions,
        ...VIDEO_ANSWER_ROW_DEFAULTS,
      },
    },
    player: { ...player },
  };
}
