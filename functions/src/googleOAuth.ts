/**
 * Server-side Google OAuth refresh-token flow.
 *
 * `exchangeGoogleAuthCode` swaps a one-time GIS authorization code for an
 * access_token + long-lived refresh_token. The refresh_token is AES-encrypted
 * with an application-managed secret and stored at
 * `/users/{uid}/private/googleAuth`. Firestore rules deny all client
 * reads/writes on that path — only the Admin SDK from this module touches it.
 *
 * `refreshGoogleAccessToken` exchanges the stored refresh_token for a fresh
 * access_token. Acts as the resilient middle leg in the client's refresh
 * chain: GIS silent first (instant, free), then this callable (survives
 * Google-session expiry), then the Firebase popup (last resort when the
 * refresh_token itself is revoked).
 *
 * `revokeGoogleRefreshToken` drops the stored refresh_token and best-effort
 * tells Google to invalidate it. Idempotent.
 *
 * Security invariants:
 * - The refresh_token plaintext NEVER leaves the server; not even the client
 *   sees it after the initial exchange.
 * - `GOOGLE_OAUTH_REFRESH_TOKEN_KEY` (encryption secret) is distinct from
 *   `GOOGLE_OAUTH_CLIENT_SECRET`; rotating either is a separate operational
 *   concern.
 * - `invalid_grant` from Google (revoked grant) deletes the stored
 *   refresh_token and surfaces `needs-consent` to the client rather than
 *   looping on a dead token.
 * - The granted `scope` set must include every entry in `REQUIRED_DRIVE_SCOPES`;
 *   partial consent is rejected at exchange time to avoid persisting a grant
 *   that will later fail deep in Drive API calls with `insufficient_scope`.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as CryptoJS from 'crypto-js';
import axios from 'axios';

if (!admin.apps.length) {
  admin.initializeApp();
}

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

// Per-request timeout for Google OAuth calls. Cloud Functions have a global
// timeout (~60s default), but a tighter per-request bound prevents a single
// hung connection from holding an instance and lets us surface a clean
// `failed-precondition` error to the client instead of a cryptic timeout.
const GOOGLE_API_TIMEOUT_MS = 10_000;

// Scopes the Drive integration depends on. If Google returns a grant that
// omits any of these (user de-selected during consent), the exchange is
// rejected with `partial-consent` rather than silently persisting a grant
// that will fail deep in Drive API calls with `insufficient_scope`.
const REQUIRED_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
];

const PRIVATE_DOC_PATH = (uid: string) =>
  `users/${uid}/private/googleAuth` as const;

const GOOGLE_OAUTH_CLIENT_ID = defineSecret('GOOGLE_OAUTH_CLIENT_ID');
const GOOGLE_OAUTH_CLIENT_SECRET = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');
const GOOGLE_OAUTH_REFRESH_TOKEN_KEY = defineSecret(
  'GOOGLE_OAUTH_REFRESH_TOKEN_KEY'
);

// Brand for ciphertext: structurally a string but never assignable from a raw
// plaintext string. Construct only via `encryptRefreshToken`, consume only via
// `decryptRefreshToken`. Prevents a future bug from accidentally writing
// plaintext into the `encryptedRefreshToken` Firestore field.
type Ciphertext = string & { readonly __ciphertext: unique symbol };

interface GoogleTokenResponse {
  // `access_token` is technically required by Google's contract but runtime
  // responses can omit it on certain error shapes. Modeled as optional so
  // call sites are forced to guard before use.
  access_token?: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

interface StoredGoogleAuth {
  /** AES-encrypted refresh_token. Plaintext NEVER persisted. */
  encryptedRefreshToken: Ciphertext;
  updatedAt: number;
  scope: string;
}

function encryptRefreshToken(plaintext: string, key: string): Ciphertext {
  return CryptoJS.AES.encrypt(plaintext, key).toString() as Ciphertext;
}

