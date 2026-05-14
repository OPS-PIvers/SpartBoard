/**
 * Server-side Google OAuth refresh-token flow.
 *
 * Phase A — toast "Connect" + sidebar "Refresh" only refresh the
 * client-side access_token via GIS silent refresh, which fails the moment
 * the user's Google browser session expires. The user then sees the
 * disconnect banner and has to re-consent, which is the maddening
 * frequency the teacher complaint describes.
 *
 * Phase B (this module) — at sign-in time, the client captures a Google
 * **authorization code** via the GIS code flow with `access_type=offline`.
 * `exchangeGoogleAuthCode` swaps that code for an access_token + a
 * long-lived refresh_token. The refresh_token is encrypted with an
 * application-managed secret and stored at
 * `/users/{uid}/private/googleAuth` (Firestore rules deny all client
 * reads/writes — only Admin SDK from this function touches it).
 *
 * From then on, `refreshGoogleAccessToken` is the resilient fallback
 * for the client's `refreshGoogleToken` helper: GIS silent first
 * (instant, free), then this callable (survives Google-session
 * expiry), then the Firebase popup (last resort when the refresh_token
 * is itself revoked).
 *
 * Security:
 * - The refresh_token NEVER leaves the server. Even the client
 *   doesn't see it after the initial exchange.
 * - The encryption secret (`GOOGLE_OAUTH_REFRESH_TOKEN_KEY`) is a
 *   Cloud-Functions-managed secret, distinct from
 *   `GOOGLE_OAUTH_CLIENT_SECRET`. Rotating either is a separate
 *   operational concern.
 * - `invalid_grant` from Google (revoked grant) deletes the stored
 *   refresh_token and signals the client to re-consent rather than
 *   loop on a dead token.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as CryptoJS from 'crypto-js';
import axios from 'axios';

if (!admin.apps.length) {
  admin.initializeApp();
}

// Google's standard OAuth 2.0 token endpoint.
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

// Per-request timeout for Google OAuth calls. Cloud Functions have a global
// timeout (~60s default), but a tighter per-request bound prevents a single
// hung connection from holding an instance and lets us surface a clean
// `failed-precondition` error to the client instead of a cryptic timeout.
const GOOGLE_API_TIMEOUT_MS = 10_000;

// Where the encrypted refresh_token lives. Firestore rules MUST deny
// client read/write on this path — see firestore.rules `/users/{uid}/private/**`.
const PRIVATE_DOC_PATH = (uid: string) =>
  `users/${uid}/private/googleAuth` as const;

// Cloud Functions secrets. `_CLIENT_ID` already exists for other flows; the
// `_CLIENT_SECRET` and `_REFRESH_TOKEN_KEY` are new — both need to be set via
// `firebase functions:secrets:set` before deploying.
const GOOGLE_OAUTH_CLIENT_ID = defineSecret('GOOGLE_OAUTH_CLIENT_ID');
const GOOGLE_OAUTH_CLIENT_SECRET = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');
const GOOGLE_OAUTH_REFRESH_TOKEN_KEY = defineSecret(
  'GOOGLE_OAUTH_REFRESH_TOKEN_KEY'
);

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

interface StoredGoogleAuth {
  /** AES-encrypted refresh_token. Plaintext NEVER persisted. */
  encryptedRefreshToken: string;
  /** Numeric epoch (ms) of last successful refresh — diagnostic, not load-bearing. */
  updatedAt: number;
  /** Scope string Google returned at the last exchange. */
  scope: string;
}

/** AES-256 encrypt with the function-managed secret. */
function encryptRefreshToken(plaintext: string, key: string): string {
  return CryptoJS.AES.encrypt(plaintext, key).toString();
}

/** AES-256 decrypt with the function-managed secret. */
function decryptRefreshToken(ciphertext: string, key: string): string {
  const decrypted = CryptoJS.AES.decrypt(ciphertext, key).toString(
    CryptoJS.enc.Utf8
  );
  if (!decrypted) {
    throw new HttpsError(
      'internal',
      'Failed to decrypt stored refresh token. The encryption key may have rotated.'
    );
  }
  return decrypted;
}

