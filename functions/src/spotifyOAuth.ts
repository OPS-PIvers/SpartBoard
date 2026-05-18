/**
 * Server-side Spotify OAuth Authorization-Code-with-PKCE flow.
 *
 * Mirrors the security model of `googleOAuth.ts`: the refresh_token is
 * AES-encrypted with an application-managed key and persisted at
 * `/users/{uid}/private/spotifyAuth`, where Firestore rules deny ALL client
 * access. Only the Admin SDK from this module reads or writes that path.
 *
 * Operations:
 * - `exchangeSpotifyAuthCode` — swap a one-time PKCE authorization code for
 *   access_token + refresh_token. Stores the encrypted refresh_token. Returns
 *   the access_token + expires_in so the client can use it immediately.
 * - `refreshSpotifyAccessToken` — exchange the stored refresh_token for a
 *   fresh access_token. On `invalid_grant` the stored token is dropped and
 *   the client gets `needs-consent` so it re-routes through the auth-code
 *   flow instead of looping.
 * - `revokeSpotifyAuth` — drop the stored refresh_token. Spotify has no
 *   public revoke endpoint, so this is local-only; the user can also
 *   manage app authorizations at spotify.com/account/apps.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as CryptoJS from 'crypto-js';
import axios from 'axios';

if (!admin.apps.length) {
  admin.initializeApp();
}

const SPOTIFY_TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_TIMEOUT_MS = 10_000;

// Scopes the widget depends on. Partial-consent rejection at exchange time
// keeps a half-granted token from being persisted only to fail at SDK init.
const REQUIRED_SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
];

const PRIVATE_DOC_PATH = (uid: string) =>
  `users/${uid}/private/spotifyAuth` as const;

const SPOTIFY_OAUTH_CLIENT_ID = defineSecret('SPOTIFY_OAUTH_CLIENT_ID');
const SPOTIFY_OAUTH_CLIENT_SECRET = defineSecret('SPOTIFY_OAUTH_CLIENT_SECRET');
const SPOTIFY_OAUTH_REFRESH_TOKEN_KEY = defineSecret(
  'SPOTIFY_OAUTH_REFRESH_TOKEN_KEY'
);

type Ciphertext = string & { readonly __ciphertext: unique symbol };

interface SpotifyTokenResponse {
  access_token?: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
}

interface StoredSpotifyAuth {
  encryptedRefreshToken: Ciphertext;
  updatedAt: number;
  scope: string;
}

function encryptRefreshToken(plaintext: string, key: string): Ciphertext {
  return CryptoJS.AES.encrypt(plaintext, key).toString() as Ciphertext;
}

function decryptRefreshToken(ciphertext: Ciphertext, key: string): string {
  let decrypted: string;
  try {
    decrypted = CryptoJS.AES.decrypt(ciphertext, key).toString(
      CryptoJS.enc.Utf8
    );
  } catch (err) {
    console.error('[decryptRefreshToken] CryptoJS decrypt threw', err);
    throw new HttpsError(
      'internal',
      'Failed to decrypt stored Spotify refresh token. The encryption key may have rotated.'
    );
  }
  // eslint-disable-next-line no-control-regex
  const hasControlChars = /[\x00-\x08\x0e-\x1f\x7f]/.test(decrypted);
  if (!decrypted || hasControlChars) {
    console.error('[decryptRefreshToken] CryptoJS decrypt returned bad data', {
      empty: !decrypted,
      hasControlChars,
      length: decrypted.length,
    });
    throw new HttpsError(
      'internal',
      'Failed to decrypt stored Spotify refresh token. The encryption key may have rotated.'
    );
  }
  return decrypted;
}

function requireAuthUid(authUid: string | undefined): string {
  if (!authUid) {
    throw new HttpsError(
      'unauthenticated',
      'Must be signed in to manage Spotify OAuth state.'
    );
  }
  return authUid;
}

function parseStoredSpotifyAuth(data: unknown): StoredSpotifyAuth | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.encryptedRefreshToken !== 'string') return null;
  if (typeof d.updatedAt !== 'number') return null;
  if (typeof d.scope !== 'string') return null;
  return {
    encryptedRefreshToken: d.encryptedRefreshToken as Ciphertext,
    updatedAt: d.updatedAt,
    scope: d.scope,
  };
}

type SpotifyRefreshErrorDetails =
  | {
      reason: 'needs-consent';
      cause:
        | 'no-stored-token'
        | 'decrypt-failed'
        | 'invalid-grant'
        | 'partial-consent';
    }
  | { reason: 'transient' };

function needsConsent(
  cause: Extract<
    SpotifyRefreshErrorDetails,
    { reason: 'needs-consent' }
  >['cause'],
  message: string
): HttpsError {
  const details: SpotifyRefreshErrorDetails = {
    reason: 'needs-consent',
    cause,
  };
  return new HttpsError('failed-precondition', message, details);
}

function transientError(message: string): HttpsError {
  const details: SpotifyRefreshErrorDetails = { reason: 'transient' };
  return new HttpsError('internal', message, details);
}

function logWarn(scope: string, err: unknown, extra?: Record<string, unknown>) {
  console.warn(`[spotifyOAuth.${scope}]`, err, extra ?? {});
}

function logInfo(scope: string, extra?: Record<string, unknown>) {
  console.info(`[spotifyOAuth.${scope}]`, extra ?? {});
}

/** HTTP Basic header for Spotify token endpoint (client_id:client_secret). */
function basicAuthHeader(clientId: string, clientSecret: string): string {
  return (
    'Basic ' +
    Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')
  );
}

