/** Standard codes a test bank key lists, matched to the standards catalog (QUIZ_EXAMVIEW_IMPORT E10). */

import type { StandardBenchmark } from '@/types';
import {
  indexByCode,
  resolveStandardCode,
  type TeachingProfile,
} from '@/utils/standardsInText';

export { normalizeStandardCode } from '@/utils/standardsInText';

export interface StandardMatch {
  /** The catalog benchmark each matched code names, in the key's order. */
  matched: StandardBenchmark[];
  /** Codes with no exact match, as the key printed them. */
  unmatched: string[];
}

/** Exact normalized code matches only; a code sets share needs `profile` to settle it, and anything else is listed, never guessed. */
export function matchStandardCodes(
  codes: readonly string[],
  benchmarks: readonly StandardBenchmark[],
  profile?: TeachingProfile
): StandardMatch {
  const byCode = indexByCode(benchmarks);
  const matched: StandardBenchmark[] = [];
  const unmatched: string[] = [];
  for (const code of codes) {
    const hit = resolveStandardCode(code, byCode, profile);
    if (hit) {
      if (!matched.includes(hit)) matched.push(hit);
    } else unmatched.push(code);
  }
  return { matched, unmatched };
}
