import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { GoogleDriveIcon } from './GoogleDriveIcon';
import { useAuth } from '@/context/useAuth';

const DISMISS_DURATION_MS = 5 * 60 * 1000; // 5 minutes
// Persisting the dismiss expiry survives dev-mode HMR remounts and full
// page reloads, so a teacher who clicks X actually gets the 5-minute
// reprieve they expect instead of having the banner pop back on the
// next render that happens to remount this component.
const DISMISS_STORAGE_KEY = 'spart_drive_banner_dismissed_until';

const readStoredDismissUntil = (): number => {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
};

const writeStoredDismissUntil = (value: number | null): void => {
  try {
    if (value === null) {
      localStorage.removeItem(DISMISS_STORAGE_KEY);
    } else {
      localStorage.setItem(DISMISS_STORAGE_KEY, String(value));
    }
  } catch {
    // localStorage unavailable — dismiss falls back to in-memory only.
  }
};

export const DriveDisconnectBanner: React.FC = () => {
  const { user, googleAccessToken, connectGoogleDrive } = useAuth();
  const [dismissedUntil, setDismissedUntil] = useState(readStoredDismissUntil);
  const [isConnecting, setIsConnecting] = useState(false);

  const isConnected = !!googleAccessToken;
  const isDismissed = dismissedUntil > Date.now();

  // When Drive reconnects, clear the dismiss state so a future disconnection
  // shows the banner again.
  useEffect(() => {
    if (isConnected) {
      setDismissedUntil(0);
      writeStoredDismissUntil(null);
    }
  }, [isConnected]);

  // Schedule a single re-show timer at the persisted expiry. Re-runs when
  // dismissedUntil changes (mount seed, click-dismiss, reconnect clear).
  useEffect(() => {
    if (dismissedUntil <= Date.now()) return;
    const remainingMs = dismissedUntil - Date.now();
    const id = setTimeout(() => setDismissedUntil(0), remainingMs);
    return () => clearTimeout(id);
  }, [dismissedUntil]);

  const handleDismiss = () => {
    const until = Date.now() + DISMISS_DURATION_MS;
    setDismissedUntil(until);
    writeStoredDismissUntil(until);
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await connectGoogleDrive();
    } finally {
      setIsConnecting(false);
    }
  };

  // Only show for authenticated users when Drive is not connected
  if (!user || isConnected || isDismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-system-banner animate-in slide-in-from-bottom-2 duration-300">
      <div className="bg-white rounded-xl shadow-xl border border-amber-200 p-3 flex items-center gap-3 max-w-[280px]">
        <div className="flex-shrink-0">
          <GoogleDriveIcon className="w-5 h-5 opacity-60" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-800 leading-tight mb-0.5">
            Drive Disconnected
          </p>
          <p className="text-xxs text-slate-500 leading-tight">
            Reconnect to resume auto-save.
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => void handleConnect()}
            disabled={isConnecting}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-brand-blue-primary text-white text-xxxs font-black uppercase tracking-widest rounded-lg hover:bg-brand-blue-dark transition-colors disabled:opacity-60"
          >
            {isConnecting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              'Connect'
            )}
          </button>

          <button
            onClick={handleDismiss}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            title="Dismiss for 5 minutes"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
