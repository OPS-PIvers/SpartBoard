/**
 * Pure selectors for the Home "Your action items" card (PRD §6.3, Decision
 * 4.1; migrated to note action items in §7.4).
 *
 * Surfaces the action items (across all live notes) assigned to the signed-in
 * member, sorted so the most urgent (overdue, then soonest-due, then undated)
 * float to the top, with a derived due-date bucket so the card can color
 * overdue / today / soon.
 *
 * Soft-deleted notes and completed items are excluded — the card is a "what's
 * on my plate" list, not a history. Kept separate from the component so the
 * sorting + bucketing is unit-tested without rendering React.
 */

import type { PlcActionItem, PlcNote } from '@/types';

/** Relative urgency bucket for an action item's due date. */
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

/** An action item enriched with its source note and derived due bucket. */
export interface ActionItemView {
  note: PlcNote;
  item: PlcActionItem;
  bucket: DueBucket;
}

/**
 * The signed-in member's open action items across all live notes,
 * urgency-sorted.
 *
 * Filters to: live notes (not soft-deleted), not done, and
 * `assigneeUid === uid`.
 * Sort order:
 *   1. Dated items before undated ones.
 *   2. Among dated items, soonest due first (overdue floats to the very top).
 *   3. Ties / undated break by creation time (oldest first — longest-waiting).
 *
 * Returns `[]` for a null uid (signed-out / unhydrated).
 */
export function selectMyActionItems(
  notes: readonly PlcNote[],
  uid: string | null,
  now: number
): ActionItemView[] {
  if (!uid) return [];
  const mine: ActionItemView[] = [];
  for (const note of notes) {
    if (note.deletedAt != null) continue;
    for (const item of note.actionItems ?? []) {
      if (item.done || item.assigneeUid !== uid) continue;
      mine.push({ note, item, bucket: dueBucket(item.dueAt, now) });
    }
  }

  mine.sort((a, b) => {
    const aHas = a.item.dueAt != null;
    const bHas = b.item.dueAt != null;
    if (aHas && bHas) {
      if (a.item.dueAt !== b.item.dueAt) {
        return (a.item.dueAt as number) - (b.item.dueAt as number);
      }
    } else if (aHas !== bHas) {
      return aHas ? -1 : 1; // dated before undated
    }
    return a.item.createdAt - b.item.createdAt; // oldest first
  });

  return mine;
}
