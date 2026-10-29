// Rules on a launched Video Activity assignment: the Settings dialog's value and what a Save writes (va-quiz-alignment slice 6).
import type {
  VideoActivityAssignment,
  VideoActivitySessionOptions,
  VideoActivitySessionSettings,
} from '@/types';
import {
  DEFAULT_VIDEO_PLAYER_SETTINGS,
  videoRewindAllowed,
  withoutAssignTimeOptions,
  type VideoAssignRules,
} from '@/components/common/library/assignStepper/VideoRuleStepValues';
import type { VideoAssignmentSettingsPatch } from '@/hooks/useVideoActivityAssignments';

const ANSWER_KEYS = [
  'shuffleAnswerOptions',
  'showResultToStudent',
  'showCorrectAnswerToStudent',
] as const;

/** The rule steps' value for an assignment; an unstamped session shows what its player does: one class-wide order, right and wrong, the answer. */
export function videoRulesFromAssignment(
  assignment: Pick<
    VideoActivityAssignment,
    'sessionOptions' | 'sessionSettings'
  >
): VideoAssignRules {
  const stored: VideoActivitySessionOptions = assignment.sessionOptions ?? {};
  const options = withoutAssignTimeOptions(stored);
  return {
    behavior: {
      sessionMode: 'student',
      attemptLimit: stored.attemptLimit ?? null,
      sessionOptions:
        stored.answerRulesSet === true
          ? options
          : {
              ...options,
              shuffleAnswerOptions: false,
              showResultToStudent: true,
              showCorrectAnswerToStudent: true,
            },
    },
    player: { ...DEFAULT_VIDEO_PLAYER_SETTINGS, ...assignment.sessionSettings },
  };
}

/** The player rules a session stores; rewind is off whenever the result or answer is hidden. */
function storedPlayer(rules: VideoAssignRules): VideoActivitySessionSettings {
  return {
    ...rules.player,
    requireCorrectAnswer:
      rules.player.requireCorrectAnswer && videoRewindAllowed(rules),
  };
}

/** Only the rule fields the teacher changed; touching an answer row on an unstamped session stamps it with all three rows. */
export function videoRulesPatch(
  assignment: Pick<
    VideoActivityAssignment,
    'sessionOptions' | 'sessionSettings'
  >,
  initial: VideoAssignRules,
  next: VideoAssignRules
): Pick<
  VideoAssignmentSettingsPatch,
  'sessionOptionEdits' | 'sessionSettings'
> {
  const before: Record<string, unknown> = initial.behavior.sessionOptions;
  const after: Record<string, unknown> = next.behavior.sessionOptions;
  const edits: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] !== after[key]) edits[key] = after[key] ?? null;
  }
  if (next.behavior.attemptLimit !== initial.behavior.attemptLimit)
    edits.attemptLimit = next.behavior.attemptLimit;
  const stamped = assignment.sessionOptions?.answerRulesSet === true;
  if (!stamped && ANSWER_KEYS.some((key) => key in edits)) {
    for (const key of ANSWER_KEYS) edits[key] = after[key] ?? true;
    edits.answerRulesSet = true;
  }
  const player = storedPlayer(next);
  const playerChanged =
    JSON.stringify(player) !== JSON.stringify(storedPlayer(initial));
  return {
    ...(Object.keys(edits).length > 0 ? { sessionOptionEdits: edits } : {}),
    ...(playerChanged ? { sessionSettings: player } : {}),
  };
}
