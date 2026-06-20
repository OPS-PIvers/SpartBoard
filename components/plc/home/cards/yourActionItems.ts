/**
 * Pure selectors for the Home "Your action items" card (PRD §6.3, Decision 4.1).
 *
 * Surfaces the to-dos assigned to the signed-in member, sorted so the most
 * urgent (overdue, then soonest-due, then undated) float to the top, with a
 * derived due-date bucket so the card can color overdue / today / soon.
 *
 * Soft-deleted and completed to-dos are excluded — the card is a "what's on my
 * plate" list, not a history. Kept separate from the component so the sorting +
 * bucketing is unit-tested without rendering React.
 */

import type { PlcTodo } from '@/types';

/** Relative urgency bucket for a to-do's due date. */
export type DueBucket =
  | 'overdue'
  | 'today'
  | 'soon' // due within the next 7 days (excl. today)
  | 'later' // due more than 7 days out
  | 'none'; // no due date

const DAY_MS = 24 * 60 * 60 * 1000;

/** Start-of-day (local) for a ms timestamp. Exported for testability. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Classify a due date relative to `now` into an urgency bucket. Comparison is
 * day-granular (a task due "today" stays `today` all day, not `overdue` after
 * its midnight). `null`/absent dueAt → `none`.
 */
export function dueBucket(
  dueAt: number | null | undefined,
  now: number
): DueBucket {
  if (dueAt == null) return 'none';
  const dueDay = startOfDay(dueAt);
  const today = startOfDay(now);
  if (dueDay < today) return 'overdue';
  if (dueDay === today) return 'today';
  if (dueDay <= today + 7 * DAY_MS) return 'soon';
  return 'later';
}

/** An action item enriched with its derived due bucket, for rendering. */
export interface ActionItemView {
  todo: PlcTodo;
  bucket: DueBucket;
}

/**
 * The signed-in member's open action items, urgency-sorted.
 *
 * Filters to: live (not soft-deleted), not done, and `assigneeUid === uid`.
 * Sort order:
 *   1. Dated items before undated ones.
 *   2. Among dated items, soonest due first (overdue floats to the very top).
 *   3. Ties / undated break by creation time (oldest first — longest-waiting).
 *
 * Returns `[]` for a null uid (signed-out / unhydrated).
 */
export function selectMyActionItems(
  todos: readonly PlcTodo[],
  uid: string | null,
  now: number
): ActionItemView[] {
  if (!uid) return [];
  const mine = todos.filter(
    (todo) => todo.deletedAt == null && !todo.done && todo.assigneeUid === uid
  );

  mine.sort((a, b) => {
    const aHas = a.dueAt != null;
    const bHas = b.dueAt != null;
    if (aHas && bHas) {
      if (a.dueAt !== b.dueAt) return (a.dueAt as number) - (b.dueAt as number);
    } else if (aHas !== bHas) {
      return aHas ? -1 : 1; // dated before undated
    }
    return a.createdAt - b.createdAt; // oldest first
  });

  return mine.map((todo) => ({ todo, bucket: dueBucket(todo.dueAt, now) }));
}
