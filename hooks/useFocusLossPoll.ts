import { useEffect, useRef } from 'react';

interface UseFocusLossPollArgs {
  /**
   * Polling is only attached while this is true. Toggling false tears
   * the interval down; toggling true again starts a fresh interval but
   * preserves the previously-observed focus state so a focus loss that
   * spans the disable→enable window is still detected on the next tick.
   */
  enabled: boolean;
  /** Default 250 ms — fast enough to catch a quick URL-bar visit. */
  intervalMs?: number;
  /**
   * Invoked once per `true → false` focus-state edge observed by the
   * poll. The hook does NOT pass any arguments; the caller already
   * knows the meaningful state.
   */
  onFocusLoss: () => void;
}

/**
 * Polls `document.hasFocus()` on an interval and invokes `onFocusLoss`
 * on each `true → false` edge.
 *
 * Why a poll instead of just listening to `window.blur`?
 * Modern Chrome and Firefox no longer fire `window.blur` when focus
 * shifts to the URL bar, bookmark dropdowns, devtools, or other
 * browser-chrome targets — the focus shift stays inside the browser's
 * own chrome. `document.hasFocus()` still flips false in all those
 * cases, so a poll watching the `true → false` edge restores the
 * stricter detection without depending on which event the browser
 * chose to dispatch.
 *
 * The seed is gated to first-call only, surviving subsequent re-renders
 * driven by external state churn (e.g. Firestore snapshot listeners
 * whose `myResponse.status` change tears the calling effect down and
 * rebuilds it). Re-seeding on every render would silently swallow a
 * focus loss that happened while the snapshot was in flight — the
 * re-seed would land at `false` while focus was already lost, the
 * next tick would see `false → false`, and the edge would be missed.
 */
export function useFocusLossPoll({
  enabled,
  intervalMs = 250,
  onFocusLoss,
}: UseFocusLossPollArgs): void {
  // "Latest ref" for the callback so the interval closure always
  // invokes the freshest function without restarting on every render.
  // Per `useDebouncedCallback`'s precedent, refs that mirror a value
  // are assigned in the render body; the eslint rule is disabled
  // locally because the interval callback always defers to a later
  // task, so the assignment is guaranteed to land first.
  const onFocusLossRef = useRef<() => void>(onFocusLoss);
  // eslint-disable-next-line react-hooks/refs
  onFocusLossRef.current = onFocusLoss;

  // Persists across re-renders AND effect re-runs. See module-level
  // doc for the snapshot-race this guards against.
  const prevHadFocusRef = useRef<boolean>(true);
  const seededRef = useRef<boolean>(false);

  useEffect(() => {
    if (enabled === false) return undefined;
    if (typeof document === 'undefined') return undefined;

    if (!seededRef.current) {
      seededRef.current = true;
      prevHadFocusRef.current = document.hasFocus();
    }

    const id = window.setInterval(() => {
      const nowHasFocus = document.hasFocus();
      if (prevHadFocusRef.current && !nowHasFocus) {
        onFocusLossRef.current();
      }
      prevHadFocusRef.current = nowHasFocus;
    }, intervalMs);

    return () => {
      window.clearInterval(id);
    };
  }, [enabled, intervalMs]);
}
