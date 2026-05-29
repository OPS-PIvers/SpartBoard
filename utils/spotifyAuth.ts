/**
 * Client-side glue for the Spotify OAuth Authorization-Code-with-PKCE flow.
 *
 * Flow:
 * 1. `connectSpotify()` — generates a PKCE verifier + challenge, opens a
 *    centered popup window to Spotify's authorize endpoint, and waits for
 *    the popup to postMessage the resulting authorization code back.
 * 2. The popup lands on `/spotify-callback` (handled by `SpotifyCallback.tsx`),
 *    which extracts `?code=...` and posts it to `window.opener` before closing.
 * 3. `connectSpotify()` calls the `exchangeSpotifyAuthCode` Cloud Function
 *    with the code + PKCE verifier. The server persists the encrypted
 *    refresh_token and returns a fresh access_token.
 *
 * The refresh_token NEVER reaches the browser. Token refresh goes through
 * `refreshAccessToken()` which calls the backend callable.
 *
 * In-memory cache: `getValidAccessToken()` keeps the current access_token
 * with its expiry and refreshes it 60s before expiry. Cleared on disconnect.
 */

import { httpsCallable, FunctionsError } from 'firebase/functions';
import { functions, isAuthBypass } from '@/config/firebase';
import { logError } from '@/utils/logError';

/** Spotify OAuth scopes required by the Music widget. Kept in sync with the backend. */
export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-recently-played',
  'playlist-read-private',
  'playlist-read-collaborative',
] as const;

export const SPOTIFY_AUTHORIZE_ENDPOINT =
  'https://accounts.spotify.com/authorize';

/** Returns the OAuth redirect URI the popup will land on after Spotify consent. */
export function getSpotifyRedirectUri(): string {
  return `${window.location.origin}/spotify-callback`;
}

function getClientId(): string {
  const id = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
  if (!id) {
    throw new Error(
      'VITE_SPOTIFY_CLIENT_ID is not configured. Add it to .env.local and register a Spotify app at https://developer.spotify.com/dashboard.'
    );
  }
  return id;
}

