import { useEffect, useRef } from 'react';
import { doc, increment, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

interface UseResultsTabWarningsArgs {
  /** True only when the session has tab-warning protection enabled AND student isn't already locked. */
  enabled: boolean;
  /** session.protection.tabWarningThreshold */
  threshold: number;
  /** response.resultsTabWarnings (current count) */
  currentWarnings: number;
  /** response.resultsLockedOut */
  lockedOut?: boolean;
  /** Firestore path: `quiz_sessions/{sessionId}/responses/{responseKey}` */
  responseDocPath: string;
}

/**
 * Listens to visibility/focus loss on the published-results view and increments
 * the student's `resultsTabWarnings` counter on each return. Flips
 * `resultsLockedOut` true when the threshold is reached. No-op once locked out
 * (further events are suppressed; the redirect-to-list logic owns the UX from
 * here).
 *
 * Note: warnings persist server-side per response doc, so closing/reopening
 * the tab does NOT reset the count within the same assignment (resets only
 * happen when teacher unlocks, decrementing by 1).
 */
export function useResultsTabWarnings({
  enabled,
  threshold,
  currentWarnings,
  lockedOut,
  responseDocPath,
}: UseResultsTabWarningsArgs): void {
  const wasHiddenRef = useRef(false);

  useEffect(() => {
    if (!enabled || lockedOut) return undefined;
    // Seed for THIS activation — `false` instead of "current visibility state"
    // avoids spurious increments if the hook mounts while the tab is hidden
    // (the first visible event would otherwise count an exit we never observed).
    wasHiddenRef.current = false;

    const incrementOnce = async () => {
      const update: Partial<{
        resultsTabWarnings: ReturnType<typeof increment>;
        resultsLockedOut: boolean;
        resultsLockedOutAt: number;
      }> = {
        resultsTabWarnings: increment(1),
      };
      // Best-effort lockout flip based on the latest snapshot. If a rapid second
      // event races, this still computes against the same stale snapshot — but the
      // increment itself is atomic via `increment(1)`, so the count is preserved
      // and the lockout will flip on the next event at the latest.
      if (currentWarnings + 1 >= threshold) {
        update.resultsLockedOut = true;
        update.resultsLockedOutAt = Date.now();
      }
      try {
        await updateDoc(doc(db, responseDocPath), update);
      } catch (e) {
        console.error('[useResultsTabWarnings] update failed', e);
      }
    };

    const handleVisibility = () => {
      const hidden = document.visibilityState === 'hidden';
      if (hidden) {
        wasHiddenRef.current = true;
        return;
      }
      if (wasHiddenRef.current) {
        wasHiddenRef.current = false;
        void incrementOnce();
      }
    };

    const handleBlur = () => {
      wasHiddenRef.current = true;
    };
    const handleFocus = () => {
      if (wasHiddenRef.current) {
        wasHiddenRef.current = false;
        void incrementOnce();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [enabled, lockedOut, threshold, currentWarnings, responseDocPath]);
}
