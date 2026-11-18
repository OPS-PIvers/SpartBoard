import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchTokenInfo } from './extensionAuth';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchTokenInfo', () => {
  it('returns the parsed body on success and null when Google refuses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ aud: 'a' })))
      .mockResolvedValueOnce(new Response('{}', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchTokenInfo('t')).toEqual({ aud: 'a' });
    expect(await fetchTokenInfo('t')).toBeNull();
  });

  it('gives up on a tokeninfo call that never answers', async () => {
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(controller.signal);
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new Error('aborted'))
          );
        })
    );
    const pending = expect(fetchTokenInfo('t')).rejects.toBeDefined();
    controller.abort(new Error('timed out'));
    await pending;
    expect(timeout).toHaveBeenCalledWith(5_000);
    timeout.mockRestore();
  });
});
