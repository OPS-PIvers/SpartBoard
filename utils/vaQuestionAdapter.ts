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

const isVaType = (t: QuizQuestionType): t is VideoActivityQuestionType =>
  t === 'MC' || t === 'FIB' || t === 'MA';

/** The Quiz editor's view of a VA question: accepted variants become alternate answers. */
export function vaToQuizQuestion(q: VideoActivityQuestion): QuizQuestion {
  const { acceptableVariants, timestamp: _timestamp, ...rest } = q;
  return {
    ...rest,
    ...(acceptableVariants && acceptableVariants.length > 0
      ? { alternateAnswers: acceptableVariants }
      : {}),
  };
}

/** A Quiz editor patch as a VA patch; null for a type VA can't play. */
export function quizUpdatesToVa(
  updates: Partial<QuizQuestion>
): Partial<VideoActivityQuestion> | null {
  if (updates.type !== undefined && !isVaType(updates.type)) return null;
  const out: Partial<VideoActivityQuestion> = {};
  if (updates.type !== undefined) out.type = updates.type;
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
