import {
  indexedDBLocalPersistence,
  inMemoryPersistence,
  setPersistence,
  signInAnonymously,
  signInWithCustomToken,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from '@/config/firebase';

/** The session a pinLoginV1 sign-in was minted for (rules scope it there), or null for any other user. */
export async function pinBridgeSessionId(user: User): Promise<string | null> {
  if (user.isAnonymous) return null;
  try {
    const { claims } = await user.getIdTokenResult();
    if (claims.pinLogin !== true) return null;
    return typeof claims.pinSessionId === 'string' ? claims.pinSessionId : '';
  } catch {
    // Unreadable claims join as before; rules still keep a PIN token to its session.
    return null;
  }
}

/** Signs in with a pinLoginV1 token kept in this tab only, so no other tab, app or later visit inherits it. */
export async function signInWithPinBridgeToken(token: string): Promise<void> {
  await setPersistence(auth, inMemoryPersistence);
  try {
    await signInWithCustomToken(auth, token);
  } catch (err) {
    // The join falls back to anonymous, whose uid must survive a reload.
    await setPersistence(auth, indexedDBLocalPersistence).catch(
      () => undefined
    );
    throw err;
  }
}

/** Replaces another session's PIN sign-in with an anonymous one saved to storage, so a fallback join survives a reload. */
export async function signInAnonymouslyOverPinBridge(): Promise<User> {
  const { user } = await signInAnonymously(auth);
  // Switched after sign-in so the PIN token is never written to storage on the way.
  await setPersistence(auth, indexedDBLocalPersistence).catch(() => undefined);
  return user;
}

/** Signs out a PIN sign-in restored from storage (saved before sign-ins stayed in their tab). */
export async function dropSavedPinSignIn(): Promise<void> {
  await auth.authStateReady();
  const user = auth.currentUser;
  // PIN sign-ins are custom tokens with no provider; skip the claims read (a network refresh) for Google users.
  if (!user || user.providerData.length > 0) return;
  if ((await pinBridgeSessionId(user)) !== null) await signOut(auth);
}
