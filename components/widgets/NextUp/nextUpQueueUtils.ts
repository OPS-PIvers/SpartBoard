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
