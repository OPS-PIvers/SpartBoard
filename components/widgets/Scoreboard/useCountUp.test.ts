import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCountUp } from './useCountUp';

describe('useCountUp', () => {
  let now = 0;
  let queue: FrameRequestCallback[] = [];
  const flush = (ms: number) => {
    now += ms;
    const run = queue;
    queue = [];
    run.forEach((cb) => cb(now));
  };

  beforeEach(() => {
    now = 0;
    queue = [];
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      queue = [];
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('holds the old number, then counts up to the new one', () => {
    const { result, rerender } = renderHook(({ v }) => useCountUp(v, true), {
      initialProps: { v: 0 },
    });
    rerender({ v: 10 });
    expect(result.current).toBe(0);
    act(() => flush(100));
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(10);
    act(() => flush(400));
    expect(result.current).toBe(10);
  });

  it('shows the new number at once when off or with reduced motion', () => {
    const { result, rerender } = renderHook(({ v }) => useCountUp(v, false), {
      initialProps: { v: 0 },
    });
    rerender({ v: 7 });
    expect(result.current).toBe(7);

    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const reduced = renderHook(({ v }) => useCountUp(v, true), {
      initialProps: { v: 1 },
    });
    reduced.rerender({ v: 5 });
    expect(reduced.result.current).toBe(5);
  });
});
