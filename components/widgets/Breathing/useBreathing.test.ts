import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBreathing } from './useBreathing';

describe('useBreathing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      return setTimeout(() => cb(performance.now()), 0) as unknown as number;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      clearTimeout(id as unknown as number);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('starts in ready state', () => {
    const { result } = renderHook(() => useBreathing('4-4-4-4'));
    expect(result.current.phase).toBe('ready');
    expect(result.current.isActive).toBe(false);
  });

  it('transitions to inhale phase on first start', () => {
    const { result } = renderHook(() => useBreathing('4-4-4-4'));

    act(() => {
      result.current.toggleActive();
    });

    expect(result.current.phase).toBe('inhale');
    expect(result.current.isActive).toBe(true);
  });

  /**
   * Regression test for pause/resume bug:
   *
   * Before the fix, calling toggleActive() while paused mid-phase would
   * always reset the phase back to 'inhale' with full duration, losing the
   * user's position in the cycle. After the fix, resuming reconstructs
   * startTime from the saved progress so the sequence continues from where
   * it was paused.
   *
   * Scenario: start → let 2 s elapse into the 4 s inhale phase (progress=0.5)
   * → pause → resume → phase should still be 'inhale', not snapped back to
   * the beginning of 'inhale' from zero.
   */
  it('resumes from the correct position after pause (does not restart inhale from zero)', () => {
    const { result } = renderHook(() => useBreathing('4-4-4-4'));

    // Start the sequence
    act(() => {
      result.current.toggleActive();
    });

    expect(result.current.phase).toBe('inhale');

    // Advance time by 2 s (halfway through the 4 s inhale phase)
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Verify we are mid-inhale with ~2 s remaining
    const progressBeforePause = result.current.progress;
    expect(result.current.phase).toBe('inhale');
    expect(progressBeforePause).toBeGreaterThan(0);
    expect(progressBeforePause).toBeLessThan(1);

    // Pause
    act(() => {
      result.current.toggleActive();
    });

    expect(result.current.isActive).toBe(false);
    expect(result.current.phase).toBe('inhale');

    // Advance fake time while paused — the timer must NOT change phase
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.phase).toBe('inhale');

    // Resume — the phase must remain 'inhale' (not jump to the start of a
    // new 'inhale' phase with full 4 s duration)
    act(() => {
      result.current.toggleActive();
    });

    expect(result.current.isActive).toBe(true);
    // The phase must still be 'inhale' immediately after resuming — the old
    // bug would also have the phase as 'inhale' right after resume, but the
    // key difference is that timeLeft should reflect the remaining time, not
    // the full duration. We advance time slightly to let the RAF tick fire.
    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(result.current.phase).toBe('inhale');
    // After resuming and advancing 50ms, timeLeft should be approximately
    // 2 s (the remaining portion), not the full 4 s. This proves the timer
    // resumed from its paused position rather than restarting.
    expect(result.current.timeLeft).toBeLessThanOrEqual(2);
    expect(result.current.timeLeft).toBeGreaterThanOrEqual(1);
  });

  it('completing inhale phase transitions to hold1 for 4-4-4-4 pattern', () => {
    const { result } = renderHook(() => useBreathing('4-4-4-4'));

    act(() => {
      result.current.toggleActive();
    });

    // Advance past the 4 s inhale phase
    act(() => {
      vi.advanceTimersByTime(4500);
    });

    expect(result.current.phase).toBe('hold1');
  });

  it('reset returns to ready state', () => {
    const { result } = renderHook(() => useBreathing('4-4-4-4'));

    act(() => {
      result.current.toggleActive();
    });

    expect(result.current.phase).toBe('inhale');

    act(() => {
      result.current.reset();
    });

    expect(result.current.phase).toBe('ready');
    expect(result.current.isActive).toBe(false);
  });

  it('after reset, starting again begins a fresh inhale phase', () => {
    const { result } = renderHook(() => useBreathing('4-4-4-4'));

    act(() => {
      result.current.toggleActive();
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.phase).toBe('ready');

    // Start again — should begin at inhale with full duration
    act(() => {
      result.current.toggleActive();
    });

    expect(result.current.phase).toBe('inhale');
    expect(result.current.isActive).toBe(true);
  });

  /**
   * Regression test for pattern-change mid-cycle edge case.
   *
   * Bug: when patternId changes while the timer is active, patternRef.current
   * is updated (via useEffect) but stateRef.current.phaseDuration is NOT
   * updated for the current phase.  The tick loop reads phaseDuration from
   * stateRef, so the current phase runs for the OLD pattern's duration.
   *
   * Scenario:
   *   - Start with 4-4-4-4 (inhale=4s). stateRef.phaseDuration is set to 4000.
   *   - After 1 s, switch to 5-5 (inhale=5s).
   *   - The inhale should now last 5 s total (4 s remaining after the switch),
   *     so the phase must NOT end at the 4 s mark.
   *   - If the bug is present, stateRef.phaseDuration stays at 4000, the phase
   *     ends at the 4 s mark (only 3 s after the switch), and the test fails.
   */
  it('switching pattern mid-cycle updates phaseDuration to the new pattern value', () => {
    const patternIdRef = {
      current: '4-4-4-4' as Parameters<typeof useBreathing>[0],
    };
    const { result, rerender } = renderHook(() =>
      useBreathing(patternIdRef.current)
    );

    // Start with 4-4-4-4 (inhale = 4 s)
    act(() => {
      result.current.toggleActive();
    });

    expect(result.current.phase).toBe('inhale');

    // Advance 1 s into the 4 s inhale
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.phase).toBe('inhale');

    // Switch to 5-5 (inhale = 5 s). The current inhale phase now has a
    // 5 s total duration, meaning 4 s should remain after the 1 s already
    // elapsed.
    act(() => {
      patternIdRef.current = '5-5';
      rerender();
    });

    // Advance to just past the OLD pattern's end mark (4000 ms from start).
    // With the bug, the phase ends here. With the fix, it must still be inhale.
    act(() => {
      vi.advanceTimersByTime(3100); // total elapsed = 4100 ms > old 4000 ms limit
    });

    // The phase should still be 'inhale' — the new pattern's 5 s duration
    // means the phase should not end until 5000 ms from the phase start.
    expect(result.current.phase).toBe('inhale');

    // Now advance past the NEW pattern's end mark (total 5000 ms from start)
    act(() => {
      vi.advanceTimersByTime(1000); // total elapsed = 5100 ms > new 5000 ms limit
    });

    // The inhale phase should now be complete and we should be in exhale
    // (5-5 pattern has hold1=0, so inhale → exhale directly)
    expect(result.current.phase).toBe('exhale');
  });
});
