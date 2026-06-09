/**
 * Regression tests for the NextUp queue-advance logic.
 *
 * Bug: handleNextStudent used a shallow spread (`[...queue]`) and then mutated
 * the item objects in place (`updated[i].status = 'done'`). Because the spread
 * only copies the array shell, `updated[i]` and `queue[i]` are the same object
 * reference.  A rapid double-click fires the callback twice with the *same*
 * stale `queue` closure value (React hasn't re-rendered yet), so both calls see
 * the already-mutated object and the active pointer advances twice instead of
 * once.
 *
 * Fix: advance logic extracted to `nextUpQueueUtils.ts` using
 * `queue.map(item => ({ ...item, … }))` so every produced element is a new
 * object. The original `queue` array and its items are never touched.
 */

import { describe, it, expect } from 'vitest';
import type { NextUpQueueItem } from '@/types';
import { advanceNextUpQueue } from './nextUpQueueUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueue(
  ...statuses: ('waiting' | 'active' | 'done')[]
): NextUpQueueItem[] {
  return statuses.map((status, i) => ({
    id: `s${i}`,
    name: `Student ${i}`,
    status,
    joinedAt: 1000 + i,
  }));
}

// ---------------------------------------------------------------------------
// Tests — all import from the production utility, not inline stubs
// ---------------------------------------------------------------------------

describe('advanceNextUpQueue', () => {
  it('advances the active student to done and the first waiting to active', () => {
    const queue = makeQueue('done', 'active', 'waiting', 'waiting');
    const result = advanceNextUpQueue(queue);

    expect(result[0].status).toBe('done'); // unchanged
    expect(result[1].status).toBe('done'); // was active → done
    expect(result[2].status).toBe('active'); // was waiting → active
    expect(result[3].status).toBe('waiting'); // unchanged
  });

  it('does NOT mutate the original queue items', () => {
    const queue = makeQueue('active', 'waiting');
    const originalStatus0 = queue[0].status;
    const originalStatus1 = queue[1].status;

    advanceNextUpQueue(queue);

    expect(queue[0].status).toBe(originalStatus0);
    expect(queue[1].status).toBe(originalStatus1);
  });

  it('returns new item objects (referential inequality) for changed items', () => {
    const queue = makeQueue('active', 'waiting');
    const result = advanceNextUpQueue(queue);

    expect(result[0]).not.toBe(queue[0]); // active item replaced
    expect(result[1]).not.toBe(queue[1]); // waiting item replaced
  });

  it('returns the same object reference for unchanged items', () => {
    const queue = makeQueue('done', 'active', 'waiting');
    const result = advanceNextUpQueue(queue);

    // The 'done' item at index 0 was not touched — reuse the same reference.
    expect(result[0]).toBe(queue[0]);
  });

  it('double-advance simulation: calling twice with the same stale queue advances by exactly one step each call', () => {
    // Models rapid double-click: both invocations close over the same `queue`
    // reference because React hasn't re-rendered between the two clicks.
    const queue = makeQueue('active', 'waiting', 'waiting');

    const after1 = advanceNextUpQueue(queue); // first click
    const after2 = advanceNextUpQueue(queue); // second click — same stale queue

    // First call advances once: s0 → done, s1 → active.
    expect(after1[0].status).toBe('done');
    expect(after1[1].status).toBe('active');
    expect(after1[2].status).toBe('waiting');

    // Second call (stale queue) produces the SAME result as the first,
    // not a double-advance.
    expect(after2[0].status).toBe('done');
    expect(after2[1].status).toBe('active');
    expect(after2[2].status).toBe('waiting');
  });

  it('handles an empty queue without throwing', () => {
    expect(() => advanceNextUpQueue([])).not.toThrow();
    expect(advanceNextUpQueue([])).toEqual([]);
  });

  it('handles a queue with only waiting students (no current active)', () => {
    const queue = makeQueue('waiting', 'waiting');
    const result = advanceNextUpQueue(queue);

    expect(result[0].status).toBe('active');
    expect(result[1].status).toBe('waiting');
  });

  it('handles a queue with no waiting students (last student finishing)', () => {
    const queue = makeQueue('done', 'done', 'active');
    const result = advanceNextUpQueue(queue);

    expect(result[0].status).toBe('done');
    expect(result[1].status).toBe('done');
    expect(result[2].status).toBe('done');
  });
});
