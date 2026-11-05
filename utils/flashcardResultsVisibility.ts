import type {
  FlashcardProgress,
  FlashcardPublishedVisibility,
  FlashcardSession,
  QuizScoreVisibility,
} from '@/types';
import {
  resolveResultsVisibility,
  type EffectiveResultsVisibility,
} from '@/utils/quizResultsVisibility';

/** A Check's class level in Quiz's terms; older Checks keep their two values, mapped, not migrated. */
export const flashcardClassVisibility = (
  visibility: FlashcardPublishedVisibility | undefined
): QuizScoreVisibility => {
  switch (visibility) {
    case 'score':
      return 'score-only';
    case 'score-and-answers':
      return 'score-responses-and-answers';
    case undefined:
      return 'none';
    default:
      return visibility;
  }
};

export const isFlashcardPublished = (
  visibility: FlashcardPublishedVisibility | undefined
): boolean => flashcardClassVisibility(visibility) !== 'none';

/** What one student may see: an unexpired per-student setting wins, else the class level. */
export const resolveFlashcardResultsVisibility = (
  session: Pick<
    FlashcardSession,
    'scoreVisibility' | 'scorePublishedAt' | 'protection'
  >,
  progress: Pick<FlashcardProgress, 'resultsOverride'> | null | undefined,
  now: number = Date.now()
): EffectiveResultsVisibility =>
  resolveResultsVisibility(
    {
      scoreVisibility: flashcardClassVisibility(session.scoreVisibility),
      scorePublishedAt: session.scorePublishedAt,
      protection: session.protection,
    },
    { resultsOverride: progress?.resultsOverride },
    now
  );

const QUIZ_LEVELS: readonly string[] = [
  'score-only',
  'score-and-responses',
  'score-responses-and-answers',
];

/** Assigned or published with flashcards-assign-v2: only those fields come from it. */
export const isFlashcardV2Check = (
  session: Pick<FlashcardSession, 'rules' | 'scoreVisibility' | 'protection'>
): boolean =>
  session.rules !== undefined ||
  session.protection !== undefined ||
  QUIZ_LEVELS.includes(session.scoreVisibility ?? '');