/**
 * Exchange a Spotify PKCE authorization code for tokens, then persist the
 * encrypted refresh_token.
 */
export const exchangeSpotifyAuthCode = onCall(
  {
    secrets: [
      SPOTIFY_OAUTH_CLIENT_ID,
      SPOTIFY_OAUTH_CLIENT_SECRET,
      SPOTIFY_OAUTH_REFRESH_TOKEN_KEY,
    ],
  },
  async (req) => {
    const uid = requireAuthUid(req.auth?.uid);
    const raw = (req.data ?? {}) as Record<string, unknown>;
    const code = typeof raw.code === 'string' ? raw.code : '';
    const redirectUri =
      typeof raw.redirectUri === 'string' ? raw.redirectUri : '';
    const codeVerifier =
      typeof raw.codeVerifier === 'string' ? raw.codeVerifier : '';
    if (!code) throw new HttpsError('invalid-argument', 'code is required.');
    if (!redirectUri) {
      throw new HttpsError('invalid-argument', 'redirectUri is required.');
    }
    if (!codeVerifier) {
      throw new HttpsError('invalid-argument', 'codeVerifier is required.');
    }

    let tokens: SpotifyTokenResponse;
    try {
      const res = await axios.post<SpotifyTokenResponse>(
        SPOTIFY_TOKEN_ENDPOINT,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: SPOTIFY_OAUTH_CLIENT_ID.value(),
          code_verifier: codeVerifier,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: basicAuthHeader(
              SPOTIFY_OAUTH_CLIENT_ID.value(),
              SPOTIFY_OAUTH_CLIENT_SECRET.value()
            ),
          },
          timeout: SPOTIFY_API_TIMEOUT_MS,
        }
      );
      tokens = res.data;
    } catch (err) {
      const spotifyErr = axios.isAxiosError(err)
        ? ((
            err.response?.data as { error?: string; error_description?: string }
          )?.error_description ??
          (err.response?.data as { error?: string })?.error ??
          err.message)
        : err instanceof Error
          ? err.message
          : String(err);
      throw new HttpsError(
        'failed-precondition',
        `Spotify token exchange failed: ${spotifyErr}`
      );
    }

    if (!tokens.access_token) {
      throw new HttpsError(
        'failed-precondition',
        'Spotify did not return an access_token. Re-consent may be required.'
      );
    }

    const grantedScopes = new Set((tokens.scope ?? '').split(' '));
    const missingScopes = REQUIRED_SPOTIFY_SCOPES.filter(
      (s) => !grantedScopes.has(s)
    );
    if (missingScopes.length > 0) {
      throw needsConsent(
        'partial-consent',
        `partial-consent: missing required scopes: ${missingScopes.join(', ')}`
      );
    }

    if (tokens.refresh_token) {
      const encrypted = encryptRefreshToken(
        tokens.refresh_token,
        SPOTIFY_OAUTH_REFRESH_TOKEN_KEY.value()
      );
      const stored: StoredSpotifyAuth = {
        encryptedRefreshToken: encrypted,
        updatedAt: Date.now(),
        scope: tokens.scope ?? '',
      };
      await admin.firestore().doc(PRIVATE_DOC_PATH(uid)).set(stored);
    }

    return {
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      hasRefreshToken: Boolean(tokens.refresh_token),
    };
  }
);

/**
 * Exchange the stored refresh_token for a fresh access_token.
 *
 * Spotify rotates refresh_tokens on every refresh call, so when a new one
 * comes back we re-encrypt and persist it. If Spotify omits the new
 * refresh_token (rare but documented) we keep the previous one — the old
 * one stays valid until explicitly revoked.
 */
