/**
 * Which capture modes a question authors, and the limit ceiling that set
 * implies. Only `'audio'` is buildable in this run — the table is
 * mode-generic so video needs no rework, not because video ships here.
 */

import type { QuizQuestion } from '@/types';
import { AUDIO_LIMIT_SECONDS_MAX } from '@/config/quizRecordingDefaults';

export type RecordingMode = 'audio' | 'video';

/** RR-A1 sub-decision 8. Whiteboard's ceilings are B-track and excluded. */
export const RECORDING_MODE_CEILING_SECONDS: Record<RecordingMode, number> = {
  audio: AUDIO_LIMIT_SECONDS_MAX,
  video: 120,
};

export const RECORDING_MODE_LABELS: Record<RecordingMode, string> = {
  audio: 'audio',
  video: 'video',
};

/**
 * The modes a question's recording block authors. There is no persisted
 * response-mode set yet, so a block means audio — never synthesise one.
 */
export function recordingModesForQuestion(
  question: Pick<QuizQuestion, 'recording'>
): RecordingMode[] {
  return question.recording ? ['audio'] : [];
}

export interface RecordingLimitCeiling {
  seconds: number;
  /** The mode imposing the ceiling — named in the clamp hint. */
  mode: RecordingMode;
}

/** The lowest ceiling across the authored modes. */
export function recordingLimitCeiling(
  modes: readonly RecordingMode[]
): RecordingLimitCeiling {
  const present: readonly RecordingMode[] =
    modes.length > 0 ? modes : ['audio'];
  let best: RecordingLimitCeiling = {
    seconds: RECORDING_MODE_CEILING_SECONDS[present[0]],
    mode: present[0],
  };
  for (const mode of present) {
    const seconds = RECORDING_MODE_CEILING_SECONDS[mode];
    if (seconds < best.seconds) best = { seconds, mode };
  }
  return best;
}

/** Count of recording slots a quiz asks each student to fill. */
export function countRecordingSlots(
  questions: readonly Pick<QuizQuestion, 'recording'>[]
): number {
  return questions.reduce((n, q) => (q.recording ? n + 1 : n), 0);
}
