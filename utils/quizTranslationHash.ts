/** Keep in sync with `functions/src/quizTranslationHash.ts` — both runtimes must agree byte for byte. */

import type { QuizQuestion } from '@/types';

/** Absent, `undefined` and `''` all collapse to this sentinel. */
const EMPTY = '';

/** Recursive key-sorted JSON so a rubric's property order cannot change the hash. */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`
      );
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Positional, normalized, filtered. Nothing here may sort the choice arrays:
 * swapping the key with a distractor MUST read stale (plan §9.1).
 */
export function serializeQuestionForHash(q: QuizQuestion): string {
  return stableStringify([
    q.type,
    q.text ?? EMPTY,
    q.correctAnswer ?? EMPTY,
    (q.incorrectAnswers ?? []).filter(Boolean),
    (q.matchingDistractors ?? []).filter(Boolean),
    q.placeholder ?? EMPTY,
    q.rubricSnapshot ? stableStringify(q.rubricSnapshot) : EMPTY,
  ]);
}

/** First 16 hex chars of SHA-256 over the UTF-8 serialization. Async because `crypto.subtle` is. */
export async function hashQuestionForTranslation(
  q: QuizQuestion
): Promise<string> {
  const bytes = new TextEncoder().encode(serializeQuestionForHash(q));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}
