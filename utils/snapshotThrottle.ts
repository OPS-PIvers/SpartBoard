/**
 * Leading-edge + trailing-flush throttle for `onSnapshot`-driven state.
 *
 * During a live quiz or video-activity session dozens of students
 * autosave/submit within the same second, so Firestore fires `onSnapshot`
 * in rapid bursts. Pushing every snapshot straight into React state
 * re-renders the whole teacher monitor on each one, which is wasteful. This
 * factory collapses a burst into at most two `apply` calls per window:
 *
 *   - The FIRST push in an idle window applies immediately (leading edge),
 *     so the very first change is never delayed, and arms a single trailing
 *     timer.
 *   - Further pushes within the window buffer the LATEST value (older
 *     buffered values are discarded) instead of applying.
 *   - When the timer fires, the buffered value (if any) is applied once and
 *     the window resets.
 *
 * `flush()` applies any buffered value now and clears the timer — call it on
 * teardown (unsubscribe / re-subscribe / unmount) so the final state in a
 * mid-burst tear-down is never dropped. `cancel()` clears the timer without
 * applying, for callers that want to discard a pending value.
 *
 * Extracted from the previously-duplicated inline throttles in
 * `useQuizSession` and `useVideoActivitySession`; the behavior is identical
 * to those copies (same leading-apply-immediately + trailing-flush
 * semantics, same flush-on-teardown).
 */

/**
 * Collapse interval for the teacher responses listener's `setResponses`.
 * During a live quiz/activity, dozens of students autosave/submit within the
 * same second, so Firestore fires `onSnapshot` in rapid bursts. Throttling
 * the state update to once per this window batches a burst into a single
 * render while still leading-edge updating immediately so the first change is
 * never delayed. Shared by `useQuizSession` and `useVideoActivitySession`.
 */
export const RESPONSES_THROTTLE_MS = 200;

export interface LeadingTrailingThrottle<T> {
  /** Feed a new value through the throttle (leading-apply or buffer). */
  push: (value: T) => void;
  /** Apply any buffered value now and clear the timer (use on teardown). */
  flush: () => void;
  /** Clear the timer without applying any buffered value. */
  cancel: () => void;
}

/**
 * Create a leading-edge + trailing-flush throttle around `apply`.
 *
 * @param apply - Sink for throttled values (e.g. a `setResponses` setter).
 * @param intervalMs - Length of the throttle window in milliseconds.
 */
export function createLeadingTrailingThrottle<T>(
  apply: (value: T) => void,
  intervalMs: number
): LeadingTrailingThrottle<T> {
  // `pending` holds the latest buffered value during an active window;
  // `hasPending` distinguishes "buffered nothing" from "buffered a value
  // that happens to be falsy/undefined" (mirrors the original `if (pending)`
  // guards but without conflating an empty array / null with "no value").
  let pending: T;
  let hasPending = false;
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    if (throttleTimer) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
    if (hasPending) {
      const value = pending;
      hasPending = false;
      apply(value);
    }
  };

  const push = (value: T): void => {
    if (throttleTimer) {
      // Inside an active window — buffer the latest value for the flush.
      pending = value;
      hasPending = true;
    } else {
      // Leading edge — apply immediately and open the window.
      apply(value);
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        if (hasPending) {
          const buffered = pending;
          hasPending = false;
          apply(buffered);
        }
      }, intervalMs);
    }
  };

  const cancel = (): void => {
    if (throttleTimer) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
    hasPending = false;
  };

  return { push, flush, cancel };
}
