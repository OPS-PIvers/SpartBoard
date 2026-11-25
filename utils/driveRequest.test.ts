import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DriveSession, resetDriveRequestStateForTests } from './driveRequest';

const res = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetDriveRequestStateForTests();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const authOf = (call: number) =>
  (fetchMock.mock.calls[call][1] as RequestInit).headers as Record<
    string,
    string
  >;

describe('DriveSession.request', () => {
  it('retries a 429 and a GET 5xx, then returns the answer', async () => {
    fetchMock
      .mockResolvedValueOnce(res(429))
      .mockResolvedValueOnce(res(503))
      .mockResolvedValueOnce(res(200, { ok: 1 }));
    const r = await new DriveSession('t').request('https://x/files');
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries a 403 rate limit but not a plain 403', async () => {
    fetchMock
      .mockResolvedValueOnce(
        res(403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } })
      )
      .mockResolvedValueOnce(res(200));
    expect((await new DriveSession('t').request('https://x')).status).toBe(200);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(res(403, { error: 'forbidden' }));
    expect((await new DriveSession('t').request('https://x')).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never retries a POST 5xx, which could make a duplicate', async () => {
    fetchMock.mockResolvedValue(res(500));
    const r = await new DriveSession('t').request('https://x/files', {
      method: 'POST',
    });
    expect(r.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes the token once on a 401 and resends with the new one', async () => {
    fetchMock.mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(200));
    const refresh = vi.fn().mockResolvedValue('t2');
    const session = new DriveSession('t1', refresh);
    const r = await session.request('https://x', {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(r.status).toBe(200);
    expect(authOf(0).Authorization).toBe('Bearer t1');
    expect(authOf(1).Authorization).toBe('Bearer t2');
    expect(authOf(1)['Content-Type']).toBe('application/json');
    expect(session.accessToken).toBe('t2');
  });

  it('returns the 401 when the refresh gives nothing', async () => {
    fetchMock.mockResolvedValue(res(401));
    const r = await new DriveSession('t', () => Promise.resolve(null)).request(
      'https://x'
    );
    expect(r.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('turns a stalled request into a timeout error', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          );
        })
    );
    await expect(
      new DriveSession('t').request('https://x', {}, { timeoutMs: 5 })
    ).rejects.toThrow('timed out');
  });
});

describe('DriveSession folders', () => {
  it('looks a folder path up once per token', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(res(200, { files: [{ id: 'f' }] }))
    );
    const session = new DriveSession('t');
    await session.getOrCreateFolderPath('App', ['Assets', 'Pics']);
    await session.getOrCreateFolderPath('App', ['Assets', 'Pics']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    session.forgetFolders();
    await session.getOrCreateFolderPath('App', ['Assets']);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('looks a folder up again after ten minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      fetchMock.mockImplementation(() =>
        Promise.resolve(res(200, { files: [{ id: 'f' }] }))
      );
      const session = new DriveSession('t');
      await session.getOrCreateFolder('App');
      vi.setSystemTime(Date.now() + 11 * 60 * 1000);
      await session.getOrCreateFolder('App');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('creates a missing folder under its parent', async () => {
    fetchMock
      .mockResolvedValueOnce(res(200, { files: [] }))
      .mockResolvedValueOnce(res(200, { id: 'new' }));
    const id = await new DriveSession('t').getOrCreateFolder('Pics', 'p1');
    expect(id).toBe('new');
    const body = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string
    ) as { parents: string[] };
    expect(body.parents).toEqual(['p1']);
  });
});
