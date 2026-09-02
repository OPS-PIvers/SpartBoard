/**
 * The quiz editor's live advisory: warn-but-permit lines derived from the
 * questions as they are authored. Never blocks a save, never joins the
 * save-error path, and returns an empty list for every quiz that predates
 * media responses.
 */

import type { QuizQuestion } from '@/types';
import { countRecordingSlots } from '@/utils/quizRecordingModes';
import { groupIntoStimulusUnits } from '@/utils/quizShuffle';

export type QuizAdvisoryId =
  /** Neutral storage figure — a fact, never a warning. */
  | 'recording-slots'
  /** A mic the device blocks lands the question on the teacher's desk. */
  | 'device-blocked'
  /** Stimulus grouping collapses the question shuffle to a no-op. */
  | 'shuffle-noop';

export interface QuizAdvisoryLine {
  id: QuizAdvisoryId;
  text: string;
}

export interface QuizAuthoringAdvisoryInput {
  questions: readonly QuizQuestion[];
  /** Whether the authored behavior actually shuffles question order. */
  shuffleQuestionsEnabled?: boolean;
}

type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * The district video gate has no client-readable signal, so that advisory
 * class is deliberately absent rather than faked.
 */
export function buildQuizAuthoringAdvisory(
  input: QuizAuthoringAdvisoryInput,
  t: Translate
): QuizAdvisoryLine[] {
  const { questions, shuffleQuestionsEnabled = false } = input;
  const lines: QuizAdvisoryLine[] = [];

  const slots = countRecordingSlots(questions);
  if (slots > 0) {
    lines.push({
      id: 'recording-slots',
      text: t('quizMediaResponse.authoring.advisory.slots', { count: slots }),
    });
    lines.push({
      id: 'device-blocked',
      text: t('quizMediaResponse.authoring.advisory.deviceBlocked'),
    });
  }

  if (shuffleQuestionsEnabled && questions.length > 1) {
    const units = groupIntoStimulusUnits(questions);
    if (units.length < 2) {
      lines.push({
        id: 'shuffle-noop',
        text: t('quizMediaResponse.authoring.advisory.shuffleNoOp'),
      });
    }
  }

  return lines;
}
