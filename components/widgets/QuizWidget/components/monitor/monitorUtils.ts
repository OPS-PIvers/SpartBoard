// Pure helpers for the quiz live monitor. Kept free of React/Firestore so the
// stuck heuristic, sort/filter, and banding logic are unit-testable.

import { QuizResponse, QuizQuestion } from '@/types';
import { groupAnswersByOption } from '@/utils/quizQuestionDrilldown';

/** In-progress students with no answer write for this long count as stuck. */
export const STUCK_THRESHOLD_MS = 120_000;

export type MonitorSortBy = 'first' | 'last' | 'status' | 'score';
export type MonitorFilterBy = 'all' | 'hi' | 'mid' | 'low' | 'tabs';
export type ProficiencyBand = 'hi' | 'mid' | 'low' | 'crit';

/** Two independent signals: an explicit request (hand) and a passive heuristic (idle). */
export interface StudentFlags {
  /** Minutes since the student raised their hand, floored; null when lowered. */
  handMinutes: number | null;
  /** Minutes without an answer write (min 2, the threshold); null when active. */
  idleMinutes: number | null;
}

export const NO_FLAGS: StudentFlags = { handMinutes: null, idleMinutes: null };

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

export function studentFlags(r: QuizResponse, now: number): StudentFlags {
  const raisedAt = r.handRaisedAt?.toMillis?.();
  const handMinutes = raisedAt ? Math.floor((now - raisedAt) / 60_000) : null;
  let idleMinutes: number | null = null;
  if (isStuck(r, now)) {
    const last = r.lastWriteAt?.toMillis?.() ?? now;
    idleMinutes = Math.max(2, Math.floor((now - last) / 60_000));
  }
  return { handMinutes, idleMinutes };
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
  /** Ordered rows: MC/MA use the option list, others group normalized answers. */
  rows: { label: string; count: number; isCorrect: boolean }[];
}

export function buildDistribution(
  question: QuizQuestion,
  responses: QuizResponse[],
  gradeAnswer: (q: QuizQuestion, answer: string) => { isCorrect: boolean }
): AnswerDistribution {
  const entries: { answer: string; item: null }[] = [];
  for (const r of responses) {
    const ans = r.answers.find((a) => a.questionId === question.id);
    if (ans) entries.push({ answer: ans.answer, item: null });
  }
  return {
    totalAnswered: entries.length,
    rows: groupAnswersByOption(question, entries).map((g) => ({
      label: g.label,
      count: g.items.length,
      isCorrect: g.isKey ?? gradeAnswer(question, g.label).isCorrect,
    })),
  };
}
