import { useEffect, useRef } from 'react';
import { subscribeDriveReconnected } from '@/utils/driveAuthErrors';

/**
 * Subscribe to "Google Drive token just rotated to a new value" events.
 *
 * Designed for widgets and hooks whose data loaders are gated behind
 * non-token state (Firestore listeners, route params, mount-only effects).
 * Those loaders normally won't re-run when `googleAccessToken` flips from
 * stale to fresh — the user clicks "Connect" in the disconnect toast, the
 * token lands, but the widget keeps showing whatever it last managed to
 * load (often nothing). Subscribing here gives them a chance to retry.
 *
 * The callback is stored in a ref so subscribers don't have to memoize it
 * with `useCallback` to avoid resubscribe churn. The subscription itself
 * mounts once per consumer.
 */
export const useDriveReconnected = (callback: () => void): void => {
  const callbackRef = useRef(callback);

  // Sync the latest callback into the ref AFTER render so the lint rule
  // about "Cannot update ref during render" (react-hooks/refs) stays happy.
  // The cost is one extra effect run per render, which is negligible — the
  // subscription itself only mounts once via the empty-deps effect below.
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    return subscribeDriveReconnected(() => {
      callbackRef.current();
    });
  }, []);
};
