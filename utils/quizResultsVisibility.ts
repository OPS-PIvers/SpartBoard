import type {
  QuizResponse,
  QuizResultsOverride,
  QuizScoreVisibility,
  QuizSession,
  ResultsProtection,
  RevealedExplanations,
  RevealedRubricExamples,
} from '@/types';

export type ResultsOverrideState = 'follows' | 'shown' | 'hidden' | 'expired';

export interface EffectiveResultsVisibility {
  visibility: QuizScoreVisibility;
  /** Publish time behind `visibility`; undefined when nothing is published. */
  publishedAt?: number;
  source: 'class' | 'student';
  /** Answer key to render, only at the `score-responses-and-answers` level. */
  revealedAnswers?: Record<string, string>;
  /** Scoring-guide example responses, at the same level as `revealedAnswers`. */
  revealedRubricExamples?: RevealedRubricExamples;
  /** Explanations, at the same level as `revealedAnswers`; present only when the teacher published them. */
  revealedExplanations?: RevealedExplanations;
  /** Watermark and tab-away lockout for the results view; absent = none. */
  protection?: ResultsProtection;
}

type SessionPublication = Pick<
  QuizSession,
  | 'scoreVisibility'
  | 'scorePublishedAt'
  | 'revealedAnswers'
  | 'showScoreOnSubmit'
  | 'protection'
>;
type ResponsePublication = Pick<
  QuizResponse,
  | 'resultsOverride'
  | 'revealedAnswers'
  | 'revealedRubricExamples'
  | 'revealedExplanations'
> &
  Partial<Pick<QuizResponse, 'score' | 'status'>>;

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

/** True at the levels that show a student their own responses and right/wrong. */
export const visibilityShowsResponses = (
  visibility: QuizScoreVisibility | null | undefined
): boolean =>
  visibility === 'score-and-responses' ||
  visibility === 'score-responses-and-answers';

/** The answers without per-question verdicts, for a student who may not see right/wrong. */
export function answersWithoutVerdicts<T extends { isCorrect?: boolean }>(
  answers: T[]
): T[] {
  return answers.map((a) => {
    const { isCorrect: _hidden, ...rest } = a;
    void _hidden;
    return rest as T;
  });
}

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
      protection: override.protection ?? session?.protection,
      revealedAnswers:
        override.visibility === 'score-responses-and-answers'
          ? (override.revealedAnswers ?? {})
          : undefined,
      revealedRubricExamples:
        override.visibility === 'score-responses-and-answers'
          ? override.revealedRubricExamples
          : undefined,
      revealedExplanations:
        override.visibility === 'score-responses-and-answers'
          ? override.revealedExplanations
          : undefined,
    };
  }
  const visibility = classResultsVisibility(session);
  if (visibility === 'none') {
    // Score on submit: the server graded this attempt, so the score shows before any publish.
    const scored =
      session?.showScoreOnSubmit === true &&
      response?.status === 'completed' &&
      typeof response.score === 'number';
    return { visibility: scored ? 'score-only' : 'none', source: 'class' };
  }
  return {
    visibility,
    publishedAt: session?.scorePublishedAt,
    source: 'class',
    protection: session?.protection,
    // Older class publishes kept the key on the session doc only.
    revealedAnswers:
      visibility === 'score-responses-and-answers'
        ? (response?.revealedAnswers ?? session?.revealedAnswers ?? {})
        : undefined,
    revealedRubricExamples:
      visibility === 'score-responses-and-answers'
        ? response?.revealedRubricExamples
        : undefined,
    revealedExplanations:
      visibility === 'score-responses-and-answers'
        ? response?.revealedExplanations
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
