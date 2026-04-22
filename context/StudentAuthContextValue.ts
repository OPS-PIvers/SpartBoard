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
 * This context is intentionally PII-free:
 *   - `pseudonymUid` is the opaque pseudonym minted by `studentLoginV1`.
 *   - `orgId` / `classIds` come from the custom claims on that custom token.
 *   - No email, name, photo, or `sub` is ever read, rendered, or persisted.
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
   * Sign out of Firebase and redirect to `/student/login`.
   *
   * Exposed so that UI (e.g. a "Done" button on `/my-assignments`) can end
   * a session on shared-device carts without depending on the idle timeout.
   */
  signOut: () => Promise<void>;
}

export const StudentAuthContext = createContext<StudentAuthValue | undefined>(
  undefined
);
