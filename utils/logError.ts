/**
 * Structured error logging for ops visibility.
 *
 * Wraps `console.error` with a consistent shape so log aggregation
 * (today: browser console + Functions logs; tomorrow: Sentry/Bugsnag)
 * can be wired in at this single seam without touching every call
 * site. Each call carries a stable `scope` string ("useQuiz.saveQuiz",
 * "Widget.onSyncAssignment", etc.) so a grep across the codebase shows
 * exactly which paths produced which errors.
 *
 * Why not just `console.error`? Because every call site that already
 * uses `console.error` does so in a slightly different shape — some
 * pass `(message, err)`, some pass `(err)`, some interpolate. Filtering
 * for "all sync-related failures last week" requires scanning
 * stringified output. Funneling through `logError` lets us:
 *   1. Standardize the prefix so logs are grep-able.
 *   2. Capture optional structured context (uid, groupId, assignmentId)
 *      that the bare console.error path drops.
 *   3. Swap in a real reporter (e.g. Sentry.captureException) by
 *      changing this one file.
 *
 * If/when Sentry or another error-reporting backend lands, replace the
 * `console.error` body below — DO NOT add a second logger at call
 * sites. The contract is "every reportable error goes through this
 * function."
 */

interface LogErrorContext {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Report an error from the application surface.
 *
 * @param scope - A stable, dotted identifier of where the error happened
 *   (e.g. `'Widget.onSyncAssignment'`, `'useQuiz.saveQuiz'`). Keep
 *   stable across releases so log queries don't break.
 * @param error - The thrown error or other rejection reason.
 * @param context - Optional flat key/value bag of structured data the
 *   triage flow needs (uid, groupId, assignmentId, etc.). Avoid putting
 *   PII here — the same logs may end up in third-party telemetry.
 */
export function logError(
  scope: string,
  error: unknown,
  context?: LogErrorContext
): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  // Keep the console.error shape predictable: `[scope] message {context}`
  // followed by the original error so the dev-tools "expand to view
  // stack trace" affordance still works.
  console.error(
    `[${scope}] ${message}`,
    {
      ...(context ?? {}),
      ...(stack ? { stack } : {}),
    },
    error
  );
}
