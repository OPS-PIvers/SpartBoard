import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';

describe('useDebouncedCallback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('delays invocation by delayMs', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 200));

    result.current('a');
    expect(fn).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(fn).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('coalesces rapid calls — only the last fires', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 200));

    result.current('a');
    result.current('b');
    result.current('c');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('uses the latest fn reference when timer fires', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ fn }) => useDebouncedCallback(fn, 200),
      {
        initialProps: { fn: first },
      }
    );

    result.current('x');
    rerender({ fn: second });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('x');
  });

  it('flushes the pending call on unmount instead of dropping it', () => {
    const fn = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDebouncedCallback(fn, 200)
    );

    result.current('last');
    unmount();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('last');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not call on unmount when nothing is pending', () => {
    const fn = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDebouncedCallback(fn, 200)
    );
    result.current('a');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    unmount();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
