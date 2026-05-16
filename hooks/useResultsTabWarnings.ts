import { useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
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
  const wasHiddenRef = useRef(document.visibilityState === 'hidden');

  useEffect(() => {
    if (!enabled || lockedOut) return undefined;

    const incrementOnce = async () => {
      const next = currentWarnings + 1;
      const update: Record<string, unknown> = { resultsTabWarnings: next };
      if (next >= threshold) {
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
