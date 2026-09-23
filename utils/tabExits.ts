import type { TabExit } from '@/types';
import { formatAwayDuration } from '@/utils/tabAwayLimit';

export type TabExitStatus =
  | 'returned'
  | 'over-limit'
  | 'auto-submitted'
  | 'session-ended'
  | 'submitted-away'
  | 'away-now';

export const TAB_EXIT_STATUS_LABEL: Record<TabExitStatus, string> = {
  returned: 'Returned',
  'over-limit': 'Over limit',
  'auto-submitted': 'Auto-submitted',
  'session-ended': 'Session ended',
  'submitted-away': 'Submitted while away',
  'away-now': 'Away now',
};

export interface TabExitRow {
  leftAt: number;
  /** "Q2" for a quiz, "1:05" of video for a video activity, else "". */
  on: string;
  /** Null when an unfinished exit can't be timed. */
  awayMs: number | null;
  status: TabExitStatus;
}

interface ResponseContext {
  /** The response has been submitted. */
  completed: boolean;
  /** The session has ended. */
  sessionEnded: boolean;
  /** Teacher's clock, for exits still open. */
  now: number;
}

/** The exit a student is away on right now, if any. */
export function openTabExit(exits: TabExit[] | undefined): TabExit | null {
  const last = exits?.[exits.length - 1];
  return last && !last.outcome ? last : null;
}

export function describeTabExit(
  exit: TabExit,
  ctx: ResponseContext
): TabExitRow {
  const on =
    typeof exit.questionIndex === 'number'
      ? `Q${exit.questionIndex + 1}`
      : typeof exit.videoTime === 'number'
        ? formatAwayDuration(exit.videoTime * 1000)
        : '';
  if (exit.outcome) {
    return {
      leftAt: exit.leftAt,
      on,
      awayMs: exit.durationMs ?? null,
      status: exit.outcome,
    };
  }
  if (ctx.sessionEnded) {
    return { leftAt: exit.leftAt, on, awayMs: null, status: 'session-ended' };
  }
  if (ctx.completed) {
    return { leftAt: exit.leftAt, on, awayMs: null, status: 'submitted-away' };
  }
  return {
    leftAt: exit.leftAt,
    on,
    awayMs: Math.max(0, ctx.now - exit.leftAt),
    status: 'away-now',
  };
}

/** Total of every exit that has a duration, the live one included. */
export function totalAwayMs(rows: TabExitRow[]): number {
  return rows.reduce((sum, row) => sum + (row.awayMs ?? 0), 0);
}

/** Export cell: the closed exits' total, or blank when no log was recorded. */
export function formatTabAwayTotal(exits: TabExit[] | undefined): string {
  if (!exits || exits.length === 0) return '';
  const ms = exits.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
  return formatAwayDuration(ms);
}
