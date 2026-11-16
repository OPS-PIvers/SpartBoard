// Maps an extension's Google-verified email to a SpartBoard account only when a Google sign-in proved that account owns it.
import * as admin from './firebaseAdmin';

interface SignInUser {
  uid: string;
  emailVerified?: boolean;
  disabled?: boolean;
  providerData?: ReadonlyArray<{ providerId?: string; email?: string }>;
}

/** The account's uid only when a Google sign-in proved it owns the address; anyone can register an unverified password account. */
export function trustedSignInUid(user: SignInUser, email: string): string | null {
  if (user.disabled === true || user.emailVerified !== true) return null;
  const want = email.trim().toLowerCase();
  const google = (user.providerData ?? []).some(
    (p) =>
      p?.providerId === 'google.com' &&
      (p.email ?? '').trim().toLowerCase() === want
  );
  return google ? user.uid : null;
}

/** The trusted account for the address, null when there is none; other Auth errors are thrown. */
export async function trustedUserForEmail(
  email: string
): Promise<admin.auth.UserRecord | null> {
  const user = await admin
    .auth()
    .getUserByEmail(email)
    .catch((err: { code?: unknown }) => {
      if (err?.code === 'auth/user-not-found') return null;
      throw err;
    });
  return user && trustedSignInUid(user, email) ? user : null;
}

/** The Firebase uid that a Google sign-in proved owns this address, else null. */
export async function trustedUidForEmail(
  email: string
): Promise<string | null> {
  try {
    return (await trustedUserForEmail(email))?.uid ?? null;
  } catch {
    return null;
  }
}
