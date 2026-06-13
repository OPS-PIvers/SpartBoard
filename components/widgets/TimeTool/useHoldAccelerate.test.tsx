import React, { useState } from 'react';
import { flushSync } from 'react-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, render, fireEvent } from '@testing-library/react';
import { useHoldAccelerate } from './useHoldAccelerate';

// ---------------------------------------------------------------------------
// Test suite for useHoldAccelerate
//
// The hook provides pointer-event handlers for a tap-and-hold control:
//   - Tap  → fires onTick(1) immediately on pointerdown
//   - Hold → after 400ms, fires onTick(multiplier) every 250ms
//            multiplier ramps: 1× for first 1s, 2× for next 1s, then 5×
//   - Cancel on pointerup / pointercancel / pointerleave / unmount
//
// Regression note — inline ref sync (bug fixed in this file's initial commit):
//   onTickRef.current is assigned INLINE in the hook body (not in a useEffect)
//   so the interval callback always reads the latest onTick closure even when
//   the TimeTool's 60fps RAF loop causes rapid re-renders while the user holds
//   a button. A useEffect sync would leave a one-render-stale window that is
//   effectively always open during a running timer.
//
//   The stale window cannot be demonstrated in this test environment:
//   vi.useFakeTimers() fakes setImmediate (the React scheduler's preferred
//   mechanism for enqueuing passive effects). As a result, any call to
//   vi.advanceTimersByTime() also drains pending setImmediate callbacks,
//   causing React's useEffect flush to happen BEFORE the setInterval fires —
//   so old-code and new-code produce identical observations in these tests.
//
//   The tests below instead verify the CORRECT behaviour contract and provide
//   full coverage of tap, hold, ramp-up, cancel, and keyboard paths so any
//   future regression (wrong timing, wrong multiplier, leaked interval) will
//   be caught.
// ---------------------------------------------------------------------------

