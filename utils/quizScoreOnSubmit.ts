import { calcModifiedNeedsAnswer } from '@/utils/quizCalculated';
import { isFreeResponseType, type CalcSpec, type QuizQuestion } from '@/types';
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
  /** Random-number FIB: the formula the server grades each student's numbers with. */
  calc?: QuizQuestion['calc'];
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
    ...(q.type === 'FIB' && q.calc
      ? { calc: calcForKey(q.calc, q.modifiedText, q.text) }
      : {}),
  }));
}

/** Swaps in the given questions' keys by id; entries for questions not given are kept as they are. */
export function mergeScoreOnSubmitKey(
  existing: unknown,
  questions: QuizQuestion[]
): unknown[] {
  const fresh = new Map(buildScoreOnSubmitKey(questions).map((k) => [k.id, k]));
  return (Array.isArray(existing) ? existing : []).map((entry: unknown) => {
    const id =
      typeof entry === 'object' && entry !== null
        ? (entry as { id?: unknown }).id
        : undefined;
    return (typeof id === 'string' ? fresh.get(id) : undefined) ?? entry;
  });
}

/** The key keeps the modified answer only while the modified prompt has typed numbers. */
function calcForKey(
  calc: CalcSpec,
  modifiedText: string | undefined,
  text: string
): CalcSpec {
  if (!calc.modifiedAnswer || calcModifiedNeedsAnswer(modifiedText, calc, text))
    return calc;
  const { modifiedAnswer: _unused, ...rest } = calc;
  return rest;
}
