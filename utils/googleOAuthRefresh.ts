/**
 * Client-side glue for the server-side Google refresh-token flow.
 *
 * Three operations sit behind this module:
 * 1. `requestAndExchangeAuthCode` — drives the GIS code client to capture
 *    a one-time authorization code, then calls the `exchangeGoogleAuthCode`
 *    Cloud Function to swap it for tokens. The refresh_token never reaches
 *    the browser; only a fresh access_token comes back.
 * 2. `refreshAccessTokenViaBackend` — asks the backend for a fresh
 *    access_token using the stored refresh_token. Returns a discriminated
 *    outcome so callers can decide whether to escalate to the code flow,
 *    retry, or fall back to the Firebase popup.
 * 3. `revokeBackendRefreshToken` — drops the stored token (both on Google's
 *    side and in our private Firestore path).
 *
 * All three are no-ops in `isAuthBypass` mode.
 */

import { httpsCallable, FunctionsError } from 'firebase/functions';
import {
  functions,
  isAuthBypass,
  GOOGLE_OAUTH_SCOPES,
} from '@/config/firebase';
import { logError } from '@/utils/logError';

export interface ExchangeAuthCodeResult {
  accessToken: string;
  expiresIn: number;
  hasRefreshToken: boolean;
}

export interface BackendRefreshResult {
  accessToken: string;
  expiresIn: number;
}

/**
 * Outcome of the auth-code popup + exchange round-trip.
 *
 * - `success` — fresh access_token captured and persisted on the server
 * - `cancelled` — the user dismissed the consent popup; expected, silent
 * - `error` — real failure (GIS error_callback, popup blocked, network
 *   issue, backend exchange rejected). The `reason` is stable enough to
 *   triage (`access_denied`, `admin_policy_enforced`, `popup-failed`,
 *   `partial-consent`, etc.). Caller should log and may surface UX.
 * - `needs-consent` — backend rejected the grant for a structural reason
 *   (partial-consent, decrypt-failed). Caller must re-prompt with a
 *   different message; falling back to the Firebase popup will hit the
 *   same rejection.
 */
export type AuthCodeOutcome =
  | { kind: 'success'; result: ExchangeAuthCodeResult }
  | { kind: 'cancelled' }
  | { kind: 'error'; reason: string }
  | { kind: 'needs-consent'; cause: string };

/**
 * Outcome of `refreshAccessTokenViaBackend`.
 *
 * - `ok` — fresh access_token in `token`
 * - `needs-consent` — no usable refresh_token on the server; caller must
 *   re-route through the auth-code flow
 * - `error` — transient/unknown failure; caller may fall back to popup
 */
export type BackendRefreshOutcome =
  | { status: 'ok'; token: string; expiresIn: number }
  | { status: 'needs-consent'; cause: string }
  | { status: 'error'; message: string };

/**
 * Server-side `RefreshErrorDetails` payload. Kept in sync with the type of
 * the same name in `functions/src/googleOAuth.ts`. A drift here breaks the
 * needs-consent UX silently, so the test suite locks the literal values.
 */
type RefreshErrorDetails =
  | { reason: 'needs-consent'; cause: string }
  | { reason: 'transient' };

/**
 * The redirect_uri Google uses internally for `ux_mode: 'popup'` is its own
 * `postmessage` endpoint — there is no external redirect URL to configure
 * in the Cloud Console. The function callable receives `redirectUri:
 * 'postmessage'` literally; Google's token endpoint accepts that as a
 * sentinel for the popup variant.
 */
const POPUP_REDIRECT_URI = 'postmessage';

const GIS_LOAD_TIMEOUT_MS = 5_000;
const GIS_LOAD_POLL_MS = 100;

const ensureGis = async (): Promise<typeof google> => {
  if (typeof window === 'undefined') {
    throw new Error('Google Identity Services is unavailable outside browser.');
  }
  if (typeof window.google !== 'undefined') return window.google;
  // GIS script loads asynchronously; if a refresh is requested before
  // the script settles we'd otherwise throw. Poll briefly so a transient
  // load race doesn't escalate to the Firebase popup fallback.
  const deadline = Date.now() + GIS_LOAD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, GIS_LOAD_POLL_MS));
    if (typeof window.google !== 'undefined') return window.google;
  }
  throw new Error(
    `Google Identity Services script did not load within ${GIS_LOAD_TIMEOUT_MS}ms.`
  );
};

function isFunctionsError(err: unknown): err is FunctionsError {
  return (
    err instanceof Error &&
    typeof (err as Partial<FunctionsError>).code === 'string'
  );
}

/**
 * Extract a `RefreshErrorDetails` payload from a Firebase callable error if
 * the server provided one. Returns null otherwise. Reading structured
 * `details` is preferable to sniffing the message string, which is brittle
 * across server-side message changes.
 */
function readRefreshErrorDetails(err: unknown): RefreshErrorDetails | null {
  if (!isFunctionsError(err)) return null;
  const details = err.details;
  if (!details || typeof details !== 'object') return null;
  const d = details as Record<string, unknown>;
  if (d.reason === 'needs-consent') {
    const cause = typeof d.cause === 'string' ? d.cause : 'unknown';
    return { reason: 'needs-consent', cause };
  }
  if (d.reason === 'transient') return { reason: 'transient' };
  return null;
}

/**
 * Show the GIS consent popup, capture the resulting authorization code,
 * and hand it to the Cloud Function for exchange. Returns a discriminated
 * outcome so callers can distinguish user cancellation (silent) from real
 * failures (log + maybe surface UX).
 */
