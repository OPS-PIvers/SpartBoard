import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPair, exportPKCS8 } from 'jose';
import {
  getAgsAccessToken,
  postScore,
  scoresUrl,
  _resetAgsTokenCache,
} from './ags';

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function testPem(): Promise<string> {
  const { privateKey } = await generateKeyPair('RS256');
  return exportPKCS8(privateKey);
}

describe('scoresUrl', () => {
  it('inserts /scores before any query string', () => {
    expect(scoresUrl('https://x/lineitems/1/lineitem')).toBe(
      'https://x/lineitems/1/lineitem/scores'
    );
    expect(scoresUrl('https://x/lineitems/1/lineitem?type_id=5')).toBe(
      'https://x/lineitems/1/lineitem/scores?type_id=5'
    );
  });

  // Regression guard: the trailing-slash strip is the ONLY protection against a
  // Schoology-issued lineitem URL that ends in `/` producing a 404-prone double
  // slash (`.../lineitem//scores`). Without the strip these cases all yield the
  // wrong URL and every AGS grade push for that student would 404.
  it('strips a single trailing slash before inserting /scores', () => {
    expect(scoresUrl('https://x/lineitems/1/lineitem/')).toBe(
      'https://x/lineitems/1/lineitem/scores'
    );
  });

  it('strips multiple consecutive trailing slashes', () => {
    expect(scoresUrl('https://x/lineitems/1/lineitem///')).toBe(
      'https://x/lineitems/1/lineitem/scores'
    );
  });

  it('strips a trailing slash that precedes a query string', () => {
    // e.g. Schoology returns "https://platform/lineitem/?type_id=5"
    expect(scoresUrl('https://x/lineitems/1/lineitem/?type_id=5')).toBe(
      'https://x/lineitems/1/lineitem/scores?type_id=5'
    );
  });

  it('is a no-op when there is no trailing slash (baseline)', () => {
    // Ensures the strip doesn't corrupt clean URLs.
    expect(scoresUrl('https://x/lineitems/1/lineitem')).toBe(
      'https://x/lineitems/1/lineitem/scores'
    );
  });
});

describe('getAgsAccessToken', () => {
  beforeEach(() => _resetAgsTokenCache());
  afterEach(() => vi.unstubAllGlobals());

  it('exchanges a signed assertion for a bearer token and caches by scope-set', async () => {
    const pem = await testPem();
    const fetchMock = vi.fn<
      (url: string | URL, init?: unknown) => Promise<Response>
    >(() =>
      Promise.resolve(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
    );
    vi.stubGlobal('fetch', fetchMock);

    const tok = await getAgsAccessToken({
      clientId: 'c1',
      tokenUrl: 'https://schoology/token',
      privatePem: pem,
      scopes: ['scopeA', 'scopeB'],
    });
    expect(tok).toBe('tok-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(fetchMock.mock.calls[0][0]).toBe('https://schoology/token');
    const body = String(
      (fetchMock.mock.calls[0][1] as { body?: unknown }).body
    );
    expect(body).toContain('grant_type=client_credentials');
    expect(body).toContain('client_assertion=');
    expect(body).toContain('scopeA');
    expect(body).toContain('scopeB');

    // Cache hit for the same scope-set (order-independent).
    const tok2 = await getAgsAccessToken({
      clientId: 'c1',
      tokenUrl: 'https://schoology/token',
      privatePem: pem,
      scopes: ['scopeB', 'scopeA'],
    });
    expect(tok2).toBe('tok-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws on a non-2xx token response', async () => {
    const pem = await testPem();
    vi.stubGlobal(
      'fetch',
      vi.fn<(url: string | URL, init?: unknown) => Promise<Response>>(() =>
        Promise.resolve(new Response('nope', { status: 401 }))
      )
    );
    await expect(
      getAgsAccessToken({
        clientId: 'c1',
        tokenUrl: 'https://schoology/token',
        privatePem: pem,
        scopes: ['s'],
      })
    ).rejects.toThrow(/401/);
  });
});

describe('postScore', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs a score+json body with Bearer auth to the scores URL', async () => {
    const fetchMock = vi.fn<
      (url: string | URL, init?: unknown) => Promise<Response>
    >(() => Promise.resolve(new Response(null, { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    const r = await postScore({
      lineitemUrl: 'https://x/li/1/lineitem',
      accessToken: 'tok',
      score: { userId: 'u1', scoreGiven: 8, scoreMaximum: 10 },
      timestamp: '2026-06-02T00:00:00Z',
    });
    expect(r).toEqual({ ok: true, status: 200 });

    expect(fetchMock.mock.calls[0][0]).toBe('https://x/li/1/lineitem/scores');
    const init = fetchMock.mock.calls[0][1] as {
      headers: Record<string, string>;
      body: string;
    };
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers['Content-Type']).toBe(
      'application/vnd.ims.lis.v1.score+json'
    );
    const sent = JSON.parse(init.body) as Record<string, unknown>;
    expect(sent).toMatchObject({
      userId: 'u1',
      scoreGiven: 8,
      scoreMaximum: 10,
      activityProgress: 'Completed',
      gradingProgress: 'FullyGraded',
      timestamp: '2026-06-02T00:00:00Z',
    });
  });

  it('returns ok:false on a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<(url: string | URL, init?: unknown) => Promise<Response>>(() =>
        Promise.reject(new Error('net'))
      )
    );
    const r = await postScore({
      lineitemUrl: 'https://x/li',
      accessToken: 't',
      score: { userId: 'u', scoreGiven: 1, scoreMaximum: 1 },
      timestamp: 'now',
    });
    expect(r).toEqual({ ok: false, status: 0 });
  });
});
