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
import {
  advanceNextUpQueue,
  shouldExpireNextUpQueue,
} from './nextUpQueueUtils';

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

/**
 * Regression tests for the NextUp auto-expiry day-rollover check.
 *
 * Bug: the widget's auto-expiry `useEffect` only re-ran when
 * `config.isActive`/`config.createdAt` changed identity. A session created
 * (and left active) before midnight, with no further config writes overnight
 * — e.g. an idle classroom display with no student joining the queue — never
 * re-evaluated the day comparison, so it stayed "active" indefinitely past
 * midnight instead of auto-expiring. Same root cause as CountdownWidget
 * (#1774) and CalendarWidget (#1955): a date comparison with no
 * time-based re-trigger. Fixed by extracting the comparison to this pure
 * function and driving it from a `now` value that ticks every 60s
 * (see Widget.tsx `nowTick`), independent of config identity.
 */
describe('shouldExpireNextUpQueue', () => {
  it('does not expire when the session was created today', () => {
    const now = new Date('2026-07-23T20:00:00');
    const createdAt = new Date('2026-07-23T08:00:00').getTime();

    expect(shouldExpireNextUpQueue(true, createdAt, now)).toBe(false);
  });

  it('expires once `now` has rolled over to the next calendar day', () => {
    const createdAt = new Date('2026-07-23T20:00:00').getTime();
    // Just after local midnight the next day.
    const now = new Date('2026-07-24T00:01:00');

    expect(shouldExpireNextUpQueue(true, createdAt, now)).toBe(true);
  });

  it('does not expire when the session is not active, regardless of date', () => {
    const createdAt = new Date('2026-07-20T08:00:00').getTime();
    const now = new Date('2026-07-24T00:01:00');

    expect(shouldExpireNextUpQueue(false, createdAt, now)).toBe(false);
  });

  it('does not expire when createdAt is missing', () => {
    const now = new Date('2026-07-24T00:01:00');

    expect(shouldExpireNextUpQueue(true, undefined, now)).toBe(false);
  });

  it('expires when createdAt is 0 (Unix epoch — a valid prior-day timestamp, not "missing")', () => {
    // Guarding on `!createdAt` would treat 0 as absent and skip expiry; the
    // guard is `createdAt == null`, so epoch 0 correctly reads as a past day.
    const now = new Date('2026-07-24T00:01:00');

    expect(shouldExpireNextUpQueue(true, 0, now)).toBe(true);
  });

  it('models the reported gap: an idle overnight session stays expired-detectable only once `now` ticks past midnight', () => {
    // A session created at 11:50pm, still active. With `now` frozen at
    // 11:55pm (matching the un-ticked bug — the widget's `nowTick` state
    // never advances without a config change), the session incorrectly
    // reads as still valid past its creation day boundary.
    const createdAt = new Date('2026-07-23T23:50:00').getTime();
    const stillBeforeMidnight = new Date('2026-07-23T23:55:00');
    const afterMidnightTick = new Date('2026-07-24T00:05:00');

    expect(shouldExpireNextUpQueue(true, createdAt, stillBeforeMidnight)).toBe(
      false
    );
    expect(shouldExpireNextUpQueue(true, createdAt, afterMidnightTick)).toBe(
      true
    );
  });
});
