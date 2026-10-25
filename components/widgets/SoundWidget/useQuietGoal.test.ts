import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuietGoal } from './useQuietGoal';

describe('useQuietGoal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a reached goal once, even if the goal is raised afterwards', () => {
    const onReached = vi.fn();
    const { rerender, result } = renderHook(
      ({ goal }) => useQuietGoal(true, goal, onReached),
      { initialProps: { goal: 1000 } }
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onReached).toHaveBeenCalledTimes(1);
    rerender({ goal: 2000 });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onReached).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.reset();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onReached).toHaveBeenCalledTimes(2);
  });

  it('keeps partial time when counting flickers off and on', () => {
    const { rerender, result } = renderHook(
      ({ counting }) => useQuietGoal(counting, 10_000, () => undefined),
      { initialProps: { counting: true } }
    );
    for (let i = 0; i < 10; i++) {
      act(() => {
        vi.advanceTimersByTime(100);
      });
      rerender({ counting: false });
      rerender({ counting: true });
    }
    expect(result.current.elapsedMs).toBe(1000);
  });

  it('reports when the goal is lowered below the time counted', () => {
    const onReached = vi.fn();
    const { rerender } = renderHook(
      ({ goal }) => useQuietGoal(true, goal, onReached),
      { initialProps: { goal: 10_000 } }
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    rerender({ goal: 2000 });
    expect(onReached).toHaveBeenCalledTimes(1);
  });
});
