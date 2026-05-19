import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFocusLossPoll } from '@/hooks/useFocusLossPoll';

/**
 * The hook detects focus loss via a `document.hasFocus()` poll. jsdom's
 * implementation always returns `true`, so we override it through the
 * descriptor so individual tests can flip the return value mid-run.
 * The afterEach restores the original to keep these tests hermetic.
 */
function setHasFocus(value: boolean): void {
  vi.spyOn(document, 'hasFocus').mockReturnValue(value);
}

describe('useFocusLossPoll', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fires onFocusLoss on a true → false edge', () => {
    setHasFocus(true);
    const onFocusLoss = vi.fn();
    renderHook(() =>
      useFocusLossPoll({ enabled: true, intervalMs: 100, onFocusLoss })
    );

    // Initial poll seeds prev = true. Now lose focus and tick once.
    setHasFocus(false);
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(onFocusLoss).toHaveBeenCalledTimes(1);
  });

  it('does not fire on subsequent false → false ticks', () => {
    setHasFocus(true);
    const onFocusLoss = vi.fn();
    renderHook(() =>
      useFocusLossPoll({ enabled: true, intervalMs: 100, onFocusLoss })
    );

    setHasFocus(false);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onFocusLoss).toHaveBeenCalledTimes(1);

    // Several more ticks while focus stays lost — no further fires.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onFocusLoss).toHaveBeenCalledTimes(1);
  });

  it('does not fire on focus regain', () => {
    setHasFocus(true);
    const onFocusLoss = vi.fn();
    renderHook(() =>
      useFocusLossPoll({ enabled: true, intervalMs: 100, onFocusLoss })
    );

    // Lose then immediately regain focus before the next tick.
    setHasFocus(false);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onFocusLoss).toHaveBeenCalledTimes(1);

    setHasFocus(true);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // The false → true transition is silent. Still one call.
    expect(onFocusLoss).toHaveBeenCalledTimes(1);
  });

  it('fires again on a new edge after focus returns', () => {
    setHasFocus(true);
    const onFocusLoss = vi.fn();
    renderHook(() =>
      useFocusLossPoll({ enabled: true, intervalMs: 100, onFocusLoss })
    );

    // First edge.
    setHasFocus(false);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onFocusLoss).toHaveBeenCalledTimes(1);

    // Return.
    setHasFocus(true);
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Second edge.
    setHasFocus(false);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onFocusLoss).toHaveBeenCalledTimes(2);
  });

  it('does not poll when enabled is false', () => {
    setHasFocus(true);
    const onFocusLoss = vi.fn();
    renderHook(() =>
      useFocusLossPoll({ enabled: false, intervalMs: 100, onFocusLoss })
    );

    setHasFocus(false);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onFocusLoss).not.toHaveBeenCalled();
  });

  it('clears the interval on unmount', () => {
    setHasFocus(true);
    const onFocusLoss = vi.fn();
    const { unmount } = renderHook(() =>
      useFocusLossPoll({ enabled: true, intervalMs: 100, onFocusLoss })
    );

    unmount();
    setHasFocus(false);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onFocusLoss).not.toHaveBeenCalled();
  });

  it('preserves edge detection when re-rendered during a focus-lost window', () => {
    // Regression test for the snapshot-race the silent-failure-hunter
    // surfaced on PR review. The inline version of this code re-seeded
    // `prevHadFocus` on every effect re-run, so if a Firestore snapshot
    // fired while focus was already lost (e.g. between a URL-bar click
    // and the next poll tick), the seed dropped to `false` and the next
    // tick saw `false → false` — silently swallowing the violation.
    //
    // With the seed gated to first-call-only, a re-render mid-focus-lost
    // must NOT reset the previous-state tracker. The next tick still
    // sees the true → false edge and fires.

    setHasFocus(true);
    const onFocusLoss = vi.fn();
    let enabled = true;
    const { rerender } = renderHook(() =>
      useFocusLossPoll({ enabled, intervalMs: 100, onFocusLoss })
    );

    // Focus is lost between renders, before any poll tick fires.
    setHasFocus(false);

    // Simulate the snapshot-driven re-render of the parent component.
    // The previous inline poll's effect would tear down and re-build
    // here, re-seeding `prev` to the now-false state and burying the
    // edge. The hook's gated seed must keep `prev = true` so the next
    // tick still detects a transition.
    rerender();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onFocusLoss).toHaveBeenCalledTimes(1);

    // Sanity: also covers re-renders triggered by the `enabled` flag
    // bouncing (e.g. session.status flipping briefly). Toggle off then
    // back on while focus stays lost; the next true→false edge after a
    // refocus should still fire.
    enabled = false;
    rerender();
    enabled = true;
    rerender();

    setHasFocus(true);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    setHasFocus(false);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onFocusLoss).toHaveBeenCalledTimes(2);
  });

  it('uses the latest onFocusLoss closure (no stale callbacks)', () => {
    setHasFocus(true);
    const first = vi.fn();
    const second = vi.fn();
    let callback = first;
    const { rerender } = renderHook(() =>
      useFocusLossPoll({
        enabled: true,
        intervalMs: 100,
        onFocusLoss: callback,
      })
    );

    // Swap the callback BEFORE the edge fires.
    callback = second;
    rerender();

    setHasFocus(false);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
