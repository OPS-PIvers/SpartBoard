/**
 * Google-session guard for teacher surfaces rendered inside cross-origin
 * iframes (the Schoology LTI deep-link picker / grader, the Google Classroom
 * add-on discovery route).
 *
 * Why this exists: inside a cross-origin iframe, Firebase Auth uses partitioned
 * storage, and `onAuthStateChanged` restores ANY Firebase session left in that
 * partition — including a leftover `studentRole` custom-token user from a prior
 * student launch in the SAME partition. Those teacher surfaces only function as
 * the teacher's own Google account (they list/load the teacher's Drive-backed
 * quiz library), so a bare `!!user` check is wrong: it treats a student/anonymous
 * session as "signed in", silently operating under the wrong uid (an empty
 * library) and never offering the Google sign-in the teacher actually needs.
 *
 * Anonymous and custom-token sessions carry an empty `providerData`; only an
 * interactive Google sign-in adds a `google.com` provider entry. Gate on that.
 */

/** The slice of a Firebase `UserInfo`/`User` this guard reads. */
type ProviderInfoLike = { readonly providerId?: string | null };

/**
 * True when the Firebase user authenticated through Google (the `google.com`
 * provider) — i.e. a real teacher session, not an anonymous or custom-token
 * (e.g. `studentRole`) session. Returns false for null/undefined.
 */
export function isGoogleSession(
  user:
    | { readonly providerData?: ReadonlyArray<ProviderInfoLike> }
    | null
    | undefined
): boolean {
  return !!user?.providerData?.some((p) => p.providerId === 'google.com');
}
