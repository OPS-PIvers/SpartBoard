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
  QuizLeaderboardEntry,
} from '@/types';
import { gradeAnswer } from '@/hooks/useQuizSession';
import { SCOREBOARD_COLORS } from '@/config/scoreboard';
import type { StudentName } from '@/hooks/useAssignmentPseudonyms';
import {
  resolveResponseDisplayName,
  responseColorIndex,
  responseTeamId,
} from './resolveDisplayName';

type QuizScoringSession =
  | Pick<QuizSession, 'speedBonusEnabled' | 'streakBonusEnabled'>
  | null
  | undefined;

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
  session?: QuizScoringSession
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
export function isGamificationActive(session?: QuizScoringSession): boolean {
  return (
    (session?.speedBonusEnabled ?? false) ||
    (session?.streakBonusEnabled ?? false)
  );
}

/**
 * Compute a student's percentage score using per-question point values.
 */
export function getResponseScore(
  r: QuizResponse,
  questions: QuizQuestion[],
  session?: QuizScoringSession
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
  session?: QuizScoringSession
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
export function getScoreSuffix(session?: QuizScoringSession): string {
  return isGamificationActive(session) ? ' pts' : '%';
}

/**
 * Build a PIN → student full-name lookup from matching rosters.
 * Accepts an array of period names to support multi-class assignments.
 * Stores both canonical (zero-padded) and stripped PIN forms. First roster
 * wins for a given PIN when multiple rosters overlap.
 */
export function buildPinToNameMap(
  rosters: ClassRoster[],
  periodNames?: string[]
): Record<string, string> {
  const map: Record<string, string> = {};
  if (!periodNames || periodNames.length === 0) return map;
  for (const pName of periodNames) {
    const roster = rosters.find((r) => r.name === pName);
    if (!roster?.students) continue;
    for (const s of roster.students) {
      if (s.pin && (s.firstName || s.lastName)) {
        const name = [s.firstName, s.lastName].filter(Boolean).join(' ');
        if (!(s.pin in map)) map[s.pin] = name;
        const stripped = s.pin.replace(/^0+/, '');
        if (stripped && stripped !== s.pin && !(stripped in map)) {
          map[stripped] = name;
        }
      }
    }
  }
  return map;
}

/**
 * Build a PIN → student name lookup formatted for spreadsheet export:
 * "Last, First" when both names exist, just first or last name alone otherwise.
 * Accepts an array of period names to support multi-class assignments.
 */
export function buildPinToExportNameMap(
  rosters: ClassRoster[],
  periodNames?: string[]
): Record<string, string> {
  const map: Record<string, string> = {};
  if (!periodNames || periodNames.length === 0) return map;
  for (const pName of periodNames) {
    const roster = rosters.find((r) => r.name === pName);
    if (!roster?.students) continue;
    for (const s of roster.students) {
      if (s.pin && (s.firstName || s.lastName)) {
        const name =
          s.lastName && s.firstName
            ? `${s.lastName}, ${s.firstName}`
            : s.lastName || s.firstName;
        if (!(s.pin in map)) map[s.pin] = name;
        const stripped = s.pin.replace(/^0+/, '');
        if (stripped && stripped !== s.pin && !(stripped in map)) {
          map[stripped] = name;
        }
      }
    }
  }
  return map;
}

/**
 * Build scoreboard teams from quiz responses.
 *
 * `byStudentUid` (optional) supplies ClassLink names for SSO `studentRole`
 * joiners that have no `pin`. When omitted, SSO rows fall back to the
 * generic `Student` label (see `resolveResponseDisplayName`). For pin-mode
 * scoreboards SSO rows render their resolved name regardless of mode,
 * because the literal `PIN undefined` is never useful.
 */
export function buildScoreboardTeams(
  completedResponses: QuizResponse[],
  questions: QuizQuestion[],
  mode: 'pin' | 'name',
  pinToName: Record<string, string>,
  session?: QuizSession | null,
  byStudentUid?: Map<string, StudentName>
): ScoreboardTeam[] {
  return completedResponses
    .map((r) => ({
      response: r,
      score: getDisplayScore(r, questions, session),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ response, score }) => {
      const resolvedName = resolveResponseDisplayName(
        response,
        pinToName,
        byStudentUid
      );
      const pinModeName = response.pin ? `PIN ${response.pin}` : resolvedName;
      return {
        id: responseTeamId(response),
        name: mode === 'name' ? resolvedName : pinModeName,
        score,
        color:
          SCOREBOARD_COLORS[
            responseColorIndex(response, SCOREBOARD_COLORS.length)
          ],
      };
    });
}

/**
 * Build ranked leaderboard entries for student-facing live leaderboard views.
 *
 * Mirrors `buildScoreboardTeams` for SSO support: `byStudentUid` resolves
 * names for `studentRole` joiners. The leaderboard's `pin` field stays
 * optional in the entry type — students see `name` (or `Student` fallback).
 */
export function buildLiveLeaderboard(
  responses: QuizResponse[],
  questions: QuizQuestion[],
  session: QuizScoringSession,
  pinToName: Record<string, string>,
  byStudentUid?: Map<string, StudentName>
): QuizLeaderboardEntry[] {
  return responses
    .filter((response) => response.status !== 'joined')
    .map((response) => ({
      // `pin` is set only for anonymous joiners; SSO joiners use `studentUid`
      // for self-identification on the student-side leaderboard view.
      ...(response.pin ? { pin: response.pin } : {}),
      studentUid: response.studentUid,
      name: resolveResponseDisplayName(response, pinToName, byStudentUid),
      score: getDisplayScore(response, questions, session),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}