// ---------------------------------------------------------------------------
// PKCE helpers (Web Crypto)
// ---------------------------------------------------------------------------

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomVerifier(): string {
  const bytes = new Uint8Array(64);
  window.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function s256Challenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// Popup-based code capture
// ---------------------------------------------------------------------------

/** Message posted by `/spotify-callback` back to the opener. */
export interface SpotifyCallbackMessage {
  source: 'spartboard-spotify-callback';
  code?: string;
  state?: string;
  error?: string;
}

function openCenteredPopup(url: string, name: string): Window | null {
  const w = 480;
  const h = 760;
  const left = window.screenX + (window.outerWidth - w) / 2;
  const top = window.screenY + (window.outerHeight - h) / 2;
  return window.open(
    url,
    name,
    `width=${w},height=${h},left=${Math.max(0, left)},top=${Math.max(0, top)},popup=yes`
  );
}

interface ConnectResult {
  accessToken: string;
  expiresIn: number;
}

export type ConnectOutcome =
  | { kind: 'success'; result: ConnectResult }
  | { kind: 'cancelled' }
  | { kind: 'error'; reason: string }
  | { kind: 'needs-consent'; cause: string };

interface SpotifyRefreshErrorDetails {
  reason?: 'needs-consent' | 'transient';
  cause?: string;
}

function detailsFrom(err: unknown): SpotifyRefreshErrorDetails | null {
  if (err instanceof FunctionsError) {
    const d = err.details;
    if (d && typeof d === 'object') return d as SpotifyRefreshErrorDetails;
  }
  return null;
}

/** Drive the Spotify consent popup. Returns the PKCE code + verifier, or a cancel/error result. */
export type PopupOutcome =
  | { kind: 'success'; code: string; codeVerifier: string; redirectUri: string }
  | { kind: 'cancelled' }
  | { kind: 'error'; reason: string };

/**
 * Open the Spotify OAuth popup and wait for the callback.
 *
 * Split from {@link exchangeSpotifyCode} so the caller can re-check the
 * Firebase uid between the popup and the backend exchange. Without that
 * check, a uid switch mid-popup could store user A's refresh token under
 * user B's Firestore path (server uses `req.auth.uid`).
 */
export async function runSpotifyAuthPopup(): Promise<PopupOutcome> {
  if (isAuthBypass) {
    return { kind: 'error', reason: 'auth-bypass-mode' };
  }
  let clientId: string;
  try {
    clientId = getClientId();
  } catch (err) {
    return {
      kind: 'error',
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const redirectUri = getSpotifyRedirectUri();
  const codeVerifier = randomVerifier();
  const codeChallenge = await s256Challenge(codeVerifier);
  // Random CSRF/state value tying the popup callback back to this exact
  // connect attempt. Sent as the OAuth `state` query parameter and echoed
  // back by Spotify in the callback URL; the message listener below
  // verifies the echoed value matches before accepting the code.
  const state = randomVerifier();

  const authUrl = new URL(SPOTIFY_AUTHORIZE_ENDPOINT);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', SPOTIFY_SCOPES.join(' '));
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('state', state);
  // Force Spotify to show the consent dialog on every connect attempt
  // (default behavior auto-redirects if the user previously consented).
  // Without this, a stale cached session at accounts.spotify.com — e.g.
  // from a prior connect attempt on a different/wrong account — silently
  // re-consents the same wrong account every time the user clicks Connect,
  // making the "Try again" loop in PersonalSpotifyPanel impossible to
  // escape from inside the app. With show_dialog=true the user at least
  // sees which account is about to be connected and can back out / log
  // out of Spotify itself.
  authUrl.searchParams.set('show_dialog', 'true');

  const popup = openCenteredPopup(authUrl.toString(), 'spotify-auth');
  if (!popup) {
    return { kind: 'error', reason: 'popup-blocked' };
  }

  const codeOrError = await new Promise<
    { code: string } | { error: string } | { cancelled: true }
  >((resolve) => {
    const expectedOrigin = window.location.origin;
    let resolved = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(closedCheck);
    };

    const onMessage = (evt: MessageEvent) => {
      if (evt.origin !== expectedOrigin) return;
      const data = evt.data as SpotifyCallbackMessage | undefined;
      if (!data || data.source !== 'spartboard-spotify-callback') return;
      if (data.state !== state) {
        // State mismatch — a different connect attempt or a forged message.
        // Ignore rather than fail, so the real callback can still arrive.
        return;
      }
      resolved = true;
      cleanup();
      try {
        popup.close();
      } catch {
        /* popup may already be closed */
      }
      if (data.error) {
        resolve({ error: data.error });
      } else if (data.code) {
        resolve({ code: data.code });
      } else {
        resolve({ error: 'callback-missing-code' });
      }
    };

    window.addEventListener('message', onMessage);

    // The user closing the popup window without finishing consent has to be
    // detected by polling — there is no `popupclosed` event. 500ms cadence
    // is the standard tradeoff between latency and CPU.
    const closedCheck = window.setInterval(() => {
      if (resolved) return;
      if (popup.closed) {
        cleanup();
        resolve({ cancelled: true });
      }
    }, 500);
  });

  if ('cancelled' in codeOrError) return { kind: 'cancelled' };
  if ('error' in codeOrError) {
    if (codeOrError.error === 'access_denied') return { kind: 'cancelled' };
    return { kind: 'error', reason: codeOrError.error };
  }
  return {
    kind: 'success',
    code: codeOrError.code,
    codeVerifier,
    redirectUri,
  };
}

/**
 * Send the PKCE code to the backend for token exchange. Stores the
 * refresh_token under the calling user's `/users/{uid}/private/spotifyAuth`.
 *
 * IMPORTANT: the server keys the stored token off the current Firebase
 * `request.auth.uid` — never call this without first confirming the uid
 * hasn't switched since the popup opened, or you'll write user A's
 * Spotify refresh_token under user B's path.
 */
export async function exchangeSpotifyCode(args: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<ConnectOutcome> {
  try {
    const exchange = httpsCallable<
      { code: string; redirectUri: string; codeVerifier: string },
      { accessToken: string; expiresIn: number; hasRefreshToken: boolean }
    >(functions, 'exchangeSpotifyAuthCode');
    const res = await exchange(args);
    return {
      kind: 'success',
      result: {
        accessToken: res.data.accessToken,
        expiresIn: res.data.expiresIn,
      },
    };
  } catch (err) {
    logError('spotifyAuth.exchange', err);
    const d = detailsFrom(err);
    if (d?.reason === 'needs-consent') {
      return { kind: 'needs-consent', cause: d.cause ?? 'unknown' };
    }
    const message =
      err instanceof FunctionsError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    return { kind: 'error', reason: message };
  }
}

/**
 * @deprecated Prefer {@link runSpotifyAuthPopup} + {@link exchangeSpotifyCode}
 * with a uid-stability check between them. Kept only for callers that don't
 * need uid-switch protection.
 */
export async function connectSpotify(): Promise<ConnectOutcome> {
  const popup = await runSpotifyAuthPopup();
  if (popup.kind !== 'success') return popup;
  return exchangeSpotifyCode({
    code: popup.code,
    codeVerifier: popup.codeVerifier,
    redirectUri: popup.redirectUri,
  });
}

// ---------------------------------------------------------------------------
// Access-token cache + auto-refresh
// ---------------------------------------------------------------------------

interface CachedToken {
  token: string;
  /** Epoch ms when this access_token expires. */
  expiresAt: number;
}

let cached: CachedToken | null = null;
let inflightRefresh: Promise<AccessTokenResult> | null = null;
/**
 * Bumped every time the cache is cleared (sign-out, uid switch, disconnect).
 * Any in-flight refresh started before the bump must check the generation
 * before writing to the cache — otherwise a refresh request issued for user A
 * could resolve after user A's session ended and repopulate the token cache
 * with a stale credential.
 */
let cacheGeneration = 0;

export function cacheAccessToken(token: string, expiresIn: number): void {
  cached = { token, expiresAt: Date.now() + expiresIn * 1000 };
}

export function clearAccessTokenCache(): void {
  cached = null;
  inflightRefresh = null;
  cacheGeneration += 1;
}

/**
 * Verbose result of {@link getValidAccessToken}.
 *
 * Distinguishing `transient` from `needs-consent` matters: a 500 from the
 * refresh callable or a Spotify outage is `transient` (the stored refresh
 * token is still valid, the user is still "connected"), whereas
 * `needs-consent` means the stored grant is gone and the user must re-auth.
 * Callers that conflate these into "no token = disconnected" will push
 * teachers into a re-consent flow during any backend hiccup.
 */
export type AccessTokenResult =
  | { status: 'ok'; token: string }
  | { status: 'needs-consent' }
  | { status: 'transient'; message: string }
  | {
      status: 'no-cache-bump'; /** swallowed because the cache was cleared mid-refresh */
    };

/**
 * Returns the current access_token, refreshing via the backend if needed.
 *
 * The full {@link AccessTokenResult} discriminator lets callers tell
 * `needs-consent` from `transient` — see the type's docs for why.
 */
export async function getValidAccessToken(): Promise<AccessTokenResult> {
  if (isAuthBypass) return { status: 'needs-consent' };
  // 60-second skew so a token never expires mid-API-call.
  if (cached && cached.expiresAt - 60_000 > Date.now()) {
    return { status: 'ok', token: cached.token };
  }
  if (inflightRefresh) return inflightRefresh;

  const generationAtStart = cacheGeneration;
  inflightRefresh = (async (): Promise<AccessTokenResult> => {
    try {
      const refresh = httpsCallable<
        Record<string, never>,
        { accessToken: string; expiresIn: number }
      >(functions, 'refreshSpotifyAccessToken');
      const res = await refresh({});
      // Drop the result if the cache was invalidated mid-flight (sign-out,
      // disconnect, or uid switch). Without this guard, the stale refresh
      // would repopulate the cache after the caller intended it cleared.
      if (cacheGeneration !== generationAtStart) {
        return { status: 'no-cache-bump' };
      }
      cacheAccessToken(res.data.accessToken, res.data.expiresIn);
      return { status: 'ok', token: res.data.accessToken };
    } catch (err) {
      logError('spotifyAuth.refresh', err);
      const d = detailsFrom(err);
      if (d?.reason === 'needs-consent') {
        if (cacheGeneration === generationAtStart) cached = null;
        return { status: 'needs-consent' };
      }
      const message =
        err instanceof FunctionsError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      return { status: 'transient', message };
    } finally {
      // Only clear the inflight pointer if it's still ours — a cache reset
      // (which nulls inflightRefresh) may have already happened.
      if (cacheGeneration === generationAtStart) {
        inflightRefresh = null;
      }
    }
  })();
  return inflightRefresh;
}

/**
 * Thin wrapper for callers that don't care to distinguish failure modes
 * (e.g. fire-and-forget search, single play attempt). Returns the token or
 * null on any non-`ok` outcome.
 */
export async function getValidAccessTokenOrNull(): Promise<string | null> {
  const result = await getValidAccessToken();
  return result.status === 'ok' ? result.token : null;
}

export type DisconnectOutcome = { ok: true } | { ok: false; message: string };

/**
 * Disconnects the current user's Spotify integration.
 *
 * Returns `{ ok: false, message }` when the backend revoke fails — the
 * caller must surface this rather than silently flipping the UI to a
 * disconnected state, otherwise the stored refresh_token survives on the
 * server and the next page load silently reconnects.
 *
 * The local cache is cleared in both branches: even on backend failure the
 * client-side credential is gone, which limits exposure if the user hits
 * disconnect because they no longer trust this browser.
 */
export async function disconnectSpotify(): Promise<DisconnectOutcome> {
  clearAccessTokenCache();
  if (isAuthBypass) return { ok: true };
  try {
    const revoke = httpsCallable<Record<string, never>, { revoked: boolean }>(
      functions,
      'revokeSpotifyAuth'
    );
    await revoke({});
    return { ok: true };
  } catch (err) {
    logError('spotifyAuth.revoke', err);
    const message =
      err instanceof FunctionsError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      ok: false,
      message: `Spotify disconnect didn't reach the server: ${message}. Your local session is cleared, but the stored connection may need to be removed at spotify.com/account/apps.`,
    };
  }
}

// ---------------------------------------------------------------------------
// Connect-error message prettification (shared between hook & UI)
// ---------------------------------------------------------------------------

/** Translates a raw `ConnectOutcome.reason` string into user-facing copy. */
export function prettifyConnectErrorReason(reason: string): string {
  switch (reason) {
    case 'popup-blocked':
      return 'Your browser blocked the Spotify sign-in popup. Allow popups for this site and try again.';
    case 'auth-bypass-mode':
      return 'Spotify cannot be connected in auth-bypass mode.';
    case 'callback-missing-code':
      return 'Spotify did not return an authorization code. Try again.';
    case 'access_denied':
      return 'Spotify access was denied. Try connecting again and approve the requested permissions.';
    default:
      return reason;
  }
}

// ---------------------------------------------------------------------------
// Spotify Web API helpers used by the widget
// ---------------------------------------------------------------------------

export interface SpotifyUserProfile {
  id: string;
  email?: string;
  displayName?: string;
  isPremium: boolean;
}

export async function fetchSpotifyProfile(
  accessToken: string
): Promise<SpotifyUserProfile> {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    // Spotify returns a JSON error body with a `message` field that's far
    // more actionable than a bare status code. 403 in particular has
    // several distinct causes (User Management allowlist mismatch in
    // Development Mode, region/age restrictions, scope/grant problems);
    // the body tells us which one.
    let detail = '';
    try {
      const body = (await res.json()) as {
        error?: { message?: string; status?: number };
      };
      if (body.error?.message) detail = `: ${body.error.message}`;
    } catch {
      try {
        const text = await res.text();
        if (text) detail = `: ${text.slice(0, 200)}`;
      } catch {
        /* nothing useful to surface */
      }
    }
    throw new Error(`Spotify /me returned ${res.status}${detail}`);
  }
  const data = (await res.json()) as {
    id: string;
    email?: string;
    display_name?: string;
    product?: string;
  };
  return {
    id: data.id,
    email: data.email,
    displayName: data.display_name,
    isPremium: data.product === 'premium',
  };
}

export type SpotifyResourceType = 'track' | 'album' | 'playlist' | 'artist';

/**
 * Thrown when the server returns 403 specifically because the token lacks a
 * scope. The browse face catches this distinctly to show a "Reconnect to
 * unlock playlists and recents" banner instead of a generic error.
 */
export class SpotifyScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpotifyScopeError';
    // Restore the prototype chain when targeting older transpile targets.
    Object.setPrototypeOf(this, SpotifyScopeError.prototype);
  }
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  owner: string;
  imageUrl?: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artist: string;
  imageUrl?: string;
}