export const requestAndExchangeAuthCode = async (
  clientId: string,
  hintEmail: string | undefined,
  // On-demand scopes (fully-qualified URLs) acquired this session via
  // `ensureGoogleScope`. The code flow is what captures a fresh refresh_token,
  // so the captured grant must include these or the backend refresh would only
  // ever reissue a `drive.file`-only token — re-stripping Sheets/Calendar after
  // every backend refresh. Unioned with `GOOGLE_OAUTH_SCOPES` and de-duped
  // below. Existing Orono users already consented, so `prompt:'consent'` here
  // still succeeds; the union just keeps the grant from shrinking.
  extraScopes: readonly string[] = []
): Promise<AuthCodeOutcome> => {
  if (isAuthBypass) return { kind: 'cancelled' };

  const requestedScope = Array.from(
    new Set([...GOOGLE_OAUTH_SCOPES, ...extraScopes])
  ).join(' ');

  let gis: typeof google;
  try {
    gis = await ensureGis();
  } catch (err) {
    return {
      kind: 'error',
      reason: err instanceof Error ? err.message : 'gis-load-failed',
    };
  }

  type CodeOutcome =
    | { kind: 'code'; code: string }
    | { kind: 'cancelled' }
    | { kind: 'error'; reason: string };

  // The Promise executor and the `requestCode()` call below can both throw
  // synchronously (older @types/google.accounts versions, an unloaded
  // `oauth2` namespace, popup-blocker policy violations, etc.). A throw
  // from the executor would reject the Promise and propagate up through
  // the `await`, bypassing the discriminated `AuthCodeOutcome` contract
  // and starving the caller's fallback chain. Wrap both seams so any
  // synchronous throw resolves cleanly into a `{ kind: 'error' }` outcome.
  const codeOutcome = await new Promise<CodeOutcome>((resolve) => {
    try {
      const codeClient = gis.accounts?.oauth2?.initCodeClient({
        client_id: clientId,
        scope: requestedScope,
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
          if (response.error) {
            // Real GIS error: `access_denied` (user revoked mid-flow),
            // `admin_policy_enforced` (Workspace admin blocks the grant),
            // `interaction_required` (silent path forced), etc.
            resolve({ kind: 'error', reason: response.error });
            return;
          }
          if (!response.code) {
            resolve({ kind: 'cancelled' });
            return;
          }
          resolve({ kind: 'code', code: response.code });
        },
        error_callback: (err: unknown) => {
          const reason =
            (err as { type?: string; message?: string })?.type ??
            (err as { message?: string })?.message ??
            'gis-error-callback';
          resolve({ kind: 'error', reason });
        },
      } as Parameters<typeof gis.accounts.oauth2.initCodeClient>[0] & {
        access_type: string;
        prompt: string;
      });
      if (!codeClient) {
        resolve({ kind: 'error', reason: 'init-code-client-failed' });
        return;
      }
      // `requestCode` is on the code-client surface but isn't typed in older
      // GIS @types — cast to a structural shape that exposes it.
      (codeClient as unknown as { requestCode: () => void }).requestCode();
    } catch (err) {
      resolve({
        kind: 'error',
        reason:
          err instanceof Error ? err.message : `gis-init-threw: ${String(err)}`,
      });
    }
  });

  if (codeOutcome.kind === 'cancelled') return { kind: 'cancelled' };
  if (codeOutcome.kind === 'error') return codeOutcome;

  try {
    const callable = httpsCallable<
      { code: string; redirectUri: string },
      ExchangeAuthCodeResult
    >(functions, 'exchangeGoogleAuthCode');
    const result = await callable({
      code: codeOutcome.code,
      redirectUri: POPUP_REDIRECT_URI,
    });
    return { kind: 'success', result: result.data };
  } catch (err) {
    const details = readRefreshErrorDetails(err);
    if (details?.reason === 'needs-consent') {
      return { kind: 'needs-consent', cause: details.cause };
    }
    return {
      kind: 'error',
      reason: err instanceof Error ? err.message : String(err),
    };
  }
};

/**
 * Ask the backend for a fresh access_token. The backend uses the
 * stored refresh_token internally — never round-trips it to the client.
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
        // Backend returned 200 without the load-bearing field. Surface to
        // ops — this represents a backend-contract regression, not a normal
        // failure mode.
        logError(
          'googleOAuthRefresh.refreshAccessTokenViaBackend',
          new Error('Backend returned 200 with no accessToken field')
        );
        return { status: 'error', message: 'no-token-in-response' };
      }
      return {
        status: 'ok',
        token: res.data.accessToken,
        expiresIn: res.data.expiresIn,
      };
    } catch (err) {
      // Prefer structured `details.reason` over string-sniffing the message.
      // A server-side message rephrasing would otherwise silently downgrade
      // `needs-consent` to `error` and the user would loop on the Firebase
      // popup instead of being re-routed through the auth-code flow.
      const details = readRefreshErrorDetails(err);
      if (details?.reason === 'needs-consent') {
        return { status: 'needs-consent', cause: details.cause };
      }
      const message = err instanceof Error ? err.message : String(err);
      logError('googleOAuthRefresh.refreshAccessTokenViaBackend', err);
      return { status: 'error', message };
    }
  };

/**
 * Revoke and forget the stored refresh_token. Awaited by the sidebar
 * Disconnect button so the user sees a truthful success/failure signal —
 * the privacy expectation is that "Disconnect" actually disconnects, not
 * just clears local state.
 *
 * Throws on backend failure so callers can surface a toast. Callers that
 * truly want fire-and-forget should wrap in `try/catch`.
 */
export const revokeBackendRefreshToken = async (): Promise<void> => {
  if (isAuthBypass) return;
  const callable = httpsCallable<void, { revoked: boolean }>(
    functions,
    'revokeGoogleRefreshToken'
  );
  await callable();
};
