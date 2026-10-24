import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJsonWithRetry } from '@/scripts/nutrisliceFetch.mjs';

describe('fetchJsonWithRetry', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retries a thrown network error and then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ a: 1 }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(fetchJsonWithRetry('u', { sleep })).resolves.toEqual({ a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rethrows the network error after the last attempt', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(fetchJsonWithRetry('u', { sleep })).rejects.toThrow(
      'fetch failed'
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 4xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchJsonWithRetry('u', { sleep: vi.fn() })).rejects.toThrow(
      '404'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
