import type {
  QuizResponse,
  QuizResultsOverride,
  QuizScoreVisibility,
  QuizSession,
} from '@/types';

export type ResultsOverrideState = 'follows' | 'shown' | 'hidden' | 'expired';

export interface EffectiveResultsVisibility {
  visibility: QuizScoreVisibility;
  /** Publish time behind `visibility`; undefined when nothing is published. */
  publishedAt?: number;
  source: 'class' | 'student';
  /** Answer key to render, only at the `score-responses-and-answers` level. */
  revealedAnswers?: Record<string, string>;
}

type SessionPublication = Pick<
  QuizSession,
  'scoreVisibility' | 'scorePublishedAt' | 'revealedAnswers'
>;
type ResponsePublication = Pick<
  QuizResponse,
  'resultsOverride' | 'revealedAnswers'
>;

export const isResultsOverrideExpired = (
  override: QuizResultsOverride,
  now: number
): boolean =>
  typeof override.expiresAt === 'number' && override.expiresAt <= now;

/** The override that still applies at `now`, or null when the student follows the class. */
export const activeResultsOverride = (
  override: QuizResultsOverride | undefined | null,
  now: number
): QuizResultsOverride | null =>
  override && !isResultsOverrideExpired(override, now) ? override : null;

export const resultsOverrideState = (
  override: QuizResultsOverride | undefined | null,
  now: number = Date.now()
): ResultsOverrideState => {
  if (!override) return 'follows';
  if (isResultsOverrideExpired(override, now)) return 'expired';
  return override.mode;
};

/** Class-wide publication as the student sees it, ignoring any override. */
export const classResultsVisibility = (
  session: SessionPublication | null | undefined
): QuizScoreVisibility => {
  return session?.scoreVisibility ?? 'none';
};

/** What one student may see: an unexpired override wins, else the class setting. */
export const resolveResultsVisibility = (
  session: SessionPublication | null | undefined,
  response: ResponsePublication | null | undefined,
  now: number = Date.now()
): EffectiveResultsVisibility => {
  const override = activeResultsOverride(response?.resultsOverride, now);
  if (override) {
    if (override.mode === 'hidden') {
      return { visibility: 'none', source: 'student' };
    }
    return {
      visibility: override.visibility,
      publishedAt: override.publishedAt,
      source: 'student',
      revealedAnswers:
        override.visibility === 'score-responses-and-answers'
          ? (override.revealedAnswers ?? {})
          : undefined,
    };
  }
  const visibility = classResultsVisibility(session);
  if (visibility === 'none') return { visibility, source: 'class' };
  return {
    visibility,
    publishedAt: session?.scorePublishedAt,
    source: 'class',
    // Older class publishes kept the key on the session doc only.
    revealedAnswers:
      visibility === 'score-responses-and-answers'
        ? (response?.revealedAnswers ?? session?.revealedAnswers ?? {})
        : undefined,
  };
};

export type ResultsExpiryPreset = 'none' | 'today' | '3days' | '1week';

/** Epoch ms for an expiry preset relative to `now`; null = no expiry. */
export const resultsExpiryFromPreset = (
  preset: ResultsExpiryPreset,
  now: number = Date.now()
): number | null => {
  const DAY = 24 * 60 * 60 * 1000;
  switch (preset) {
    case 'none':
      return null;
    case 'today': {
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return end.getTime();
    }
    case '3days':
      return now + 3 * DAY;
    case '1week':
      return now + 7 * DAY;
  }
};
