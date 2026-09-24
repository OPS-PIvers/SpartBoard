import type { QuizQuestion } from '@/types';

// A revealed FIB key lists its accepted answers one per line; a typed blank can't hold a newline.
const REVEAL_SEPARATOR = '\n';

/** Alternate answers with blanks and repeats of the main answer dropped. */
export function fibAlternateAnswers(
  q: Pick<QuizQuestion, 'type' | 'correctAnswer' | 'alternateAnswers'>
): string[] {
  if (q.type !== 'FIB') return [];
  const main = q.correctAnswer.trim().toLowerCase();
  const seen = new Set<string>([main]);
  const out: string[] = [];
  for (const raw of q.alternateAnswers ?? []) {
    const a = raw.trim();
    if (!a || seen.has(a.toLowerCase())) continue;
    seen.add(a.toLowerCase());
    out.push(a);
  }
  return out;
}

/** The value written to `revealedAnswers` for one question. */
export function revealValueFor(
  q: Pick<QuizQuestion, 'type' | 'correctAnswer' | 'alternateAnswers'>
): string {
  const alternates = fibAlternateAnswers(q);
  return alternates.length === 0
    ? q.correctAnswer
    : [q.correctAnswer, ...alternates].join(REVEAL_SEPARATOR);
}

/** Every accepted answer carried by a revealed value. */
export function splitRevealedAnswer(revealed: string): string[] {
  return revealed.split(REVEAL_SEPARATOR);
}

/** "color (also accepted: colour)" for a revealed FIB value; other values unchanged. */
export function formatRevealedAnswer(revealed: string): string {
  const [main, ...rest] = splitRevealedAnswer(revealed);
  return rest.length === 0
    ? revealed
    : `${main} (also accepted: ${rest.join(', ')})`;
}
