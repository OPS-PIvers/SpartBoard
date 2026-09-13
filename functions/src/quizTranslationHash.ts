/** Keep in sync with `utils/quizTranslationHash.ts` — both runtimes must agree byte for byte. */

import { createHash } from 'node:crypto';

/** The subset of a quiz question the hash covers; `functions/` does not import root types. */
export interface HashableQuestion {
  type: string;
  text?: string;
  correctAnswer?: string;
  incorrectAnswers?: string[];
  matchingDistractors?: string[];
  placeholder?: string;
  rubricSnapshot?: unknown;
}

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
export function serializeQuestionForHash(q: HashableQuestion): string {
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

/** First 16 hex chars of SHA-256 over the UTF-8 serialization. */
export function hashQuestionForTranslation(q: HashableQuestion): string {
  return createHash('sha256')
    .update(serializeQuestionForHash(q), 'utf8')
    .digest('hex')
    .slice(0, 16);
}
