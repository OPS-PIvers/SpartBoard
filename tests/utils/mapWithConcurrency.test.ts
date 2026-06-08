import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from '@/utils/mapWithConcurrency';
import { ROSTER_DRIVE_CONCURRENCY } from '@/hooks/useRosters';

/**
 * Guards the bounded Drive fan-out in buildRosters: the pool must cap how many
 * mapper calls run at once (so we don't burst-fire every roster's Drive
 * download in one tick and trip a 429) while preserving Promise.all's contract
 * — same-order results, one result per input.
 */

/**
 * A controllable async mapper that lets the test hold every in-flight call open
 * until it explicitly releases it, so the peak concurrency is observable.
 */
function makeTrackingMapper() {
  let active = 0;
  let peak = 0;
  const pending: Array<() => void> = [];

  const mapper = (value: number): Promise<number> => {
    active++;
    peak = Math.max(peak, active);
    return new Promise<number>((resolve) => {
      // Resolve on the next microtask so multiple workers can ramp up to the
      // cap before any single task completes — this is what makes `peak`
      // meaningful rather than always 1.
      pending.push(() => {
        active--;
        resolve(value * 2);
      });
    });
  };

  // Drain the queue repeatedly until no tasks remain in flight, letting the
  // pool refill behind each completion.
  const drain = async (): Promise<void> => {
    while (pending.length > 0) {
      const next = pending.splice(0);
      next.forEach((release) => release());
      // Yield so freed workers can claim the next index before we loop.
      await Promise.resolve();
    }
  };

  return { mapper, drain, getPeak: () => peak };
}

describe('mapWithConcurrency', () => {
  it('preserves input order in the results array', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const result = await mapWithConcurrency(items, 3, (n) =>
      Promise.resolve(n * 10)
    );
    expect(result).toEqual([10, 20, 30, 40, 50, 60, 70]);
  });

  it('returns one result per input even when the list exceeds the cap', async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const result = await mapWithConcurrency(items, 4, (n) =>
      Promise.resolve(n + 1)
    );
    expect(result).toHaveLength(items.length);
    expect(result).toEqual(items.map((n) => n + 1));
  });

  it('never runs more tasks concurrently than the cap', async () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const { mapper, drain, getPeak } = makeTrackingMapper();

    const resultPromise = mapWithConcurrency(items, 4, mapper);
    await drain();
    const result = await resultPromise;

    expect(getPeak()).toBeLessThanOrEqual(4);
    expect(result).toEqual(items.map((n) => n * 2));
  });

  it('respects the production ROSTER_DRIVE_CONCURRENCY cap', async () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const { mapper, drain, getPeak } = makeTrackingMapper();

    const resultPromise = mapWithConcurrency(
      items,
      ROSTER_DRIVE_CONCURRENCY,
      mapper
    );
    await drain();
    await resultPromise;

    expect(getPeak()).toBeLessThanOrEqual(ROSTER_DRIVE_CONCURRENCY);
    // Sanity-check the pool actually ramps up to the cap rather than running
    // serially (which would also satisfy the ≤ assertion vacuously).
    expect(getPeak()).toBe(ROSTER_DRIVE_CONCURRENCY);
  });

  it('handles an empty list without running the mapper', async () => {
    let calls = 0;
    const result = await mapWithConcurrency([], 4, (n: number) => {
      calls++;
      return Promise.resolve(n);
    });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  it('does not stall when the cap is wider than the list', async () => {
    const items = [1, 2];
    const result = await mapWithConcurrency(items, 10, (n) =>
      Promise.resolve(n * 3)
    );
    expect(result).toEqual([3, 6]);
  });

  it('propagates a mapper rejection (Promise.all semantics)', async () => {
    const items = [1, 2, 3];
    await expect(
      mapWithConcurrency(items, 2, (n) =>
        n === 2 ? Promise.reject(new Error('boom')) : Promise.resolve(n)
      )
    ).rejects.toThrow('boom');
  });
});