export interface SpotifySearchResult {
  type: SpotifyResourceType;
  uri: string;
  id: string;
  name: string;
  subtitle: string;
  imageUrl?: string;
}

/**
 * Returns `https://open.spotify.com/{type}/{id}` for any input that
 * `parseSpotifyResource` accepts. Useful for the embed iframe, which only
 * understands https URLs — `spotify:` URIs would break it.
 */
export function spotifyOpenUrlFromInput(input: string): string | null {
  const parsed = parseSpotifyResource(input);
  if (!parsed) return null;
  return `https://open.spotify.com/${parsed.type}/${parsed.id}`;
}

/**
 * Extracts `{ type, id }` from any Spotify URL or URI. Supports:
 *   - https://open.spotify.com/track/{id}
 *   - https://open.spotify.com/playlist/{id}?si=...
 *   - spotify:track:{id}
 * Returns null for anything else (including invalid types like `user`).
 */
export function parseSpotifyResource(
  input: string
): { type: SpotifyResourceType; id: string; uri: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('spotify:')) {
    const parts = trimmed.split(':');
    if (parts.length >= 3) {
      const type = parts[1];
      const id = parts[2];
      if (
        (type === 'track' ||
          type === 'album' ||
          type === 'playlist' ||
          type === 'artist') &&
        /^[A-Za-z0-9]+$/.test(id)
      ) {
        return { type, id, uri: `spotify:${type}:${id}` };
      }
    }
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== 'https:' ||
      (url.hostname !== 'open.spotify.com' &&
        !url.hostname.endsWith('.spotify.com'))
    ) {
      return null;
    }
    const segments = url.pathname.split('/').filter(Boolean);
    // Spotify URLs may be locale-prefixed: /intl-de/track/{id}
    const typeIdx = segments.findIndex((s) =>
      ['track', 'album', 'playlist', 'artist'].includes(s)
    );
    if (typeIdx < 0 || typeIdx + 1 >= segments.length) return null;
    const type = segments[typeIdx] as SpotifyResourceType;
    const id = segments[typeIdx + 1];
    if (!/^[A-Za-z0-9]+$/.test(id)) return null;
    return { type, id, uri: `spotify:${type}:${id}` };
  } catch {
    return null;
  }
}

