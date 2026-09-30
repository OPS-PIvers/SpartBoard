import { isFreeResponseType, type QuizQuestion } from '@/types';
import { questionHasRecordingSlot } from '@/utils/mediaGrading';
import { dedupeQuestionsById } from '@/utils/quizMaxPoints';

/** Doc id of the answer key under `users/{uid}/quiz_assignments/{id}/key/`. */
export const SCORE_ON_SUBMIT_KEY_DOC = 'answers';

/** One question of the server-only answer key `scoreQuizOnSubmitV1` grades with. */
export interface ScoreOnSubmitKeyQuestion {
  id: string;
  type: QuizQuestion['type'];
  points: number;
  correctAnswer: string;
  incorrectAnswers: string[];
  alternateAnswers?: string[];
  blankAlternates?: QuizQuestion['blankAlternates'];
  allowPartialCredit?: boolean;
  /** A recording slot needs a teacher grade, so the server never scores it. */
  recording?: true;
}

/** True when this question needs a teacher grade; Review skips these (plan D19). */
export function questionNeedsManualGrading(
  q: Pick<QuizQuestion, 'type' | 'recording'>
): boolean {
  return isFreeResponseType(q.type) || questionHasRecordingSlot(q);
}

/** True when any question needs a teacher grade, so scores can't show on submit. */
export function quizNeedsManualGrading(
  questions: readonly Pick<QuizQuestion, 'type' | 'recording'>[]
): boolean {
  return questions.some(questionNeedsManualGrading);
}

/** The answer key fields the server grader reads, first-wins on duplicate ids. */
export function buildScoreOnSubmitKey(
  questions: QuizQuestion[]
): ScoreOnSubmitKeyQuestion[] {
  return dedupeQuestionsById(questions).map((q) => ({
    id: q.id,
    type: q.type,
    points: q.points ?? 1,
    correctAnswer: q.correctAnswer ?? '',
    incorrectAnswers: q.incorrectAnswers ?? [],
    ...(q.alternateAnswers && q.alternateAnswers.length > 0
      ? { alternateAnswers: q.alternateAnswers }
      : {}),
    ...(q.blankAlternates && q.blankAlternates.length > 0
      ? { blankAlternates: q.blankAlternates }
      : {}),
    ...(q.allowPartialCredit ? { allowPartialCredit: true } : {}),
    ...(questionHasRecordingSlot(q) ? { recording: true as const } : {}),
  }));
}
