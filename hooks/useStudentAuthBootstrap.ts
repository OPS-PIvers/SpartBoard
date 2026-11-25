import { useEffect, useState } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { dropPinLogin } from '@/utils/pinLoginScope';
import { logError } from '@/utils/logError';

export interface StudentAuthBootstrapOptions {
  /** False skips sign-in entirely (teacher preview links). */
  enabled?: boolean;
  /** Quiz and Video Activity keep a PIN-bridge token; every other app drops it. */
  keepPinLogin?: boolean;
  /** /join still signs in anonymously when IndexedDB hydration fails. */
  continueOnHydrationError?: boolean;
  /** Tag for the error log when sign-in fails. */
  label: string;
}

export interface StudentAuthBootstrap {
  ready: boolean;
  failed: boolean;
  uid: string | null;
  /** The ClassLink or Classroom `studentRole` claim. */
  isStudentRole: boolean;
  /** A `pinLoginV1` token: signed in for one session only. */
  isPinLogin: boolean;
  /** The token's `classIds` claim; empty for anonymous joiners. */
  classIds: string[];
}

const INITIAL: StudentAuthBootstrap = {
  ready: false,
  failed: false,
  uid: null,
  isStudentRole: false,
  isPinLogin: false,
  classIds: [],
};

/** The one student-app sign-in: wait for hydration, keep an SSO user, else sign in anonymously. */
export async function bootstrapStudentAuth(
  options: Omit<StudentAuthBootstrapOptions, 'enabled'>
): Promise<StudentAuthBootstrap> {
  try {
    // Awaiting hydration stops a full-page hop from /my-assignments demoting the SSO user.
    try {
      await auth.authStateReady();
    } catch (err) {
      if (!options.continueOnHydrationError) throw err;
      console.warn(`[${options.label}] authStateReady failed:`, err);
    }
    if (!options.keepPinLogin) await dropPinLogin(auth);
    const existing = auth.currentUser;
    const user = existing ?? (await signInAnonymously(auth)).user;
    const result: StudentAuthBootstrap = {
      ...INITIAL,
      ready: true,
      uid: user.uid,
    };
    if (existing && !existing.isAnonymous) {
      const { claims } = await existing.getIdTokenResult();
      result.isStudentRole = claims?.studentRole === true;
      result.isPinLogin = claims?.pinLogin === true;
      const raw: unknown = claims?.classIds;
      if (Array.isArray(raw)) {
        result.classIds = raw.filter(
          (id): id is string => typeof id === 'string' && id.length > 0
        );
      }
    }
    return result;
  } catch (err) {
    logError(`${options.label}.authInit`, err);
    return {
      ...INITIAL,
      ready: true,
      failed: true,
      uid: auth.currentUser?.uid ?? null,
    };
  }
}

/** Runs `bootstrapStudentAuth` once on mount. */
export function useStudentAuthBootstrap({
  enabled = true,
  keepPinLogin = false,
  continueOnHydrationError = false,
  label,
}: StudentAuthBootstrapOptions): StudentAuthBootstrap {
  const [state, setState] = useState<StudentAuthBootstrap>(INITIAL);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void bootstrapStudentAuth({
      keepPinLogin,
      continueOnHydrationError,
      label,
    }).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, keepPinLogin, continueOnHydrationError, label]);
  return state;
}
