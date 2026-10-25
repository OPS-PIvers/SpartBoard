import { signInAnonymously, type Auth, type User } from 'firebase/auth';

/** A pinLoginV1 token only works in its own session, so swap one proven elsewhere back to anonymous to re-run the PIN join. */
export async function dropPinLoginFromOtherSession(
  auth: Auth,
  sessionId: string | null
): Promise<User | null> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return user;
  // Best effort: if the claims can't be read, rules still decide what the token reaches.
  let claims: Record<string, unknown>;
  try {
    claims = (await user.getIdTokenResult()).claims;
  } catch {
    return user;
  }
  if (claims.pinLogin !== true || claims.pinSessionId === sessionId) {
    return user;
  }
  await signInAnonymously(auth);
  return auth.currentUser;
}

/** Apps other than quiz and video never PIN-bridge, so a leftover pinLoginV1 token there goes back to anonymous. */
export function dropPinLogin(auth: Auth): Promise<User | null> {
  return dropPinLoginFromOtherSession(auth, null);
}
