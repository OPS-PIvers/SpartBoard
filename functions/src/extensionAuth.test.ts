import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ExtensionCallError,
  fetchTokenInfo,
  verifiedTokenEmail,
} from './extensionAuth';

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

describe('verifiedTokenEmail', () => {
  const good = {
    aud: 'cid',
    azp: 'cid',
    email: 'Ada@orono.k12.mn.us',
    email_verified: 'true',
    expires_in: '3000',
  };
  const check = (tokenInfo: () => Promise<Record<string, unknown> | null>) =>
    verifiedTokenEmail(
      't',
      { clientId: 'cid', tokenInfo },
      'orono.k12.mn.us',
      'Sign in.'
    );
  const statusOf = async (p: Promise<unknown>) =>
    p.then(
      () => 200,
      (e: unknown) => (e instanceof ExtensionCallError ? e.status : -1)
    );

  it('accepts a good token', async () => {
    expect(await check(() => Promise.resolve(good))).toBe(
      'ada@orono.k12.mn.us'
    );
  });

  it('keeps 401 for a real refusal from Google', async () => {
    expect(await statusOf(check(() => Promise.resolve(null)))).toBe(401);
    expect(
      await statusOf(check(() => Promise.resolve({ ...good, aud: 'other' })))
    ).toBe(401);
  });

  it('answers 502, not 401, when tokeninfo times out or the network fails', async () => {
    expect(
      await statusOf(check(() => Promise.reject(new Error('timed out'))))
    ).toBe(502);
  });
});
