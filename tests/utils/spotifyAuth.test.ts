/* eslint-disable @typescript-eslint/require-await -- the mock callable is
   declared async so a throwing handler surfaces as a rejected promise (the
   real httpsCallable contract); several handlers return synchronously. */
/**
 * Tests for `utils/spotifyAuth.ts` — the client-side glue for the Spotify
 * Authorization-Code-with-PKCE flow.
 *
 * Coverage focus (Priority 1 of the "utils/ files with complex logic have no
 * test coverage" item): the PKCE authorize-URL construction + popup messaging
 * protocol (`runSpotifyAuthPopup`), the in-memory access-token cache with its
 * 60s skew / inflight-dedup / cache-generation guard (`getValidAccessToken`),
 * and the three callable wrappers (`exchangeSpotifyCode`, `disconnectSpotify`,
 * and the refresh path). The pure URL/parse helpers are locked down too.
 *
 * `firebase/functions` is partially mocked: `httpsCallable` is swapped for a
 * per-function-name handler registry, but the REAL `FunctionsError` is kept so
 * the production `err instanceof FunctionsError` / `err.details` branches are
 * exercised faithfully. `@/config/firebase` is mocked with a live-getter
 * `isAuthBypass` so both branches can be driven per-test.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FunctionsError } from 'firebase/functions';

// --- logError capture -------------------------------------------------------
const loggedErrors: { scope: string; error: unknown }[] = [];
vi.mock('@/utils/logError', () => ({
  logError: (scope: string, error: unknown) => {
    loggedErrors.push({ scope, error });
  },
}));

// --- callable handler registry ---------------------------------------------
type CallableHandler = (data: unknown) => unknown;
const handlers: Record<string, CallableHandler> = {};
const callCounts: Record<string, number> = {};

function setCallable(name: string, handler: CallableHandler): void {
  handlers[name] = handler;
}

vi.mock('firebase/functions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/functions')>();
  return {
    ...actual,
    httpsCallable: (_functions: unknown, name: string) => {
      return async (data: unknown) => {
        callCounts[name] = (callCounts[name] ?? 0) + 1;
        const handler = handlers[name];
        if (!handler)
          throw new Error(`no callable handler registered for ${name}`);
        return handler(data);
      };
    },
  };
});

// --- config/firebase mock with a controllable isAuthBypass -----------------
let authBypass = false;
vi.mock('@/config/firebase', () => ({
  functions: {},
  get isAuthBypass() {
    return authBypass;
  },
}));

import {
  getSpotifyRedirectUri,
  parseSpotifyResource,
  spotifyUriFromInput,
  spotifyOpenUrlFromInput,
  prettifyConnectErrorReason,
  SPOTIFY_SCOPES,
  SPOTIFY_AUTHORIZE_ENDPOINT,
  SpotifyScopeError,
  DEVICE_REGISTRATION_POLL_DELAYS_MS,
  cacheAccessToken,
  clearAccessTokenCache,
  getValidAccessToken,
  getValidAccessTokenOrNull,
  disconnectSpotify,
  exchangeSpotifyCode,
  runSpotifyAuthPopup,
} from '@/utils/spotifyAuth';

beforeEach(() => {
  loggedErrors.length = 0;
  for (const key of Object.keys(handlers)) delete handlers[key];
  for (const key of Object.keys(callCounts)) delete callCounts[key];
  authBypass = false;
  clearAccessTokenCache();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('exposes the required OAuth scopes and authorize endpoint', () => {
    expect(SPOTIFY_SCOPES).toContain('streaming');
    expect(SPOTIFY_SCOPES).toContain('user-modify-playback-state');
    expect(SPOTIFY_AUTHORIZE_ENDPOINT).toBe(
      'https://accounts.spotify.com/authorize'
    );
  });

  it('front-loads the device-registration poll schedule and ends near 15s', () => {
    expect(DEVICE_REGISTRATION_POLL_DELAYS_MS[0]).toBe(0);
    const total = DEVICE_REGISTRATION_POLL_DELAYS_MS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(10_000);
    expect(total).toBeLessThan(20_000);
  });
});

describe('getSpotifyRedirectUri', () => {
  it('lands on /spotify-callback under the current origin', () => {
    expect(getSpotifyRedirectUri()).toBe(
      `${window.location.origin}/spotify-callback`
    );
  });
});

describe('SpotifyScopeError', () => {
  it('is an Error subclass with a stable name and preserved prototype', () => {
    const err = new SpotifyScopeError('insufficient scope');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SpotifyScopeError);
    expect(err.name).toBe('SpotifyScopeError');
    expect(err.message).toBe('insufficient scope');
  });
});

describe('prettifyConnectErrorReason', () => {
  it('maps known reason codes to user-facing copy', () => {
    expect(prettifyConnectErrorReason('popup-blocked')).toMatch(/blocked/i);
    expect(prettifyConnectErrorReason('auth-bypass-mode')).toMatch(
      /auth-bypass/i
    );
    expect(prettifyConnectErrorReason('callback-missing-code')).toMatch(
      /authorization code/i
    );
    expect(prettifyConnectErrorReason('access_denied')).toMatch(/denied/i);
  });

  it('passes an unknown reason through unchanged', () => {
    expect(prettifyConnectErrorReason('some raw server text')).toBe(
      'some raw server text'
    );
  });
});

describe('parseSpotifyResource', () => {
  it('parses spotify: URIs for the four supported types', () => {
    expect(parseSpotifyResource('spotify:track:abc123')).toEqual({
      type: 'track',
      id: 'abc123',
      uri: 'spotify:track:abc123',
    });
    expect(parseSpotifyResource('spotify:album:Xyz9')).toEqual({
      type: 'album',
      id: 'Xyz9',
      uri: 'spotify:album:Xyz9',
    });
    expect(parseSpotifyResource('spotify:playlist:pl1')?.type).toBe('playlist');
    expect(parseSpotifyResource('spotify:artist:ar1')?.type).toBe('artist');
  });

  it('rejects unsupported spotify: URI types and malformed ids', () => {
    expect(parseSpotifyResource('spotify:user:someone')).toBeNull();
    expect(parseSpotifyResource('spotify:track:')).toBeNull();
    expect(parseSpotifyResource('spotify:track:bad$id')).toBeNull();
    expect(parseSpotifyResource('spotify:track')).toBeNull();
  });

  it('parses open.spotify.com https URLs, stripping query params', () => {
    expect(
      parseSpotifyResource('https://open.spotify.com/playlist/37i9dQ?si=xyz')
    ).toEqual({
      type: 'playlist',
      id: '37i9dQ',
      uri: 'spotify:playlist:37i9dQ',
    });
  });

  it('handles locale-prefixed paths and *.spotify.com subdomains', () => {
    expect(
      parseSpotifyResource('https://open.spotify.com/intl-de/track/abc')
    ).toEqual({ type: 'track', id: 'abc', uri: 'spotify:track:abc' });
    expect(parseSpotifyResource('https://sub.spotify.com/album/xyz')?.id).toBe(
      'xyz'
    );
  });

  it('returns null for non-https, wrong-host, wrong-type, and junk input', () => {
    expect(
      parseSpotifyResource('http://open.spotify.com/track/abc')
    ).toBeNull();
    expect(parseSpotifyResource('https://evil.com/track/abc')).toBeNull();
    expect(
      parseSpotifyResource('https://open.spotify.com/user/foo')
    ).toBeNull();
    expect(
      parseSpotifyResource('https://open.spotify.com/track/bad$id')
    ).toBeNull();
    expect(parseSpotifyResource('not a url at all')).toBeNull();
    expect(parseSpotifyResource('')).toBeNull();
    expect(parseSpotifyResource('   ')).toBeNull();
  });
});

describe('spotifyUriFromInput / spotifyOpenUrlFromInput', () => {
  it('derives the spotify: URI from any accepted input', () => {
    expect(spotifyUriFromInput('spotify:track:abc')).toBe('spotify:track:abc');
    expect(spotifyUriFromInput('https://open.spotify.com/album/xyz')).toBe(
      'spotify:album:xyz'
    );
    expect(spotifyUriFromInput('garbage')).toBeNull();
  });

  it('derives the open.spotify.com https URL from any accepted input', () => {
    expect(spotifyOpenUrlFromInput('spotify:playlist:pl1')).toBe(
      'https://open.spotify.com/playlist/pl1'
    );
    expect(spotifyOpenUrlFromInput('bad')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Access-token cache + refresh
// ---------------------------------------------------------------------------

describe('getValidAccessToken — cache + refresh', () => {
  it('returns a cached token without calling refresh when far from expiry', async () => {
    cacheAccessToken('cached-token', 3600);
    setCallable('refreshSpotifyAccessToken', () => {
      throw new Error('refresh must not be called on a cache hit');
    });
    const result = await getValidAccessToken();
    expect(result).toEqual({ status: 'ok', token: 'cached-token' });
    expect(callCounts['refreshSpotifyAccessToken'] ?? 0).toBe(0);
  });

  it('refreshes when the cached token is inside the 60s skew window', async () => {
    cacheAccessToken('near-expiry', 30); // expires in 30s < 60s skew
    setCallable('refreshSpotifyAccessToken', () => ({
      data: { accessToken: 'fresh', expiresIn: 3600 },
    }));
    const result = await getValidAccessToken();
    expect(result).toEqual({ status: 'ok', token: 'fresh' });
    expect(callCounts['refreshSpotifyAccessToken']).toBe(1);
  });

  it('refreshes on an empty cache, then serves the refreshed token from cache', async () => {
    setCallable('refreshSpotifyAccessToken', () => ({
      data: { accessToken: 'from-server', expiresIn: 3600 },
    }));
    expect(await getValidAccessToken()).toEqual({
      status: 'ok',
      token: 'from-server',
    });
    expect(await getValidAccessToken()).toEqual({
      status: 'ok',
      token: 'from-server',
    });
    expect(callCounts['refreshSpotifyAccessToken']).toBe(1);
  });

  it('maps a needs-consent FunctionsError to status:needs-consent and clears the cache', async () => {
    setCallable('refreshSpotifyAccessToken', () => {
      throw new FunctionsError('failed-precondition', 'grant gone', {
        reason: 'needs-consent',
        cause: 'revoked',
      });
    });
    expect(await getValidAccessToken()).toEqual({ status: 'needs-consent' });
    expect(loggedErrors.some((e) => e.scope === 'spotifyAuth.refresh')).toBe(
      true
    );
    // Cache was cleared, so a subsequent successful refresh takes over.
    setCallable('refreshSpotifyAccessToken', () => ({
      data: { accessToken: 'recovered', expiresIn: 3600 },
    }));
    expect(await getValidAccessToken()).toEqual({
      status: 'ok',
      token: 'recovered',
    });
  });

  it('maps a generic error to status:transient with its message', async () => {
    setCallable('refreshSpotifyAccessToken', () => {
      throw new Error('backend 500');
    });
    expect(await getValidAccessToken()).toEqual({
      status: 'transient',
      message: 'backend 500',
    });
  });

  it('dedupes concurrent refreshes into a single backend call', async () => {
    let resolveRefresh: (() => void) | undefined;
    setCallable(
      'refreshSpotifyAccessToken',
      () =>
        new Promise((resolve) => {
          resolveRefresh = () =>
            resolve({ data: { accessToken: 'shared', expiresIn: 3600 } });
        })
    );
    const p1 = getValidAccessToken();
    const p2 = getValidAccessToken();
    resolveRefresh?.();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ status: 'ok', token: 'shared' });
    expect(r2).toEqual({ status: 'ok', token: 'shared' });
    expect(callCounts['refreshSpotifyAccessToken']).toBe(1);
  });

  it('drops a refresh whose cache was cleared mid-flight (generation guard)', async () => {
    let resolveRefresh: (() => void) | undefined;
    setCallable(
      'refreshSpotifyAccessToken',
      () =>
        new Promise((resolve) => {
          resolveRefresh = () =>
            resolve({ data: { accessToken: 'stale', expiresIn: 3600 } });
        })
    );
    const pending = getValidAccessToken();
    clearAccessTokenCache(); // bump generation + null inflight before it resolves
    resolveRefresh?.();
    expect(await pending).toEqual({ status: 'no-cache-bump' });

    // The stale token must NOT have populated the cache: a fresh call refreshes.
    setCallable('refreshSpotifyAccessToken', () => ({
      data: { accessToken: 'proper', expiresIn: 3600 },
    }));
    expect(await getValidAccessToken()).toEqual({
      status: 'ok',
      token: 'proper',
    });
  });

  it('short-circuits to needs-consent in auth-bypass mode', async () => {
    authBypass = true;
    expect(await getValidAccessToken()).toEqual({ status: 'needs-consent' });
    expect(callCounts['refreshSpotifyAccessToken'] ?? 0).toBe(0);
  });
});

describe('getValidAccessTokenOrNull', () => {
  it('returns the token on ok and null on any non-ok outcome', async () => {
    cacheAccessToken('tok', 3600);
    expect(await getValidAccessTokenOrNull()).toBe('tok');

    clearAccessTokenCache();
    authBypass = true; // forces needs-consent
    expect(await getValidAccessTokenOrNull()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// exchangeSpotifyCode
// ---------------------------------------------------------------------------

describe('exchangeSpotifyCode', () => {
  const args = { code: 'c', codeVerifier: 'v', redirectUri: 'r' };

  it('returns success with the access token and expiry on a good exchange', async () => {
    setCallable('exchangeSpotifyAuthCode', () => ({
      data: { accessToken: 'acc', expiresIn: 1200, hasRefreshToken: true },
    }));
    expect(await exchangeSpotifyCode(args)).toEqual({
      kind: 'success',
      result: { accessToken: 'acc', expiresIn: 1200 },
    });
  });

  it('surfaces a needs-consent FunctionsError with its cause', async () => {
    setCallable('exchangeSpotifyAuthCode', () => {
      throw new FunctionsError('failed-precondition', 'x', {
        reason: 'needs-consent',
        cause: 'denied',
      });
    });
    expect(await exchangeSpotifyCode(args)).toEqual({
      kind: 'needs-consent',
      cause: 'denied',
    });
  });

  it('maps any other error to kind:error with its message', async () => {
    setCallable('exchangeSpotifyAuthCode', () => {
      throw new Error('exchange failed');
    });
    expect(await exchangeSpotifyCode(args)).toEqual({
      kind: 'error',
      reason: 'exchange failed',
    });
    expect(loggedErrors.some((e) => e.scope === 'spotifyAuth.exchange')).toBe(
      true
    );
  });
});

// ---------------------------------------------------------------------------
// disconnectSpotify
// ---------------------------------------------------------------------------

describe('disconnectSpotify', () => {
  it('clears the local cache and returns ok when revoke succeeds', async () => {
    cacheAccessToken('doomed', 3600);
    setCallable('revokeSpotifyAuth', () => ({ data: { revoked: true } }));
    expect(await disconnectSpotify()).toEqual({ ok: true });

    // Local cache is gone: getValidAccessToken must go back to the backend.
    setCallable('refreshSpotifyAccessToken', () => ({
      data: { accessToken: 'after-disconnect', expiresIn: 3600 },
    }));
    expect(await getValidAccessToken()).toEqual({
      status: 'ok',
      token: 'after-disconnect',
    });
  });

  it('returns ok:false with an actionable message when revoke fails', async () => {
    setCallable('revokeSpotifyAuth', () => {
      throw new Error('network down');
    });
    const result = await disconnectSpotify();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('network down');
      expect(result.message).toMatch(/spotify\.com\/account\/apps/);
    }
    expect(loggedErrors.some((e) => e.scope === 'spotifyAuth.revoke')).toBe(
      true
    );
  });

  it('returns ok without hitting the backend in auth-bypass mode', async () => {
    authBypass = true;
    setCallable('revokeSpotifyAuth', () => {
      throw new Error('must not be called');
    });
    expect(await disconnectSpotify()).toEqual({ ok: true });
    expect(callCounts['revokeSpotifyAuth'] ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// runSpotifyAuthPopup — PKCE authorize URL + popup messaging protocol
// ---------------------------------------------------------------------------

interface FakePopup {
  closed: boolean;
  close: ReturnType<typeof vi.fn>;
}

function makePopup(): FakePopup {
  return { closed: false, close: vi.fn() };
}

function stubOpen(popup: FakePopup | null): {
  spy: ReturnType<typeof vi.spyOn>;
  lastUrl: () => string;
} {
  let captured = '';
  const spy = vi
    .spyOn(window, 'open')
    .mockImplementation((url?: string | URL) => {
      captured = String(url ?? '');
      return popup as unknown as Window | null;
    });
  return { spy, lastUrl: () => captured };
}

function postCallback(data: Record<string, unknown>, origin?: string): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: origin ?? window.location.origin,
      data: { source: 'spartboard-spotify-callback', ...data },
    })
  );
}

describe('runSpotifyAuthPopup', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', 'test-client-id');
  });

  it('errors immediately in auth-bypass mode without opening a popup', async () => {
    authBypass = true;
    const { spy } = stubOpen(makePopup());
    expect(await runSpotifyAuthPopup()).toEqual({
      kind: 'error',
      reason: 'auth-bypass-mode',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('errors when VITE_SPOTIFY_CLIENT_ID is not configured', async () => {
    vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', '');
    const { spy } = stubOpen(makePopup());
    const outcome = await runSpotifyAuthPopup();
    expect(outcome.kind).toBe('error');
    if (outcome.kind === 'error') {
      expect(outcome.reason).toContain('VITE_SPOTIFY_CLIENT_ID');
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('errors with popup-blocked when window.open returns null', async () => {
    stubOpen(null);
    expect(await runSpotifyAuthPopup()).toEqual({
      kind: 'error',
      reason: 'popup-blocked',
    });
  });

  it('builds a PKCE S256 authorize URL and resolves the code from the callback', async () => {
    const popup = makePopup();
    const { spy, lastUrl } = stubOpen(popup);
    const pending = runSpotifyAuthPopup();

    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    const url = new URL(lastUrl());
    expect(url.origin + url.pathname).toBe(SPOTIFY_AUTHORIZE_ENDPOINT);
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe(
      `${window.location.origin}/spotify-callback`
    );
    expect(url.searchParams.get('scope')).toBe(SPOTIFY_SCOPES.join(' '));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('show_dialog')).toBe('true');

    const state = url.searchParams.get('state');
    expect(state).toBeTruthy();

    postCallback({ code: 'auth-code-123', state: state as string });

    expect(await pending).toEqual({
      kind: 'success',
      code: 'auth-code-123',
      codeVerifier: expect.any(String),
      redirectUri: `${window.location.origin}/spotify-callback`,
    });
    expect(popup.close).toHaveBeenCalled();
  });

  it('ignores messages from the wrong origin or with a mismatched state', async () => {
    const popup = makePopup();
    const { spy, lastUrl } = stubOpen(popup);
    const pending = runSpotifyAuthPopup();

    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    const state = new URL(lastUrl()).searchParams.get('state') as string;

    // Wrong origin — ignored.
    postCallback({ code: 'evil', state }, 'https://attacker.example');
    // Right origin, wrong state — ignored.
    postCallback({ code: 'stale', state: 'not-the-state' });
    // The genuine callback finally arrives.
    postCallback({ code: 'real-code', state });

    const outcome = await pending;
    expect(outcome).toMatchObject({ kind: 'success', code: 'real-code' });
  });

  it('treats access_denied as a cancellation', async () => {
    const popup = makePopup();
    const { spy, lastUrl } = stubOpen(popup);
    const pending = runSpotifyAuthPopup();
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    const state = new URL(lastUrl()).searchParams.get('state') as string;

    postCallback({ error: 'access_denied', state });
    expect(await pending).toEqual({ kind: 'cancelled' });
  });

  it('surfaces a non-cancel error string from the callback', async () => {
    const popup = makePopup();
    const { spy, lastUrl } = stubOpen(popup);
    const pending = runSpotifyAuthPopup();
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    const state = new URL(lastUrl()).searchParams.get('state') as string;

    postCallback({ error: 'server_error', state });
    expect(await pending).toEqual({ kind: 'error', reason: 'server_error' });
  });

  it('reports callback-missing-code when neither code nor error is present', async () => {
    const popup = makePopup();
    const { spy, lastUrl } = stubOpen(popup);
    const pending = runSpotifyAuthPopup();
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    const state = new URL(lastUrl()).searchParams.get('state') as string;

    postCallback({ state });
    expect(await pending).toEqual({
      kind: 'error',
      reason: 'callback-missing-code',
    });
  });

  it('detects a user-closed popup via the closed-poll interval', async () => {
    vi.useFakeTimers();
    const popup = makePopup();
    const { spy } = stubOpen(popup);
    const pending = runSpotifyAuthPopup();

    // Flush the async S256 digest + executor so window.open runs and the
    // 500ms closed-check interval is registered.
    await vi.advanceTimersByTimeAsync(0);
    expect(spy).toHaveBeenCalled();

    popup.closed = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toEqual({ kind: 'cancelled' });
  });
});
