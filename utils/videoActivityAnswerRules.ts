// What the self-paced VA player shows after an answer (va-quiz-alignment slice 5); mirrored in functions/src/videoActivityGrade.ts.
import type { VideoActivitySession } from '@/types';

export interface VideoActivityAnswerRules {
  /** Each student gets their own option order; otherwise one order for the class. */
  shuffleForEachStudent: boolean;
  showResult: boolean;
  revealAnswer: boolean;
  /** A wrong answer rewinds to the previous question and asks again. */
  requireCorrectAnswer: boolean;
}

/** Sessions without `answerRulesSet` play exactly as before the rules existed. */
export function videoActivityAnswerRules(
  session: Pick<VideoActivitySession, 'settings' | 'sessionOptions'> | null
): VideoActivityAnswerRules {
  const requireCorrect = session?.settings?.requireCorrectAnswer ?? true;
  const o = session?.sessionOptions;
  if (o?.answerRulesSet !== true)
    return {
      shuffleForEachStudent: false,
      showResult: true,
      revealAnswer: true,
      requireCorrectAnswer: requireCorrect,
    };
  const showResult = o.showResultToStudent !== false;
  return {
    shuffleForEachStudent: o.shuffleAnswerOptions !== false,
    showResult,
    revealAnswer: showResult && o.showCorrectAnswerToStudent !== false,
    // Retrying until right would give away a hidden result or answer.
    requireCorrectAnswer:
      requireCorrect && showResult && o.showCorrectAnswerToStudent !== false,
  };
}
