/**
 * Shared utilities for quiz-to-scoreboard integration.
 * Used by QuizResults (one-time send) and live scoreboard sync.
 */

import {
  QuizResponse,
  QuizQuestion,
  ClassRoster,
  ScoreboardTeam,
} from '@/types';
import { gradeAnswer } from '@/hooks/useQuizSession';
import { SCOREBOARD_COLORS } from '@/config/scoreboard';

/**
 * Compute the raw points a student earned.
 */
function getEarnedPoints(r: QuizResponse, questions: QuizQuestion[]): number {
  return questions.reduce((sum, q) => {
    const ans = r.answers.find((a) => a.questionId === q.id);
    if (!ans) return sum;
    return sum + (gradeAnswer(q, ans.answer) ? (q.points ?? 1) : 0);
  }, 0);
}

/**
 * Compute a student's percentage score using per-question point values.
 */
export function getResponseScore(
  r: QuizResponse,
  questions: QuizQuestion[]
): number {
  const maxPoints = questions.reduce((sum, q) => sum + (q.points ?? 1), 0);
  if (maxPoints === 0) return 0;
  return Math.round((getEarnedPoints(r, questions) / maxPoints) * 100);
}

/**
 * Build a PIN → student full-name lookup from the matching roster.
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
      map[s.pin] = [s.firstName, s.lastName].filter(Boolean).join(' ');
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
  pinToName: Record<string, string>
): ScoreboardTeam[] {
  return completedResponses
    .map((r) => ({
      response: r,
      score: getResponseScore(r, questions),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ response, score }, index) => ({
      id: crypto.randomUUID(),
      name:
        mode === 'name'
          ? (pinToName[response.pin] ?? `PIN ${response.pin}`)
          : `PIN ${response.pin}`,
      score,
      color: SCOREBOARD_COLORS[index % SCOREBOARD_COLORS.length],
    }));
}
