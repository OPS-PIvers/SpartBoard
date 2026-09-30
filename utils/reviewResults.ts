import type { QuizQuestion, QuizResponse, QuizSession } from '@/types';
import { gameDisplayPoints } from '@/utils/quizGame';
import {
  canScoreResponse,
  getDisplayScore,
  isGamificationActive,
} from '@/components/widgets/QuizWidget/utils/quizScoreboard';
import type { FibGradingContext } from '@/utils/quizFibAnswers';

type ScoringSession = Pick<
  QuizSession,
  'sessionMode' | 'speedBonusEnabled' | 'streakBonusEnabled'
>;

/** A self-paced Review game (QUIZ_REVIEW_SPLIT.md D4). */
export function isGameSession(
  session: Pick<QuizSession, 'sessionMode'> | null | undefined
): boolean {
  return session?.sessionMode === 'game';
}

/** Whether results show points instead of percentages. */
export function resultsInPoints(
  session: ScoringSession | null | undefined
): boolean {
  return isGameSession(session) || isGamificationActive(session);
}

/** A game student who answered is finished even if the teacher never pressed End. */
export function isResultsFinished(
  r: QuizResponse,
  session: Pick<QuizSession, 'sessionMode'> | null | undefined
): boolean {
  if (r.status === 'completed') return true;
  return isGameSession(session) && (r.game?.answered ?? 0) > 0;
}

/** Whether a row can show a number (a game score needs no answer key). */
export function canShowResultsScore(
  r: QuizResponse,
  questions: QuizQuestion[],
  session: Pick<QuizSession, 'sessionMode'> | null | undefined
): boolean {
  if (isGameSession(session)) return true;
  return canScoreResponse(r, questions);
}

/** Server-graded game points for a game, else the usual display score. */
export function resultsDisplayScore(
  r: QuizResponse,
  questions: QuizQuestion[],
  session: ScoringSession | null | undefined,
  fibGrading?: FibGradingContext | null
): number {
  if (isGameSession(session)) return gameDisplayPoints(r.game?.points ?? 0);
  return getDisplayScore(r, questions, session, fibGrading);
}

export interface FirstTryTally {
  correct: number;
  tried: number;
}

/** First-try results per question from the server-written game state (D25). */
export function gameFirstTry(r: QuizResponse): FirstTryTally {
  const firstTry = r.game?.firstTry ?? {};
  const values = Object.values(firstTry);
  return {
    correct: values.filter((v) => v === true).length,
    tried: values.length,
  };
}

/** Class first-try accuracy as a whole percent, or null before anyone answered. */
export function classFirstTryAccuracy(
  responses: QuizResponse[]
): number | null {
  let correct = 0;
  let tried = 0;
  for (const r of responses) {
    const t = gameFirstTry(r);
    correct += t.correct;
    tried += t.tried;
  }
  return tried === 0 ? null : Math.round((correct / tried) * 100);
}

export interface ReviewRankRow {
  response: QuizResponse;
  rank: number;
  score: number;
}

/** Final ranking; ties share a rank so equal points never read as a loss. */
export function buildReviewRanking(
  responses: QuizResponse[],
  questions: QuizQuestion[],
  session: ScoringSession | null | undefined,
  fibGrading?: FibGradingContext | null
): ReviewRankRow[] {
  const scored = responses
    .filter(
      (r) =>
        isResultsFinished(r, session) &&
        canShowResultsScore(r, questions, session)
    )
    .map((response) => ({
      response,
      score: resultsDisplayScore(response, questions, session, fibGrading),
    }))
    .sort((a, b) => b.score - a.score);
  let rank = 0;
  return scored.map((row, i) => {
    if (i === 0 || row.score !== scored[i - 1].score) rank = i + 1;
    return { ...row, rank };
  });
}
