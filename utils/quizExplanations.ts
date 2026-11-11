import type { QuizData, QuizQuestion, RevealedExplanations } from '@/types';

type ExplainedQuestion = Pick<
  QuizQuestion,
  | 'type'
  | 'correctAnswer'
  | 'incorrectAnswers'
  | 'explanation'
  | 'optionExplanations'
>;

const clean = (v: string | undefined): string => (v ?? '').trim();

/** The option texts of an MC or MA question, right ones first; empty for other types. */
export function explainableOptions(q: ExplainedQuestion): string[] {
  if (q.type !== 'MC' && q.type !== 'MA') return [];
  const right =
    q.type === 'MC' ? [q.correctAnswer] : q.correctAnswer.split('|');
  return [...right, ...q.incorrectAnswers].filter((o) => clean(o) !== '');
}

/** The question's explanations with blanks and options that no longer exist dropped; null when none remain. */
export function explanationsForQuestion(
  q: ExplainedQuestion
): RevealedExplanations[string] | null {
  const explanation = clean(q.explanation);
  const options: Record<string, string> = {};
  for (const option of explainableOptions(q)) {
    const text = clean(q.optionExplanations?.[option]);
    if (text) options[option] = text;
  }
  const hasOptions = Object.keys(options).length > 0;
  if (!explanation && !hasOptions) return null;
  return {
    ...(explanation ? { explanation } : {}),
    ...(hasOptions ? { options } : {}),
  };
}

/** Explanations by question id for a publish; null when none are written. */
export function buildRevealedExplanations(
  quizData: Pick<QuizData, 'questions'>
): RevealedExplanations | null {
  const out: RevealedExplanations = {};
  for (const q of quizData.questions) {
    if (out[q.id]) continue;
    const entry = explanationsForQuestion(q);
    if (entry) out[q.id] = entry;
  }
  return Object.keys(out).length > 0 ? out : null;
}
