// Pure question-edit helpers shared by the Quiz and Video Activity editors (docs/plans/VA_QUIZ_ALIGNMENT.md slice 1).
import {
  type QuizQuestion,
  type QuizQuestionType,
  isFreeResponseType,
} from '@/types';
import {
  countTextBlanks,
  fibBlankCount,
  isMultiBlank,
  joinBlanks,
  reshapeFibBlanks,
} from '@/utils/quizFibBlanks';

export const QUESTION_TYPES: {
  value: QuizQuestionType;
  label: string;
}[] = [
  {
    value: 'MC',
    label: 'Multiple Choice',
  },
  {
    value: 'FIB',
    label: 'Fill in the Blank',
  },
  {
    value: 'MA',
    label: 'Choose All That Apply',
  },
  {
    value: 'Matching',
    label: 'Matching',
  },
  {
    value: 'Ordering',
    label: 'Ordering',
  },
  {
    value: 'free-response',
    label: 'Free Response',
  },
];

/** Prompt edit for FIB: reshapes the blank answers when the blank count changes. */
export function fibPromptUpdate(
  q: QuizQuestion,
  text: string
): Partial<QuizQuestion> {
  if (q.type !== 'FIB') return { text };
  const blanks = countTextBlanks(text);
  if (isMultiBlank(q)) {
    return blanks === fibBlankCount(q)
      ? { text }
      : { text, ...reshapeFibBlanks(q, blanks) };
  }
  const grew = blanks > countTextBlanks(q.text);
  if (blanks < 2 || !grew) return { text };
  return { text, ...reshapeFibBlanks(q, blanks) };
}

/**
 * Updates for switching a question's type; null when nothing changes (MA is
 * Multiple Choice with a setting on). `stashedPoints` are the manual points
 * held aside while a rubric owned them.
 */
export function questionTypeChangeUpdates(
  q: QuizQuestion,
  nextType: QuizQuestionType,
  {
    mediaResponseAllowed,
    stashedPoints,
  }: { mediaResponseAllowed: boolean; stashedPoints?: number }
): Partial<QuizQuestion> | null {
  if (nextType === 'MC' && q.type === 'MA') return null;
  const isWritten = isFreeResponseType(nextType);
  // A rubric only applies to written types, and its Detach button
  // only renders there — so drop it here, restoring the stashed
  // manual points, or Points stays locked with no way to unlock.
  const droppingRubric = !isWritten && !!q.rubricSnapshot;
  // The Format row (Spoken) no longer has a "remove" affordance
  // for non-written types, so drop any stray recording block here.
  const droppingRecording = mediaResponseAllowed && !isWritten && !!q.recording;
  return {
    type: nextType,
    incorrectAnswers: nextType === 'MC' || nextType === 'MA' ? ['', ''] : [],
    alternateAnswers: undefined,
    blankAlternates: undefined,
    optionOrder: undefined,
    correctAnswer:
      nextType === 'FIB' && countTextBlanks(q.text) >= 2
        ? joinBlanks(Array(countTextBlanks(q.text)).fill(''))
        : '',
    matchingDistractors: undefined,
    // Reset written-specific fields when switching off written types
    placeholder: isWritten ? q.placeholder : undefined,
    maxWords: isWritten ? q.maxWords : undefined,
    noSpellCheck: isWritten ? q.noSpellCheck : undefined,
    rubricId: isWritten ? q.rubricId : undefined,
    rubricSnapshot: isWritten ? q.rubricSnapshot : undefined,
    rubricVisibleToStudents: isWritten ? q.rubricVisibleToStudents : undefined,
    ...(droppingRubric ? { points: stashedPoints ?? q.points ?? 1 } : {}),
    ...(droppingRecording
      ? {
          recording: undefined,
          timeLimit: q.recording?.priorTimeLimit ?? q.timeLimit,
        }
      : {}),
  };
}
