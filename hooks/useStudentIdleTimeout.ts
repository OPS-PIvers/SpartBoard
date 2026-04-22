/**
 * useStudentIdleTimeout — 15-minute idle auto-sign-out for student sessions
 * on shared Chromebook carts.
 *
 * A single setTimeout, reset on interaction (throttled to once per 5s). On
 * expiry, calls `firebaseSignOut` and redirects to `/student/login`. The
 * 15-min window is meaningfully shorter than the ~1h custom-token TTL so
 * the worst-case exposure window on a walk-away is 15 min, not 60.
 *
 * `enabled=false` fully tears down listeners and timers so teachers
 * previewing student routes are never timed out.
 */

import { useEffect } from 'react';
import { signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '@/config/firebase';

export const STUDENT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const INTERACTION_THROTTLE_MS = 5 * 1000;
export const STUDENT_LOGIN_PATH = '/student/login';

export function useStudentIdleTimeout(
  enabled: boolean,
  redirectPath: string = STUDENT_LOGIN_PATH
): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    let timeoutId: number | undefined;
    let lastInteractionAt = Date.now();

    const triggerIdleSignOut = () => {
      void firebaseSignOut(auth).catch(() => {
        // Swallow — redirect below is the actual remediation.
      });
      window.location.assign(redirectPath);
    };

    const scheduleTimeout = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(
        triggerIdleSignOut,
        STUDENT_IDLE_TIMEOUT_MS
      );
    };

    const handleInteraction = () => {
      const now = Date.now();
      if (now - lastInteractionAt < INTERACTION_THROTTLE_MS) return;
      lastInteractionAt = now;
      scheduleTimeout();
    };

    scheduleTimeout();

    const events = ['mousemove', 'keydown', 'touchstart', 'click'] as const;
    const options: AddEventListenerOptions = { passive: true, capture: true };
    events.forEach((event) => {
      window.addEventListener(event, handleInteraction, options);
    });

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      events.forEach((event) => {
        window.removeEventListener(event, handleInteraction, options);
      });
    };
  }, [enabled, redirectPath]);
}
