/** Session fields that decide whether a no-sign-in (PIN) joiner may enter. */
export interface AnonymousJoinSessionFields {
  allowAnonymousJoin?: boolean;
  mode?: string;
}

/** Sign-in-only message shown in place of the PIN form. */
export const ANONYMOUS_JOIN_BLOCKED_MESSAGE = 'Sign in to join this activity.';

/** True when the teacher lacked `anonymous-join` at create time; view-only shares and unstamped sessions stay open. */
export function isAnonymousJoinBlocked(
  session: AnonymousJoinSessionFields | null | undefined
): boolean {
  if (!session) return false;
  return session.allowAnonymousJoin === false && session.mode !== 'view-only';
}
