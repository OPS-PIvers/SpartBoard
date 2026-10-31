// Maps Video Activity questions to and from the Quiz editor's shape; VA storage is unchanged (docs/plans/VA_QUIZ_ALIGNMENT.md V7).
import type {
  QuizQuestion,
  QuizQuestionType,
  VideoActivityQuestion,
  VideoActivityQuestionType,
} from '@/types';
import { FIB_BLANK_SEP } from '@/utils/quizFibBlanks';

/** Question types the Quiz editor offers for a Video Activity. */
export const VA_EDITOR_TYPES: readonly QuizQuestionType[] = ['MC', 'FIB', 'MA'];

/** With short answer on, the Quiz editor's written type stands in for VA 'SA'. */
export const VA_EDITOR_TYPES_WITH_SHORT_ANSWER: readonly QuizQuestionType[] = [
  ...VA_EDITOR_TYPES,
  'free-response',
];

const toVaType = (t: QuizQuestionType): VideoActivityQuestionType | null =>
  t === 'MC' || t === 'FIB' || t === 'MA'
    ? t
    : t === 'free-response'
      ? 'SA'
      : null;

/** The Quiz editor's view of a VA question: accepted variants become alternate answers. */
export function vaToQuizQuestion(q: VideoActivityQuestion): QuizQuestion {
  const { acceptableVariants, timestamp: _timestamp, type, ...rest } = q;
  return {
    ...rest,
    type: type === 'SA' ? 'free-response' : type,
    ...(acceptableVariants && acceptableVariants.length > 0
      ? { alternateAnswers: acceptableVariants }
      : {}),
  };
}

/** A Quiz editor patch as a VA patch; null for a type VA can't play. */
export function quizUpdatesToVa(
  updates: Partial<QuizQuestion>
): Partial<VideoActivityQuestion> | null {
  const type = updates.type === undefined ? undefined : toVaType(updates.type);
  if (type === null) return null;
  const out: Partial<VideoActivityQuestion> = {};
  if (type !== undefined) out.type = type;
  if ('text' in updates && updates.text !== undefined) out.text = updates.text;
  if ('correctAnswer' in updates && updates.correctAnswer !== undefined)
    // VA grades one typed FIB answer, so a multi-blank key starts empty.
    out.correctAnswer = updates.correctAnswer.includes(FIB_BLANK_SEP)
      ? ''
      : updates.correctAnswer;
  if ('incorrectAnswers' in updates && updates.incorrectAnswers !== undefined)
    out.incorrectAnswers = updates.incorrectAnswers;
  if ('alternateAnswers' in updates)
    out.acceptableVariants = updates.alternateAnswers;
  if ('optionOrder' in updates) out.optionOrder = updates.optionOrder;
  if ('allowPartialCredit' in updates)
    out.allowPartialCredit = updates.allowPartialCredit;
  if ('points' in updates) out.points = updates.points;
  if ('timeLimit' in updates && updates.timeLimit !== undefined)
    out.timeLimit = updates.timeLimit;
  if ('targets' in updates) out.targets = updates.targets;
  if ('needsKey' in updates) out.needsKey = updates.needsKey;
  return out;
}