// Spotify's search API is known to return literal `null` entries inside
// `items[]` — most often in `playlists.items` for deleted/private playlists,
// but it has been observed in tracks/albums too. Type all three as nullable
// and skip null entries at the call site.
interface SpotifySearchApiResponse {
  tracks?: {
    items: Array<{
      id: string;
      name: string;
      uri: string;
      artists: Array<{ name: string }>;
      album?: { images?: Array<{ url: string }> };
    } | null>;
  };
  albums?: {
    items: Array<{
      id: string;
      name: string;
      uri: string;
      artists: Array<{ name: string }>;
      images?: Array<{ url: string }>;
    } | null>;
  };
  playlists?: {
    items: Array<{
      id: string;
      name: string;
      uri: string;
      owner?: { display_name?: string };
      images?: Array<{ url: string }>;
    } | null>;
  };
}

export async function searchSpotify(
  accessToken: string,
  query: string,
  signal?: AbortSignal
): Promise<SpotifySearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const url = new URL('https://api.spotify.com/v1/search');
  url.searchParams.set('q', trimmed);
  url.searchParams.set('type', 'track,album,playlist');
  url.searchParams.set('limit', '6');
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Spotify search returned ${res.status}`);
  }
  const data = (await res.json()) as SpotifySearchApiResponse;
  const out: SpotifySearchResult[] = [];
  for (const t of data.tracks?.items ?? []) {
    if (!t) continue;
    out.push({
      type: 'track',
      uri: t.uri,
      id: t.id,
      name: t.name,
      subtitle: t.artists.map((a) => a.name).join(', '),
      imageUrl: t.album?.images?.[0]?.url,
    });
  }
  for (const a of data.albums?.items ?? []) {
    if (!a) continue;
    out.push({
      type: 'album',
      uri: a.uri,
      id: a.id,
      name: a.name,
      subtitle: `Album · ${a.artists.map((x) => x.name).join(', ')}`,
      imageUrl: a.images?.[0]?.url,
    });
  }
  for (const p of data.playlists?.items ?? []) {
    if (!p) continue;
    out.push({
      type: 'playlist',
      uri: p.uri,
      id: p.id,
      name: p.name,
      subtitle: `Playlist · ${p.owner?.display_name ?? 'Spotify'}`,
      imageUrl: p.images?.[0]?.url,
    });
  }
  return out;
}

interface SpotifyPlaylistsApiResponse {
  items: Array<{
    id: string;
    name: string;
    uri: string;
    owner?: { display_name?: string };
    images?: Array<{ url: string }>;
  } | null>;
}

/**
 * GET /me/playlists for the connected user. Returns up to 50 playlists.
 * Tolerates Spotify's documented null-item quirk in items[].
 *
 * Throws SpotifyScopeError on 403/insufficient_scope so the browse face
 * can surface the dedicated reconnect banner; throws a generic Error on
 * any other non-2xx so the surrounding tab can render a retry affordance.
 */
export async function fetchUserPlaylists(
  accessToken: string,
  signal?: AbortSignal
): Promise<SpotifyPlaylist[]> {
  const url = new URL('https://api.spotify.com/v1/me/playlists');
  url.searchParams.set('limit', '50');
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (!res.ok) {
    if (res.status === 403) {
      let body = '';
      try {
        body = (await res.text()).toLowerCase();
      } catch {
        // ignore — body read failed, fall through to generic 403
      }
      if (body.includes('scope')) {
        throw new SpotifyScopeError('Spotify playlists: insufficient scope');
      }
    }
    throw new Error(`Spotify playlists returned ${res.status}`);
  }
  const data = (await res.json()) as SpotifyPlaylistsApiResponse;
  const out: SpotifyPlaylist[] = [];
  for (const p of data.items ?? []) {
    if (!p) continue;
    out.push({
      id: p.id,
      name: p.name,
      uri: p.uri,
      owner: p.owner?.display_name ?? 'Spotify',
      imageUrl: p.images?.[0]?.url,
    });
  }
  return out;
}

interface SpotifyRecentlyPlayedApiResponse {
  items: Array<{
    track: {
      id: string;
      name: string;
      uri: string;
      artists: Array<{ name: string }>;
      album?: { images?: Array<{ url: string }> };
    } | null;
  } | null>;
}

/**
 * GET /me/player/recently-played for the connected user. Returns up to 20
 * tracks. Tolerates null `items[]` entries and null `items[].track`
 * (Spotify omits the track when it has been removed from the catalog).
 *
 * Throws SpotifyScopeError on 403/insufficient_scope.
 */
export async function fetchRecentlyPlayed(
  accessToken: string,
  signal?: AbortSignal
): Promise<SpotifyTrack[]> {
  const url = new URL('https://api.spotify.com/v1/me/player/recently-played');
  url.searchParams.set('limit', '20');
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (!res.ok) {
    if (res.status === 403) {
      let body = '';
      try {
        body = (await res.text()).toLowerCase();
      } catch {
        // ignore
      }
      if (body.includes('scope')) {
        throw new SpotifyScopeError(
          'Spotify recently-played: insufficient scope'
        );
      }
    }
    throw new Error(`Spotify recently-played returned ${res.status}`);
  }
  const data = (await res.json()) as SpotifyRecentlyPlayedApiResponse;
  const out: SpotifyTrack[] = [];
  const seen = new Set<string>();
  for (const item of data.items ?? []) {
    if (!item) continue;
    const t = item.track;
    if (!t) continue;
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push({
      id: t.id,
      name: t.name,
      uri: t.uri,
      artist: t.artists.map((a) => a.name).join(', '),
      imageUrl: t.album?.images?.[0]?.url,
    });
  }
  return out;
}

/**
 * Activate a Web Playback SDK device in Spotify Connect by transferring
 * playback to it. A freshly-`ready` SDK device is registered locally but is
 * often not yet a valid REST `play?device_id=` target — `PUT /me/player`
 * with the device id makes Spotify treat it as the active device. We pass
 * `play: false` so this only activates without forcing a resume; the caller
 * issues the real `play` (with the desired context/tracks) right after.
 *
 * Error policy
 * ------------
 * - 403 → throw 'spotify-premium-required'. The transfer endpoint returns
 *   403 for non-Premium accounts; if we surface the raw status, togglePlay's
 *   exact-string fallback misses it and the UI never swaps to the embed
 *   iframe. The 403 here means the same thing as a 403 on the play endpoint.
 * - Other non-2xx (transient 5xx, 429, 401, 404) → return silently. The
 *   caller (`putWithDeviceActivation`) will still retry the original PUT
 *   after the activation wait, and the retry's own error message is more
 *   actionable than a generic "transfer returned X." Pre-PR this helper
 *   swallowed all responses; preserving that recovery path for transient
 *   errors avoids breaking flows that historically self-healed.
 */
async function transferPlaybackToDevice(
  accessToken: string,
  deviceId: string
): Promise<void> {
  const res = await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
  if (res.status === 403) {
    throw new Error('spotify-premium-required');
  }
  // Any other non-2xx: let the caller's retry of the original endpoint
  // surface the real error. res.ok already covers 200-299 (including 204).
}

/**
 * Lists Spotify Connect devices visible to the access token's user.
 *
 * Used by `waitForDeviceRegistration` to confirm that a freshly-`ready` Web
 * Playback SDK device has propagated server-side before the UI starts
 * targeting it via REST. Returns an empty list on any non-2xx so the caller
 * just keeps polling — a transient 5xx shouldn't burn the registration wait.
 */
export async function fetchSpotifyDevices(
  accessToken: string
): Promise<Array<{ id: string; name: string }>> {
  let res: Response;
  try {
    res = await fetch('https://api.spotify.com/v1/me/player/devices', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // Network failure (offline, DNS, CORS error) — return empty so the
    // polling loop keeps trying instead of rejecting up through .then().
    return [];
  }
  if (!res.ok) return [];
  // Spotify edge/CDN occasionally serves a 200 + HTML error page during
  // incidents (and captive portals do the same). Wrap json() so a parse
  // failure doesn't reject the whole helper — `waitForDeviceRegistration`
  // would then escape past the hook's .then() as an unhandled rejection.
  try {
    const body = (await res.json()) as {
      devices?: Array<{ id: string; name: string }>;
    };
    return body.devices ?? [];
  } catch {
    return [];
  }
}

/**
 * Backoff schedule (ms before each attempt) for `waitForDeviceRegistration`.
 * Front-loaded so the common case (registration completes in <1s) resolves
 * fast; tail extended to ~15s for slow-propagating accounts. Exported for
 * the unit test so it doesn't have to hard-code the timing.
 */
export const DEVICE_REGISTRATION_POLL_DELAYS_MS: ReadonlyArray<number> = [
  0, 300, 600, 1000, 1500, 2500, 4000, 5000,
];

/**
 * Polls `GET /v1/me/player/devices` until the given device id appears in the
 * caller's Spotify Connect device list, or until `isCancelled()` returns true.
 *
 * The Web Playback SDK's `ready` event fires the instant the local device
 * object exists — but Spotify Connect's server-side registration lags by
 * 1-3 seconds. Calling `play?device_id=` (or `transfer`) before registration
 * completes returns 404 "Device not found"; the existing transfer-then-retry
 * self-heal can't recover when the underlying device hasn't propagated
 * because transfer 404s for the same reason.
 *
 * Polling the devices endpoint until the id is visible is the canonical fix.
 * Returns true once the device appears, false on timeout or cancellation.
 */
export async function waitForDeviceRegistration(
  getAccessToken: () => Promise<string | null>,
  deviceId: string,
  isCancelled: () => boolean
): Promise<boolean> {
  for (const delay of DEVICE_REGISTRATION_POLL_DELAYS_MS) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (isCancelled()) return false;
    const token = await getAccessToken();
    if (isCancelled()) return false;
    if (!token) continue;
    const devices = await fetchSpotifyDevices(token);
    if (isCancelled()) return false;
    if (devices.some((d) => d.id === deviceId)) return true;
  }
  return false;
}

/**
 * Issue a PUT to a Spotify player endpoint that targets a specific device,
 * self-healing the "Device not found" (404) case: a freshly-`ready` Web
 * Playback SDK device is registered locally but is often not yet a valid
 * Spotify Connect target. On 404 we transfer playback to the device to
 * activate it, give Spotify ~400ms to register it, then retry the PUT once.
 *
 * Shared by playOnDevice / setRepeatMode / setShuffle so the activation
 * dance lives in exactly one place.
 */
async function putWithDeviceActivation(
  url: string,
  accessToken: string,
  deviceId: string,
  init?: RequestInit
): Promise<Response> {
  const send = () =>
    fetch(url, {
      method: 'PUT',
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, ...init?.headers },
    });

  let res = await send();
  if (res.status === 404) {
    await transferPlaybackToDevice(accessToken, deviceId);
    await new Promise((resolve) => setTimeout(resolve, 400));
    res = await send();
  }
  return res;
}

/**
 * Issue `play` on the given device. Pass either a context URI (album/playlist/artist)
 * via `contextUri`, or a list of track URIs via `uris`, but not both.
 *
 * Self-heals the common "Device not found" (404) case: when a just-created
 * SDK device hasn't been activated in Spotify Connect yet, the first
 * `play?device_id=` returns 404. We then transfer playback to the device to
 * activate it and retry the play once.
 */
export async function playOnDevice(
  accessToken: string,
  deviceId: string,
  payload: { contextUri?: string; uris?: string[] }
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (payload.contextUri) body.context_uri = payload.contextUri;
  if (payload.uris) body.uris = payload.uris;

  // 404 (device not yet an active Connect target) self-heals via
  // putWithDeviceActivation: transfer playback to the device, then retry once.
  const res = await putWithDeviceActivation(
    `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
    accessToken,
    deviceId,
    {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  // 204 is success; some non-Premium accounts return 403.
  if (res.status === 403) {
    throw new Error('spotify-premium-required');
  }
  if (!res.ok && res.status !== 204) {
    throw new Error(`Spotify play returned ${res.status}`);
  }
}

