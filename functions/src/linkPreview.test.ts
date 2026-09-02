// Unit tests for the fetchLinkPreview callable (P1-3).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    onCall: (_opts: unknown, handler: unknown) => handler,
    HttpsError: FakeHttpsError,
  };
});

vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({
  ALLOWED_ORIGINS: ['https://example.com'],
}));

const dnsLookup = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('dns', () => {
  const lookup = (...args: unknown[]): Promise<unknown> => dnsLookup(...args);
  return { default: { promises: { lookup } }, promises: { lookup } };
});

const axiosGet = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('axios', () => ({
  default: {
    get: (...args: unknown[]): Promise<unknown> => axiosGet(...args),
    isAxiosError: (err: unknown): err is { response?: unknown } =>
      !!err && typeof err === 'object' && 'isAxiosError' in err,
  },
}));

function makeRedirectError(status: number, location: string) {
  return {
    isAxiosError: true,
    response: { status, headers: { location } },
  };
}

import { fetchLinkPreview } from './linkPreview';

type Handler = (request: {
  auth: {
    uid: string;
    token?: { firebase?: { sign_in_provider?: string } };
  } | null;
  data: unknown;
}) => Promise<unknown>;

const call = fetchLinkPreview as unknown as Handler;

const AUTH = { uid: 'user-1' };

beforeEach(() => {
  vi.clearAllMocks();
  dnsLookup.mockResolvedValue([{ address: '93.184.216.34' }]);
});

