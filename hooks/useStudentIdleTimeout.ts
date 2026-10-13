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
import { clearStudentFirstName } from '@/context/StudentAuthContextValue';

export const STUDENT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const INTERACTION_THROTTLE_MS = 5 * 1000;
export const STUDENT_LOGIN_PATH = '/student/login';
const SHARED_ACTIVITY_KEY = 'sb_student_last_activity';

const readSharedActivity = (): number => {
  try {
    const value = Number(window.localStorage.getItem(SHARED_ACTIVITY_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
};

const writeSharedActivity = (at: number): void => {
  try {
    window.localStorage.setItem(SHARED_ACTIVITY_KEY, String(at));
  } catch {
    // Storage blocked: this tab's own activity still counts.
  }
};

const isFocusInsideFrame = (): boolean =>
  document.hasFocus() && document.activeElement instanceof HTMLIFrameElement;

export function useStudentIdleTimeout(
  enabled: boolean,
  redirectPath: string = STUDENT_LOGIN_PATH
): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    let timeoutId: number | undefined;
    let lastInteractionAt = Date.now();
    writeSharedActivity(lastInteractionAt);

    const triggerIdleSignOut = () => {
      // Always clear the cached first name before tearing down the
      // session — same hygiene as the explicit `signOut()` and the
      // claim-rejection path. Without this, a tab that idles out on a
      // shared cart leaves the previous student's greeting in
      // sessionStorage until the next successful login overwrites it.
      clearStudentFirstName();
      void firebaseSignOut(auth).catch(() => {
        // Swallow — redirect below is the actual remediation.
      });
      window.location.assign(redirectPath);
    };

    const scheduleTimeout = (delay: number = STUDENT_IDLE_TIMEOUT_MS) => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(onTimeout, delay);
    };

    // Sign-out is shared by every tab, so activity in another tab or inside an embedded frame counts too.
    function onTimeout() {
      const now = Date.now();
      if (isFocusInsideFrame()) {
        lastInteractionAt = now;
        writeSharedActivity(now);
      }
      const lastActive = Math.max(lastInteractionAt, readSharedActivity());
      const remaining = lastActive + STUDENT_IDLE_TIMEOUT_MS - now;
      if (remaining > 0) scheduleTimeout(remaining);
      else triggerIdleSignOut();
    }

    const handleInteraction = () => {
      const now = Date.now();
      if (now - lastInteractionAt < INTERACTION_THROTTLE_MS) return;
      lastInteractionAt = now;
      writeSharedActivity(now);
      scheduleTimeout();
    };

    scheduleTimeout();

    const events = [
      'mousemove',
      'pointerdown',
      'keydown',
      'touchstart',
      'click',
      'wheel',
      'scroll',
    ] as const;
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
