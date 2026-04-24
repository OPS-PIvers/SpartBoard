import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  onIdTokenChanged,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { auth, isAuthBypass } from '@/config/firebase';
import {
  useStudentIdleTimeout,
  STUDENT_LOGIN_PATH,
} from '@/hooks/useStudentIdleTimeout';
import {
  StudentAuthContext,
  type StudentAuthStatus,
  type StudentAuthValue,
} from './StudentAuthContextValue';

/**
 * StudentAuthContext — Phase 2B of the ClassLink-via-Google auth flow.
 *
 * This provider is SEPARATE from the teacher `AuthContext`. A route uses one
 * or the other, never both. The student context exposes only what a student
 * page needs to render assignments: the opaque pseudonym UID, the org id, and
 * the list of ClassLink class sourcedIds — all sourced from custom claims on
 * the custom token minted by `studentLoginV1`.
 *
 * Hard PII rules (enforced here):
 *   - Never read `user.email`, `user.displayName`, or `user.providerData`.
 *   - Never log or persist the raw ID token, `sub`, email, or name.
 *   - The only identifier we touch is `user.uid` (the pseudonym) plus the
 *     three custom claims we mint ourselves: `studentRole`, `orgId`,
 *     `classIds`.
 *
 * Shared-device hygiene:
 *   - 15-minute idle timeout on activity listeners → auto sign-out + redirect.
 *   - `signOut()` exposed for an explicit "Done" button on student pages.
 *   - `<RequireStudentAuth>` wrapper renders nothing while redirecting, so
 *     stale content never flashes between pages.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Protected student-facing routes. `/student/login` is NOT protected. */
const PROTECTED_STUDENT_PATH_PREFIXES: readonly string[] = [
  '/my-assignments',
  '/student/assignments', // Reserved for future use.
];

const isProtectedStudentRoute = (pathname: string): boolean =>
  PROTECTED_STUDENT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

// ---------------------------------------------------------------------------
// Claim validation
// ---------------------------------------------------------------------------

interface ValidatedStudentClaims {
  orgId: string;
  classIds: string[];
}

/** Reason a claim set was rejected — surfaced on the login screen. */
export type StudentClaimRejectionReason = 'no-classes' | 'invalid-claims';

type ClaimExtractionResult =
  | { ok: true; value: ValidatedStudentClaims }
  | { ok: false; reason: StudentClaimRejectionReason };

/**
 * Validate that the signed-in user carries the custom claims we mint in
 * `studentLoginV1`. On failure returns a reason so the login screen can
 * explain why the student was bounced (instead of a silent redirect loop).
 */
async function extractStudentClaims(
  user: User
): Promise<ClaimExtractionResult> {
  // Force a refresh on the first call per mount so a stale cached token
  // from a previous student's session can't leak into this one. Firebase
  // transparently uses the refresh token; no network round-trip when the
  // local token is still fresh.
  const result = await user.getIdTokenResult();
  const claims = result.claims;

  if (claims.studentRole !== true) {
    return { ok: false, reason: 'invalid-claims' };
  }
  if (typeof claims.orgId !== 'string' || claims.orgId.length === 0) {
    return { ok: false, reason: 'invalid-claims' };
  }
  const rawClassIds: unknown = claims.classIds;
  if (!Array.isArray(rawClassIds)) {
    return { ok: false, reason: 'invalid-claims' };
  }
  if (!rawClassIds.every((c): c is string => typeof c === 'string')) {
    return { ok: false, reason: 'invalid-claims' };
  }
  // Distinguish "no classes yet" from other malformed-claim cases: the
  // student is a valid account but isn't on any roster. This is the most
  // common soft-failure path and deserves its own login-screen message.
  if (rawClassIds.length === 0) {
    return { ok: false, reason: 'no-classes' };
  }

  return { ok: true, value: { orgId: claims.orgId, classIds: rawClassIds } };
}

// ---------------------------------------------------------------------------
// Auth-bypass mock (dev/testing only; mirrors the teacher bypass pattern).
// ---------------------------------------------------------------------------

