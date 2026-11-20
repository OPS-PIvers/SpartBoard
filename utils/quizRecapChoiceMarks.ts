import type { QuizPublicQuestion } from '@/types';
import { parseMultiAnswer } from '@/utils/quizMultiAnswer';
import { normalizeAnswer } from '@/hooks/useQuizSession';

export type RecapChoiceMark = 'right' | 'wrong' | 'picked' | 'key' | 'none';

/** Per-option marks; with no key, only the whole-question verdict can color a pick. */
export function recapChoiceMarks(
  type: QuizPublicQuestion['type'],
  choices: readonly string[],
  studentAnswer: string,
  verdict: boolean | undefined,
  correctAnswer: string | undefined
): RecapChoiceMark[] {
  const split = (v: string) =>
    type === 'MA' ? parseMultiAnswer(v) : v ? [v] : [];
  const picked = new Set(split(studentAnswer).map(normalizeAnswer));
  const key = correctAnswer
    ? new Set(split(correctAnswer).map(normalizeAnswer))
    : null;
  return choices.map((c) => {
    const n = normalizeAnswer(c);
    const isPicked = picked.has(n);
    if (key) {
      if (isPicked) return key.has(n) ? 'right' : 'wrong';
      return key.has(n) ? 'key' : 'none';
    }
    if (!isPicked) return 'none';
    if (verdict === true) return 'right';
    // A wrong MC has one pick, so it is the wrong one; a wrong MA can't say which.
    if (verdict === false && type === 'MC') return 'wrong';
    return 'picked';
  });
}
