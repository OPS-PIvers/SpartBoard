/**
 * Pure routing helpers for the student quiz-join flow.
 *
 * Deliberately free of Firebase / DOM / React imports so they can be unit
 * tested in isolation and reused by both the login page and the join flow.
 */

/**
 * Validate a post-login redirect target read from a `?next=` query param.
 *
 * SECURITY: the returned value is handed to `window.location.assign`, so an
 * unvalidated value is an open-redirect (phishing) vector. We accept ONLY a
 * root-relative path to a known student-join route:
 *   - must start with a single `/` (reject `//host` protocol-relative URLs),
 *   - must contain no backslash (some engines normalise `\` to `/`),
 *   - its path (sans query/hash) must be exactly `/quiz` or `/join`.
 *
 * Anything else returns `null` and the caller should fall back to its default
 * destination.
 */
export function resolveNextTarget(rawNext: string | null): string | null {
  if (!rawNext) return null;
  if (
    !rawNext.startsWith('/') ||
    rawNext.startsWith('//') ||
    rawNext.includes('\\')
  ) {
    return null;
  }
  // Compare on the path alone so `/quiz?code=ABC` (with its query) is allowed.
  const path = rawNext.split(/[?#]/)[0];
  return path === '/quiz' || path === '/join' ? rawNext : null;
}

/**
 * Decide whether an anonymous quiz joiner should be steered to Google SSO
 * instead of the PIN+period path. True only when:
 *   - the feature flag is on,
 *   - the visitor isn't already an SSO `studentRole` user (they auto-join),
 *   - we're not embedded in the Classroom add-on iframe (own auth handshake),
 *   - a join code is present, and
 *   - the session is ClassLink-rostered (`classIds` non-empty).
 *
 * The last condition is the key one: only ClassLink sessions can fork a
 * submission onto the wrong roster slot via a wrong PIN-period, and only they
 * have an SSO identity to fall back to. PIN-only sessions stay on the PIN path.
 */
export function shouldGateToSso(args: {
  flagEnabled: boolean;
  isStudentRole: boolean;
  embedded: boolean;
  hasCode: boolean;
  classIds: string[] | undefined;
}): boolean {
  return (
    args.flagEnabled &&
    !args.isStudentRole &&
    !args.embedded &&
    args.hasCode &&
    Array.isArray(args.classIds) &&
    args.classIds.length > 0
  );
}
