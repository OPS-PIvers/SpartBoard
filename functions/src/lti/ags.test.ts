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
    const call = fetchMock.mock.calls[0][1] as {
      body?: unknown;
      redirect?: string;
    };
    const body = String(call.body);
    expect(body).toContain('grant_type=client_credentials');
    expect(body).toContain('client_assertion=');
    expect(body).toContain('scopeA');
    expect(body).toContain('scopeB');
    // SSRF regression: `fetch()` follows redirects by default, so a 3xx from
    // the token URL could silently retarget this request off-platform.
    // `redirect: 'manual'` refuses to follow — see index.test.ts's
    // `maxRedirects: 0` assertions for the equivalent axios-based guard.
    expect(call.redirect).toBe('manual');

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

  // Regression (#2433 round-2 review): the 'refused redirect (SSRF guard)'
  // reason string is only reachable via `res.type === 'opaqueredirect'` — a
  // typo in that literal would silently fall through to the ordinary
  // `${res.status}` branch with no test to catch it.
  it('names the failure "refused redirect (SSRF guard)" on an opaque redirect, not a bare status', async () => {
    const pem = await testPem();
    const opaqueRedirect = new Response(null, { status: 200 });
    Object.defineProperty(opaqueRedirect, 'type', {
      value: 'opaqueredirect',
    });
    Object.defineProperty(opaqueRedirect, 'status', { value: 0 });
    Object.defineProperty(opaqueRedirect, 'ok', { value: false });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(opaqueRedirect))
    );

    await expect(
      getAgsAccessToken({
        clientId: 'c1',
        tokenUrl: 'https://schoology/token',
        privatePem: pem,
        scopes: ['s'],
      })
    ).rejects.toThrow(/refused redirect \(SSRF guard\)/);
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
    expect(r).toEqual({ ok: true, status: 200, isRedirect: false });

    expect(fetchMock.mock.calls[0][0]).toBe('https://x/li/1/lineitem/scores');
    const init = fetchMock.mock.calls[0][1] as {
      headers: Record<string, string>;
      body: string;
      redirect?: string;
    };
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers['Content-Type']).toBe(
      'application/vnd.ims.lis.v1.score+json'
    );
    // SSRF regression: without `redirect: 'manual'`, a 3xx from the
    // (platform-asserted) lineitem URL would carry the bearer token to
    // whatever host it redirects to.
    expect(init.redirect).toBe('manual');
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

  // Regression (#2433 round-4 review): the error path drains the response
  // body so undici returns the socket to the pool, but the 200 OK success
  // path returned without consuming it. The AGS spec has the scores
  // endpoint echo the submitted score record as JSON on success, so a
  // 200 leaves an unconsumed body too — under Promise.all across many
  // concurrent grade posts, that holds sockets out of the pool just like
  // an unconsumed error body does, starving subsequent token
  // exchanges/score posts until they time out.
  it('drains the response body on the 200 OK success path too', async () => {
    const okResponse = new Response(JSON.stringify({ scoreGiven: 8 }), {
      status: 200,
    });
    const drainSpy = vi.spyOn(okResponse, 'text');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(okResponse))
    );

    const r = await postScore({
      lineitemUrl: 'https://x/li',
      accessToken: 't',
      score: { userId: 'u', scoreGiven: 8, scoreMaximum: 10 },
      timestamp: 'now',
    });
    expect(r).toEqual({ ok: true, status: 200, isRedirect: false });
    expect(drainSpy).toHaveBeenCalled();
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
    expect(r).toEqual({ ok: false, status: 0, isRedirect: false });
  });

  // Regression (#2433 round-2 review): a refused redirect and a genuine
  // network error both surfaced as {ok:false, status:0} with no
  // caller-visible way to distinguish them — a future retry keyed on
  // status:0 would also retry a redirect attack, resending the bearer token
  // toward the attacker's redirect target on every attempt.
  it('drains the body and reports isRedirect:true on an opaque redirect, distinct from a network failure', async () => {
    const opaqueRedirect = new Response(null, { status: 200 });
    Object.defineProperty(opaqueRedirect, 'type', {
      value: 'opaqueredirect',
    });
    Object.defineProperty(opaqueRedirect, 'status', { value: 0 });
    Object.defineProperty(opaqueRedirect, 'ok', { value: false });
    const drainSpy = vi.spyOn(opaqueRedirect, 'text');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(opaqueRedirect))
    );

    const r = await postScore({
      lineitemUrl: 'https://x/li',
      accessToken: 't',
      score: { userId: 'u', scoreGiven: 1, scoreMaximum: 1 },
      timestamp: 'now',
    });
    expect(r).toEqual({ ok: false, status: 0, isRedirect: true });
    // Draining the body is what lets undici recycle the connection — without
    // it, a burst of refused redirects/429s exhausts the pool.
    expect(drainSpy).toHaveBeenCalled();
  });
});