describe('fetchLinkPreview', () => {
  it('rejects unauthenticated calls', async () => {
    await expect(
      call({ auth: null, data: { url: 'https://example.com' } })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects non-https URLs', async () => {
    await expect(
      call({ auth: AUTH, data: { url: 'http://example.com' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('rejects a hostname that resolves to a private IP (SSRF)', async () => {
    dnsLookup.mockResolvedValue([{ address: '10.0.0.5' }]);
    await expect(
      call({ auth: AUTH, data: { url: 'https://internal.example.com/page' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('rejects an IPv4-mapped IPv6 private address (dotted form)', async () => {
    dnsLookup.mockResolvedValue([{ address: '::ffff:10.0.0.5' }]);
    await expect(
      call({ auth: AUTH, data: { url: 'https://internal.example.com/page' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('rejects an IPv4-mapped IPv6 metadata address (hex form)', async () => {
    // ::ffff:169.254.169.254 in hex form is ::ffff:a9fe:a9fe
    dnsLookup.mockResolvedValue([{ address: '::ffff:a9fe:a9fe' }]);
    await expect(
      call({ auth: AUTH, data: { url: 'https://internal.example.com/page' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('rejects localhost and metadata hosts without a DNS lookup', async () => {
    await expect(
      call({ auth: AUTH, data: { url: 'https://localhost/page' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      call({
        auth: AUTH,
        data: { url: 'https://metadata.google.internal/page' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('short-circuits youtube.com/watch links without fetching', async () => {
    const result = await call({
      auth: AUTH,
      data: { url: 'https://www.youtube.com/watch?v=abc123' },
    });
    expect(result).toEqual({ domain: 'youtube.com', videoId: 'abc123' });
    expect(axiosGet).not.toHaveBeenCalled();
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it('short-circuits youtu.be links without fetching', async () => {
    const result = await call({
      auth: AUTH,
      data: { url: 'https://youtu.be/abc123' },
    });
    expect(result).toEqual({ domain: 'youtube.com', videoId: 'abc123' });
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('parses og: meta tags and title from a fetched page', async () => {
    axiosGet.mockResolvedValue({
      data: `<html><head>
        <title>Fallback Title</title>
        <meta property="og:title" content="Real Title">
        <meta property="og:description" content="A description &amp; more">
        <meta property="og:image" content="https://cdn.example.com/img.png">
      </head></html>`,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });

    const result = await call({
      auth: AUTH,
      data: { url: 'https://example.com/article' },
    });

    expect(result).toEqual({
      title: 'Real Title',
      description: 'A description & more',
      image: 'https://cdn.example.com/img.png',
      domain: 'example.com',
    });
  });

  it('falls back to <title> when og:title is missing', async () => {
    axiosGet.mockResolvedValue({
      data: '<html><head><title>Plain Title</title></head></html>',
      headers: { 'content-type': 'text/html' },
    });

    const result = await call({
      auth: AUTH,
      data: { url: 'https://example.com/plain' },
    });

    expect(result).toMatchObject({
      title: 'Plain Title',
      domain: 'example.com',
    });
  });

  it('follows a 302 redirect to a final 200 page', async () => {
    axiosGet
      .mockRejectedValueOnce(
        makeRedirectError(302, 'https://redirected.example.com/final')
      )
      .mockResolvedValueOnce({
        data: '<html><head><title>Redirected Title</title></head></html>',
        headers: { 'content-type': 'text/html' },
      });

    const result = await call({
      auth: AUTH,
      data: { url: 'https://example.com/short-link' },
    });

    expect(result).toMatchObject({
      title: 'Redirected Title',
      domain: 'redirected.example.com',
    });
    expect(axiosGet).toHaveBeenCalledTimes(2);
    // The redirect target's host must be re-validated (a second DNS lookup).
    expect(dnsLookup).toHaveBeenCalledTimes(2);
  });

  it('gives up after exceeding the max redirect hops', async () => {
    axiosGet.mockRejectedValue(
      makeRedirectError(302, 'https://example.com/next')
    );
    await expect(
      call({ auth: AUTH, data: { url: 'https://example.com/loop' } })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('pins the connection to the DNS-validated address instead of re-resolving', async () => {
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    axiosGet.mockResolvedValue({
      data: '<html><head><title>T</title></head></html>',
      headers: { 'content-type': 'text/html' },
    });

    await call({ auth: AUTH, data: { url: 'https://example.com/page' } });

    const options = axiosGet.mock.calls[0][1] as {
      httpsAgent: { options: { lookup: (...a: unknown[]) => void } };
    };
    expect(options.httpsAgent).toBeTruthy();
    const lookupCallback = vi.fn();
    options.httpsAgent.options.lookup('example.com', {}, lookupCallback);
    expect(lookupCallback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    // Pinning must not trigger an extra DNS lookup beyond the initial validation.
    expect(dnsLookup).toHaveBeenCalledTimes(1);
  });

  it('rejects non-html content types', async () => {
    axiosGet.mockResolvedValue({
      data: '{}',
      headers: { 'content-type': 'application/json' },
    });
    await expect(
      call({ auth: AUTH, data: { url: 'https://example.com/api' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rate-limits after 30 calls in the window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000_000);
    axiosGet.mockResolvedValue({
      data: '<html><head><title>T</title></head></html>',
      headers: { 'content-type': 'text/html' },
    });
    for (let i = 0; i < 30; i += 1) {
      await call({
        auth: { uid: 'rate-limited-user' },
        data: { url: 'https://example.com/p' },
      });
    }
    await expect(
      call({
        auth: { uid: 'rate-limited-user' },
        data: { url: 'https://example.com/p' },
      })
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
    vi.useRealTimers();
  });

  it('rate-limits anonymous callers after 10 calls in the window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000_000_000);
    axiosGet.mockResolvedValue({
      data: '<html><head><title>T</title></head></html>',
      headers: { 'content-type': 'text/html' },
    });
    const anonAuth = {
      uid: 'anon-user',
      token: { firebase: { sign_in_provider: 'anonymous' } },
    };
    for (let i = 0; i < 10; i += 1) {
      await call({ auth: anonAuth, data: { url: 'https://example.com/p' } });
    }
    await expect(
      call({ auth: anonAuth, data: { url: 'https://example.com/p' } })
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
    vi.useRealTimers();
  });

  it('rate-limits globally across uids after 300 calls in the window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(3_000_000_000_000);
    axiosGet.mockResolvedValue({
      data: '<html><head><title>T</title></head></html>',
      headers: { 'content-type': 'text/html' },
    });
    for (let i = 0; i < 300; i += 1) {
      await call({
        auth: { uid: `global-user-${i}` },
        data: { url: 'https://example.com/p' },
      });
    }
    await expect(
      call({
        auth: { uid: 'global-user-overflow' },
        data: { url: 'https://example.com/p' },
      })
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
    vi.useRealTimers();
  });
});

afterEach(() => {
  vi.useRealTimers();
});