function requireAuthUid(authUid: string | undefined): string {
  if (!authUid) {
    throw new HttpsError(
      'unauthenticated',
      'Must be signed in to manage Google OAuth state.'
    );
  }
  return authUid;
}

/**
 * Exchange a Google authorization code for tokens, then persist the
 * refresh_token. Called once at sign-in (and again any time the user
 * re-consents after a revocation).
 *
 * Inputs:
 * - `code` — the authorization code from `google.accounts.oauth2.initCodeClient`
 * - `redirectUri` — must match the redirect_uri the client passed when
 *   requesting the code (Google enforces strict equality)
 *
 * Returns the access_token + expires_in so the client can use it
 * immediately without a second round-trip.
 */
export const exchangeGoogleAuthCode = onCall(
  {
    secrets: [
      GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET,
      GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
    ],
  },
  async (req) => {
    const uid = requireAuthUid(req.auth?.uid);
    const raw = (req.data ?? {}) as Record<string, unknown>;
    const code = typeof raw.code === 'string' ? raw.code : '';
    const redirectUri =
      typeof raw.redirectUri === 'string' ? raw.redirectUri : '';
    if (!code) {
      throw new HttpsError('invalid-argument', 'code is required.');
    }
    if (!redirectUri) {
      throw new HttpsError('invalid-argument', 'redirectUri is required.');
    }

    let tokens: GoogleTokenResponse;
    try {
      const res = await axios.post<GoogleTokenResponse>(
        GOOGLE_TOKEN_ENDPOINT,
        new URLSearchParams({
          code,
          client_id: GOOGLE_OAUTH_CLIENT_ID.value(),
          client_secret: GOOGLE_OAUTH_CLIENT_SECRET.value(),
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: GOOGLE_API_TIMEOUT_MS,
        }
      );
      tokens = res.data;
    } catch (err) {
      // Narrow via `axios.isAxiosError` so we only reach for `.response.data`
      // when the error genuinely came from axios. A bare assertion would
      // silently work via optional chaining but mask any non-axios failures
      // (e.g. a TypeError thrown by surrounding code) behind a misleading
      // "Google token exchange failed: undefined" message.
      const googleErr = axios.isAxiosError(err)
        ? ((err.response?.data as { error?: string })?.error ?? err.message)
        : err instanceof Error
          ? err.message
          : String(err);
      throw new HttpsError(
        'failed-precondition',
        `Google token exchange failed: ${googleErr}`
      );
    }

    if (!tokens.access_token) {
      throw new HttpsError(
        'failed-precondition',
        'Google did not return an access_token. Re-consent may be required.'
      );
    }

    // Google only issues a refresh_token on the FIRST consent (or when
    // `prompt=consent` is forced). If we don't get one, leave the
    // existing stored token in place (if any) — this exchange was a
    // re-authorization that doesn't re-issue the refresh leg.
    if (tokens.refresh_token) {
      const encrypted = encryptRefreshToken(
        tokens.refresh_token,
        GOOGLE_OAUTH_REFRESH_TOKEN_KEY.value()
      );
      const stored: StoredGoogleAuth = {
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
 * Returns `{ accessToken, expiresIn }` on success.
 * Throws `failed-precondition` with code `needs-consent` if no refresh
 * token is stored or Google returns `invalid_grant` (revoked) — the
 * client should then route the user through the auth-code flow again.
 */
export const refreshGoogleAccessToken = onCall(
  {
    secrets: [
      GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET,
      GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
    ],
  },
  async (req) => {
    const uid = requireAuthUid(req.auth?.uid);
    const db = admin.firestore();
    const ref = db.doc(PRIVATE_DOC_PATH(uid));
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError(
        'failed-precondition',
        'needs-consent: no refresh token stored for this user.'
      );
    }
    const stored = snap.data() as StoredGoogleAuth;
    let refreshToken: string;
    try {
      refreshToken = decryptRefreshToken(
        stored.encryptedRefreshToken,
        GOOGLE_OAUTH_REFRESH_TOKEN_KEY.value()
      );
    } catch (err) {
      // Decryption failed — the most likely cause is rotation of
      // GOOGLE_OAUTH_REFRESH_TOKEN_KEY, which makes every previously-stored
      // ciphertext undecryptable. Drop the stored doc and signal
      // needs-consent so the client routes the user through the
      // auth-code flow instead of looping on a useless popup retry.
      console.warn(
        '[refreshGoogleAccessToken] Failed to decrypt stored refresh token; dropping doc and prompting re-consent.',
        err
      );
      await ref.delete().catch(() => undefined);
      throw new HttpsError(
        'failed-precondition',
        'needs-consent: stored refresh token could not be decrypted (key may have rotated).'
      );
    }

    try {
      const res = await axios.post<GoogleTokenResponse>(
        GOOGLE_TOKEN_ENDPOINT,
        new URLSearchParams({
          client_id: GOOGLE_OAUTH_CLIENT_ID.value(),
          client_secret: GOOGLE_OAUTH_CLIENT_SECRET.value(),
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: GOOGLE_API_TIMEOUT_MS,
        }
      );
      return {
        accessToken: res.data.access_token,
        expiresIn: res.data.expires_in,
      };
    } catch (err) {
      // Narrow via `axios.isAxiosError` before reading `.response.data` so a
      // non-axios failure (e.g. a TypeError from surrounding code) doesn't
      // get misclassified as a Google API error. Only axios errors carry
      // the `invalid_grant` signal we need to recognize.
      if (axios.isAxiosError(err)) {
        const googleErr = (err.response?.data as { error?: string })?.error;
        if (googleErr === 'invalid_grant') {
          // Refresh token revoked (user disconnected at myaccount.google.com,
          // password reset, etc.). Drop the stored token so the next refresh
          // call surfaces `needs-consent` cleanly and the client re-routes
          // through the code flow rather than looping on a dead token.
          await ref.delete().catch(() => undefined);
          throw new HttpsError(
            'failed-precondition',
            'needs-consent: stored refresh token was revoked.'
          );
        }
        throw new HttpsError(
          'internal',
          `Google refresh failed: ${googleErr ?? err.message}`
        );
      }
      throw new HttpsError(
        'internal',
        `Google refresh failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
);

/**
 * Explicit revoke — used by the "Disconnect Google Drive" action in the
 * sidebar. Drops the stored refresh_token and best-effort tells Google
 * to invalidate it. Idempotent: a missing doc is a no-op success.
 */
export const revokeGoogleRefreshToken = onCall(
  {
    secrets: [GOOGLE_OAUTH_REFRESH_TOKEN_KEY],
  },
  async (req) => {
    const uid = requireAuthUid(req.auth?.uid);
    const ref = admin.firestore().doc(PRIVATE_DOC_PATH(uid));
    const snap = await ref.get();
    if (!snap.exists) {
      return { revoked: false, reason: 'no-stored-token' };
    }
    const stored = snap.data() as StoredGoogleAuth;
    let plaintext: string | null = null;
    try {
      plaintext = decryptRefreshToken(
        stored.encryptedRefreshToken,
        GOOGLE_OAUTH_REFRESH_TOKEN_KEY.value()
      );
    } catch {
      // Encryption key rotated and we can no longer decrypt — still drop
      // the stored doc so future calls don't keep failing on it.
      plaintext = null;
    }
    if (plaintext) {
      await axios
        .post(
          GOOGLE_REVOKE_ENDPOINT,
          new URLSearchParams({ token: plaintext }).toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: GOOGLE_API_TIMEOUT_MS,
          }
        )
        .catch(() => {
          // Google may have already invalidated the token; deleting the
          // stored copy is the load-bearing step regardless.
        });
    }
    await ref.delete();
    return { revoked: true };
  }
);
