// Pure helpers for the quiz live monitor. Kept free of React/Firestore so the
// stuck heuristic, sort/filter, and banding logic are unit-testable.

import { QuizResponse, QuizQuestion } from '@/types';

/** In-progress students with no answer write for this long count as stuck. */
export const STUCK_THRESHOLD_MS = 120_000;

export type MonitorSortBy = 'first' | 'last' | 'status' | 'score';
export type MonitorFilterBy = 'all' | 'hi' | 'mid' | 'low' | 'tabs';
export type ProficiencyBand = 'hi' | 'mid' | 'low' | 'crit';

export interface NeedsHelpFlag {
  kind: 'hand' | 'stuck';
  /** Minutes idle (stuck) or minutes since raise (hand), floored. */
  minutes: number;
}

/** Approved 4-band row tint scale: green >=80, yellow 60-79, orange 40-59, red <40. */
export function proficiencyBand(score: number): ProficiencyBand {
  if (score >= 80) return 'hi';
  if (score >= 60) return 'mid';
  if (score >= 40) return 'low';
  return 'crit';
}

export function isStuck(r: QuizResponse, now: number): boolean {
  if (r.status !== 'in-progress') return false;
  const last = r.lastWriteAt?.toMillis?.();
  if (!last) return false;
  return now - last > STUCK_THRESHOLD_MS;
}

export function needsHelpFlag(
  r: QuizResponse,
  now: number
): NeedsHelpFlag | null {
  const raisedAt = r.handRaisedAt?.toMillis?.();
  if (raisedAt) {
    return { kind: 'hand', minutes: Math.floor((now - raisedAt) / 60_000) };
  }
  if (isStuck(r, now)) {
    const last = r.lastWriteAt?.toMillis?.() ?? now;
    return { kind: 'stuck', minutes: Math.floor((now - last) / 60_000) };
  }
  return null;
}

export interface SortableStudent {
  name: string;
  status: QuizResponse['status'];
  score: number | null;
  tabWarnings: number;
}

const STATUS_ORDER: Record<QuizResponse['status'], number> = {
  'in-progress': 0,
  joined: 1,
  completed: 2,
};

function lastNameKey(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? name).toLowerCase();
}

export function compareStudents(
  a: SortableStudent,
  b: SortableStudent,
  sortBy: MonitorSortBy
): number {
  switch (sortBy) {
    case 'last': {
      const cmp = lastNameKey(a.name).localeCompare(lastNameKey(b.name));
      return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
    }
    case 'status': {
      const cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
    }
    case 'score': {
      const cmp = (b.score ?? -1) - (a.score ?? -1);
      return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
    }
    default:
      return a.name.localeCompare(b.name);
  }
}

export function matchesFilter(
  s: SortableStudent,
  filterBy: MonitorFilterBy
): boolean {
  switch (filterBy) {
    case 'hi':
      return s.score != null && s.score >= 80;
    case 'mid':
      return s.score != null && s.score >= 60 && s.score < 80;
    case 'low':
      return s.score != null && s.score < 60;
    case 'tabs':
      return s.tabWarnings > 0;
    default:
      return true;
  }
}

export interface AnswerDistribution {
  totalAnswered: number;
  /** Ordered rows: MC uses the option list, others aggregate raw answers. */
  rows: { label: string; count: number; isCorrect: boolean }[];
}

export function buildDistribution(
  question: QuizQuestion,
  responses: QuizResponse[],
  gradeAnswer: (q: QuizQuestion, answer: string) => { isCorrect: boolean }
): AnswerDistribution {
  const counts: Record<string, number> = {};
  let totalAnswered = 0;
  for (const r of responses) {
    const ans = r.answers.find((a) => a.questionId === question.id);
    if (!ans) continue;
    totalAnswered++;
    counts[ans.answer] = (counts[ans.answer] ?? 0) + 1;
  }
  if (question.type === 'MC') {
    const options = [
      question.correctAnswer,
      ...question.incorrectAnswers.filter(Boolean),
    ];
    return {
      totalAnswered,
      rows: options.map((opt) => ({
        label: opt,
        count: counts[opt] ?? 0,
        isCorrect: gradeAnswer(question, opt).isCorrect,
      })),
    };
  }
  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label,
      count,
      isCorrect: gradeAnswer(question, label).isCorrect,
    }));
  return { totalAnswered, rows };
}
