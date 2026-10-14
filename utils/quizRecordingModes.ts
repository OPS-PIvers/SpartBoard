/**
 * Which capture modes a question authors, and the limit ceiling that set
 * implies. Audio and whiteboard are buildable; video is not.
 */

import type { QuizQuestion } from '@/types';
import { AUDIO_LIMIT_SECONDS_MAX } from '@/config/quizRecordingDefaults';

export type RecordingMode = 'audio' | 'video' | 'whiteboard';

/** RR-A1 sub-decision 8; whiteboard shares audio's ceiling (QUIZ_WHITEBOARD_RESPONSE D3). */
export const RECORDING_MODE_CEILING_SECONDS: Record<RecordingMode, number> = {
  audio: AUDIO_LIMIT_SECONDS_MAX,
  video: 120,
  whiteboard: AUDIO_LIMIT_SECONDS_MAX,
};

/** Locale keys under `quizMediaResponse.authoring` — the label itself is i18n's. */
export const RECORDING_MODE_LABEL_KEYS: Record<RecordingMode, string> = {
  audio: 'modeLabelAudio',
  video: 'modeLabelVideo',
  whiteboard: 'modeLabelWhiteboard',
};

/** The mode a question's recording block authors; a block with no `mode` means audio (C5). */
export function recordingModesForQuestion(
  question: Pick<QuizQuestion, 'recording'>
): RecordingMode[] {
  if (!question.recording) return [];
  return [question.recording.mode === 'whiteboard' ? 'whiteboard' : 'audio'];
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
