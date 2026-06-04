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
});
