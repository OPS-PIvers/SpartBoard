import { describe, it, expect, vi } from 'vitest';
import { SetPrefetchCache } from './setPrefetchCache';

describe('SetPrefetchCache', () => {
  it('dedupes concurrent fetches for the same set id', async () => {
    const cache = new SetPrefetchCache<string>();
    const fetcher = vi.fn().mockResolvedValue('data');
    const [a, b] = await Promise.all([
      cache.fetch('s1', fetcher),
      cache.fetch('s1', fetcher),
    ]);
    expect(a).toBe('data');
    expect(b).toBe('data');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps independent entries per set id (rapid selection changes)', async () => {
    const cache = new SetPrefetchCache<string>();
    const f1 = vi.fn().mockResolvedValue('one');
    const f2 = vi.fn().mockResolvedValue('two');
    const p1 = cache.fetch('s1', f1);
    const p2 = cache.fetch('s2', f2);
    expect(await p1).toBe('one');
    expect(await p2).toBe('two');
    expect(cache.has('s1')).toBe(true);
    expect(cache.has('s2')).toBe(true);
  });

  it('reuses the resolved value on later fetches without refetching', async () => {
    const cache = new SetPrefetchCache<string>();
    const fetcher = vi.fn().mockResolvedValue('data');
    await cache.fetch('s1', fetcher);
    const again = await cache.fetch('s1', vi.fn());
    expect(again).toBe('data');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('evicts rejected fetches so the next call retries fresh', async () => {
    const cache = new SetPrefetchCache<string>();
    const failing = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(cache.fetch('s1', failing)).rejects.toThrow('boom');
    expect(cache.has('s1')).toBe(false);
    const ok = vi.fn().mockResolvedValue('recovered');
    await expect(cache.fetch('s1', ok)).resolves.toBe('recovered');
  });

  it('retries via the new fetcher when awaiting a stale rejected entry', async () => {
    const cache = new SetPrefetchCache<string>();
    let reject!: (e: Error) => void;
    const pending = new Promise<string>((_, rej) => {
      reject = rej;
    });
    const first = cache.fetch('s1', () => pending);
    reject(new Error('offline'));
    await expect(first).rejects.toThrow('offline');
    const ok = vi.fn().mockResolvedValue('fresh');
    await expect(cache.fetch('s1', ok)).resolves.toBe('fresh');
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('invalidate() forces a refetch on the next call', async () => {
    const cache = new SetPrefetchCache<string>();
    await cache.fetch('s1', vi.fn().mockResolvedValue('v1'));
    cache.invalidate('s1');
    expect(cache.has('s1')).toBe(false);
    const f2 = vi.fn().mockResolvedValue('v2');
    await expect(cache.fetch('s1', f2)).resolves.toBe('v2');
    expect(f2).toHaveBeenCalledTimes(1);
  });
});
