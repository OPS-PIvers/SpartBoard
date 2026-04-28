import { createContext } from 'react';

/**
 * Authentication status for a protected student page.
 *
 * - `'loading'`: initial ID-token check is in flight. Callers should render
 *   a spinner and NOT redirect.
 * - `'authenticated'`: the Firebase user has a valid custom token with
 *   `studentRole === true` and the expected pseudonym claims.
 * - `'unauthenticated'`: either no Firebase user, or the signed-in user is
 *   not a student (e.g. a teacher who landed on a student page). The
 *   provider has already kicked a redirect to `/student/login`.
 */
export type StudentAuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

/**
 * Minimal auth surface for student-facing protected routes.
 *
 * This context is intentionally Firestore-PII-free:
 *   - `pseudonymUid` is the opaque pseudonym minted by `studentLoginV1`.
 *   - `orgId` / `classIds` come from the custom claims on that custom token.
 *   - No email, full name, photo, or `sub` is ever read, rendered, or
 *     persisted to any server we own.
 *
 * `firstName` is the one exception, and only as the student's own name in
 * their own browser tab: read from the Google ID token at login and parked
 * in tab-scoped `sessionStorage`, never sent to Firestore, never logged,
 * cleared on `signOut()`. Used purely for the personalized greeting in the
 * sidebar footer. `null` when unavailable (legacy session, Google declined
 * to include `given_name`, or the storage read failed).
 */
export interface StudentAuthValue {
  /** Auth lifecycle status. */
  status: StudentAuthStatus;
  /** Opaque pseudonym UID (Firebase `user.uid`). `null` when not authenticated. */
  pseudonymUid: string | null;
  /** Org id from custom claims. `null` when not authenticated. */
  orgId: string | null;
  /** ClassLink class sourcedIds the student is enrolled in. Empty when not authenticated. */
  classIds: string[];
  /**
   * Student's given/first name from the Google ID token at sign-in. Stored
   * in sessionStorage, never in Firestore. See class-doc above. `null` when
   * not available — UI must render a sensible fallback.
   */
  firstName: string | null;
  /**
   * Sign out of Firebase and redirect to `/student/login`. Also clears the
   * sessionStorage `firstName` so the next session on a shared device
   * doesn't inherit the previous student's name.
   */
  signOut: () => Promise<void>;
}

/** Tab-scoped sessionStorage key for the student's first name. */
export const STUDENT_FIRST_NAME_KEY = 'sb_student_first_name';

/**
 * Remove the student's first name from tab-scoped `sessionStorage`. Must be
 * called on every sign-out path (explicit `signOut()`, idle-timeout
 * auto-logout, and the StudentAuthContext claim-rejection path) so the
 * next student on a shared device never inherits the previous student's
 * greeting. Safe to call when storage is empty or disabled.
 */
export const clearStudentFirstName = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STUDENT_FIRST_NAME_KEY);
  } catch {
    // Storage disabled — nothing to clear; the value couldn't have been
    // written either.
  }
};

export const StudentAuthContext = createContext<StudentAuthValue | undefined>(
  undefined
);
