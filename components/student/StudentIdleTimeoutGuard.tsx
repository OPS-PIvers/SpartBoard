/**
 * StudentIdleTimeoutGuard — arms the 15-minute idle-timeout sign-out for
 * studentRole (ClassLink-via-Google) sessions on the lightweight student
 * assignment routes that DON'T sit behind `StudentAuthProvider`
 * (Mini-app, Video Activity, Activity Wall, Guided Learning).
 *
 * No-op for:
 *   - Anonymous code+PIN student launches (no `studentRole` claim).
 *   - Teachers previewing a student route (no `studentRole` claim).
 *   - Auth-bypass testing mode.
 *
 * Subscribes to `onIdTokenChanged` so claim updates from a mid-session token
 * refresh (student switches classes, admin revokes role, etc.) propagate
 * immediately — no page reload required.
 */

import React, { useEffect, useState } from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import { auth, isAuthBypass } from '@/config/firebase';
import { useStudentIdleTimeout } from '@/hooks/useStudentIdleTimeout';

export const StudentIdleTimeoutGuard: React.FC = () => {
  const [isStudentRole, setIsStudentRole] = useState(false);

  useEffect(() => {
    if (isAuthBypass) return;
    let cancelled = false;
    const unsubscribe = onIdTokenChanged(auth, (user) => {
      if (!user) {
        if (!cancelled) setIsStudentRole(false);
        return;
      }
      void user
        .getIdTokenResult()
        .then((result) => {
          if (cancelled) return;
          // Drop stale resolutions: if the current user changed between
          // callback fire and promise resolve, a newer callback will set
          // the correct value.
          if (auth.currentUser?.uid !== user.uid) return;
          setIsStudentRole(result.claims.studentRole === true);
        })
        .catch(() => {
          if (!cancelled) setIsStudentRole(false);
        });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useStudentIdleTimeout(isStudentRole);
  return null;
};