export const refreshSpotifyAccessToken = onCall(
  {
    secrets: [
      SPOTIFY_OAUTH_CLIENT_ID,
      SPOTIFY_OAUTH_CLIENT_SECRET,
      SPOTIFY_OAUTH_REFRESH_TOKEN_KEY,
    ],
  },
  async (req) => {
    const uid = requireAuthUid(req.auth?.uid);
    const db = admin.firestore();
    const ref = db.doc(PRIVATE_DOC_PATH(uid));
    const snap = await ref.get();
    if (!snap.exists) {
      throw needsConsent(
        'no-stored-token',
        'needs-consent: no refresh token stored for this user.'
      );
    }
    const stored = parseStoredSpotifyAuth(snap.data());
    if (!stored) {
      await ref.delete().catch((delErr) => {
        logWarn('refreshSpotifyAccessToken.deletePoisonDoc', delErr, { uid });
      });
      throw needsConsent(
        'decrypt-failed',
        'needs-consent: stored Spotify refresh token document has an unexpected shape.'
      );
    }

    let refreshToken: string;
    try {
      refreshToken = decryptRefreshToken(
        stored.encryptedRefreshToken,
        SPOTIFY_OAUTH_REFRESH_TOKEN_KEY.value()
      );
    } catch (err) {
      logWarn('refreshSpotifyAccessToken.decrypt', err, { uid });
      await ref.delete().catch((delErr) => {
        logWarn('refreshSpotifyAccessToken.deletePoisonDoc', delErr, { uid });
      });
      throw needsConsent(
        'decrypt-failed',
        'needs-consent: stored Spotify refresh token could not be decrypted (key may have rotated).'
      );
    }

    try {
      const res = await axios.post<SpotifyTokenResponse>(
        SPOTIFY_TOKEN_ENDPOINT,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: SPOTIFY_OAUTH_CLIENT_ID.value(),
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: basicAuthHeader(
              SPOTIFY_OAUTH_CLIENT_ID.value(),
              SPOTIFY_OAUTH_CLIENT_SECRET.value()
            ),
          },
          timeout: SPOTIFY_API_TIMEOUT_MS,
        }
      );
      if (!res.data.access_token) {
        throw transientError('Spotify refresh returned no access_token.');
      }

      // Spotify rotates refresh_tokens — re-encrypt and persist if one came back.
      if (res.data.refresh_token) {
        const reEncrypted = encryptRefreshToken(
          res.data.refresh_token,
          SPOTIFY_OAUTH_REFRESH_TOKEN_KEY.value()
        );
        await ref
          .set(
            {
              encryptedRefreshToken: reEncrypted,
              updatedAt: Date.now(),
              scope: res.data.scope ?? stored.scope,
            } satisfies StoredSpotifyAuth,
            { merge: true }
          )
          .catch((err) => {
            // Persist failure is non-fatal — the old refresh_token still
            // works for at least one more cycle. Surface it in logs so
            // sustained failures are debuggable.
            logWarn('refreshSpotifyAccessToken.persistRotated', err, { uid });
          });
      }

      return {
        accessToken: res.data.access_token,
        expiresIn: res.data.expires_in,
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      if (axios.isAxiosError(err)) {
        const spotifyErr = (err.response?.data as { error?: string })?.error;
        if (spotifyErr === 'invalid_grant') {
          // Race-safe delete: another tab may have already rotated the
          // refresh_token (T0 both tabs read R0; T1 tab A rotates to R1
          // and writes; T2 tab B's refresh with R0 fails as invalid_grant).
          // If we unconditionally deleted here we'd erase R1 and force a
          // re-consent that wasn't actually needed. The transaction reads
          // the doc again and only deletes if the ciphertext we just used
          // is still the stored ciphertext — otherwise leave the rotated
          // token alone.
          await db
            .runTransaction(async (tx) => {
              const fresh = await tx.get(ref);
              if (!fresh.exists) return;
              const freshStored = parseStoredSpotifyAuth(fresh.data());
              if (!freshStored) {
                tx.delete(ref);
                return;
              }
              if (
                freshStored.encryptedRefreshToken ===
                stored.encryptedRefreshToken
              ) {
                tx.delete(ref);
              }
              // else: another tab rotated the token; leave the new doc in place.
            })
            .catch((delErr) => {
              logWarn('refreshSpotifyAccessToken.deletePoisonDoc', delErr, {
                uid,
              });
            });
          throw needsConsent(
            'invalid-grant',
            'needs-consent: stored Spotify refresh token was revoked.'
          );
        }
        throw transientError(
          `Spotify refresh failed: ${spotifyErr ?? err.message}`
        );
      }
      throw transientError(
        `Spotify refresh failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
);

/**
 * Explicit disconnect — drops the stored refresh_token for this user.
 *
 * Spotify has no public per-app revoke endpoint (users must visit
 * spotify.com/account/apps to fully de-authorize), so this is local-only.
 * Idempotent: a missing doc is a no-op success.
 */
export const revokeSpotifyAuth = onCall(async (req) => {
  const uid = requireAuthUid(req.auth?.uid);
  const ref = admin.firestore().doc(PRIVATE_DOC_PATH(uid));
  const snap = await ref.get();
  if (!snap.exists) {
    return { revoked: false, reason: 'no-stored-token' };
  }
  await ref.delete();
  logInfo('revokeSpotifyAuth.success', { uid });
  return { revoked: true };
});
