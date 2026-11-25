import { LEGACY_PIN_TOKEN_GRACE_MS } from './viewAsGuard';

const nonEmptyIds = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((c): c is string => typeof c === 'string' && c.length > 0)
    : [];

/** The session's targeted classes: its `classIds` list, else a legacy single `classId`. */
function sessionClassesOf(session: Record<string, unknown>): string[] {
  const listed = nonEmptyIds(session.classIds);
  return listed.length ? listed : nonEmptyIds([session.classId]);
}

const sharesClass = (
  session: Record<string, unknown>,
  claims: Record<string, unknown>
): boolean => {
  const tokenClasses = nonEmptyIds(claims.classIds);
  return sessionClassesOf(session).some((c) => tokenClasses.includes(c));
};

/** A PIN token proves one session; a pre-scope one in grace, one targeted class (as getMyQuizAttempts). */
export function pinTokenReachesSession(
  claims: Record<string, unknown>,
  sessionId: string,
  session: Record<string, unknown>,
  now: number
): boolean {
  if (claims.pinLogin !== true) return true;
  if (claims.pinSessionId !== undefined) {
    return claims.pinSessionId === sessionId;
  }
  if (
    typeof claims.auth_time !== 'number' ||
    now >= claims.auth_time * 1000 + LEGACY_PIN_TOKEN_GRACE_MS
  ) {
    return false;
  }
  return sharesClass(session, claims);
}

/** Student tokens reach a session only through their PIN scope or a shared targeted class (#4678); others pass. */
export function studentTokenReachesSession(
  claims: Record<string, unknown>,
  sessionId: string,
  session: Record<string, unknown>,
  now: number
): boolean {
  if (claims.pinLogin === true) {
    return pinTokenReachesSession(claims, sessionId, session, now);
  }
  if (claims.studentRole !== true) return true;
  if (sessionClassesOf(session).length === 0) return true;
  return sharesClass(session, claims);
}
