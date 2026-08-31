/** Scale a duration (ms) by a `StudentOverride.timeMultiplier` (M17 spec §5 C3). */

import type { StudentOverride } from '@/types';

export function applyTimeMultiplier(
  ms: number,
  multiplier: StudentOverride['timeMultiplier']
): number {
  if (multiplier === 'unlimited') return Infinity;
  if (multiplier === 1.5 || multiplier === 2) return ms * multiplier;
  return ms;
}
