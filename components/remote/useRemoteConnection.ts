import { useCallback, useEffect, useState } from 'react';

export type RemoteConnectionStatus = 'connected' | 'reconnecting';

export interface RemoteConnection {
  status: RemoteConnectionStatus;
  lastSyncedAt: number | null;
  markSynced: () => void;
}

/**
 * Drives the remote's connection chip + last-synced indicator. Uses the
 * browser online/offline signal as a cheap proxy for Firestore reachability
 * (no new channel); `markSynced` is called whenever a fresh context snapshot
 * is reflected so "updated just now" stays honest.
 */
export const useRemoteConnection = (): RemoteConnection => {
  const [status, setStatus] = useState<RemoteConnectionStatus>(
    typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'reconnecting'
      : 'connected'
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  useEffect(() => {
    const online = () => setStatus('connected');
    const offline = () => setStatus('reconnecting');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);
  const markSynced = useCallback(() => setLastSyncedAt(Date.now()), []);
  return { status, lastSyncedAt, markSynced };
};