const MOCK_STUDENT: Omit<StudentAuthValue, 'signOut'> & {
  status: 'authenticated';
} = {
  status: 'authenticated',
  pseudonymUid: 'mock-student',
  orgId: 'mock-org',
  classIds: ['mock-class-1'],
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ProviderState {
  status: StudentAuthStatus;
  pseudonymUid: string | null;
  orgId: string | null;
  classIds: string[];
}

const INITIAL_STATE: ProviderState = {
  status: 'loading',
  pseudonymUid: null,
  orgId: null,
  classIds: [],
};

const UNAUTH_STATE: ProviderState = {
  status: 'unauthenticated',
  pseudonymUid: null,
  orgId: null,
  classIds: [],
};

/**
 * Redirect to `/student/login` iff we're currently on a protected route.
 * Never yanks a user away from the login page itself (which would cause an
 * infinite reload loop) or from unrelated app surfaces. An optional reason
 * is forwarded as `?reason=<kind>` so the login screen can explain the bounce
 * instead of leaving the student to guess.
 */
function redirectToLoginIfProtected(
  reason?: StudentClaimRejectionReason
): void {
  if (typeof window === 'undefined') return;
  if (!isProtectedStudentRoute(window.location.pathname)) return;
  const target = reason
    ? `${STUDENT_LOGIN_PATH}?reason=${encodeURIComponent(reason)}`
    : STUDENT_LOGIN_PATH;
  window.location.assign(target);
}

export const StudentAuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<ProviderState>(() =>
    isAuthBypass
      ? {
          status: MOCK_STUDENT.status,
          pseudonymUid: MOCK_STUDENT.pseudonymUid,
          orgId: MOCK_STUDENT.orgId,
          classIds: MOCK_STUDENT.classIds,
        }
      : INITIAL_STATE
  );

  // Track whether the provider is still mounted so async claim resolution
  // doesn't set state on an unmounted component.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Subscribe to onIdTokenChanged (NOT onAuthStateChanged) so claim updates
  // from a token refresh (e.g. when a student joins a new class mid-session)
  // propagate without requiring a full sign-out/sign-in cycle.
  useEffect(() => {
    if (isAuthBypass) return;

    const unsubscribe = onIdTokenChanged(auth, (user) => {
      if (!user) {
        if (!mountedRef.current) return;
        setState(UNAUTH_STATE);
        redirectToLoginIfProtected();
        return;
      }

      // Resolve claims asynchronously; guard against races by capturing the
      // user reference we started with.
      void extractStudentClaims(user).then(
        (outcome) => {
          if (!mountedRef.current) return;
          // If the user changed between resolution starting and finishing,
          // a newer callback will reset state — bail to avoid clobbering.
          if (auth.currentUser?.uid !== user.uid) return;

          if (!outcome.ok) {
            // Signed in, but not a student (e.g. teacher account), claims
            // are malformed, OR the student is valid but isn't on any
            // roster yet. Force a sign-out so the stale session can't
            // linger on a shared device, then redirect with a reason so
            // the login screen can explain the bounce.
            void firebaseSignOut(auth).catch(() => {
              // Swallow — the redirect below is the actual remediation.
            });
            setState(UNAUTH_STATE);
            redirectToLoginIfProtected(outcome.reason);
            return;
          }

          setState({
            status: 'authenticated',
            pseudonymUid: user.uid,
            orgId: outcome.value.orgId,
            classIds: outcome.value.classIds,
          });
        },
        () => {
          if (!mountedRef.current) return;
          setState(UNAUTH_STATE);
          redirectToLoginIfProtected('invalid-claims');
        }
      );
    });

    return unsubscribe;
  }, []);

  // Idle timeout (15 minutes). `useStudentIdleTimeout` owns the listeners,
  // throttle, timer, and sign-out+redirect. Armed only for authenticated
  // student sessions; bypass mode and teacher previews never arm it.
  useStudentIdleTimeout(!isAuthBypass && state.status === 'authenticated');

  // --- Imperative sign-out (exposed on context) -----------------------------
  const signOut = useCallback(async () => {
    if (isAuthBypass) {
      // Bypass mode: simulate a sign-out by flipping to unauthenticated and
      // redirecting. Real Firebase Auth isn't involved.
      setState(UNAUTH_STATE);
      if (typeof window !== 'undefined') {
        window.location.assign(STUDENT_LOGIN_PATH);
      }
      return;
    }
    try {
      await firebaseSignOut(auth);
    } finally {
      // Always redirect — even if sign-out threw, the user should be booted
      // off a protected page on a shared device.
      if (typeof window !== 'undefined') {
        window.location.assign(STUDENT_LOGIN_PATH);
      }
    }
  }, []);

  const value = useMemo<StudentAuthValue>(
    () => ({
      status: state.status,
      pseudonymUid: state.pseudonymUid,
      orgId: state.orgId,
      classIds: state.classIds,
      signOut,
    }),
    [state.status, state.pseudonymUid, state.orgId, state.classIds, signOut]
  );

  return (
    <StudentAuthContext.Provider value={value}>
      {children}
    </StudentAuthContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// RequireStudentAuth — gate component for protected student pages
// ---------------------------------------------------------------------------

const StudentAuthLoader: React.FC = () => (
  <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
    <Loader2 className="w-12 h-12 text-brand-blue-primary animate-spin" />
  </div>
);

/**
 * Gate a protected student route. While loading, renders a full-page
 * spinner. While unauthenticated, renders nothing — the provider has
 * already kicked a redirect to `/student/login`. Only renders `children`
 * once the custom claims are fully validated.
 */
export const RequireStudentAuth: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { status } = React.useContext(StudentAuthContext) ?? {
    status: 'loading' as StudentAuthStatus,
  };

  if (status === 'loading') return <StudentAuthLoader />;
  if (status === 'unauthenticated') return null;
  return <>{children}</>;
};
