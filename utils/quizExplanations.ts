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

type OptionedQuestion = Pick<
  QuizQuestion,
  'type' | 'correctAnswer' | 'incorrectAnswers' | 'optionExplanations'
>;

const optionSlots = (q: OptionedQuestion): string[] => [
  ...(q.type === 'MA' ? q.correctAnswer.split('|') : [q.correctAnswer]),
  ...q.incorrectAnswers,
];

/** Option explanations after an edit: a renamed option keeps its text, a deleted option's is dropped. */
export function rekeyOptionExplanations(
  prev: OptionedQuestion,
  next: OptionedQuestion
): Record<string, string> | undefined {
  const map = prev.optionExplanations;
  if (!map) return undefined;
  const before = optionSlots(prev);
  const after = optionSlots(next);
  const kept = new Set(after);
  const out: Record<string, string> = {};
  for (const [option, text] of Object.entries(map)) {
    if (kept.has(option)) out[option] = text;
  }
  if (before.length === after.length) {
    before.forEach((option, i) => {
      const moved = map[option];
      const blank = !option.trim();
      if (
        option !== after[i] &&
        (blank || !kept.has(option)) &&
        moved &&
        !(after[i] in out)
      ) {
        out[after[i]] = moved;
        if (blank && after[i].trim()) delete out[option];
      }
    });
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Drops explanations parked under a blank option while it was being retyped; Firestore refuses empty keys. */
export function withoutBlankOptionKeys<
  T extends { optionExplanations?: Record<string, string> },
>(q: T): T {
  const map = q.optionExplanations;
  if (!map || Object.keys(map).every((k) => k.trim())) return q;
  const kept = Object.fromEntries(
    Object.entries(map).filter(([k]) => k.trim())
  );
  const next = { ...q };
  if (Object.keys(kept).length > 0) next.optionExplanations = kept;
  else delete next.optionExplanations;
  return next;
}
