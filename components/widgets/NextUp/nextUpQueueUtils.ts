import type { NextUpQueueItem } from '@/types';

/**
 * Advance the NextUp queue by one step.
 *
 * Returns a new array where the currently-active item transitions to 'done'
 * and the first 'waiting' item transitions to 'active'. All item objects are
 * replaced with new objects (no in-place mutation) so that React state
 * comparisons work correctly and rapid successive calls with a stale closure
 * each advance by exactly one step.
 */
export function advanceNextUpQueue(
  queue: NextUpQueueItem[]
): NextUpQueueItem[] {
  const activeIdx = queue.findIndex((q) => q.status === 'active');
  const nextIdx = queue.findIndex((q) => q.status === 'waiting');

  return queue.map((item, idx) => {
    if (idx === activeIdx) return { ...item, status: 'done' as const };
    if (idx === nextIdx) return { ...item, status: 'active' as const };
    return item;
  });
}

/**
 * Determine whether an active NextUp session should be auto-expired because
 * it was created on a previous calendar day (local time).
 *
 * Pure so it can be driven by an explicit `now`, independent of a live
 * ticking clock — the caller is responsible for re-invoking this on a
 * periodic tick (see Widget.tsx) so day-rollover is detected even when
 * `config` hasn't otherwise changed since before midnight.
 */
export function shouldExpireNextUpQueue(
  isActive: boolean | undefined,
  createdAt: number | undefined,
  now: Date
): boolean {
  // Guard only on a genuinely missing timestamp — not `!createdAt`, which
  // would also swallow createdAt === 0 (the Unix epoch, a valid prior-day
  // timestamp that should expire).
  if (!isActive || createdAt == null) return false;
  const createdDate = new Date(createdAt).toDateString();
  const today = now.toDateString();
  return createdDate !== today;
}

/** The queue grows no larger than this, so a flood of joins can't fill Drive. */
export const NEXT_UP_QUEUE_CAP = 500;

export type NextUpQueueAction =
  | { type: 'joined'; entries: Omit<NextUpQueueItem, 'status'>[] }
  | { type: 'advance' }
  | { type: 'reset' }
  | { type: 'replace'; queue: NextUpQueueItem[] };

/** Every teacher-side queue change, applied to the latest queue. */
export function nextUpQueueReducer(
  queue: NextUpQueueItem[],
  action: NextUpQueueAction
): NextUpQueueItem[] {
  switch (action.type) {
    case 'joined': {
      const next = [...queue];
      for (const entry of action.entries) {
        if (next.length >= NEXT_UP_QUEUE_CAP) break;
        if (next.some((item) => item.id === entry.id)) continue;
        next.push({
          ...entry,
          status: next.length === 0 ? 'active' : 'waiting',
        });
      }
      return next.length === queue.length ? queue : next;
    }
    case 'advance':
      return advanceNextUpQueue(queue);
    case 'reset':
      return [];
    case 'replace':
      return action.queue;
  }
}
