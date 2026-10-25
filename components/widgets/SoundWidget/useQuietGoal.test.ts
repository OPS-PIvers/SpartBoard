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
});