describe('useHoldAccelerate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ── tap behaviour ──────────────────────────────────────────────────────────

  it('fires onTick(1) immediately on pointerdown', () => {
    const onTick = vi.fn();
    const { result } = renderHook(() => useHoldAccelerate(onTick));

    const fakeEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.onPointerDown(fakeEvent);
    });

    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalledWith(1);
  });

  it('does not start the interval on a quick tap (pointerup before 400ms)', () => {
    const onTick = vi.fn();
    const { result } = renderHook(() => useHoldAccelerate(onTick));

    const fakeEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.onPointerDown(fakeEvent);
      result.current.onPointerUp();
      vi.advanceTimersByTime(1000);
    });

    // Only the immediate tap pulse — no interval ticks
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  // ── hold behaviour ─────────────────────────────────────────────────────────

  it('starts ticking at 1× after 400ms hold', () => {
    const onTick = vi.fn();
    const { result } = renderHook(() => useHoldAccelerate(onTick));

    const fakeEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.onPointerDown(fakeEvent);
    });

    // Clear the immediate tap call so we only count interval ticks
    onTick.mockClear();

    act(() => {
      // Advance past hold delay + one interval tick: 400 + 250 = 650ms
      vi.advanceTimersByTime(650);
    });

    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalledWith(1);
  });

  it('ramps to 2× multiplier after 1s of ticking', () => {
    const onTick = vi.fn();
    const { result } = renderHook(() => useHoldAccelerate(onTick));

    const fakeEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.onPointerDown(fakeEvent);
    });

    onTick.mockClear();

    act(() => {
      // Advance past hold delay (400ms) + 1s of ticking = 1400ms
      // At 1000ms into ticking the multiplier becomes 2×.
      // Tick at 400ms: heldMs=0 → 1×
      // ...
      // Tick at 1400ms: heldMs=1000 → 2×
      vi.advanceTimersByTime(1400);
    });

    const calls = onTick.mock.calls.map((c) => c[0] as number);
    // All 1× calls happen before 1000ms of holding; 2× calls after
    expect(calls.some((m) => m === 2)).toBe(true);
  });

  it('ramps to 5× multiplier after 2s of ticking', () => {
    const onTick = vi.fn();
    const { result } = renderHook(() => useHoldAccelerate(onTick));

    const fakeEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.onPointerDown(fakeEvent);
    });

    onTick.mockClear();

    act(() => {
      // Advance past hold delay (400ms) + 2s of ticking = 2400ms
      vi.advanceTimersByTime(2400);
    });

    const calls = onTick.mock.calls.map((c) => c[0] as number);
    expect(calls.some((m) => m === 5)).toBe(true);
  });

  // ── cancel behaviour ────────────────────────────────────────────────────────

  it('stops ticking on pointerup', () => {
    const onTick = vi.fn();
    const { result } = renderHook(() => useHoldAccelerate(onTick));

    const fakeEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.onPointerDown(fakeEvent);
      vi.advanceTimersByTime(650); // tap + 1 interval tick
      result.current.onPointerUp();
      vi.advanceTimersByTime(1000); // no more ticks should fire
    });

    // 1 immediate + 1 interval tick = 2 total
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it('stops ticking on pointercancel', () => {
    const onTick = vi.fn();
    const { result } = renderHook(() => useHoldAccelerate(onTick));

    const fakeEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.onPointerDown(fakeEvent);
      vi.advanceTimersByTime(650);
      result.current.onPointerCancel();
      vi.advanceTimersByTime(1000);
    });

    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it('stops ticking on pointerleave', () => {
    const onTick = vi.fn();
    const { result } = renderHook(() => useHoldAccelerate(onTick));

    const fakeEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.onPointerDown(fakeEvent);
      vi.advanceTimersByTime(650);
      result.current.onPointerLeave();
      vi.advanceTimersByTime(1000);
    });

    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it('cancels the hold timeout when pointerup fires before 400ms', () => {
    const onTick = vi.fn();
    const { result } = renderHook(() => useHoldAccelerate(onTick));

    const fakeEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.onPointerDown(fakeEvent);
      vi.advanceTimersByTime(300); // less than HOLD_DELAY_MS
      result.current.onPointerUp();
      vi.advanceTimersByTime(2000); // well past where interval would have started
    });

    expect(onTick).toHaveBeenCalledTimes(1); // only the immediate tap
  });

  it('cancels interval on unmount', () => {
    const onTick = vi.fn();
    const { result, unmount } = renderHook(() => useHoldAccelerate(onTick));

    const fakeEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.onPointerDown(fakeEvent);
      vi.advanceTimersByTime(650); // 1 interval tick
    });

    unmount();
    onTick.mockClear();

    act(() => {
      vi.advanceTimersByTime(1000); // should fire nothing
    });

    expect(onTick).not.toHaveBeenCalled();
  });

  // ── keyboard behaviour ─────────────────────────────────────────────────────

  it('fires onTick(1) on Enter keydown', () => {
    const onTick = vi.fn();
    const { result } = renderHook(() => useHoldAccelerate(onTick));

    const enterEvent = {
      key: 'Enter',
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;

    act(() => {
      result.current.onKeyDown(enterEvent);
    });

    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalledWith(1);
  });

  it('fires onTick(1) on Space keydown', () => {
    const onTick = vi.fn();
    const { result } = renderHook(() => useHoldAccelerate(onTick));

    const spaceEvent = {
      key: ' ',
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;

    act(() => {
      result.current.onKeyDown(spaceEvent);
    });

    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalledWith(1);
  });

  it('does not fire onTick for other keys', () => {
    const onTick = vi.fn();
    const { result } = renderHook(() => useHoldAccelerate(onTick));

    const tabEvent = {
      key: 'Tab',
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;

    act(() => {
      result.current.onKeyDown(tabEvent);
    });

    expect(onTick).not.toHaveBeenCalled();
  });

  // ── ref-currency contract (regression for inline ref sync) ──────────────────
  //
  // This test verifies that after a rerender with a new onTick callback, the
  // NEXT interval tick calls the new callback — not the one from the previous
  // render.
  //
  // Why this can't directly observe the pre-fix failure:
  //   React Testing Library's act() and renderHook().rerender both flush
  //   passive effects synchronously. In the OLD code (useEffect sync), the
  //   effect ran before the next timer advance, so both old and new code reach
  //   the same ref value by the time vi.advanceTimersByTime() fires.
  //
  //   In production, passive effects run AFTER the browser paint (via
  //   setImmediate / MessageChannel). During a 60fps RAF loop the effect lags
  //   by at least one 16ms frame. With a 250ms tick interval the stale window
  //   is small but real and was reproducible with a debug log added to the
  //   interval callback.
  //
  //   The test below validates the CORRECT contract: after rerender, the
  //   interval must call the current onTick.
  it('interval always calls the latest onTick after a prop change', () => {
    const onTickA = vi.fn();
    const onTickB = vi.fn();

    let currentOnTick = onTickA;

    const { result, rerender } = renderHook(() =>
      useHoldAccelerate(currentOnTick)
    );

    const fakeEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.PointerEvent;

    // Start holding — fires immediate tap (onTickA)
    act(() => {
      result.current.onPointerDown(fakeEvent);
    });

    // Advance past hold delay to start the interval
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Clear so we only observe post-rerender ticks
    onTickA.mockClear();
    onTickB.mockClear();

    // Swap to onTickB and rerender — act() inside rerender flushes the effect
    currentOnTick = onTickB;
    rerender();

    // Advance one interval tick — must call the NEW callback
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onTickB).toHaveBeenCalledTimes(1);
    expect(onTickA).not.toHaveBeenCalled();
  });

  // ── second pointerdown resets the interval ─────────────────────────────────

  it('a second pointerdown resets the hold cycle', () => {
    const onTick = vi.fn();
    const { result } = renderHook(() => useHoldAccelerate(onTick));

    const fakeEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.onPointerDown(fakeEvent); // tap #1
      vi.advanceTimersByTime(650); // tap + 1 interval tick
      result.current.onPointerDown(fakeEvent); // tap #2 (resets cycle)
      vi.advanceTimersByTime(399); // just under hold delay — no interval yet
    });

    // tap #1 immediate + 1 interval + tap #2 immediate = 3
    expect(onTick).toHaveBeenCalledTimes(3);
  });
});

