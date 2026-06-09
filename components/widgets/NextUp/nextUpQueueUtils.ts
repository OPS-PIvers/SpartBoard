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
