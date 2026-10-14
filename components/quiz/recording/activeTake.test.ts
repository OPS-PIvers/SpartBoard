import { describe, it, expect, vi, afterEach } from 'vitest';
import { commitActiveTake, registerActiveTake } from './activeTake';

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.useRealTimers();
});

describe('activeTake registry', () => {
  it('resolves at once with nothing registered', async () => {
    await expect(commitActiveTake()).resolves.toBeUndefined();
  });

  it('awaits the registered capture', async () => {
    const commitNow = vi.fn().mockResolvedValue(undefined);
    cleanup = registerActiveTake({ commitNow });
    await commitActiveTake();
    expect(commitNow).toHaveBeenCalledTimes(1);
  });

  it('swallows a failed commit so the cutoff still runs', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    cleanup = registerActiveTake({
      commitNow: () => Promise.reject(new Error('offline')),
    });
    await expect(commitActiveTake()).resolves.toBeUndefined();
  });

  it('stops waiting at the cap', async () => {
    vi.useFakeTimers();
    cleanup = registerActiveTake({
      commitNow: () => new Promise<void>(() => undefined),
    });
    const done = commitActiveTake(500);
    await vi.advanceTimersByTimeAsync(500);
    await expect(done).resolves.toBeUndefined();
  });

  it('ignores a stale unregister', async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    const unregisterFirst = registerActiveTake({ commitNow: first });
    cleanup = registerActiveTake({ commitNow: second });
    unregisterFirst();
    await commitActiveTake();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
