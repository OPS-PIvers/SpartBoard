import { useEffect, useRef } from 'react';
import { doc, increment, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';

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
  // Mirror `currentWarnings` into a ref so the listener effect can read the
  // latest value without re-subscribing on every snapshot. If `currentWarnings`
  // were in the effect deps, each successful increment would tear down
  // listeners and reset `wasHiddenRef` — losing the hidden state during a
  // rapid hide→return→hide race window (Firestore round-trip is ~100-200ms,
  // comfortably within motivated-cheater behavior).
  const currentWarningsRef = useRef(currentWarnings);
  // Tracks the last `currentWarnings` this effect has accounted for, so a
  // snapshot only clears as much of `pendingDeltaRef` as it actually
  // confirms — a blanket reset-to-0 on any snapshot discards the tally for
  // a second write still in flight when only the first of two rapid writes
  // has landed, delaying the lockout flip past the event that crosses it.
  const prevCurrentWarningsRef = useRef(currentWarnings);
  useEffect(() => {
    const prev = prevCurrentWarningsRef.current;
    prevCurrentWarningsRef.current = currentWarnings;
    currentWarningsRef.current = currentWarnings;
    pendingDeltaRef.current =
      currentWarnings > prev
        ? Math.max(0, pendingDeltaRef.current - (currentWarnings - prev))
        : 0; // non-increase (equal, or a teacher-unlock decrement): nothing pending to confirm
  }, [currentWarnings]);

  // Counts increments fired locally since the last snapshot landed.
  // `increment(1)` is atomic server-side, so the count is always correct
  // — but the LOCKOUT-flip decision (`nextCount >= threshold`) was reading
  // `currentWarnings` alone, which lags one round-trip behind under rapid
  // successive events. Three quick tab switches at warnings=1 / threshold=3
  // could all see `nextCount=2` and skip the lockout flag, so the student
  // was effectively locked out one event late. Folding `pendingDelta` into
  // the threshold check makes the lockout flip on the event that actually
  // crosses the threshold, even when the snapshot hasn't returned yet.
  const pendingDeltaRef = useRef(0);

  useEffect(() => {
    if (!enabled || lockedOut) return undefined;
    // Seed for THIS activation — `false` instead of "current visibility state"
    // avoids spurious increments if the hook mounts while the tab is hidden
    // (the first visible event would otherwise count an exit we never observed).
    wasHiddenRef.current = false;

    const incrementOnce = async () => {
      pendingDeltaRef.current += 1;
      const nextCount = currentWarningsRef.current + pendingDeltaRef.current;
      const update: Partial<{
        resultsTabWarnings: ReturnType<typeof increment>;
        resultsLockedOut: boolean;
        resultsLockedOutAt: number;
      }> = {
        resultsTabWarnings: increment(1),
      };
      // `nextCount` now reflects in-flight increments too, so a burst of
      // rapid events correctly crosses the threshold on the right event.
      // The increment itself remains atomic via `increment(1)` — only the
      // lockout-flip decision uses the local tally.
      if (nextCount >= threshold) {
        update.resultsLockedOut = true;
        update.resultsLockedOutAt = Date.now();
      }
      try {
        await updateDoc(doc(db, responseDocPath), update);
      } catch (e) {
        logError('useResultsTabWarnings.update', e, {
          responseDocPath,
          nextCount,
          threshold,
        });
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
    // `currentWarnings` is intentionally excluded — mirrored via
    // `currentWarningsRef` above. Re-subscribing on every increment would
    // reset `wasHiddenRef` and drop subsequent hidden-state observations.
  }, [enabled, lockedOut, threshold, responseDocPath]);
}
