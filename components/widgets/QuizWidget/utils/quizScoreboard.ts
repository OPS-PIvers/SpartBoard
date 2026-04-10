/**
 * Shared utilities for quiz-to-scoreboard integration.
 * Used by QuizResults (one-time send) and live scoreboard sync.
 */

import {
  QuizResponse,
  QuizQuestion,
  ClassRoster,
  ScoreboardTeam,
  QuizSession,
} from '@/types';
import { gradeAnswer } from '@/hooks/useQuizSession';
import { SCOREBOARD_COLORS } from '@/config/scoreboard';

/**
 * Compute the streak multiplier for the i-th answer in a sequence.
 * Returns 1x for streak<2, 1.5x for streak==2, 2x for streak>=3.
 */
function streakMultiplier(consecutiveCorrect: number): number {
  if (consecutiveCorrect >= 3) return 2;
  if (consecutiveCorrect === 2) return 1.5;
  return 1;
}

/**
 * Compute the raw points a student earned, optionally including
 * speed bonus and streak multiplier when the session has them enabled.
 */
export function getEarnedPoints(
  r: QuizResponse,
  questions: QuizQuestion[],
  session?: QuizSession | null
): number {
  const speedEnabled = session?.speedBonusEnabled ?? false;
  const streakEnabled = session?.streakBonusEnabled ?? false;

  // Precompute question lookup map for O(1) access
  const qMap = new Map(questions.map((q) => [q.id, q]));

  // Sort answers by answeredAt to compute streaks in chronological order
  const sortedAnswers = [...r.answers].sort(
    (a, b) => (a.answeredAt ?? 0) - (b.answeredAt ?? 0)
  );

  let totalPoints = 0;
  let streak = 0;

  for (const ans of sortedAnswers) {
    const q = qMap.get(ans.questionId);
    if (!q) continue;

    const basePts = q.points ?? 1;
    const isCorrect = gradeAnswer(q, ans.answer);

    if (!isCorrect) {
      streak = 0;
      continue;
    }

    streak++;

    let pts = basePts;

    // Speed bonus: up to 50% extra for fast answers (clamp untrusted client data)
    if (speedEnabled && q.timeLimit > 0 && ans.speedBonus) {
      const clamped = Math.min(50, Math.max(0, ans.speedBonus));
      pts *= 1 + clamped / 100;
    }

    // Streak multiplier
    if (streakEnabled) {
      pts *= streakMultiplier(streak);
    }

    totalPoints += pts;
  }

  return Math.round(totalPoints);
}

/**
 * Returns true when the session has speed bonus or streak multiplier enabled,
 * meaning scores can exceed 100% and should be shown as raw points instead.
 */
export function isGamificationActive(session?: QuizSession | null): boolean {
  return !!(session?.speedBonusEnabled ?? session?.streakBonusEnabled);
}

/**
 * Compute a student's percentage score using per-question point values.
 */
export function getResponseScore(
  r: QuizResponse,
  questions: QuizQuestion[],
  session?: QuizSession | null
): number {
  const maxPoints = questions.reduce((sum, q) => sum + (q.points ?? 1), 0);
  if (maxPoints === 0) return 0;
  return Math.round((getEarnedPoints(r, questions, session) / maxPoints) * 100);
}

/**
 * Returns the score value appropriate for display:
 * - When gamification is active: raw earned points (avoids confusing >100% values)
 * - When gamification is off: percentage score (0-100)
 */
export function getDisplayScore(
  r: QuizResponse,
  questions: QuizQuestion[],
  session?: QuizSession | null
): number {
  if (isGamificationActive(session)) {
    return getEarnedPoints(r, questions, session);
  }
  return getResponseScore(r, questions, session);
}

/**
 * Returns the suffix for displayed scores: "pts" when gamification is active,
 * "%" otherwise.
 */
export function getScoreSuffix(session?: QuizSession | null): string {
  return isGamificationActive(session) ? ' pts' : '%';
}

/**
 * Build a PIN → student full-name lookup from the matching roster.
 * Stores both the canonical (zero-padded) and numeric-only (stripped leading
 * zeros) forms so lookups succeed regardless of how the student typed their PIN.
 */
export function buildPinToNameMap(
  rosters: ClassRoster[],
  periodName?: string
): Record<string, string> {
  const map: Record<string, string> = {};
  if (!periodName) return map;
  const roster = rosters.find((r) => r.name === periodName);
  if (!roster?.students) return map;
  for (const s of roster.students) {
    if (s.pin && (s.firstName || s.lastName)) {
      const name = [s.firstName, s.lastName].filter(Boolean).join(' ');
      // Canonical form (e.g. "01")
      map[s.pin] = name;
      // Stripped form (e.g. "1") for students who omit the leading zero
      const stripped = s.pin.replace(/^0+/, '');
      if (stripped && stripped !== s.pin) {
        map[stripped] = name;
      }
    }
  }
  return map;
}

/**
 * Build scoreboard teams from quiz responses.
 */
export function buildScoreboardTeams(
  completedResponses: QuizResponse[],
  questions: QuizQuestion[],
  mode: 'pin' | 'name',
  pinToName: Record<string, string>,
  session?: QuizSession | null
): ScoreboardTeam[] {
  return completedResponses
    .map((r) => ({
      response: r,
      score: getDisplayScore(r, questions, session),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ response, score }) => ({
      id: `pin-${response.pin}`,
      name:
        mode === 'name'
          ? (pinToName[response.pin] ?? `PIN ${response.pin}`)
          : `PIN ${response.pin}`,
      score,
      color:
        SCOREBOARD_COLORS[
          parseInt(response.pin, 10) % SCOREBOARD_COLORS.length
        ],
    }));
}
