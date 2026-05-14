/**
 * Client-side glue for the Phase-B server-side refresh-token flow.
 *
 * Three operations sit behind this module:
 * 1. `requestAndExchangeAuthCode` — drives the GIS code client to capture
 *    a one-time authorization code, then calls the `exchangeGoogleAuthCode`
 *    Cloud Function to swap it for tokens. The refresh_token never reaches
 *    the browser; only a fresh access_token comes back.
 * 2. `refreshAccessTokenViaBackend` — asks the backend for a fresh
 *    access_token using the stored refresh_token. Returns null + the
 *    needs-consent flag when there's no usable refresh_token, so callers
 *    can decide whether to escalate to the code flow.
 * 3. `revokeBackendRefreshToken` — drops the stored token (both locally
 *    on Google's side and in our private Firestore path). Wired into
 *    the sidebar "Disconnect" button.
 *
 * All three are no-ops in `isAuthBypass` mode — the mock user never
 * touches real Google APIs.
 */

import { httpsCallable } from 'firebase/functions';
import {
  functions,
  isAuthBypass,
  GOOGLE_OAUTH_SCOPES,
} from '@/config/firebase';

/** Matches the Cloud Function's exchange response. */
export interface ExchangeAuthCodeResult {
  accessToken: string;
  expiresIn: number;
  hasRefreshToken: boolean;
}

/** Matches the Cloud Function's refresh response. */
export interface BackendRefreshResult {
  accessToken: string;
  expiresIn: number;
}

/** Outcome of the backend refresh path, distinguishing success from re-consent. */
export type BackendRefreshOutcome =
  | { status: 'ok'; token: string; expiresIn: number }
  | { status: 'needs-consent' }
  | { status: 'error'; message: string };

/**
 * Drive the GIS auth-code flow in popup mode and return the captured code.
 *
 * The redirect_uri Google uses internally for `ux_mode: 'popup'` is its own
 * `postmessage` endpoint — there is no external redirect URL to configure
 * in the Cloud Console. The function callable receives `redirectUri:
 * 'postmessage'` literally; Google's token endpoint accepts that as a
 * sentinel for the popup variant.
 */
const POPUP_REDIRECT_URI = 'postmessage';

const ensureGis = (): typeof google => {
  if (typeof window === 'undefined' || typeof window.google === 'undefined') {
    throw new Error(
      'Google Identity Services script has not loaded yet. Retry once the page settles.'
    );
  }
  return window.google;
};

/**
 * Show the GIS consent popup, capture the resulting authorization code,
 * and hand it to the Cloud Function for exchange. Returns the fresh
 * access_token directly so the caller can install it without a second
 * round-trip.
 *
 * Resolves to null if the user dismisses the consent popup.
 */
export const requestAndExchangeAuthCode = async (
  clientId: string,
  hintEmail: string | undefined
): Promise<ExchangeAuthCodeResult | null> => {
  if (isAuthBypass) return null;

  const gis = ensureGis();
  const code = await new Promise<string | null>((resolve) => {
    const codeClient = gis.accounts?.oauth2?.initCodeClient({
      client_id: clientId,
      scope: GOOGLE_OAUTH_SCOPES.join(' '),
      ux_mode: 'popup',
      hint: hintEmail,
      // `access_type: 'offline'` is what makes Google issue a refresh_token.
      // Without it we'd be right back at the 1-hour TTL with no offline
      // recovery path. `prompt: 'consent'` forces the consent screen so the
      // refresh_token is reliably included (Google omits it on subsequent
      // consents to the same scopes otherwise). Both fields are valid on
      // `initCodeClient` config but aren't in older @types/google.accounts;
      // the cast below widens the parameter type to accept them.
      access_type: 'offline',
      prompt: 'consent',
      callback: (response: { code?: string; error?: string }) => {
        if (response.error || !response.code) {
          resolve(null);
          return;
        }
        resolve(response.code);
      },
      error_callback: () => resolve(null),
    } as Parameters<typeof gis.accounts.oauth2.initCodeClient>[0] & {
      access_type: string;
      prompt: string;
    });
    if (!codeClient) {
      resolve(null);
      return;
    }
    // `requestCode` is on the code-client surface but isn't typed in older
    // GIS @types — cast to a structural shape that exposes it.
    (codeClient as unknown as { requestCode: () => void }).requestCode();
  });

  if (!code) return null;

  const callable = httpsCallable<
    { code: string; redirectUri: string },
    ExchangeAuthCodeResult
  >(functions, 'exchangeGoogleAuthCode');
  const result = await callable({ code, redirectUri: POPUP_REDIRECT_URI });
  return result.data;
};

/**
 * Ask the backend for a fresh access_token. The backend uses the
 * stored refresh_token internally — never round-trips it to the client.
 *
 * Distinguishes:
 * - `ok` — fresh access_token in `token`
 * - `needs-consent` — no usable refresh_token; caller should escalate
 *   to the auth-code flow
 * - `error` — transient/unknown failure; caller may fall back to popup
 */
export const refreshAccessTokenViaBackend =
  async (): Promise<BackendRefreshOutcome> => {
    if (isAuthBypass) return { status: 'error', message: 'auth-bypass' };

    try {
      const callable = httpsCallable<void, BackendRefreshResult>(
        functions,
        'refreshGoogleAccessToken'
      );
      const res = await callable();
      if (!res.data?.accessToken) {
        return { status: 'error', message: 'no-token-in-response' };
      }
      return {
        status: 'ok',
        token: res.data.accessToken,
        expiresIn: res.data.expiresIn,
      };
    } catch (err) {
      // Firebase callable errors come back as { code, message } where code is
      // the HttpsError code string. Our backend uses `failed-precondition`
      // plus a `needs-consent:` message prefix for the re-consent path so the
      // client can react without ambiguity.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('needs-consent')) {
        return { status: 'needs-consent' };
      }
      return { status: 'error', message };
    }
  };

/**
 * Revoke and forget the stored refresh_token. Fire-and-forget from the
 * sidebar Disconnect button — failures are logged but don't block UI
 * state changes (we still want the client-side token cleared regardless).
 */
export const revokeBackendRefreshToken = async (): Promise<void> => {
  if (isAuthBypass) return;
  try {
    const callable = httpsCallable<void, { revoked: boolean }>(
      functions,
      'revokeGoogleRefreshToken'
    );
    await callable();
  } catch (err) {
    console.warn(
      '[googleOAuthRefresh] revokeGoogleRefreshToken failed (non-fatal):',
      err
    );
  }
};
