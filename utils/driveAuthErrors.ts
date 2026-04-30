/**
 * Shared "Drive auth error" surface used across the platform.
 *
 * Any code that throws — or catches — a Google Drive 401/403 should route
 * through `reportDriveAuthError(err)`. The helper classifies the error,
 * de-dupes via a module-level latch, and dispatches the registered toast
 * handler so the teacher sees one actionable "Reconnect" prompt instead
 * of a wall of identical toasts.
 *
 * Architecturally the **services themselves** (`GoogleDriveService`,
 * `QuizDriveService`) call `reportDriveAuthError` before throwing auth
 * errors — this gives us platform-wide coverage without each individual
 * caller having to remember to opt in. New code that catches Drive errors
 * doesn't need to do anything special; the toast already fired.
 *
 * Latch lifecycle:
 * - Mounts with `latched = false`.
 * - First auth-error report flips it to `true` and dispatches the handler.
 * - All subsequent reports during the same stale-token episode are no-ops.
 * - When a *new* access token arrives (via `onDriveTokenChange`), the latch
 *   resets so the next stale episode triggers exactly one toast again.
 *
 * The toast handler is registered by `DashboardProvider`. `useGoogleDrive`
 * is consumed inside `DashboardProvider` itself, so the dashboard context
 * isn't available at hook-call time — the singleton dispatch pattern
 * sidesteps that ordering issue.
 */

/**
 * True for auth-related Drive failures — i.e. anything we'd surface to the
 * user as "your Drive session went stale, click Reconnect."
 *
 * The services throw plain `Error` instances (no custom subclass), so we
 * have to match on message content. Three signals:
 *  1. The explicit "Google Drive access expired" message thrown when a 401
 *     comes back AND `onTokenExpire` couldn't refresh the token.
 *  2. Any thrown message that embeds the literal HTTP status `401`.
 *  3. Any thrown message that embeds `403` (Drive returns 403 when the
 *     token has been revoked or its scopes were downgraded).
 *
 * Message-matching is brittle, but the alternative is plumbing a custom
 * error class through every throw site and that's a much larger refactor
 * for a fix that's about user-visible surfacing, not error taxonomy.
 */
export function isDriveAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message;
  if (!message) return false;
  if (message.includes('Google Drive access expired')) return true;
  if (message.includes('Google Sheets access is not granted')) return true;
  // Match standalone HTTP status numbers — word-boundary so file IDs that
  // happen to contain "401" don't false-positive.
  if (/\b(401|403)\b/.test(message)) return true;
  return false;
}

type DriveAuthErrorHandler = () => void;

let driveAuthErrorHandler: DriveAuthErrorHandler | null = null;
let driveAuthErrorLatched = false;
let lastSeenToken: string | null = null;

/** Register (or clear) the toast dispatcher. Called by `DashboardProvider`. */
export const setDriveAuthErrorHandler = (
  handler: DriveAuthErrorHandler | null
): void => {
  driveAuthErrorHandler = handler;
};

/**
 * Inspect any caught/thrown value. If it looks like a Drive auth failure,
 * fire the toast (subject to the de-dupe latch). Returns `true` iff the
 * input was classified as an auth error.
 *
 * The latch is set only AFTER a successful dispatch. If no handler is
 * registered yet (e.g. an early Drive call before `DashboardProvider`'s
 * effect runs), we leave the latch open so the next report — once a
 * handler exists — actually surfaces a toast. This avoids the race where
 * a pre-handler error would otherwise silence every subsequent toast in
 * the same stale-token episode.
 */
export const reportDriveAuthError = (err: unknown): boolean => {
  if (!isDriveAuthError(err)) return false;
  if (driveAuthErrorLatched) return true;
  if (!driveAuthErrorHandler) return true;
  driveAuthErrorHandler();
  driveAuthErrorLatched = true;
  return true;
};

/**
 * Construct an `Error` and route it through `reportDriveAuthError` before
 * returning it for the caller to throw. Use at every Drive/Sheets throw
 * site that represents an auth failure so the toast surfaces even when
 * the upstream caller swallows or transforms the error.
 *
 * Usage: `throw authError('Google Sheets access is not granted...')`.
 */
export const authError = (message: string): Error => {
  const err = new Error(message);
  reportDriveAuthError(err);
  return err;
};

/**
 * Re-arm the latch only when a *new* token arrives. Multiple
 * `useGoogleDrive` consumers all run an effect on mount, and they all see
 * the same current token; resetting unconditionally would clear the latch
 * each time a consumer mounted, defeating the de-dupe. Comparing against
 * `lastSeenToken` makes the reset fire exactly once per real token rotation.
 *
 * Sign-out (`token === null`) also resets the latch so a subsequent sign-in
 * with the same cached token (rare but possible: re-entering an unexpired
 * session) re-arms the toast for that session's first stale episode.
 */
export const onDriveTokenChange = (token: string | null): void => {
  if (token && token !== lastSeenToken) {
    lastSeenToken = token;
    driveAuthErrorLatched = false;
  } else if (!token) {
    lastSeenToken = null;
    driveAuthErrorLatched = false;
  }
};

/**
 * Test-only: clear all module-level state (handler, latch, last-seen token)
 * so unit tests don't leak state across cases. Production code should use
 * `setDriveAuthErrorHandler(null)` + a fresh token signal instead.
 */
export const __resetDriveAuthErrorsForTests = (): void => {
  driveAuthErrorHandler = null;
  driveAuthErrorLatched = false;
  lastSeenToken = null;
};
