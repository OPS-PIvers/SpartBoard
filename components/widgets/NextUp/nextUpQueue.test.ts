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
 * Fix: replace direct property writes with `queue.map(item => ({ ...item, … }))`
 * so every produced element is a new object. The original `queue` array and its
 * items are never touched.
 */

import { describe, it, expect } from 'vitest';
import type { NextUpQueueItem } from '@/types';

// ---------------------------------------------------------------------------
// The pure advance logic extracted verbatim from Widget.tsx handleNextStudent.
// Any change to this function should be mirrored back to the widget.
// ---------------------------------------------------------------------------

/** Buggy implementation — mutates items from the original array. */
function advanceQueueBuggy(queue: NextUpQueueItem[]): NextUpQueueItem[] {
  const updated = [...queue];
  const activeIdx = updated.findIndex((q) => q.status === 'active');
  if (activeIdx !== -1) updated[activeIdx].status = 'done'; // mutates in place!

  const nextIdx = updated.findIndex((q) => q.status === 'waiting');
  if (nextIdx !== -1) updated[nextIdx].status = 'active'; // mutates in place!

  return updated;
}

/** Fixed implementation — produces new item objects via map. */
function advanceQueueFixed(queue: NextUpQueueItem[]): NextUpQueueItem[] {
  const activeIdx = queue.findIndex((q) => q.status === 'active');
  const nextIdx = queue.findIndex((q) => q.status === 'waiting');

  return queue.map((item, idx) => {
    if (idx === activeIdx) return { ...item, status: 'done' as const };
    if (idx === nextIdx) return { ...item, status: 'active' as const };
    return item;
  });
}

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
// Tests
// ---------------------------------------------------------------------------

describe('advanceQueue — correct (immutable) implementation', () => {
  it('advances the active student to done and the first waiting to active', () => {
    const queue = makeQueue('done', 'active', 'waiting', 'waiting');
    const result = advanceQueueFixed(queue);

    expect(result[0].status).toBe('done'); // unchanged
    expect(result[1].status).toBe('done'); // was active → done
    expect(result[2].status).toBe('active'); // was waiting → active
    expect(result[3].status).toBe('waiting'); // unchanged
  });

  it('does NOT mutate the original queue items', () => {
    const queue = makeQueue('active', 'waiting');
    const originalStatus0 = queue[0].status;
    const originalStatus1 = queue[1].status;

    advanceQueueFixed(queue);

    // Original objects must be untouched.
    expect(queue[0].status).toBe(originalStatus0);
    expect(queue[1].status).toBe(originalStatus1);
  });

  it('returns new item objects (referential inequality) for changed items', () => {
    const queue = makeQueue('active', 'waiting');
    const result = advanceQueueFixed(queue);

    expect(result[0]).not.toBe(queue[0]); // active item replaced
    expect(result[1]).not.toBe(queue[1]); // waiting item replaced
  });

  it('returns the same object reference for unchanged items', () => {
    const queue = makeQueue('done', 'active', 'waiting');
    const result = advanceQueueFixed(queue);

    // The 'done' item at index 0 was not touched — reuse the same reference.
    expect(result[0]).toBe(queue[0]);
  });

  it('double-advance simulation: calling twice with the same stale queue advances by exactly one step each call', () => {
    // This models what happens on a rapid double-click: both invocations close
    // over the same `queue` reference because React hasn't re-rendered between
    // the two clicks.
    const queue = makeQueue('active', 'waiting', 'waiting');

    const after1 = advanceQueueFixed(queue); // first click
    const after2 = advanceQueueFixed(queue); // second click — same stale queue

    // First call advances once: s0 → done, s1 → active.
    expect(after1[0].status).toBe('done');
    expect(after1[1].status).toBe('active');
    expect(after1[2].status).toBe('waiting');

    // Second call (stale queue) produces the SAME result as the first,
    // not a double-advance.  React will batch these into a single setQueue
    // update, so the net effect is one advance, not two.
    expect(after2[0].status).toBe('done');
    expect(after2[1].status).toBe('active');
    expect(after2[2].status).toBe('waiting');
  });

  it('handles an empty queue without throwing', () => {
    expect(() => advanceQueueFixed([])).not.toThrow();
    expect(advanceQueueFixed([])).toEqual([]);
  });

  it('handles a queue with only waiting students (no current active)', () => {
    const queue = makeQueue('waiting', 'waiting');
    const result = advanceQueueFixed(queue);

    // With no active student, no one becomes done; first waiting becomes active.
    expect(result[0].status).toBe('active');
    expect(result[1].status).toBe('waiting');
  });

  it('handles a queue with no waiting students (last student finishing)', () => {
    const queue = makeQueue('done', 'done', 'active');
    const result = advanceQueueFixed(queue);

    expect(result[0].status).toBe('done');
    expect(result[1].status).toBe('done');
    expect(result[2].status).toBe('done'); // was active, no next waiting
  });
});

describe('advanceQueue — buggy (mutating) implementation — documents the failure mode', () => {
  it('mutates the original queue item when advancing (root cause)', () => {
    const queue = makeQueue('active', 'waiting');
    const originalItem0 = queue[0]; // keep reference to original

    advanceQueueBuggy(queue);

    // The bug: originalItem0 and updated[0] are the same object, so the
    // in-place write `updated[0].status = 'done'` corrupts the source array.
    expect(originalItem0.status).toBe('done'); // mutated!
    expect(queue[0].status).toBe('done'); // source array poisoned
  });

  it('double-advance simulation: second call with same stale queue double-advances (demonstrates the bug)', () => {
    const queue = makeQueue('active', 'waiting', 'waiting');

    advanceQueueBuggy(queue); // first click: mutates queue[0].status → 'done', queue[1].status → 'active'
    const after2 = advanceQueueBuggy(queue); // second click with now-mutated queue

    // Because the first call already mutated queue[1].status to 'active',
    // the second call finds queue[1] as active and advances IT too,
    // pushing the queue forward by two steps instead of one.
    expect(after2[1].status).toBe('done'); // was 'waiting' before first call; now done
    expect(after2[2].status).toBe('active'); // was 'waiting'; now activated prematurely
  });
});