/**
 * Set the repeat mode on the given device.
 *   - 'off'     → no repeat
 *   - 'track'   → repeat the current track
 *   - 'context' → repeat the current context (playlist/album)
 *
 * Mirrors playOnDevice's fetch/error style: 204 is success, 403 means the
 * account isn't Premium, any other non-2xx throws. Self-heals the same 404
 * "device not yet an active Connect target" case as playOnDevice via
 * putWithDeviceActivation (transfer → retry once) — a just-`ready` SDK device
 * otherwise silently 404s here and the toggle does nothing.
 */
export async function setRepeatMode(
  accessToken: string,
  deviceId: string,
  state: 'off' | 'track' | 'context'
): Promise<void> {
  const res = await putWithDeviceActivation(
    `https://api.spotify.com/v1/me/player/repeat?state=${state}&device_id=${encodeURIComponent(deviceId)}`,
    accessToken,
    deviceId
  );
  if (res.status === 403) {
    throw new Error('spotify-premium-required');
  }
  if (!res.ok && res.status !== 204) {
    throw new Error(`Spotify repeat returned ${res.status}`);
  }
}

/**
 * Toggle native Spotify shuffle on the given device. Same fetch/error style as
 * setRepeatMode (204 success, 403 → premium-required, other non-2xx throws),
 * including the 404 transfer-then-retry self-heal for a freshly-ready device.
 */
export async function setShuffle(
  accessToken: string,
  deviceId: string,
  on: boolean
): Promise<void> {
  const res = await putWithDeviceActivation(
    `https://api.spotify.com/v1/me/player/shuffle?state=${on ? 'true' : 'false'}&device_id=${encodeURIComponent(deviceId)}`,
    accessToken,
    deviceId
  );
  if (res.status === 403) {
    throw new Error('spotify-premium-required');
  }
  if (!res.ok && res.status !== 204) {
    throw new Error(`Spotify shuffle returned ${res.status}`);
  }
}

/** Build the Spotify resource URI (track/album/playlist) for a given input. */
export function spotifyUriFromInput(input: string): string | null {
  return parseSpotifyResource(input)?.uri ?? null;
}
