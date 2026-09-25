// Server twin of `utils/quizResultsVisibility.ts`: what one student may see of their published results.

export type ServerScoreVisibility =
  | 'none'
  | 'score-only'
  | 'score-and-responses'
  | 'score-responses-and-answers';

const LEVELS: ReadonlySet<string> = new Set<ServerScoreVisibility>([
  'none',
  'score-only',
  'score-and-responses',
  'score-responses-and-answers',
]);

function asVisibility(value: unknown): ServerScoreVisibility {
  return typeof value === 'string' && LEVELS.has(value)
    ? (value as ServerScoreVisibility)
    : 'none';
}

/** Fails closed: anything unreadable resolves to `'none'`. */
export function resolveServerResultsVisibility(
  session: Record<string, unknown> | undefined,
  response: Record<string, unknown> | undefined,
  now: number
): { visibility: ServerScoreVisibility; source: 'class' | 'student' } {
  const override = response?.resultsOverride as
    | { mode?: unknown; visibility?: unknown; expiresAt?: unknown }
    | undefined
    | null;
  const expired =
    typeof override?.expiresAt === 'number' && override.expiresAt <= now;
  if (override && typeof override === 'object' && !expired) {
    const visibility =
      override.mode === 'shown' ? asVisibility(override.visibility) : 'none';
    return { visibility, source: 'student' };
  }
  return {
    visibility: asVisibility(session?.scoreVisibility),
    source: 'class',
  };
}

export function visibilityIncludesResponses(
  visibility: ServerScoreVisibility
): boolean {
  return (
    visibility === 'score-and-responses' ||
    visibility === 'score-responses-and-answers'
  );
}

/** D38: responses are visible and the return mode includes handwriting. */
export function studentMaySeeHandwriting(
  session: Record<string, unknown> | undefined,
  response: Record<string, unknown> | undefined,
  now: number
): boolean {
  const { visibility } = resolveServerResultsVisibility(session, response, now);
  if (!visibilityIncludesResponses(visibility)) return false;
  const mode = session?.writtenReturnMode ?? 'handwriting';
  return mode === 'handwriting' || mode === 'both';
}
