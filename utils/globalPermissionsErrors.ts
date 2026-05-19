/**
 * Module-level dispatch for "global_permissions snapshot failed" errors.
 *
 * Modeled on `utils/driveAuthErrors.ts`. The toast is owned by
 * `DashboardProvider` (which consumes the dashboard toast queue), while
 * the failing snapshot lives in `AuthProvider`. Because Dashboard wraps
 * Auth (Dashboard is *inside* Auth in the provider tree), Auth can't
 * call into Dashboard directly — but a singleton dispatch is fine: the
 * provider that owns the toast queue registers itself once, and the
 * provider that detects the failure dispatches through this seam.
 *
 * The latch ensures we surface the error ONCE per session — the
 * snapshot retries internally, and a constant stream of toasts would
 * be more confusing than useful. If the underlying Firestore problem
 * gets resolved (network back, rules deployed, etc.), the user can
 * refresh; we don't try to auto-clear the latch.
 *
 * @see context/AuthContext.tsx — the dispatch site (snapshot error
 *   callback for `global_permissions`).
 * @see context/DashboardContext.tsx — registers the toast handler.
 */

type GlobalPermissionsErrorHandler = () => void;

let handler: GlobalPermissionsErrorHandler | null = null;
let latched = false;

/** Register (or clear) the toast dispatcher. Called by `DashboardProvider`. */
export const setGlobalPermissionsErrorHandler = (
  next: GlobalPermissionsErrorHandler | null
): void => {
  handler = next;
};

/**
 * Surface a "feature availability may be stale" toast. No-op if the
 * latch is already set for this session, so a snapshot that retries
 * five times in a row doesn't fan out five toasts.
 *
 * Returns `true` iff a toast was actually dispatched.
 */
export const reportGlobalPermissionsError = (): boolean => {
  if (latched) return false;
  if (!handler) return false;
  handler();
  latched = true;
  return true;
};

/**
 * Test-only: clear module-level state. Production code has no reason
 * to reset the latch — it's a one-shot per page load.
 */
export const __resetGlobalPermissionsErrorsForTests = (): void => {
  handler = null;
  latched = false;
};
