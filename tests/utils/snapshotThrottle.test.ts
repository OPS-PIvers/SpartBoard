import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createLeadingTrailingThrottle,
  RESPONSES_THROTTLE_MS,
} from '@/utils/snapshotThrottle';

/**
 * Leading-edge + trailing-flush throttle used by the quiz / video-activity
 * session listeners. Semantics under test:
 *   - first push in an idle window applies immediately (leading edge)
 *   - further pushes buffer the LATEST value (older buffered values dropped)
 *   - the trailing timer applies the buffered value once, then resets
 *   - flush() applies any buffered value now (teardown path)
 *   - cancel() clears the timer WITHOUT applying
 */

describe('createLeadingTrailingThrottle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('exposes the shared 200ms responses window constant', () => {
    expect(RESPONSES_THROTTLE_MS).toBe(200);
  });

  it('applies the first push immediately (leading edge)', () => {
    const apply = vi.fn();
    const t = createLeadingTrailingThrottle<number>(apply, 100);
    t.push(1);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenLastCalledWith(1);
  });

  it('buffers pushes within the window and flushes the latest on timer fire', () => {
    const apply = vi.fn();
    const t = createLeadingTrailingThrottle<number>(apply, 100);
    t.push(1); // leading — applies now
    t.push(2); // buffered
    t.push(3); // buffered — supersedes 2
    expect(apply).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    // Only the latest buffered value (3) is applied on the trailing edge.
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith(3);
  });

  it('does not fire a trailing apply when nothing was buffered', () => {
    const apply = vi.fn();
    const t = createLeadingTrailingThrottle<number>(apply, 100);
    t.push(1); // leading only, no further pushes
    vi.advanceTimersByTime(100);
    // Window closes with nothing buffered — no second apply.
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('re-opens the leading edge after the window closes', () => {
    const apply = vi.fn();
    const t = createLeadingTrailingThrottle<number>(apply, 100);
    t.push(1); // leading
    vi.advanceTimersByTime(100); // window closes, nothing buffered
    expect(apply).toHaveBeenCalledTimes(1);

    t.push(2); // new idle window — leading edge again, applies now
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith(2);
  });

  it('applies a buffered value immediately via flush() and clears the timer', () => {
    const apply = vi.fn();
    const t = createLeadingTrailingThrottle<number>(apply, 100);
    t.push(1); // leading
    t.push(2); // buffered
    t.flush();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith(2);

    // Timer was cleared by flush — advancing must not re-apply.
    vi.advanceTimersByTime(100);
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('flush() with no buffered value only clears the timer', () => {
    const apply = vi.fn();
    const t = createLeadingTrailingThrottle<number>(apply, 100);
    t.push(1); // leading, nothing buffered
    t.flush();
    expect(apply).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('cancel() drops the buffered value without applying it', () => {
    const apply = vi.fn();
    const t = createLeadingTrailingThrottle<number>(apply, 100);
    t.push(1); // leading
    t.push(2); // buffered
    t.cancel();
    // Buffered 2 is discarded, timer cleared.
    vi.advanceTimersByTime(100);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenLastCalledWith(1);
  });

  it('correctly buffers falsy values (empty array) via the hasPending flag', () => {
    // The hasPending flag exists so a buffered falsy value (e.g. an empty
    // responses array) is not conflated with "nothing buffered".
    const apply = vi.fn();
    const t = createLeadingTrailingThrottle<number[]>(apply, 100);
    t.push([1, 2, 3]); // leading
    t.push([]); // buffered empty array — must still flush
    vi.advanceTimersByTime(100);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith([]);
  });

  it('after a trailing flush, the next push is a fresh leading edge', () => {
    const apply = vi.fn();
    const t = createLeadingTrailingThrottle<number>(apply, 100);
    t.push(1); // leading
    t.push(2); // buffered
    vi.advanceTimersByTime(100); // trailing applies 2, window resets
    expect(apply).toHaveBeenCalledTimes(2);

    t.push(3); // fresh idle window
    expect(apply).toHaveBeenCalledTimes(3);
    expect(apply).toHaveBeenLastCalledWith(3);
  });
});
