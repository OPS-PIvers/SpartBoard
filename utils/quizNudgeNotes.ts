import type { QuizNudgeNoteId } from '@/types';

/** How long a Nudge border stays up on the student's quiz. */
export const NUDGE_SHOW_MS = 6000;

export const NUDGE_NOTE_IDS: readonly QuizNudgeNoteId[] = [
  'see-me',
  'own-work',
  'keep-going',
];

/** English note text; the teacher's picker and the translation fallback share it. */
export const NUDGE_NOTE_TEXT: Record<QuizNudgeNoteId, string> = {
  'see-me': 'Please see me',
  'own-work': 'Eyes on your own work',
  'keep-going': 'Keep going',
};
