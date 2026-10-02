import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import { getWindowState } from '@/utils/assignmentWindow';

/** STUDENT_LANDING_V2 D13: where a student stands on one piece of work. */
export type TurnInState = 'turned-in' | 'in-progress' | 'not-started';

type Kind = AssignmentSummary['kind'];

const isNum = (v: unknown): v is number => typeof v === 'number';

/** D13: a real submission only; a response doc that merely exists is "in progress". `null` means no doc. */
export function readTurnInState(
  kind: Kind,
  flashcardKind: AssignmentSummary['flashcardKind'],
  response: Record<string, unknown> | null
): TurnInState {
  if (!response) return 'not-started';
  const retaken = isNum(response.completedAttempts)
    ? response.completedAttempts > 0
    : false;
  switch (kind) {
    case 'quiz':
      return response.status === 'completed' || retaken
        ? 'turned-in'
        : 'in-progress';
    case 'video-activity':
      return isNum(response.completedAt) || retaken
        ? 'turned-in'
        : 'in-progress';
    case 'guided-learning':
      return isNum(response.completedAt) ? 'turned-in' : 'in-progress';
    case 'flashcards':
      // A Study set collects nothing, so its progress doc never counts.
      if (flashcardKind === 'study') return 'not-started';
      return isNum(response.submittedAt) ? 'turned-in' : 'in-progress';
    case 'mini-app':
      return 'turned-in';
    default:
      return 'not-started';
  }
}

type DueFields = Pick<
  AssignmentSummary,
  'workKind' | 'dueAt' | 'openAt' | 'closeAt' | 'endedAt'
>;

/** D14: Work past its due date, not turned in, and still accepting submissions. */
export function isMissingStillOpen(
  a: DueFields,
  turnIn: TurnInState,
  nowMs: number
): boolean {
  return (
    a.workKind === 'work' &&
    turnIn !== 'turned-in' &&
    a.endedAt === undefined &&
    typeof a.dueAt === 'number' &&
    nowMs > a.dueAt &&
    getWindowState(a, nowMs) === 'open'
  );
}

/** D15: Missing-still-open first, then by due date, then no due date; ties keep newest-first. */
export function compareByDueDate(
  a: DueFields & { createdAt?: number; title: string },
  b: DueFields & { createdAt?: number; title: string },
  turnInOf: (x: DueFields) => TurnInState,
  nowMs: number
): number {
  const am = isMissingStillOpen(a, turnInOf(a), nowMs);
  const bm = isMissingStillOpen(b, turnInOf(b), nowMs);
  if (am !== bm) return am ? -1 : 1;
  const ad = a.dueAt ?? Infinity;
  const bd = b.dueAt ?? Infinity;
  if (ad !== bd) return ad < bd ? -1 : 1;
  const ac = a.createdAt ?? 0;
  const bc = b.createdAt ?? 0;
  if (ac !== bc) return bc - ac;
  return a.title.localeCompare(b.title);
}

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** D15: "Due today, 11:59 PM" or "Due Mon, Oct 5". */
export function formatDueLabel(dueAtMs: number, nowMs: number): string {
  const d = new Date(dueAtMs);
  if (sameDay(d, new Date(nowMs))) {
    const time = d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `Due today, ${time}`;
  }
  const day = d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `Due ${day}`;
}
