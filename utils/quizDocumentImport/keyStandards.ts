/** Standard codes a test bank key lists, matched to the standards catalog (QUIZ_EXAMVIEW_IMPORT E10). */

import type { StandardBenchmark } from '@/types';

/** `MN 9.4.2.1`, `9.4.2.1` and `9.4.2.1.` all normalize to `9.4.2.1`. */
export const normalizeStandardCode = (code: string): string =>
  code
    .trim()
    .replace(/^[A-Za-z]{2,4}\s+(?=\d)/, '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[.:;,]+$/, '');

export interface StandardMatch {
  /** The catalog benchmark each matched code names, in the key's order. */
  matched: StandardBenchmark[];
  /** Codes with no exact match, as the key printed them. */
  unmatched: string[];
}

/** Exact normalized code matches only; anything else is listed, never guessed. */
export function matchStandardCodes(
  codes: readonly string[],
  benchmarks: readonly StandardBenchmark[]
): StandardMatch {
  const byCode = new Map<string, StandardBenchmark[]>();
  for (const b of benchmarks) {
    const key = normalizeStandardCode(b.code);
    byCode.set(key, [...(byCode.get(key) ?? []), b]);
  }
  const matched: StandardBenchmark[] = [];
  const unmatched: string[] = [];
  for (const code of codes) {
    const hits = byCode.get(normalizeStandardCode(code)) ?? [];
    // A code two sets share can't be told apart, so it isn't a match.
    if (hits.length === 1) {
      if (!matched.includes(hits[0])) matched.push(hits[0]);
    } else unmatched.push(code);
  }
  return { matched, unmatched };
}

/** The review note for codes the catalog doesn't hold. */
export const unmatchedStandardsNote = (codes: readonly string[]): string =>
  codes.length === 1
    ? `Key lists standard ${codes[0]}, which isn’t in the standards list.`
    : `Key lists standards ${codes.join(', ')}, which aren’t in the standards list.`;
