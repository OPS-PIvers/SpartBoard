/**
 * The quiz editor's live advisory: warn-but-permit lines derived from the
 * questions as they are authored. Never blocks a save, never joins the
 * save-error path, and returns an empty list for every quiz that predates
 * media responses.
 */

import type { QuizQuestion, QuizStimulus } from '@/types';
import { countRecordingSlots } from '@/utils/quizRecordingModes';
import { groupIntoStimulusUnits } from '@/utils/quizShuffle';

export type QuizAdvisoryId =
  /** Neutral storage figure — a fact, never a warning. */
  | 'recording-slots'
  /** A mic the device blocks lands the question on the teacher's desk. */
  | 'device-blocked'
  /** Stimulus grouping collapses the question shuffle to a no-op. */
  | 'shuffle-noop'
  /** Text baked into an image is never translated (D10). */
  | 'stimulus-text';

export interface QuizAdvisoryLine {
  id: QuizAdvisoryId;
  text: string;
}

export interface QuizAuthoringAdvisoryInput {
  questions: readonly QuizQuestion[];
  /** Whether the authored behavior actually shuffles question order. */
  shuffleQuestionsEnabled?: boolean;
  /** Quiz stimuli; only consulted for the translation advisory. */
  stimuli?: readonly QuizStimulus[];
  /** True on the Languages tab, where the image-text caveat is relevant. */
  translationAvailable?: boolean;
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
  const {
    questions,
    shuffleQuestionsEnabled = false,
    stimuli,
    translationAvailable = false,
  } = input;
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

  if (translationAvailable) {
    const referenced = new Set(questions.flatMap((q) => q.stimulusIds ?? []));
    const imageCount = (stimuli ?? []).filter(
      (s) => referenced.has(s.id) && (s.type === 'image' || s.type === 'pdf')
    ).length;
    if (imageCount > 0) {
      lines.push({
        id: 'stimulus-text',
        text: t('quizTranslation.authoring.advisory.stimulusText', {
          count: imageCount,
        }),
      });
    }
  }

  return lines;
}
