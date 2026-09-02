// Word-limit evaluation for Free Response answers; enforcement lives at the Submit button only.

export interface WordLimitConfig {
  minWords?: number;
  maxWords?: number;
  enforceWordLimit?: boolean;
}

export interface WordLimitStatus {
  /** True only when enforcement is on AND the count is outside the range. */
  blocked: boolean;
  /** Student-facing explanation shown under Submit; null when nothing to say. */
  message: string | null;
  /** `warn` = advisory amber, `blocked` = enforced red. */
  tone: 'ok' | 'warn' | 'blocked';
}

/** Positive integers only; 0/undefined/NaN all mean "no bound on this side". */
const bound = (n: number | undefined): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) && n >= 1
    ? Math.floor(n)
    : undefined;

/** Normalized `[min, max]` for a question, with unusable values dropped. */
export function wordLimitBounds(cfg: WordLimitConfig): {
  min?: number;
  max?: number;
} {
  return { min: bound(cfg.minWords), max: bound(cfg.maxWords) };
}

/** True when the range is authored backwards and must not be saved. */
export function isInvalidWordRange(
  min: number | undefined,
  max: number | undefined
): boolean {
  const lo = bound(min);
  const hi = bound(max);
  return lo !== undefined && hi !== undefined && lo > hi;
}

/** Evaluates a live word count against a question's word limit. */
export function wordLimitStatus(
  count: number,
  cfg: WordLimitConfig
): WordLimitStatus {
  const { min, max } = wordLimitBounds(cfg);
  const over = max !== undefined && count > max;
  const under = min !== undefined && count < min;
  // A blank draft is simply unanswered: never scolded, never trapped.
  if ((!over && !under) || count === 0) {
    return { blocked: false, message: null, tone: 'ok' };
  }
  if (!cfg.enforceWordLimit) {
    return { blocked: false, message: null, tone: 'warn' };
  }
  if (over && max !== undefined) {
    const excess = count - max;
    return {
      blocked: true,
      tone: 'blocked',
      message: `Your answer is ${excess} ${excess === 1 ? 'word' : 'words'} over the ${max}-word limit. Trim it to submit.`,
    };
  }
  const shortfall = (min as number) - count;
  return {
    blocked: true,
    tone: 'blocked',
    message: `Write at least ${min} words to submit. ${shortfall} to go.`,
  };
}

/** Counter chip copy, e.g. `42 / 100–200 words`. */
export function wordCounterLabel(count: number, cfg: WordLimitConfig): string {
  const { min, max } = wordLimitBounds(cfg);
  if (min !== undefined && max !== undefined) {
    return `${count} / ${min}–${max} words`;
  }
  if (min !== undefined) return `${count} / ${min}+ words`;
  if (max !== undefined) return `${count} / ${max} words`;
  return `${count} ${count === 1 ? 'word' : 'words'}`;
}