// ── Integration: hook wired up via a real component ────────────────────────
//
// Verifies the hook's event handlers work correctly when attached to a real
// DOM button, including that the immediate tap fires on the initial click.

function HoldButton({ onTick }: { onTick: (multiplier: number) => void }) {
  const handlers = useHoldAccelerate(onTick);
  return <button {...handlers}>Hold me</button>;
}

describe('useHoldAccelerate (component integration)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('immediate tap fires when pointerdown is triggered on a real button', () => {
    const onTick = vi.fn();

    const { getByText } = render(<HoldButton onTick={onTick} />);
    const btn = getByText('Hold me');

    fireEvent.pointerDown(btn);

    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalledWith(1);
  });

  it('ticks stop when pointerup is fired on a real button', () => {
    const onTick = vi.fn();

    const { getByText } = render(<HoldButton onTick={onTick} />);
    const btn = getByText('Hold me');

    act(() => {
      fireEvent.pointerDown(btn);
      vi.advanceTimersByTime(650);
      fireEvent.pointerUp(btn);
      vi.advanceTimersByTime(1000);
    });

    expect(onTick).toHaveBeenCalledTimes(2); // immediate + 1 interval tick
  });

  it('updates onTick correctly when parent re-renders with a new callback', () => {
    // Regression: inline ref sync ensures the interval fires the LATEST
    // onTick even when the parent re-renders (e.g. every RAF frame in TimeTool)
    const callLog: string[] = [];
    const onTickA = vi.fn(() => callLog.push('A'));
    const onTickB = vi.fn(() => callLog.push('B'));

    function Parent() {
      const [useB, setUseB] = useState(false);
      return (
        <>
          <HoldButton onTick={useB ? onTickB : onTickA} />
          <button onClick={() => setUseB(true)}>swap</button>
        </>
      );
    }

    const { getByText } = render(<Parent />);
    const holdBtn = getByText('Hold me');
    const swapBtn = getByText('swap');

    // Start holding
    act(() => {
      fireEvent.pointerDown(holdBtn);
      vi.advanceTimersByTime(400); // starts interval
    });

    callLog.length = 0; // clear initial tap and any pre-swap ticks

    // Swap the callback — done in a SEPARATE act() so the React re-render
    // commits (and the inline ref sync runs) BEFORE the timer fires.
    // Putting fireEvent.click and vi.advanceTimersByTime in the SAME act()
    // would defer the render to the end of the batch, meaning the interval
    // fires before the ref is updated — that is a known React 19 act()
    // behaviour and is not specific to the inline-sync fix.
    act(() => {
      fireEvent.click(swapBtn); // triggers React re-render with onTickB
    });

    callLog.length = 0; // clear any tap that fired from the click

    // Now the render has committed and the ref is current — advance one tick
    act(() => {
      vi.advanceTimersByTime(250);
    });

    // After the re-render, the interval must call onTickB
    expect(callLog).toContain('B');
    expect(callLog).not.toContain('A');
  });

  it('interval always calls the latest onTick after a flushSync + timer advance', () => {
    // Documents the correct behaviour contract: even when renders are forced
    // synchronously via flushSync (bypassing act()), the interval callback
    // always reads the most up-to-date onTick.
    //
    // Note: vi.advanceTimersByTime() advances setImmediate (faked by vitest),
    // which is the same mechanism React's scheduler uses to flush passive
    // effects. As a result, both old-style useEffect sync and the inline-sync
    // fix produce identical observable outcomes in this test environment — the
    // effect runs before the interval fires regardless.
    //
    // The true stale window exists in production browsers where setImmediate/
    // MessageChannel are NOT faked: the passive effect scheduler runs
    // asynchronously, AFTER the browser paints, while the setInterval fires
    // at its own cadence. During the TimeTool's 60fps RAF loop this window is
    // open on every frame while the user holds the button.
    const callLog: string[] = [];
    const onTickA = vi.fn(() => callLog.push('A'));
    const onTickB = vi.fn(() => callLog.push('B'));

    function Parent() {
      const [useB, setUseB] = useState(false);
      return (
        <>
          <HoldButton onTick={useB ? onTickB : onTickA} />
          <button onClick={() => setUseB(true)}>swap</button>
        </>
      );
    }

    const { getByText } = render(<Parent />);
    const holdBtn = getByText('Hold me');
    const swapBtn = getByText('swap');

    // Start holding (inside act so effects are flushed before we begin)
    act(() => {
      fireEvent.pointerDown(holdBtn);
      vi.advanceTimersByTime(400); // starts interval
    });

    callLog.length = 0;

    // Force a synchronous render with the new onTick, bypassing act().
    // flushSync commits the render (layout effects run) but passive effects
    // (useEffect) are NOT flushed — they remain scheduled via setImmediate.
    flushSync(() => {
      fireEvent.click(swapBtn);
    });

    callLog.length = 0;

    // Advance the interval timer WITHOUT wrapping in act(), so the pending
    // passive effects do NOT get a chance to run first.
    vi.advanceTimersByTime(250);

    // With inline ref sync (current code): ref was updated during the
    // flushSync render → interval calls onTickB ✓
    expect(callLog).toContain('B');
    expect(callLog).not.toContain('A');
  });
});