function decryptRefreshToken(ciphertext: Ciphertext, key: string): string {
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

// Runtime validator for Firestore reads. A bare `as StoredGoogleAuth` would
// lie if the document shape ever drifted (manual edit, schema migration,
// admin-SDK write from another module); this returns null instead, letting
// callers decide whether to drop the doc or surface needs-consent.
function parseStoredGoogleAuth(data: unknown): StoredGoogleAuth | null {
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

// `HttpsError.details` payload that the client reads to discriminate
// needs-consent (re-route to auth-code flow) from generic errors. Strongly
// typed so a typo here breaks compilation rather than silently falling
// through to a generic-error UX.
type RefreshErrorDetails =
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
  cause: Extract<RefreshErrorDetails, { reason: 'needs-consent' }>['cause'],
  message: string
): HttpsError {
  const details: RefreshErrorDetails = { reason: 'needs-consent', cause };
  return new HttpsError('failed-precondition', message, details);
}

function transientError(message: string): HttpsError {
  const details: RefreshErrorDetails = { reason: 'transient' };
  return new HttpsError('internal', message, details);
}

function logWarn(scope: string, err: unknown, extra?: Record<string, unknown>) {
  console.warn(`[googleOAuth.${scope}]`, err, extra ?? {});
}

/**
 * Exchange a Google authorization code for tokens, then persist the
 * refresh_token.
 *
 * Inputs:
 * - `code` — the authorization code from `google.accounts.oauth2.initCodeClient`
 * - `redirectUri` — must match the redirect_uri the client passed when
 *   requesting the code (Google enforces strict equality)
 *
 * Returns the access_token + expires_in so the client can use it immediately
 * without a second round-trip.
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

    // Reject scope downgrades at the exchange boundary. If the user
    // de-selected a required scope on the consent screen, Google still
    // returns a valid refresh_token — but Drive API calls will fail far
    // downstream with `insufficient_scope` and no obvious cause. Refusing
    // the exchange here gives the client a clean signal to re-prompt with
    // `prompt=consent` and explain what's missing.
    const grantedScopes = new Set((tokens.scope ?? '').split(' '));
    const missingScopes = REQUIRED_DRIVE_SCOPES.filter(
      (s) => !grantedScopes.has(s)
    );
    if (missingScopes.length > 0) {
      throw needsConsent(
        'partial-consent',
        `partial-consent: missing required scopes: ${missingScopes.join(', ')}`
      );
    }

    // Google only issues a refresh_token on the FIRST consent (or when
    // `prompt=consent` is forced). If we don't get one, leave the existing
    // stored token in place (if any) — this exchange was a re-authorization
    // that doesn't re-issue the refresh leg.
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
 *
 * Throws `failed-precondition` with `details.reason = 'needs-consent'` when
 * the client must re-route through the auth-code flow (no stored token,
 * decrypt failed, or Google returned `invalid_grant`). Throws `internal` with
 * `details.reason = 'transient'` for retryable failures.
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
      throw needsConsent(
        'no-stored-token',
        'needs-consent: no refresh token stored for this user.'
      );
    }
    const stored = parseStoredGoogleAuth(snap.data());
    if (!stored) {
      // Shape drift in Firestore — drop the doc and force re-consent.
      await ref.delete().catch((delErr) => {
        logWarn('refreshGoogleAccessToken.deletePoisonDoc', delErr, { uid });
      });
      throw needsConsent(
        'decrypt-failed',
        'needs-consent: stored refresh token document has an unexpected shape.'
      );
    }

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
      logWarn('refreshGoogleAccessToken.decrypt', err, { uid });
      await ref.delete().catch((delErr) => {
        logWarn('refreshGoogleAccessToken.deletePoisonDoc', delErr, { uid });
      });
      throw needsConsent(
        'decrypt-failed',
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
      if (!res.data.access_token) {
        throw transientError('Google refresh returned no access_token.');
      }
      return {
        accessToken: res.data.access_token,
        expiresIn: res.data.expires_in,
      };
    } catch (err) {
      // Narrow via `axios.isAxiosError` before reading `.response.data` so a
      // non-axios failure (e.g. a TypeError from surrounding code) doesn't
      // get misclassified as a Google API error. Only axios errors carry
      // the `invalid_grant` signal we need to recognize.
      if (err instanceof HttpsError) throw err;
      if (axios.isAxiosError(err)) {
        const googleErr = (err.response?.data as { error?: string })?.error;
        if (googleErr === 'invalid_grant') {
          // Refresh token revoked (user disconnected at myaccount.google.com,
          // password reset, etc.). Drop the stored token so the next refresh
          // call surfaces `needs-consent` cleanly and the client re-routes
          // through the code flow rather than looping on a dead token.
          await ref.delete().catch((delErr) => {
            logWarn('refreshGoogleAccessToken.deletePoisonDoc', delErr, {
              uid,
            });
          });
          throw needsConsent(
            'invalid-grant',
            'needs-consent: stored refresh token was revoked.'
          );
        }
        throw transientError(
          `Google refresh failed: ${googleErr ?? err.message}`
        );
      }
      throw transientError(
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
    const stored = parseStoredGoogleAuth(snap.data());
    let plaintext: string | null = null;
    if (stored) {
      try {
        plaintext = decryptRefreshToken(
          stored.encryptedRefreshToken,
          GOOGLE_OAUTH_REFRESH_TOKEN_KEY.value()
        );
      } catch (err) {
        // Encryption key rotated and we can no longer decrypt — still drop
        // the stored doc so future calls don't keep failing on it.
        logWarn('revokeGoogleRefreshToken.decrypt', err, { uid });
        plaintext = null;
      }
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
        .catch((err) => {
          // Best-effort revoke. Google may have already invalidated the
          // token (`invalid_token` response) — that's fine, deleting the
          // local copy is the load-bearing step. But network failures,
          // 5xx responses, and `invalid_client` (deployment-time
          // misconfiguration) are all worth surfacing in logs so ops can
          // see sustained revoke endpoint regressions.
          logWarn('revokeGoogleRefreshToken.revokeEndpoint', err, { uid });
        });
    }
    await ref.delete();
    return { revoked: true };
  }
);
